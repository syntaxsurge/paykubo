import { attestAgentRunOnMorph } from '@/features/agents/attestation'
import {
  buildProofId,
  getAgentRunReceiptIds,
  hashAgentRunProof
} from '@/features/agents/proof'
import { executeAgentRunActions } from '@/features/agents/runner'
import { getAgentTemplate } from '@/features/agents/templates'
import type {
  AgentLedgerEvent,
  AgentProof,
  AgentRun,
  CreateAgentRunInput
} from '@/features/agents/types'
import { buildExplorerUrl } from '@/features/marketplace/receipts'
import {
  getAgentRunBytes32,
  getAgentRunVaultBudget,
  getAgentRunVaultAddress,
  getAgentRunVaultExplorerUrl,
  getAgentSignerAddress,
  getUsdcTokenAddress,
  isActiveAgentRunVaultBudget,
  parseUsdcToAtomic,
  writeAgentRunVault
} from '@/lib/contracts/agent-run-vault'
import { getConvexClient } from '@/lib/db/convex/client'

import { api } from '../../../convex/_generated/api'

type AgentGlobalStore = {
  runs: Map<string, AgentRun>
  proofs: Map<string, AgentProof>
  cancelledRuns: Set<string>
  loadedRuns?: boolean
  loadedProofs?: boolean
}

const globalStore = globalThis as typeof globalThis & {
  __paykuboAgentStore?: AgentGlobalStore
}

const store =
  globalStore.__paykuboAgentStore ??
  (globalStore.__paykuboAgentStore = {
    runs: new Map<string, AgentRun>(),
    proofs: new Map<string, AgentProof>(),
    cancelledRuns: new Set<string>()
  })

store.cancelledRuns ??= new Set<string>()

const runs = store.runs
const proofs = store.proofs
const cancelledRuns = store.cancelledRuns

export async function listAgentRuns() {
  await loadAgentRuns()

  return Array.from(runs.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export async function getAgentRun(runId: string) {
  await loadAgentRuns()

  return runs.get(runId)
}

export async function getAgentProof(proofId: string) {
  await loadAgentProofs()

  return proofs.get(proofId)
}

export async function createAgentRun(input: CreateAgentRunInput) {
  await loadAgentRuns()

  const now = new Date().toISOString()
  const runId = `run_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  const vaultAddress = getAgentRunVaultAddress() ?? undefined
  const template = getAgentTemplate(input.template)
  const run: AgentRun = {
    id: runId,
    template: template?.id ?? input.template ?? 'custom',
    title: template?.title ?? 'Custom Agent Run',
    objective: input.objective,
    sourceText: input.sourceText,
    ownerWallet: input.ownerWallet,
    budgetCapUsdc: input.budgetCapUsdc,
    maxPaidActions: input.maxPaidActions,
    allowedTools: input.allowedTools,
    mode: 'production',
    status: 'planned',
    fundingStatus: 'unfunded',
    vaultPaymentId: getAgentRunBytes32(runId),
    vaultAddress,
    vaultExplorerUrl: getAgentRunVaultExplorerUrl(),
    fundedAmountUsdc: '0.00 USDC',
    spentAmountUsdc: '0.00 USDC',
    reservedAmountUsdc: '0.00 USDC',
    refundedAmountUsdc: '0.00 USDC',
    availableAmountUsdc: '0.00 USDC',
    ledgerEvents: [],
    summary:
      'The launch-pack agent is ready to select paid tools, spend within budget, and prepare a Morph proof.',
    deliverables: {},
    actions: [],
    createdAt: now,
    updatedAt: now
  }

  runs.set(run.id, run)
  cancelledRuns.delete(run.id)
  await persistAgentRun(run)

  return run
}

export async function deleteAgentRun(runId: string) {
  const run = await getAgentRun(runId)

  if (!run) {
    return null
  }

  cancelledRuns.add(runId)

  if (
    ['funded', 'partially_spent', 'refund_available'].includes(
      run.fundingStatus
    ) &&
    run.availableAmountUsdc !== '0.00 USDC'
  ) {
    await writeAgentRunVault({
      functionName: 'cancelRun',
      args: [getAgentRunBytes32(run.id)]
    }).catch(() => null)

    await writeAgentRunVault({
      functionName: 'refundUnused',
      args: [getAgentRunBytes32(run.id)]
    }).catch(() => null)
  }

  runs.delete(runId)
  await getConvexClient().mutation(api.agentState.deleteRun, { runKey: runId })
  Array.from(proofs.entries()).forEach(([proofId, proof]) => {
    if (proof.runId === runId) {
      proofs.delete(proofId)
    }
  })
  await getConvexClient().mutation(api.agentState.deleteProofsForRun, {
    runKey: runId
  })

  return run
}

export function isAgentRunCancelled(runId: string) {
  return cancelledRuns.has(runId)
}

export async function executeStoredAgentRun(runId: string, appUrl?: string) {
  const run = await getAgentRun(runId)

  if (!run) {
    return null
  }

  if (
    !['funded', 'partially_spent', 'refund_available'].includes(
      run.fundingStatus
    )
  ) {
    return {
      ...run,
      summary: 'Fund this agent run before it can spend USDC through x402.',
      updatedAt: new Date().toISOString()
    } satisfies AgentRun
  }

  const budget = await getAgentRunVaultBudget(run.id).catch(() => null)

  if (!isActiveAgentRunVaultBudget(budget) && budget?.state === 0) {
    const nextRun = resetRunFundingState(
      run,
      'This run is not funded in the current AgentRunVault. Fund the agent again before retrying paid actions.'
    )

    runs.set(run.id, nextRun)
    await persistAgentRun(nextRun)

    return nextRun
  }

  if (!isActiveAgentRunVaultBudget(budget)) {
    const nextRun = {
      ...run,
      status: 'failed',
      summary:
        'This run has an AgentRunVault budget, but it is no longer active for new paid actions. Refund unused budget, then create or fund a fresh run.',
      updatedAt: new Date().toISOString()
    } satisfies AgentRun

    runs.set(run.id, nextRun)
    await persistAgentRun(nextRun)

    return nextRun
  }

  const running = {
    ...run,
    status: 'running',
    fundingStatus: 'partially_spent',
    ledgerEvents: [
      ...run.ledgerEvents,
      buildLedgerEvent({
        type: 'run_started',
        label: 'Agent run started with a funded on-chain budget.'
      })
    ],
    updatedAt: new Date().toISOString()
  } satisfies AgentRun
  runs.set(run.id, running)
  await persistAgentRun(running)

  await writeAgentRunVault({
    functionName: 'markRunning',
    args: [getAgentRunBytes32(run.id)]
  }).catch(() => null)

  const result = await executeAgentRunActions(
    running,
    () => isAgentRunCancelled(run.id),
    appUrl
  )

  if (isAgentRunCancelled(run.id)) {
    return null
  }

  const ledgerResult = await buildSpendLedger(running, result.actions)
  const nextRun = {
    ...running,
    status: result.status,
    actions: result.actions,
    deliverables: result.deliverables,
    summary: result.summary,
    fundingStatus:
      ledgerResult.availableAmountUsdc === '0.00 USDC'
        ? 'partially_spent'
        : 'refund_available',
    spentAmountUsdc: ledgerResult.spentAmountUsdc,
    reservedAmountUsdc: ledgerResult.reservedAmountUsdc,
    availableAmountUsdc: ledgerResult.availableAmountUsdc,
    ledgerEvents: ledgerResult.ledgerEvents,
    updatedAt: new Date().toISOString()
  } satisfies AgentRun

  runs.set(run.id, nextRun)
  await persistAgentRun(nextRun)

  await writeAgentRunVault({
    functionName: result.status === 'completed' ? 'markCompleted' : 'cancelRun',
    args: [getAgentRunBytes32(run.id)]
  }).catch(() => null)

  return nextRun
}

export async function prepareAgentRunFunding(runId: string) {
  const run = await getAgentRun(runId)
  const vaultAddress = getAgentRunVaultAddress()
  const agentSigner = getAgentSignerAddress()

  if (!run) {
    return null
  }

  const existingBudget = await getAgentRunVaultBudget(run.id).catch(() => null)

  if (isActiveAgentRunVaultBudget(existingBudget)) {
    return {
      error:
        'This agent run is already funded in the current AgentRunVault. Run the agent or refund unused budget before funding it again.'
    }
  }

  if (existingBudget && existingBudget.state !== 0) {
    return {
      error:
        'This agent run already has a finalized or inactive budget in the current AgentRunVault. Refund unused budget, then create a new run.'
    }
  }

  if (!vaultAddress || !agentSigner) {
    return {
      error:
        'Agent budget vault is not configured. Deploy AgentRunVault and set NEXT_PUBLIC_AGENT_RUN_VAULT_ADDRESS plus AGENT_SPENDER_PRIVATE_KEY.'
    }
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24
  const nextRun = {
    ...run,
    fundingStatus: 'funding_pending',
    vaultAddress,
    vaultExplorerUrl: getAgentRunVaultExplorerUrl(),
    fundingExpiresAt: new Date(expiresAt * 1000).toISOString(),
    ledgerEvents: [
      ...run.ledgerEvents,
      buildLedgerEvent({
        type: 'funding_prepared',
        label: 'Funding request prepared for the agent run vault.',
        amountUsdc: `${run.budgetCapUsdc.toFixed(2)} USDC`
      })
    ],
    updatedAt: new Date().toISOString()
  } satisfies AgentRun

  runs.set(run.id, nextRun)
  await persistAgentRun(nextRun)

  return {
    run: nextRun,
    funding: {
      runId: getAgentRunBytes32(run.id),
      vaultAddress,
      tokenAddress: getUsdcTokenAddress(),
      amount: parseUsdcToAtomic(run.budgetCapUsdc).toString(),
      amountUsdc: `${run.budgetCapUsdc.toFixed(2)} USDC`,
      agentSigner,
      expiresAt
    }
  }
}

export async function confirmAgentRunFunding({
  runId,
  fundingTxHash,
  approvalTxHash
}: {
  runId: string
  fundingTxHash: string
  approvalTxHash?: string
}) {
  const run = await getAgentRun(runId)

  if (!run) {
    return null
  }

  const budget = await waitForActiveVaultBudget(run.id)

  if (!isActiveAgentRunVaultBudget(budget)) {
    return resetRunFundingState(
      run,
      'Funding transaction was not found in the current AgentRunVault. Confirm that your wallet submitted fundRun to the configured vault address, then fund the agent again.'
    )
  }

  const amountUsdc = `${run.budgetCapUsdc.toFixed(2)} USDC`
  const nextRun = {
    ...run,
    fundingStatus: 'funded',
    fundedAmountUsdc: amountUsdc,
    availableAmountUsdc: amountUsdc,
    fundingTxHash,
    fundingExplorerUrl: buildExplorerUrl(fundingTxHash),
    approvalTxHash,
    approvalExplorerUrl: buildExplorerUrl(approvalTxHash),
    ledgerEvents: [
      ...run.ledgerEvents,
      buildLedgerEvent({
        type: 'funded',
        label: 'User funded this autonomous agent run.',
        amountUsdc,
        txHash: fundingTxHash,
        explorerUrl: buildExplorerUrl(fundingTxHash)
      })
    ],
    summary:
      'The agent budget is funded. OpenAI can now select tools and Paykubo can pay x402 calls inside this budget.',
    updatedAt: new Date().toISOString()
  } satisfies AgentRun

  runs.set(run.id, nextRun)
  await persistAgentRun(nextRun)

  return nextRun
}

export async function refundAgentRunUnusedBudget({
  runId,
  refundTxHash
}: {
  runId: string
  refundTxHash?: string
}) {
  const run = await getAgentRun(runId)

  if (!run) {
    return null
  }

  const available = run.availableAmountUsdc
  const tx =
    refundTxHash ??
    (
      await writeAgentRunVault({
        functionName: 'refundUnused',
        args: [getAgentRunBytes32(run.id)]
      }).catch(() => null)
    )?.txHash

  const nextRun = {
    ...run,
    fundingStatus: 'refunded',
    refundedAmountUsdc: addUsdc(run.refundedAmountUsdc, available),
    availableAmountUsdc: '0.00 USDC',
    refundTxHash: tx,
    refundExplorerUrl: buildExplorerUrl(tx),
    ledgerEvents: [
      ...run.ledgerEvents,
      buildLedgerEvent({
        type: 'unused_refunded',
        label: 'Unused agent budget was returned to the owner.',
        amountUsdc: available,
        txHash: tx,
        explorerUrl: buildExplorerUrl(tx)
      })
    ],
    updatedAt: new Date().toISOString()
  } satisfies AgentRun

  runs.set(run.id, nextRun)
  await persistAgentRun(nextRun)

  return nextRun
}

export async function getAgentRunLedger(runId: string) {
  return (await getAgentRun(runId))?.ledgerEvents ?? null
}

export async function attestStoredAgentRun(runId: string) {
  const run = await getAgentRun(runId)

  if (!run) {
    return null
  }

  const proofHash = hashAgentRunProof(run)
  const proofId = buildProofId(proofHash)
  const now = new Date().toISOString()
  const proofBase = {
    id: proofId,
    runId: run.id,
    ownerWallet: run.ownerWallet,
    proofHash,
    proofUri: `/proofs/${proofId}`,
    network: 'eip155:2910',
    receiptIds: getAgentRunReceiptIds(run.actions),
    totalSpendUsdc: calculateTotalSpend(run),
    createdAt: now
  } satisfies Omit<AgentProof, 'txHash' | 'explorerUrl'>

  const attestingRun = {
    ...run,
    status: 'attesting',
    updatedAt: now
  } satisfies AgentRun
  runs.set(run.id, attestingRun)
  await persistAgentRun(attestingRun)

  const attestation = await attestAgentRunOnMorph(run, proofBase)
  const proof: AgentProof = {
    ...proofBase,
    txHash: attestation.txHash,
    explorerUrl: attestation.explorerUrl
  }
  const nextRun = {
    ...run,
    status: 'attested',
    proof,
    updatedAt: new Date().toISOString()
  } satisfies AgentRun

  proofs.set(proof.id, proof)
  runs.set(run.id, nextRun)
  await persistAgentProof(proof)
  await persistAgentRun(nextRun)

  return nextRun
}

export async function getAgentMetrics() {
  const allRuns = await listAgentRuns()
  const completed = allRuns.filter(run =>
    ['completed', 'attested'].includes(run.status)
  )
  const proofsCount = allRuns.filter(run => run.proof).length

  return {
    totalRuns: allRuns.length,
    completedRuns: completed.length,
    proofCount: proofsCount,
    totalSpendUsdc: allRuns
      .reduce((sum, run) => sum + Number(calculateTotalSpend(run)), 0)
      .toFixed(2)
  }
}

function calculateTotalSpend(run: AgentRun) {
  return run.actions
    .reduce((sum, action) => {
      if (action.status !== 'completed') {
        return sum
      }

      return sum + Number(action.amountUsdc.replace(' USDC', ''))
    }, 0)
    .toFixed(2)
}

function buildLedgerEvent({
  type,
  label,
  amountUsdc,
  txHash,
  explorerUrl,
  actionId
}: Omit<AgentLedgerEvent, 'id' | 'createdAt'>): AgentLedgerEvent {
  return {
    id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    type,
    label,
    amountUsdc,
    txHash,
    explorerUrl,
    actionId,
    createdAt: new Date().toISOString()
  }
}

function resetRunFundingState(run: AgentRun, summary: string) {
  return {
    ...run,
    status: 'planned',
    fundingStatus: 'unfunded',
    fundedAmountUsdc: '0.00 USDC',
    spentAmountUsdc: '0.00 USDC',
    reservedAmountUsdc: '0.00 USDC',
    refundedAmountUsdc: '0.00 USDC',
    availableAmountUsdc: '0.00 USDC',
    fundingTxHash: undefined,
    fundingExplorerUrl: undefined,
    approvalTxHash: undefined,
    approvalExplorerUrl: undefined,
    fundingExpiresAt: undefined,
    summary,
    updatedAt: new Date().toISOString()
  } satisfies AgentRun
}

async function waitForActiveVaultBudget(runId: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const budget = await getAgentRunVaultBudget(runId).catch(() => null)

    if (isActiveAgentRunVaultBudget(budget)) {
      return budget
    }

    if (attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, 1200))
    }
  }

  return await getAgentRunVaultBudget(runId).catch(() => null)
}

async function buildSpendLedger(run: AgentRun, actions: AgentRun['actions']) {
  const newEvents: AgentLedgerEvent[] = []
  let spent = 0

  for (const action of actions) {
    const advanced = parseUsdc(action.vaultAdvancedAmountUsdc)
    const refunded = parseUsdc(action.vaultRefundedAmountUsdc)

    if (advanced <= 0) {
      continue
    }

    spent += Math.max(0, advanced - refunded)
    newEvents.push(
      buildLedgerEvent({
        type: 'spend_recorded',
        label: `Agent advanced vault budget to pay ${action.productName}.`,
        amountUsdc: `${advanced.toFixed(2)} USDC`,
        txHash: action.vaultSpendTxHash ?? action.receipt?.txHash,
        explorerUrl:
          action.vaultSpendExplorerUrl ?? action.receipt?.explorerUrl,
        actionId: action.id
      })
    )

    if (refunded > 0) {
      newEvents.push(
        buildLedgerEvent({
          type: 'spend_refunded',
          label: `Unused agent signer funds were returned after ${action.productName}.`,
          amountUsdc: `${refunded.toFixed(2)} USDC`,
          txHash: action.vaultRefundTxHash ?? action.vaultReturnTxHash,
          explorerUrl:
            action.vaultRefundExplorerUrl ?? action.vaultReturnExplorerUrl,
          actionId: action.id
        })
      )
    }
  }

  const funded = parseUsdc(run.fundedAmountUsdc)
  const available = Math.max(0, funded - spent)

  return {
    spentAmountUsdc: `${spent.toFixed(2)} USDC`,
    reservedAmountUsdc: '0.00 USDC',
    availableAmountUsdc: `${available.toFixed(2)} USDC`,
    ledgerEvents: [
      ...run.ledgerEvents,
      ...newEvents,
      buildLedgerEvent({
        type: 'run_completed',
        label: 'Agent execution ended. Any remaining budget can be refunded.',
        amountUsdc: `${available.toFixed(2)} USDC`
      })
    ]
  }
}

async function loadAgentRuns() {
  if (store.loadedRuns) {
    return
  }

  const rows = await getConvexClient().query(api.agentState.listRuns, {})
  runs.clear()

  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (isAgentRun(row)) {
        runs.set(row.id, row)
      }
    }
  }

  store.loadedRuns = true
}

async function loadAgentProofs() {
  if (store.loadedProofs) {
    return
  }

  const rows = await getConvexClient().query(api.agentState.listProofs, {})
  proofs.clear()

  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (isAgentProof(row)) {
        proofs.set(row.id, row)
      }
    }
  }

  store.loadedProofs = true
}

async function persistAgentRun(run: AgentRun) {
  await getConvexClient().mutation(api.agentState.upsertRun, {
    runKey: run.id,
    runJson: JSON.stringify(run)
  })
}

async function persistAgentProof(proof: AgentProof) {
  await getConvexClient().mutation(api.agentState.upsertProof, {
    proofKey: proof.id,
    proofJson: JSON.stringify(proof)
  })
}

function parseUsdc(value: string | null | undefined) {
  const amount = Number((value ?? '').replace(/[^0-9.]/g, ''))

  return Number.isFinite(amount) ? amount : 0
}

function addUsdc(first: string, second: string) {
  return `${(parseUsdc(first) + parseUsdc(second)).toFixed(2)} USDC`
}

function isAgentRun(value: unknown): value is AgentRun {
  if (!value || typeof value !== 'object') {
    return false
  }

  const run = value as Partial<AgentRun>

  return (
    typeof run.id === 'string' &&
    typeof run.title === 'string' &&
    typeof run.objective === 'string' &&
    typeof run.ownerWallet === 'string' &&
    typeof run.status === 'string' &&
    Array.isArray(run.actions) &&
    typeof run.createdAt === 'string'
  )
}

function isAgentProof(value: unknown): value is AgentProof {
  if (!value || typeof value !== 'object') {
    return false
  }

  const proof = value as Partial<AgentProof>

  return (
    typeof proof.id === 'string' &&
    typeof proof.runId === 'string' &&
    typeof proof.ownerWallet === 'string' &&
    typeof proof.proofHash === 'string' &&
    typeof proof.createdAt === 'string'
  )
}
