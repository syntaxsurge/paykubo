import { createHash } from 'node:crypto'

import type { AgentAction, AgentRun } from '@/features/agents/types'

export function hashAgentRunProof(run: AgentRun): `0x${string}` {
  const proofPayload = {
    runId: run.id,
    objective: run.objective,
    allowedTools: run.allowedTools,
    budgetCapUsdc: run.budgetCapUsdc,
    funding: {
      status: run.fundingStatus,
      vaultPaymentId: run.vaultPaymentId,
      vaultAddress: run.vaultAddress,
      fundedAmountUsdc: run.fundedAmountUsdc,
      spentAmountUsdc: run.spentAmountUsdc,
      reservedAmountUsdc: run.reservedAmountUsdc,
      refundedAmountUsdc: run.refundedAmountUsdc,
      availableAmountUsdc: run.availableAmountUsdc,
      fundingTxHash: run.fundingTxHash,
      refundTxHash: run.refundTxHash,
      ledgerEvents: run.ledgerEvents.map(event => ({
        type: event.type,
        label: event.label,
        amountUsdc: event.amountUsdc,
        txHash: event.txHash,
        actionId: event.actionId
      }))
    },
    planner: {
      mode: run.deliverables.plannerMode,
      model: run.deliverables.plannerModel,
      prompt: run.deliverables.planningPrompt,
      responseId: run.deliverables.plannerResponseId,
      skippedTools: run.deliverables.skippedTools,
      expectedDeliverables: run.deliverables.expectedDeliverables,
      budgetStrategy: run.deliverables.budgetStrategy,
      synthesisInstructions: run.deliverables.synthesisInstructions,
      synthesisModel: run.deliverables.synthesisModel,
      synthesisResponseId: run.deliverables.synthesisResponseId
    },
    actions: run.actions.map(action => ({
      id: action.id,
      productSlug: action.productSlug,
      status: action.status,
      planningRationale: action.planningRationale,
      plannerScore: action.plannerScore,
      orderId: action.orderId,
      receiptId: action.receipt?.id,
      responseHash: action.responsePayload
        ? hashObject(action.responsePayload)
        : undefined
    })),
    deliverables: run.deliverables,
    receiptIds: getAgentRunReceiptIds(run.actions)
  }

  return hashObject(proofPayload)
}

export function getAgentRunReceiptIds(actions: AgentAction[]) {
  return actions
    .map(action => action.receipt?.id)
    .filter((receiptId): receiptId is string => Boolean(receiptId))
}

export function hashObject(value: unknown): `0x${string}` {
  return `0x${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

export function buildProofId(proofHash: `0x${string}`) {
  return `proof_${proofHash.slice(2, 14)}`
}
