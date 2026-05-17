import { x402Client } from '@x402/core/client'
import {
  createPermit2ApprovalTx,
  getPermit2AllowanceReadParams
} from '@x402/evm'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import {
  type x402PaymentResult,
  x402HTTPClient,
  wrapFetchWithPayment
} from '@x402/fetch'
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  parseAbi,
  parseUnits,
  type Address,
  type Hex
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  type AgentPlanMetadata,
  buildAgentPlan,
  buildPlannerSummary,
  parseOpenAiJson
} from '@/features/agents/planner'
import type {
  AgentAction,
  AgentAsyncPollingResponse,
  AgentRun
} from '@/features/agents/types'
import { resolveProductPrice } from '@/features/marketplace/pricing'
import { getProductBySlug } from '@/features/marketplace/products'
import {
  buildExplorerUrl,
  type MarketplaceReceipt
} from '@/features/marketplace/receipts'
import type { MarketplaceOrder } from '@/features/marketplace/types'
import { defaultAppChain, morphUsdcTokenAddress } from '@/lib/config/chains'
import {
  getAgentRunBytes32,
  getAgentRunVaultBudget,
  getAgentRunVaultAddress,
  getAgentVaultPaymentId,
  parseUsdcToAtomic,
  type AgentVaultWriteResult,
  writeAgentRunVault
} from '@/lib/contracts/agent-run-vault'
import { envClient } from '@/lib/env/env.client'
import { envServer } from '@/lib/env/env.server'

const asyncProviderPollIntervalMs = 5_000
const asyncProviderPollAttempts = 72

type AgentRunProgress = {
  actions: AgentAction[]
  summary?: string
}

type AgentRunProgressHandler = (
  progress: AgentRunProgress
) => Promise<void> | void

type AgentActionProgressHandler = (action: AgentAction) => Promise<void> | void

export async function executeAgentRunActions(
  run: AgentRun,
  shouldStop: () => boolean = () => false,
  appUrl = envClient.NEXT_PUBLIC_APP_URL,
  onProgress?: AgentRunProgressHandler
) {
  const plan =
    run.actions.length > 0
      ? {
          actions: run.actions,
          metadata: buildPlannerSummary(run, run.actions)
        }
      : await buildAgentPlan(run)
  const actions = plan.actions
  const completedActions: AgentAction[] = []
  let progressActions = actions
  let spendUsd = 0
  const publishProgress = async (summary?: string) => {
    await onProgress?.({
      actions: progressActions,
      summary
    })
  }
  const publishActionProgress = async (nextAction: AgentAction) => {
    progressActions = progressActions.map(action =>
      action.id === nextAction.id ? nextAction : action
    )
    await publishProgress(describeAgentActionProgress(nextAction))
  }

  await publishProgress(
    `The agent planned ${actions.length} paid action${
      actions.length === 1 ? '' : 's'
    } and is preparing x402 settlement.`
  )

  for (const action of actions) {
    if (shouldStop()) {
      const stoppedAction = {
        ...action,
        status: 'failed',
        errorMessage: 'The agent run was stopped before this action executed.',
        completedAt: new Date().toISOString()
      } satisfies AgentAction
      completedActions.push(stoppedAction)
      await publishActionProgress(stoppedAction)
      break
    }

    const result = await executeAgentAction(
      run,
      action,
      spendUsd,
      appUrl,
      publishActionProgress
    )

    if (result.vaultAdvancedAmountUsdc && !result.vaultRefundedAmountUsdc) {
      spendUsd = Number(
        (spendUsd + parseUsdcLabel(result.vaultAdvancedAmountUsdc)).toFixed(6)
      )
    } else if (result.receipt) {
      spendUsd = Number(
        (spendUsd + parseUsdcLabel(result.receipt.amountUsdc)).toFixed(6)
      )
    }

    completedActions.push(result)
    await publishActionProgress(result)

    if (shouldStop()) {
      break
    }
  }

  const deliverables = await buildDeliverables(
    run,
    completedActions,
    plan.metadata
  )
  const completed = completedActions.every(
    action => action.status === 'completed'
  )
  const receiptCount = completedActions.filter(action => action.receipt).length

  return {
    actions: completedActions,
    deliverables,
    summary: completed
      ? receiptCount > 0
        ? `The launch-pack agent completed ${completedActions.length} actions, captured ${receiptCount} USDC receipt records, and prepared an auditable Morph proof package.`
        : 'The launch-pack agent completed without receipt-backed paid actions.'
      : 'The launch-pack agent stopped before completing every selected paid action.',
    status: completed ? 'completed' : 'failed'
  } as const
}

async function executeAgentAction(
  run: AgentRun,
  action: AgentAction,
  currentSpendUsd: number,
  appUrl?: string,
  onProgress?: AgentActionProgressHandler
) {
  const product = await getProductBySlug(action.productSlug)

  if (!product) {
    return {
      ...action,
      status: 'failed',
      errorMessage: 'API product was not found.',
      completedAt: new Date().toISOString()
    } satisfies AgentAction
  }

  const requestPayload = action.requestPayload
  const quotedPrice = await resolveProductPrice({
    product,
    requestPayload
  }).catch(error => ({
    error:
      error instanceof Error
        ? error.message
        : 'The agent could not quote this paid tool.'
  }))

  if ('error' in quotedPrice) {
    return {
      ...action,
      status: 'failed',
      errorMessage: quotedPrice.error,
      completedAt: new Date().toISOString()
    } satisfies AgentAction
  }

  if (currentSpendUsd + quotedPrice.amountUsd > run.budgetCapUsdc) {
    return {
      ...action,
      status: 'skipped',
      amountUsdc: quotedPrice.amountLabel,
      errorMessage:
        'Skipped because the quoted USDC price would exceed the agent budget.',
      completedAt: new Date().toISOString()
    } satisfies AgentAction
  }

  const started = {
    ...action,
    status: 'quoted',
    amountUsdc: quotedPrice.amountLabel,
    requestPayload,
    startedAt: action.startedAt ?? new Date().toISOString()
  } satisfies AgentAction
  await onProgress?.(started)

  if (!envServer.AGENT_SPENDER_PRIVATE_KEY || !appUrl) {
    return {
      ...started,
      status: 'failed',
      errorMessage:
        'Production agent payment signing is not configured. Set AGENT_SPENDER_PRIVATE_KEY and NEXT_PUBLIC_APP_URL so the vault-funded signer can settle x402 payments.',
      completedAt: new Date().toISOString()
    } satisfies AgentAction
  }

  let advanced: AgentAction | null = null

  try {
    advanced = {
      ...(await advanceAgentVaultSpend({
        runId: run.id,
        action: started,
        amountUsd: quotedPrice.amountUsd,
        amountLabel: quotedPrice.amountLabel
      })),
      status: 'paid'
    } satisfies AgentAction
    await onProgress?.(advanced)
    await ensureAgentCanPayWithPermit2(quotedPrice.amountUsd)
    let paidProgress = advanced
    const paidResult = await callPaidProductWithAgentWallet(
      run.id,
      advanced,
      appUrl,
      async (progress, pollingResponse) => {
        paidProgress = {
          ...paidProgress,
          responsePayload: buildPaidProductResponsePayload(progress),
          latestAsyncPollingResponse:
            pollingResponse ?? paidProgress.latestAsyncPollingResponse,
          asyncPollingResponses: pollingResponse
            ? [pollingResponse]
            : paidProgress.asyncPollingResponses,
          receipt: progress.receipt,
          orderId: progress.order?.id,
          requestId: progress.order?.requestId
        } satisfies AgentAction
        await onProgress?.(paidProgress)
      }
    )

    const resultStatus =
      paidResult.order?.status === 'failed' ||
      paidResult.order?.status === 'expired' ||
      paidResult.order?.status === 'delta_payment_required'
        ? 'failed'
        : 'completed'

    const refundedAdvance =
      resultStatus === 'failed' && didEscrowRefundBuyer(paidResult)
        ? await refundAgentVaultAdvance({
            runId: run.id,
            action: advanced,
            amountUsd: quotedPrice.amountUsd,
            amountLabel: quotedPrice.amountLabel
          }).catch(error => ({
            error:
              error instanceof Error
                ? error.message
                : 'Unable to return the refunded x402 payment to the agent vault.'
          }))
        : null
    const refundError =
      refundedAdvance && 'error' in refundedAdvance
        ? refundedAdvance.error
        : undefined
    const refundFields =
      refundedAdvance && !('error' in refundedAdvance) ? refundedAdvance : {}

    return {
      ...paidProgress,
      ...refundFields,
      status: resultStatus,
      responsePayload: buildPaidProductResponsePayload(paidResult),
      latestAsyncPollingResponse: paidProgress.latestAsyncPollingResponse,
      asyncPollingResponses: paidProgress.asyncPollingResponses,
      receipt: paidResult.receipt,
      orderId: paidResult.order?.id,
      requestId: paidResult.order?.requestId,
      errorMessage:
        resultStatus === 'failed'
          ? [
              describeAsyncOrderFailure(paidResult.order),
              refundError
                ? `The x402 payment was refunded to the signer, but Paykubo could not return it to the agent vault: ${refundError}`
                : undefined
            ]
              .filter(Boolean)
              .join(' ')
          : undefined,
      completedAt: new Date().toISOString()
    } satisfies AgentAction
  } catch (caughtError) {
    const refundedAdvance = advanced
      ? await refundAgentVaultAdvance({
          runId: run.id,
          action: advanced,
          amountUsd: quotedPrice.amountUsd,
          amountLabel: quotedPrice.amountLabel
        }).catch(error => ({
          error:
            error instanceof Error
              ? error.message
              : 'Unable to return the advanced vault spend.'
        }))
      : null
    const refundError =
      refundedAdvance && 'error' in refundedAdvance
        ? refundedAdvance.error
        : undefined
    const refundFields =
      refundedAdvance && !('error' in refundedAdvance) ? refundedAdvance : {}

    return {
      ...(advanced ?? started),
      ...refundFields,
      status: 'failed',
      errorMessage: [
        caughtError instanceof Error
          ? caughtError.message
          : 'The paid x402 request failed.',
        refundError
          ? `Paykubo advanced this action from the vault, but could not return the unused signer funds: ${refundError}`
          : undefined
      ]
        .filter(Boolean)
        .join(' '),
      completedAt: new Date().toISOString()
    } satisfies AgentAction
  }
}

function describeAgentActionProgress(action: AgentAction) {
  if (action.status === 'planned') {
    return `${action.productName} is queued.`
  }

  if (action.status === 'quoted') {
    return `${action.productName} was quoted at ${action.amountUsdc}; Paykubo is advancing vault funds.`
  }

  if (action.status === 'paid') {
    return `${action.productName} is paid and running. Async tools stay in this state while Paykubo polls the provider result.`
  }

  if (action.status === 'completed') {
    return `${action.productName} completed and returned a receipt-backed result.`
  }

  if (action.status === 'skipped') {
    return `${action.productName} was skipped: ${
      action.errorMessage ??
      'the action could not run inside the selected budget.'
    }`
  }

  return `${action.productName} failed: ${
    action.errorMessage ?? 'the paid action did not complete.'
  }`
}

function parseUsdcLabel(value: string) {
  const amount = Number(value.replace(/[^0-9.]/g, ''))

  return Number.isFinite(amount) ? amount : 0
}

async function advanceAgentVaultSpend({
  runId,
  action,
  amountUsd,
  amountLabel
}: {
  runId: string
  action: AgentAction
  amountUsd: number
  amountLabel: string
}) {
  const paymentId = getAgentVaultPaymentId(runId, action.id)
  const result = await writeAgentRunVault({
    functionName: 'recordSpend',
    args: [getAgentRunBytes32(runId), paymentId, parseUsdcToAtomic(amountUsd)]
  })

  if (!result) {
    throw new Error(
      'AgentRunVault spend could not be advanced. Set NEXT_PUBLIC_AGENT_RUN_VAULT_ADDRESS and AGENT_RUN_VAULT_OPERATOR_PRIVATE_KEY so Paykubo can transfer the funded run budget to the agent signer before x402 settlement.'
    )
  }

  return {
    ...action,
    vaultPaymentId: paymentId,
    vaultAdvancedAmountUsdc: amountLabel,
    vaultSpendTxHash: result.txHash,
    vaultSpendExplorerUrl: result.explorerUrl
  } satisfies AgentAction
}

async function refundAgentVaultAdvance({
  runId,
  action,
  amountUsd,
  amountLabel
}: {
  runId: string
  action: AgentAction
  amountUsd: number
  amountLabel: string
}) {
  if (!action.vaultPaymentId) {
    throw new Error('The vault payment ID is missing for this agent action.')
  }

  const requestedAmount = parseUsdcToAtomic(amountUsd)
  const budget = await getAgentRunVaultBudget(runId).catch(() => null)
  const refundableAmount =
    budget && budget.spentAmount < requestedAmount
      ? budget.spentAmount
      : requestedAmount

  if (refundableAmount <= 0n) {
    return {
      vaultRefundedAmountUsdc: '0.00 USDC'
    } satisfies Partial<AgentAction>
  }

  const returnTx = await returnAgentSignerUsdcToVault(refundableAmount)
  const refund = await writeAgentRunVault({
    functionName: 'recordSpendRefund',
    args: [
      getAgentRunBytes32(runId),
      action.vaultPaymentId as Hex,
      refundableAmount
    ]
  })

  if (!refund) {
    throw new Error(
      'AgentRunVault refund record could not be written. The signer transfer was submitted, but the operator key or vault address is not configured for recordSpendRefund.'
    )
  }

  return {
    vaultRefundedAmountUsdc:
      refundableAmount === requestedAmount
        ? amountLabel
        : formatUsdcAmount(refundableAmount),
    vaultRefundTxHash: refund.txHash,
    vaultRefundExplorerUrl: refund.explorerUrl,
    vaultReturnTxHash: returnTx.txHash,
    vaultReturnExplorerUrl: returnTx.explorerUrl
  } satisfies Partial<AgentAction>
}

async function callPaidProductWithAgentWallet(
  runId: string,
  action: AgentAction,
  appUrl: string,
  onProgress?: PaidProductProgressHandler
) {
  const privateKey = envServer.AGENT_SPENDER_PRIVATE_KEY

  if (!privateKey) {
    throw new Error('AGENT_SPENDER_PRIVATE_KEY is not configured.')
  }

  const account = privateKeyToAccount(
    (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex
  )
  const client = registerExactEvmScheme(new x402Client(), { signer: account })
  const httpClient = new x402HTTPClient(client)
  const paidFetch = wrapFetchWithPayment(fetch, httpClient)
  const response = await paidFetch(
    `${appUrl}/api/x402/products/${action.productSlug}/call`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-paykubo-agent-run-id': runId
      },
      body: JSON.stringify(action.requestPayload)
    }
  )
  const paymentResult = await httpClient
    .processResponse(response.clone())
    .catch(() => null)
  const body = await readJsonResponse(response)

  if (!response.ok) {
    throw new Error(describePaidCallFailure(response, body, paymentResult))
  }

  await onProgress?.(body as PaidProductCallResponse)

  return await waitForPaidProductCompletion({
    appUrl,
    initial: body as PaidProductCallResponse,
    onProgress
  })
}

type PaidProductCallResponse = {
  order?: Partial<MarketplaceOrder>
  receipt: MarketplaceReceipt
  data: Record<string, unknown>
  pricing?: unknown
  provider?: unknown
  x402?: unknown
  escrow?: unknown
}

type PaidProductProgressHandler = (
  result: PaidProductCallResponse,
  pollingResponse?: AgentAsyncPollingResponse
) => Promise<void> | void

type ProviderStatusResponse = {
  error?: string
  order?: MarketplaceOrder
  provider?: {
    status?: string
    externalJobId?: string
    resultUrl?: string
    responsePayload?: unknown
    errorMessage?: string
  }
  pricing?: unknown
  escrow?: unknown
}

async function waitForPaidProductCompletion({
  appUrl,
  initial,
  onProgress
}: {
  appUrl: string
  initial: PaidProductCallResponse
  onProgress?: PaidProductProgressHandler
}) {
  const order = initial.order

  if (!shouldPollPaidOrder(order)) {
    return normalizePaidProductResponse(initial, order)
  }

  let lastOrder = order

  for (let attempt = 1; attempt <= asyncProviderPollAttempts; attempt += 1) {
    if (attempt > 1) {
      await delay(asyncProviderPollIntervalMs)
    }

    const pollingUrl = `${appUrl}/api/orders/${encodeURIComponent(String(order?.id))}/provider-status`
    const pollingRequest = {
      method: 'GET',
      url: pollingUrl,
      headers: { Accept: 'application/json' },
      params: { orderId: String(order?.id ?? '') }
    }
    const response = await fetch(pollingUrl, {
      headers: pollingRequest.headers
    })
    const body = (await readJsonResponse(response)) as ProviderStatusResponse
    const pollingResponse = buildAsyncPollingResponse({
      attempt,
      pollingUrl,
      request: pollingRequest,
      httpStatus: response.status,
      body
    })

    if (!response.ok || !body.order) {
      const failedProgress = normalizePaidProductResponse(
        {
          ...initial,
          data: {
            ...initial.data,
            providerStatusError: body
          }
        },
        lastOrder
      )
      await onProgress?.(failedProgress, pollingResponse)
      throw new Error(
        body.error ??
          `Unable to poll async provider status (${response.status} ${response.statusText}).`
      )
    }

    lastOrder = body.order
    const next = normalizePaidProductResponse(
      {
        ...initial,
        order: body.order,
        data: buildProviderStatusData(body)
      },
      body.order
    )
    await onProgress?.(next, pollingResponse)

    if (!shouldPollPaidOrder(body.order)) {
      return next
    }
  }

  throw new Error(
    [
      `Async provider job ${lastOrder?.externalJobId ?? ''} did not finish before the agent polling window expired.`,
      'Open the order page to continue polling, or retry the agent after the provider job completes.'
    ]
      .filter(Boolean)
      .join(' ')
  )
}

function buildAsyncPollingResponse({
  attempt,
  pollingUrl,
  request,
  httpStatus,
  body
}: {
  attempt: number
  pollingUrl: string
  request: AgentAsyncPollingResponse['request']
  httpStatus: number
  body: ProviderStatusResponse
}): AgentAsyncPollingResponse {
  const resultUrl =
    body.order?.resultUrl ??
    body.provider?.resultUrl ??
    extractResultUrl(body.order?.responsePayload) ??
    extractResultUrl(body.provider?.responsePayload)

  return {
    id: `poll_${Date.now().toString(36)}_${attempt}`,
    attempt,
    polledAt: new Date().toISOString(),
    pollingUrl,
    request,
    httpStatus,
    orderStatus: body.order?.status,
    resultReleaseStatus: body.order?.resultReleaseStatus,
    externalJobId: body.order?.externalJobId ?? body.provider?.externalJobId,
    resultUrl,
    response: body as Record<string, unknown>
  }
}

function buildPaidProductResponsePayload(result: PaidProductCallResponse) {
  const payload: Record<string, unknown> = {
    data: result.data,
    order: result.order,
    receipt: result.receipt,
    pricing: result.pricing,
    provider: result.provider,
    x402: result.x402,
    escrow: result.escrow
  }
  const resultUrl =
    extractResultUrl(result.data) ??
    extractResultUrl(result.order?.responsePayload) ??
    result.order?.resultUrl

  if (resultUrl) {
    payload.resultUrl = resultUrl
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  )
}

function normalizePaidProductResponse(
  response: PaidProductCallResponse,
  order: PaidProductCallResponse['order']
): PaidProductCallResponse {
  return {
    ...response,
    order,
    data: {
      ...response.data,
      order,
      resultUrl:
        order?.resultUrl ??
        extractResultUrl(response.data) ??
        response.data?.resultUrl,
      externalJobId: order?.externalJobId ?? response.data?.externalJobId,
      status: order?.status ?? response.data?.status,
      resultReleaseStatus:
        order?.resultReleaseStatus ?? response.data?.resultReleaseStatus
    }
  }
}

function buildProviderStatusData(body: ProviderStatusResponse) {
  const order = body.order
  const responsePayload =
    order?.responsePayload ?? body.provider?.responsePayload
  const resultUrl =
    order?.resultUrl ??
    body.provider?.resultUrl ??
    extractResultUrl(responsePayload)

  return {
    status: order?.status ?? body.provider?.status,
    resultReleaseStatus: order?.resultReleaseStatus,
    externalJobId: order?.externalJobId ?? body.provider?.externalJobId,
    resultUrl,
    responsePayload,
    provider: body.provider,
    pricing: body.pricing,
    escrow: body.escrow,
    order
  } as Record<string, unknown>
}

function shouldPollPaidOrder(order: PaidProductCallResponse['order']) {
  if (!order?.id) {
    return false
  }

  if (
    order.status === 'completed' ||
    order.status === 'failed' ||
    order.status === 'expired' ||
    order.status === 'delta_payment_required'
  ) {
    return false
  }

  return Boolean(
    order.externalJobId ||
      order.resultReleaseStatus === 'provider_retrying' ||
      order.resultReleaseStatus === 'reserved'
  )
}

function extractResultUrl(value: unknown): string | undefined {
  const direct = getStringPath(value, [
    'resultUrl',
    'renderUrl',
    'previewUrl',
    'publicProjectUrl',
    'projectUrl',
    'cloneUrl',
    'outputUrl',
    'url'
  ])

  if (direct) {
    return direct
  }

  return getStringPath(value, [
    'result.resultUrl',
    'result.renderUrl',
    'result.previewUrl',
    'result.publicProjectUrl',
    'result.projectUrl',
    'result.cloneUrl',
    'result.outputUrl',
    'data.resultUrl',
    'data.renderUrl',
    'data.previewUrl',
    'data.publicProjectUrl',
    'data.projectUrl',
    'data.cloneUrl',
    'data.outputUrl'
  ])
}

function getStringPath(value: unknown, paths: string[]) {
  for (const path of paths) {
    const match = readPath(value, path)

    if (typeof match === 'string' && match.trim().length > 0) {
      return match
    }
  }

  return undefined
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined
    }

    return (current as Record<string, unknown>)[key]
  }, value)
}

function describeAsyncOrderFailure(order: PaidProductCallResponse['order']) {
  if (!order) {
    return 'The paid provider request failed.'
  }

  const providerError =
    typeof order.responsePayload === 'object' &&
    order.responsePayload &&
    'errorMessage' in order.responsePayload &&
    typeof order.responsePayload.errorMessage === 'string'
      ? order.responsePayload.errorMessage
      : undefined

  return (
    providerError ||
    `The provider job ended with status ${order.status}. Result release state: ${
      order.resultReleaseStatus ?? 'unknown'
    }.`
  )
}

function didEscrowRefundBuyer(result: PaidProductCallResponse) {
  return (
    result.order?.resultReleaseStatus === 'refunded' ||
    result.order?.escrowStatus === 'refunded' ||
    result.receipt?.escrowStatus === 'refunded'
  )
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const agentPublicClient = createPublicClient({
  chain: defaultAppChain.viemChain,
  transport: http(defaultAppChain.viemChain.rpcUrls.default.http[0])
})

const usdcAgentAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
])

async function returnAgentSignerUsdcToVault(amount: bigint) {
  const privateKey = envServer.AGENT_SPENDER_PRIVATE_KEY
  const vaultAddress = getAgentRunVaultAddress()

  if (!privateKey) {
    throw new Error('AGENT_SPENDER_PRIVATE_KEY is not configured.')
  }

  if (!vaultAddress) {
    throw new Error('NEXT_PUBLIC_AGENT_RUN_VAULT_ADDRESS is not configured.')
  }

  const account = privateKeyToAccount(
    (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex
  )
  const walletClient = createWalletClient({
    account,
    chain: defaultAppChain.viemChain,
    transport: http(defaultAppChain.viemChain.rpcUrls.default.http[0])
  })
  const txHash = await walletClient
    .writeContract({
      address: morphUsdcTokenAddress as Address,
      abi: usdcAgentAbi,
      functionName: 'transfer',
      args: [vaultAddress, amount]
    })
    .catch(error => {
      throw new Error(
        `Agent signer could not return unused USDC to the vault. The signer may need Hoodi ETH for gas. ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    })
  const receipt = await agentPublicClient.waitForTransactionReceipt({
    hash: txHash
  })

  if (receipt.status !== 'success') {
    throw new Error(`Agent signer USDC return transaction reverted: ${txHash}`)
  }

  return {
    txHash,
    explorerUrl: buildExplorerUrl(txHash)
  } satisfies AgentVaultWriteResult
}

async function ensureAgentCanPayWithPermit2(amountUsd: number) {
  const privateKey = envServer.AGENT_SPENDER_PRIVATE_KEY

  if (!privateKey) {
    throw new Error('AGENT_SPENDER_PRIVATE_KEY is not configured.')
  }

  const requiredAmount = parseUnits(amountUsd.toFixed(6), 18)

  if (requiredAmount <= 0n) {
    return
  }

  const account = privateKeyToAccount(
    (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex
  )
  const tokenAddress = morphUsdcTokenAddress as Address
  const [balance, allowance] = await Promise.all([
    agentPublicClient.readContract({
      address: tokenAddress,
      abi: usdcAgentAbi,
      functionName: 'balanceOf',
      args: [account.address]
    }),
    agentPublicClient.readContract(
      getPermit2AllowanceReadParams({
        tokenAddress,
        ownerAddress: account.address
      })
    )
  ])

  if (balance < requiredAmount) {
    throw new Error(
      `Agent signer did not receive enough USDC from AgentRunVault. Required ${formatUsdcAmount(
        requiredAmount
      )}, available ${formatUsdcAmount(balance)}. Confirm the run vault is funded and AGENT_RUN_VAULT_OPERATOR_PRIVATE_KEY can call recordSpend.`
    )
  }

  if (allowance >= requiredAmount) {
    return
  }

  const walletClient = createWalletClient({
    account,
    chain: defaultAppChain.viemChain,
    transport: http(defaultAppChain.viemChain.rpcUrls.default.http[0])
  })
  const approval = createPermit2ApprovalTx(tokenAddress)
  const txHash = await walletClient
    .sendTransaction({
      account,
      chain: defaultAppChain.viemChain,
      to: approval.to,
      data: approval.data
    })
    .catch(error => {
      throw new Error(
        `Agent signer received vault USDC but could not submit the Permit2 approval. Fund the agent signer with a small amount of Hoodi ETH for gas. ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    })
  const receipt = await agentPublicClient.waitForTransactionReceipt({
    hash: txHash
  })

  if (receipt.status !== 'success') {
    throw new Error(`Agent USDC Permit2 approval failed: ${txHash}`)
  }

  await waitForAgentPermit2Allowance({
    tokenAddress,
    ownerAddress: account.address,
    requiredAmount
  })
}

async function waitForAgentPermit2Allowance({
  tokenAddress,
  ownerAddress,
  requiredAmount
}: {
  tokenAddress: Address
  ownerAddress: Address
  requiredAmount: bigint
}) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const allowance = await agentPublicClient.readContract(
      getPermit2AllowanceReadParams({
        tokenAddress,
        ownerAddress
      })
    )

    if (allowance >= requiredAmount) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 1200))
  }

  throw new Error(
    'Agent USDC Permit2 approval was submitted, but the allowance is not readable yet. Retry the agent run in a moment.'
  )
}

function formatUsdcAmount(amount: bigint) {
  return `${Number(formatUnits(amount, 18)).toLocaleString(undefined, {
    maximumFractionDigits: 6
  })} USDC`
}

async function readJsonResponse(response: Response) {
  const text = await response.text().catch(() => '')

  if (!text) {
    return {} as Record<string, unknown>
  }

  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { message: text }
  }
}

function describePaidCallFailure(
  response: Response,
  body: Record<string, unknown>,
  paymentResult: x402PaymentResult | null
) {
  if (paymentResult?.kind === 'settle_failed') {
    return (
      [
        paymentResult.settleResponse.errorMessage,
        paymentResult.settleResponse.errorReason
      ]
        .filter(Boolean)
        .join(' ') || 'USDC settlement failed.'
    )
  }

  if (paymentResult?.kind === 'payment_required') {
    return [
      paymentResult.paymentRequired.error,
      body.error,
      body.message,
      body.guidance
    ]
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0
      )
      .join(' ')
  }

  if (paymentResult?.kind === 'error') {
    const resultBody =
      paymentResult.body &&
      typeof paymentResult.body === 'object' &&
      !Array.isArray(paymentResult.body)
        ? (paymentResult.body as Record<string, unknown>)
        : {}
    const message = describePaidCallFailureBody(response, resultBody)

    if (message) {
      return message
    }
  }

  return (
    describePaidCallFailureBody(response, body) ||
    `Paid product call failed with ${response.status} ${response.statusText}.`
  )
}

function describePaidCallFailureBody(
  response: Response,
  body: Record<string, unknown>
) {
  const values = [
    body.error,
    body.message,
    body.guidance,
    typeof body.settlement === 'object' && body.settlement
      ? JSON.stringify(body.settlement)
      : undefined,
    typeof body.details === 'object' && body.details
      ? JSON.stringify(body.details)
      : undefined
  ].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )

  return values.join(' ')
}

async function buildDeliverables(
  run: AgentRun,
  actions: AgentAction[],
  planMetadata: AgentPlanMetadata
) {
  const completedActions = actions.filter(
    action => action.status === 'completed'
  )
  const paidCompletedActions = completedActions.filter(action => action.receipt)

  if (actions.length > 0 && paidCompletedActions.length === 0) {
    return buildFailedPaidActionDeliverables(run, actions, planMetadata)
  }

  if (envServer.AGENT_LLM_API_KEY) {
    const synthesized = await synthesizeWithOpenAi(
      run,
      actions,
      planMetadata
    ).catch(error => {
      console.warn('OpenAI synthesis failed; using fallback synthesis.', error)
      return null
    })

    if (synthesized) {
      return synthesized
    }
  }

  return buildFallbackDeliverables(run, actions, planMetadata)
}

function buildFailedPaidActionDeliverables(
  run: AgentRun,
  actions: AgentAction[],
  planMetadata: AgentPlanMetadata
) {
  const failed = actions.filter(action => action.status === 'failed')
  const skipped = actions.filter(action => action.status === 'skipped')

  return {
    ...planMetadata,
    launchBrief:
      'The agent did not produce a final launch pack because no paid tool returned a completed receipt-backed result.',
    developerCopy:
      'Retry the failed tools after funding and provider health are confirmed.',
    marketSignal:
      failed.length > 0
        ? `No external market signal is available. ${failed.length} paid action(s) failed and ${skipped.length} action(s) were skipped.`
        : 'No external market signal is available because the agent did not complete a paid action.',
    videoResultUrl: '',
    proofExplanation: `The production agent selected ${actions.length} tool(s), but no paid action completed with a receipt. The proof should preserve failed action reasons without presenting generated copy as externally verified evidence for: ${run.objective}`
  }
}

function buildFallbackDeliverables(
  run: AgentRun,
  actions: AgentAction[],
  planMetadata: AgentPlanMetadata
) {
  const completedActions = actions.filter(
    action => action.status === 'completed'
  )
  const asyncAction = completedActions.find(
    action =>
      Boolean(extractResultUrl(action.responsePayload)) ||
      Boolean(action.responsePayload?.externalJobId)
  )
  const videoResultUrl = extractResultUrl(asyncAction?.responsePayload)

  return {
    ...planMetadata,
    launchBrief: `The agent used ${completedActions.length} selected marketplace APIs for: ${run.objective}`,
    developerCopy: completedActions
      .map(action => `${action.productName}: ${action.status}`)
      .join('\n'),
    marketSignal:
      completedActions.length > 0
        ? `${completedActions.length} paid tool result(s) are attached to this run.`
        : undefined,
    videoResultUrl: videoResultUrl ?? ''
  }
}

type OpenAiSynthesisResponse = {
  launchBrief: string
  developerCopy: string
  marketSignal: string
  videoResultUrl: string
  proofExplanation: string
}

async function synthesizeWithOpenAi(
  run: AgentRun,
  actions: AgentAction[],
  planMetadata: AgentPlanMetadata
) {
  const model = envServer.AGENT_LLM_MODEL || 'gpt-5.2'
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${envServer.AGENT_LLM_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text: [
                'You are Paykubo Launch Pack Agent synthesizer.',
                'Use the completed paid tool outputs, receipts, skipped tools, and objective to produce the final launch-pack deliverables.',
                'Do not invent receipts, transactions, or provider results.',
                'Only include videoResultUrl when a completed media action returned a final result, project, render, preview, clone, or output URL. Do not use queued or processing job IDs as final media output.',
                'Return only structured JSON that matches the schema.'
              ].join('\n')
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                objective: run.objective,
                sourceText: run.sourceText ?? '',
                budgetCapUsdc: run.budgetCapUsdc,
                planMetadata,
                actions: actions.map(action => ({
                  productSlug: action.productSlug,
                  productName: action.productName,
                  providerName: action.providerName,
                  status: action.status,
                  amountUsdc: action.amountUsdc,
                  rationale: action.planningRationale,
                  requestPayload: action.requestPayload,
                  responsePayload: compactForSynthesis(action.responsePayload),
                  receipt: action.receipt
                    ? {
                        id: action.receipt.id,
                        amountUsdc: action.receipt.amountUsdc,
                        txHash: action.receipt.txHash,
                        explorerUrl: action.receipt.explorerUrl
                      }
                    : undefined,
                  errorMessage: action.errorMessage
                }))
              })
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'paykubo_agent_synthesis',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: [
              'launchBrief',
              'developerCopy',
              'marketSignal',
              'videoResultUrl',
              'proofExplanation'
            ],
            properties: {
              launchBrief: { type: 'string' },
              developerCopy: { type: 'string' },
              marketSignal: { type: 'string' },
              videoResultUrl: { type: 'string' },
              proofExplanation: { type: 'string' }
            }
          }
        }
      }
    })
  })
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!response.ok) {
    throw new Error(
      `OpenAI synthesis failed with ${response.status} ${response.statusText}: ${JSON.stringify(body)}`
    )
  }

  const synthesized = parseOpenAiJson<OpenAiSynthesisResponse>(body)

  if (!synthesized) {
    return null
  }

  return {
    ...planMetadata,
    synthesisModel: model,
    synthesisResponseId: typeof body?.id === 'string' ? body.id : undefined,
    ...synthesized
  }
}

function compactForSynthesis(value: unknown) {
  if (!value) {
    return undefined
  }

  const serialized = JSON.stringify(value)

  if (serialized.length <= 6000) {
    return value
  }

  return {
    truncated: true,
    preview: serialized.slice(0, 6000)
  }
}
