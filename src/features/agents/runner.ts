import { x402Client } from '@x402/core/client'
import {
  createPermit2ApprovalTx,
  getPermit2AllowanceReadParams
} from '@x402/evm'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import { wrapFetchWithPayment } from '@x402/fetch'
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
import type { AgentAction, AgentRun } from '@/features/agents/types'
import { resolveProductPrice } from '@/features/marketplace/pricing'
import { getProductBySlug } from '@/features/marketplace/products'
import type { MarketplaceReceipt } from '@/features/marketplace/receipts'
import { defaultAppChain, morphUsdcTokenAddress } from '@/lib/config/chains'
import { envClient } from '@/lib/env/env.client'
import { envServer } from '@/lib/env/env.server'

export async function executeAgentRunActions(
  run: AgentRun,
  shouldStop: () => boolean = () => false,
  appUrl = envClient.NEXT_PUBLIC_APP_URL
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
  let spendUsd = 0

  for (const action of actions) {
    if (shouldStop()) {
      completedActions.push({
        ...action,
        status: 'failed',
        errorMessage: 'The agent run was stopped before this action executed.',
        completedAt: new Date().toISOString()
      })
      break
    }

    const result = await executeAgentAction(run, action, spendUsd, appUrl)

    if (result.receipt) {
      spendUsd = Number(
        (spendUsd + parseUsdcLabel(result.receipt.amountUsdc)).toFixed(6)
      )
    }

    completedActions.push(result)

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
  appUrl?: string
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

  if (!envServer.AGENT_SPENDER_PRIVATE_KEY || !appUrl) {
    return {
      ...started,
      status: 'failed',
      errorMessage:
        'Production agent payment is not configured. Set AGENT_SPENDER_PRIVATE_KEY and NEXT_PUBLIC_APP_URL before running agent actions.',
      completedAt: new Date().toISOString()
    } satisfies AgentAction
  }

  try {
    await ensureAgentCanPayWithPermit2(quotedPrice.amountUsd)
    const paidResult = await callPaidProductWithAgentWallet(
      run.id,
      started,
      appUrl
    )

    return {
      ...started,
      status: 'completed',
      responsePayload: paidResult.data,
      receipt: paidResult.receipt,
      orderId: paidResult.order?.id,
      requestId: paidResult.order?.requestId,
      completedAt: new Date().toISOString()
    } satisfies AgentAction
  } catch (caughtError) {
    return {
      ...started,
      status: 'failed',
      errorMessage:
        caughtError instanceof Error
          ? caughtError.message
          : 'The paid x402 request failed.',
      completedAt: new Date().toISOString()
    } satisfies AgentAction
  }
}

function parseUsdcLabel(value: string) {
  const amount = Number(value.replace(/[^0-9.]/g, ''))

  return Number.isFinite(amount) ? amount : 0
}

async function callPaidProductWithAgentWallet(
  runId: string,
  action: AgentAction,
  appUrl: string
) {
  const privateKey = envServer.AGENT_SPENDER_PRIVATE_KEY

  if (!privateKey) {
    throw new Error('AGENT_SPENDER_PRIVATE_KEY is not configured.')
  }

  const account = privateKeyToAccount(
    (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex
  )
  const client = registerExactEvmScheme(new x402Client(), { signer: account })
  const paidFetch = wrapFetchWithPayment(fetch, client)
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
  const body = await readJsonResponse(response)

  if (!response.ok) {
    throw new Error(describePaidCallFailure(response, body))
  }

  return body as {
    order?: { id?: string; requestId?: string }
    receipt: MarketplaceReceipt
    data: Record<string, unknown>
  }
}

const agentPublicClient = createPublicClient({
  chain: defaultAppChain.viemChain,
  transport: http(defaultAppChain.viemChain.rpcUrls.default.http[0])
})

const usdcBalanceAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)'
])

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
      abi: usdcBalanceAbi,
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
      `Agent signer has insufficient USDC. Required ${formatUsdcAmount(
        requiredAmount
      )}, available ${formatUsdcAmount(balance)}. Fund AGENT_SPENDER_PRIVATE_KEY on Morph Hoodi before running paid actions.`
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
  const txHash = await walletClient.sendTransaction({
    account,
    chain: defaultAppChain.viemChain,
    to: approval.to,
    data: approval.data
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

  return (
    values.join(' ') ||
    `Paid product call failed with ${response.status} ${response.statusText}.`
  )
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
      Boolean(action.responsePayload?.resultUrl) ||
      Boolean(action.responsePayload?.externalJobId)
  )

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
    videoResultUrl: String(asyncAction?.responsePayload?.resultUrl ?? '')
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
                'If a media result URL exists, include it in videoResultUrl. Otherwise use an empty string.',
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
