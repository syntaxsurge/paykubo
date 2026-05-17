import type { MarketplaceReceipt } from '@/features/marketplace/receipts'

export type AgentRunStatus =
  | 'planned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'attesting'
  | 'attested'

export type AgentActionStatus =
  | 'planned'
  | 'quoted'
  | 'paid'
  | 'completed'
  | 'skipped'
  | 'failed'

export type AgentRunMode = 'production'
export type AgentPlannerMode = 'openai' | 'deterministic'
export type AgentFundingStatus =
  | 'unfunded'
  | 'funding_pending'
  | 'funded'
  | 'partially_spent'
  | 'refund_available'
  | 'refunded'

export type AgentLedgerEventType =
  | 'funding_prepared'
  | 'funded'
  | 'run_started'
  | 'spend_recorded'
  | 'spend_refunded'
  | 'run_completed'
  | 'unused_refunded'

export type AgentLedgerEvent = {
  id: string
  type: AgentLedgerEventType
  label: string
  amountUsdc?: string
  txHash?: string | null
  explorerUrl?: string | null
  actionId?: string
  createdAt: string
}

export type AgentToolSlug = string

export type AgentSkippedTool = {
  slug: AgentToolSlug
  productName?: string
  reason: string
}

export type AgentAction = {
  id: string
  runId: string
  productSlug: AgentToolSlug
  productName: string
  providerName: string
  status: AgentActionStatus
  amountUsdc: string
  objective: string
  planningRationale?: string
  plannerScore?: number
  requestPayload: Record<string, unknown>
  responsePayload?: Record<string, unknown>
  receipt?: MarketplaceReceipt
  orderId?: string
  requestId?: string
  vaultPaymentId?: string
  vaultAdvancedAmountUsdc?: string
  vaultSpendTxHash?: string | null
  vaultSpendExplorerUrl?: string | null
  vaultRefundedAmountUsdc?: string
  vaultRefundTxHash?: string | null
  vaultRefundExplorerUrl?: string | null
  vaultReturnTxHash?: string | null
  vaultReturnExplorerUrl?: string | null
  errorMessage?: string
  startedAt?: string
  completedAt?: string
}

export type AgentProof = {
  id: string
  runId: string
  ownerWallet: string
  proofHash: `0x${string}`
  proofUri: string
  network: 'eip155:2910'
  txHash: string | null
  explorerUrl: string | null
  receiptIds: string[]
  totalSpendUsdc: string
  createdAt: string
}

export type AgentRun = {
  id: string
  template: string
  title: string
  objective: string
  sourceText?: string
  ownerWallet: string
  budgetCapUsdc: number
  maxPaidActions: number
  allowedTools: AgentToolSlug[]
  mode: AgentRunMode
  status: AgentRunStatus
  fundingStatus: AgentFundingStatus
  vaultPaymentId?: string
  vaultAddress?: string
  vaultExplorerUrl?: string | null
  fundedAmountUsdc: string
  spentAmountUsdc: string
  reservedAmountUsdc: string
  refundedAmountUsdc: string
  availableAmountUsdc: string
  fundingTxHash?: string
  fundingExplorerUrl?: string | null
  approvalTxHash?: string
  approvalExplorerUrl?: string | null
  refundTxHash?: string
  refundExplorerUrl?: string | null
  fundingExpiresAt?: string
  ledgerEvents: AgentLedgerEvent[]
  summary: string
  deliverables: {
    plannerMode?: AgentPlannerMode
    plannerModel?: string
    plannerResponseId?: string
    planningPrompt?: string
    toolSelectionRationale?: string
    skippedTools?: AgentSkippedTool[]
    expectedDeliverables?: string[]
    budgetInstruction?: string
    budgetStrategy?: string
    synthesisInstructions?: string
    synthesisModel?: string
    synthesisResponseId?: string
    proofExplanation?: string
    launchBrief?: string
    developerCopy?: string
    marketSignal?: string
    videoResultUrl?: string
  }
  actions: AgentAction[]
  proof?: AgentProof
  createdAt: string
  updatedAt: string
}

export type CreateAgentRunInput = {
  template?: string
  objective: string
  sourceText?: string
  ownerWallet: string
  budgetCapUsdc: number
  maxPaidActions: number
  allowedTools: AgentToolSlug[]
  mode: AgentRunMode
}
