'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  ExternalLink,
  FileCheck2,
  History,
  type LucideIcon,
  Play,
  ReceiptText,
  Route,
  ShieldCheck,
  Sparkles,
  Undo2,
  WalletCards
} from 'lucide-react'
import { createPublicClient, http, type Address, type Hex } from 'viem'
import { useAccount, useWalletClient } from 'wagmi'

import { JsonViewer } from '@/components/data-display/json-viewer'
import { MarkdownViewer } from '@/components/data-display/markdown-viewer'
import { Button, buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  agentActionStatusLabels,
  agentRunStatusDetails,
  agentRunStatusLabels
} from '@/features/agents/status'
import type { AgentLedgerEvent, AgentRun } from '@/features/agents/types'
import { defaultAppChain } from '@/lib/config/chains'
import {
  agentRunVaultAbi,
  erc20ApprovalAbi
} from '@/lib/contracts/agent-run-vault'

type AgentRunClientProps = {
  runId: string
  initialRun: AgentRun | null
}

type FundingPrepareResponse = {
  run: AgentRun
  funding: {
    runId: Hex
    vaultAddress: Address
    tokenAddress: Address
    amount: string
    amountUsdc: string
    agentSigner: Address
    expiresAt: number
  }
  error?: string
}

const publicClient = createPublicClient({
  chain: defaultAppChain.viemChain,
  transport: http(defaultAppChain.viemChain.rpcUrls.default.http[0])
})

export function AgentRunClient({ runId, initialRun }: AgentRunClientProps) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [run, setRun] = useState<AgentRun | null>(initialRun)
  const [status, setStatus] = useState('')
  const [isFunding, setIsFunding] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isRefunding, setIsRefunding] = useState(false)
  const [isAttesting, setIsAttesting] = useState(false)

  useEffect(() => {
    if (run) {
      return
    }

    const saved = window.sessionStorage.getItem(`paykubo:agent-run:${runId}`)

    if (saved) {
      setRun(JSON.parse(saved) as AgentRun)
    }
  }, [run, runId])

  const completedPaidActions = useMemo(
    () =>
      run?.actions.filter(
        action => action.status === 'completed' && action.receipt
      ).length ?? 0,
    [run?.actions]
  )

  async function fundRun() {
    if (!walletClient?.account) {
      setStatus('Connect the wallet that owns this run before funding it.')
      return
    }

    setIsFunding(true)
    setStatus('Preparing the agent budget vault transaction.')

    try {
      const prepareResponse = await fetch(
        `/api/agents/runs/${runId}/funding/prepare`,
        { method: 'POST' }
      )
      const prepared = (await prepareResponse.json()) as FundingPrepareResponse

      if (!prepareResponse.ok || prepared.error) {
        throw new Error(prepared.error ?? 'Unable to prepare agent funding.')
      }

      setRun(prepared.run)
      setStatus('Approve USDC for the agent run vault in your wallet.')
      const approvalTxHash = await walletClient.writeContract({
        address: prepared.funding.tokenAddress,
        abi: erc20ApprovalAbi,
        functionName: 'approve',
        args: [prepared.funding.vaultAddress, BigInt(prepared.funding.amount)]
      })

      await publicClient.waitForTransactionReceipt({ hash: approvalTxHash })

      setStatus('Funding the agent run vault.')
      const fundingTxHash = await walletClient.writeContract({
        address: prepared.funding.vaultAddress,
        abi: agentRunVaultAbi,
        functionName: 'fundRun',
        args: [
          prepared.funding.runId,
          prepared.funding.tokenAddress,
          BigInt(prepared.funding.amount),
          prepared.funding.agentSigner,
          BigInt(prepared.funding.expiresAt)
        ]
      })

      await publicClient.waitForTransactionReceipt({ hash: fundingTxHash })

      const confirmResponse = await fetch(
        `/api/agents/runs/${runId}/funding/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fundingTxHash, approvalTxHash })
        }
      )
      const body = (await confirmResponse.json()) as AgentRun & {
        error?: string
      }

      if (!confirmResponse.ok) {
        throw new Error(body.error ?? 'Unable to confirm funding.')
      }

      persistRun(body)
      setStatus('Agent budget funded. The agent can now run paid actions.')
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to fund the agent.'
      )
    } finally {
      setIsFunding(false)
    }
  }

  async function executeRun() {
    setIsRunning(true)
    setStatus('')

    try {
      const response = await fetch(`/api/agents/runs/${runId}/execute`, {
        method: 'POST'
      })
      const body = (await response.json()) as AgentRun & { error?: string }

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to execute the agent run.')
      }

      persistRun(body)
      setStatus(
        body.status === 'completed'
          ? 'Agent run completed paid actions and prepared deliverables.'
          : body.summary
      )
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to execute the agent run.'
      )
    } finally {
      setIsRunning(false)
    }
  }

  async function refundUnusedBudget() {
    setIsRefunding(true)
    setStatus('')

    try {
      const response = await fetch(`/api/agents/runs/${runId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const body = (await response.json()) as AgentRun & { error?: string }

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to refund unused budget.')
      }

      persistRun(body)
      setStatus('Unused budget marked as refunded.')
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to refund unused budget.'
      )
    } finally {
      setIsRefunding(false)
    }
  }

  async function attestRun() {
    setIsAttesting(true)
    setStatus('')

    try {
      const response = await fetch(`/api/agents/runs/${runId}/attest`, {
        method: 'POST'
      })
      const body = (await response.json()) as AgentRun & { error?: string }

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to attest the agent run.')
      }

      persistRun(body)
      setStatus('Proof hash attested on Morph and ready for public audit.')
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to attest the agent run.'
      )
    } finally {
      setIsAttesting(false)
    }
  }

  function persistRun(nextRun: AgentRun) {
    try {
      window.sessionStorage.setItem(
        `paykubo:agent-run:${nextRun.id}`,
        JSON.stringify(nextRun)
      )
      nextRun.actions.forEach(action => {
        if (action.receipt) {
          window.sessionStorage.setItem(
            `paykubo:receipt:${action.receipt.id}`,
            JSON.stringify(action.receipt)
          )
        }
      })
    } catch {
      window.sessionStorage.removeItem(`paykubo:agent-run:${nextRun.id}`)
    }

    setRun(nextRun)
  }

  if (!run) {
    return (
      <Card>
        <p className='font-semibold'>Agent run not found</p>
        <p className='text-foreground/65 mt-2 text-sm leading-6'>
          The run is not available in this browser session.
        </p>
      </Card>
    )
  }

  const canRun =
    ['planned', 'failed'].includes(run.status) &&
    ['funded', 'partially_spent', 'refund_available'].includes(
      run.fundingStatus
    ) &&
    run.availableAmountUsdc !== '0.00 USDC'
  const canRefund =
    ['failed', 'completed', 'attested'].includes(run.status) &&
    run.fundingStatus === 'refund_available' &&
    run.availableAmountUsdc !== '0.00 USDC'

  return (
    <div className='space-y-6'>
      <section className='grid gap-4 xl:grid-cols-[1fr_360px]'>
        <Card className='space-y-5 overflow-hidden'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div className='space-y-2'>
              <div className='text-primary flex items-center gap-2'>
                <Bot className='h-5 w-5' aria-hidden />
                <span className='text-xs font-semibold tracking-[0.18em] uppercase'>
                  Agent run
                </span>
              </div>
              <h2 className='font-display text-3xl leading-tight'>
                {run.title}
              </h2>
              <p className='text-foreground/65 max-w-3xl text-sm leading-6'>
                {run.objective}
              </p>
            </div>
            <StatusPill status={run.status} />
          </div>

          <div className='grid gap-3 md:grid-cols-4'>
            <MetricCard
              icon={WalletCards}
              label='Funded'
              value={run.fundedAmountUsdc}
            />
            <MetricCard
              icon={CircleDollarSign}
              label='Spent'
              value={run.spentAmountUsdc}
            />
            <MetricCard
              icon={Undo2}
              label='Available'
              value={run.availableAmountUsdc}
            />
            <MetricCard
              icon={Sparkles}
              label='Planner'
              value={formatPlanner(run)}
            />
          </div>

          <div className='border-border/80 bg-muted/25 rounded-lg border p-4'>
            <p className='font-semibold'>{agentRunStatusLabels[run.status]}</p>
            <p className='text-foreground/65 mt-1 text-sm leading-6'>
              {agentRunStatusDetails[run.status]}
            </p>
            {run.status === 'failed' && completedPaidActions === 0 ? (
              <p className='mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm leading-6 text-red-600 dark:text-red-300'>
                No paid tool completed with a receipt, so Paykubo is showing
                diagnostics instead of treating the generated copy as verified
                launch output.
              </p>
            ) : null}
          </div>
        </Card>

        <Card className='space-y-4 xl:sticky xl:top-28 xl:self-start'>
          <div>
            <p className='text-foreground/60 text-xs tracking-[0.16em] uppercase'>
              Controls
            </p>
            <p className='mt-1 text-lg font-semibold'>Budget and lifecycle</p>
          </div>
          <Button
            className='w-full'
            onClick={fundRun}
            disabled={
              isFunding ||
              !['unfunded', 'funding_pending'].includes(run.fundingStatus)
            }
          >
            <WalletCards className='h-4 w-4' aria-hidden />
            {isFunding ? 'Funding' : 'Fund agent'}
          </Button>
          <Button
            className='w-full'
            onClick={executeRun}
            disabled={isRunning || !canRun}
          >
            <Play className='h-4 w-4' aria-hidden />
            {isRunning
              ? 'Running'
              : run.status === 'failed'
                ? 'Retry actions'
                : 'Run actions'}
          </Button>
          <Button
            className='w-full'
            variant='outline'
            onClick={refundUnusedBudget}
            disabled={isRefunding || !canRefund}
          >
            <Undo2 className='h-4 w-4' aria-hidden />
            {isRefunding ? 'Refunding' : 'Refund unused'}
          </Button>
          <Button
            className='w-full'
            variant='outline'
            onClick={attestRun}
            disabled={
              isAttesting || !['completed', 'attesting'].includes(run.status)
            }
          >
            <FileCheck2 className='h-4 w-4' aria-hidden />
            {isAttesting ? 'Writing proof' : 'Attest proof'}
          </Button>
          {run.proof ? (
            <Link
              href={`/proofs/${run.proof.id}`}
              className={buttonClasses({
                variant: 'primary',
                size: 'md',
                className: 'w-full'
              })}
            >
              <ExternalLink className='h-4 w-4' aria-hidden />
              Open proof
            </Link>
          ) : null}
          {status ? (
            <p
              className='border-border bg-muted/40 rounded-lg border p-3 text-sm leading-6 break-words'
              role='status'
            >
              {status}
            </p>
          ) : null}
          <div className='border-border rounded-lg border p-3 text-sm'>
            <p className='text-foreground/60 text-xs tracking-[0.14em] uppercase'>
              Connected wallet
            </p>
            <p className='mt-1 font-semibold break-all'>
              {address ?? 'Not connected'}
            </p>
          </div>
        </Card>
      </section>

      <section className='grid gap-4 xl:grid-cols-[0.85fr_1.15fr]'>
        <Card className='space-y-4'>
          <div className='flex items-center gap-2'>
            <ShieldCheck className='text-primary h-5 w-5' aria-hidden />
            <h3 className='text-lg font-semibold'>Funding ledger</h3>
          </div>
          <div className='grid gap-3 md:grid-cols-2'>
            <DetailLink
              label='Vault'
              value={run.vaultAddress}
              href={run.vaultExplorerUrl}
            />
            <DetailLink
              label='Funding tx'
              value={run.fundingTxHash}
              href={run.fundingExplorerUrl}
            />
            <DetailLink
              label='Approval tx'
              value={run.approvalTxHash}
              href={run.approvalExplorerUrl}
            />
            <DetailLink
              label='Refund tx'
              value={run.refundTxHash}
              href={run.refundExplorerUrl}
            />
          </div>
          <LedgerTimeline events={run.ledgerEvents} />
        </Card>

        <Card className='space-y-4'>
          <div className='flex items-center gap-2'>
            <Route className='text-primary h-5 w-5' aria-hidden />
            <h3 className='text-lg font-semibold'>Paid actions</h3>
          </div>
          {run.actions.length === 0 ? (
            <p className='text-foreground/65 text-sm leading-6'>
              Actions appear here after the planner chooses tools.
            </p>
          ) : (
            <div className='grid gap-3'>
              {run.actions.map(action => (
                <ActionCard key={action.id} action={action} />
              ))}
            </div>
          )}
        </Card>
      </section>

      {run.deliverables.skippedTools?.length ? (
        <Card className='space-y-3'>
          <div className='flex items-center gap-2'>
            <Route className='text-primary h-4 w-4' aria-hidden />
            <p className='font-semibold'>Skipped tools</p>
          </div>
          <div className='grid gap-3 md:grid-cols-2'>
            {run.deliverables.skippedTools.map(tool => (
              <div
                key={tool.slug}
                className='border-border bg-muted/20 rounded-lg border p-3 text-sm'
              >
                <p className='font-semibold'>{tool.productName ?? tool.slug}</p>
                <p className='text-foreground/65 mt-1 leading-6'>
                  {tool.reason}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {hasDeliverableSummary(run) ? (
        <section className='grid gap-4 xl:grid-cols-[1.2fr_0.8fr]'>
          <DeliverableCard
            title='Launch brief'
            value={run.deliverables.launchBrief}
          />
          <div className='grid gap-4'>
            <DeliverableCard
              title='Developer copy'
              value={run.deliverables.developerCopy}
            />
            <DeliverableCard
              title='Market signal'
              value={run.deliverables.marketSignal}
            />
          </div>
        </section>
      ) : null}

      <Card>
        <JsonViewer
          title='Planner, receipts, and deliverable diagnostics'
          value={run.deliverables}
          defaultOpen={false}
          copyLabel='Copy diagnostics'
        />
      </Card>
    </div>
  )
}

function StatusPill({ status }: { status: AgentRun['status'] }) {
  const Icon = statusIcon(status)

  return (
    <span className='border-border bg-card inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold'>
      <Icon className='text-primary h-4 w-4' aria-hidden />
      {agentRunStatusLabels[status]}
    </span>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className='border-border bg-background/60 rounded-lg border p-4'>
      <Icon className='text-primary h-4 w-4' aria-hidden />
      <p className='text-foreground/60 mt-3 text-xs tracking-[0.14em] uppercase'>
        {label}
      </p>
      <p className='mt-1 font-semibold break-words'>{value}</p>
    </div>
  )
}

function DetailLink({
  label,
  value,
  href
}: {
  label: string
  value?: string | null
  href?: string | null
}) {
  return (
    <div className='border-border bg-background/60 rounded-lg border p-3'>
      <p className='text-foreground/60 text-xs tracking-[0.14em] uppercase'>
        {label}
      </p>
      {value ? (
        href ? (
          <a
            href={href}
            target='_blank'
            rel='noreferrer'
            className='text-primary mt-1 inline-flex max-w-full items-center gap-2 font-semibold break-all underline-offset-4 hover:underline'
          >
            {shorten(value)}
            <ExternalLink className='h-4 w-4 shrink-0' aria-hidden />
          </a>
        ) : (
          <p className='mt-1 font-semibold break-all'>{shorten(value)}</p>
        )
      ) : (
        <p className='text-foreground/50 mt-1 text-sm'>Not recorded yet</p>
      )}
    </div>
  )
}

function LedgerTimeline({ events }: { events: AgentLedgerEvent[] }) {
  if (events.length === 0) {
    return (
      <p className='text-foreground/65 border-border rounded-lg border border-dashed p-4 text-sm leading-6'>
        Funding and spend events appear here as the run moves through the vault.
      </p>
    )
  }

  return (
    <div className='space-y-3'>
      {events.map(event => (
        <div key={event.id} className='flex gap-3'>
          <span className='bg-primary/10 text-primary mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full'>
            <History className='h-3.5 w-3.5' aria-hidden />
          </span>
          <div className='min-w-0'>
            <p className='text-sm font-semibold'>{event.label}</p>
            <p className='text-foreground/55 text-xs'>
              {new Date(event.createdAt).toLocaleString()}
              {event.amountUsdc ? ` - ${event.amountUsdc}` : ''}
            </p>
            {event.explorerUrl && event.txHash ? (
              <a
                href={event.explorerUrl}
                target='_blank'
                rel='noreferrer'
                className='text-primary mt-1 inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline'
              >
                {shorten(event.txHash)}
                <ExternalLink className='h-3.5 w-3.5' aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function ActionCard({ action }: { action: AgentRun['actions'][number] }) {
  const Icon =
    action.status === 'completed'
      ? CheckCircle2
      : action.status === 'failed'
        ? AlertTriangle
        : Clock

  return (
    <div className='border-border bg-background/60 rounded-lg border p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex items-center gap-2'>
            <Icon className='text-primary h-4 w-4' aria-hidden />
            <p className='font-semibold'>{action.productName}</p>
          </div>
          <p className='text-foreground/60 mt-1 text-sm'>
            {action.providerName} - {action.amountUsdc}
          </p>
        </div>
        <span className='bg-muted rounded-md px-2 py-1 text-xs font-semibold'>
          {agentActionStatusLabels[action.status]}
        </span>
      </div>
      {action.errorMessage ? (
        <p className='mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm leading-6 text-red-600 dark:text-red-300'>
          {action.errorMessage}
        </p>
      ) : null}
      {action.planningRationale ? (
        <details className='border-border bg-muted/30 mt-3 rounded-lg border p-3 text-sm'>
          <summary className='cursor-pointer font-semibold'>
            Planner rationale
          </summary>
          <p className='text-foreground/65 mt-2 leading-6'>
            {action.planningRationale}
          </p>
        </details>
      ) : null}
      {action.receipt ? (
        <div className='mt-3 grid gap-3 text-sm md:grid-cols-3'>
          <Link
            href={`/receipts/${action.receipt.id}`}
            className='border-border rounded-lg border p-3 font-semibold underline-offset-4 hover:underline'
          >
            <ReceiptText className='text-primary mb-2 h-4 w-4' aria-hidden />
            {action.receipt.id}
          </Link>
          <span className='border-border rounded-lg border p-3'>
            {action.receipt.network}
          </span>
          {action.receipt.explorerUrl ? (
            <a
              href={action.receipt.explorerUrl}
              target='_blank'
              rel='noreferrer'
              className='border-border text-primary rounded-lg border p-3 font-semibold underline-offset-4 hover:underline'
            >
              View settlement
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function formatPlanner(run: AgentRun) {
  const mode = run.deliverables.plannerMode

  if (mode === 'openai') {
    return `OpenAI ${run.deliverables.plannerModel ?? 'model'}`
  }

  if (mode === 'deterministic') {
    return 'Deterministic fallback'
  }

  return 'Pending'
}

function statusIcon(status: AgentRun['status']) {
  if (['completed', 'attested'].includes(status)) {
    return CheckCircle2
  }

  if (['failed'].includes(status)) {
    return AlertTriangle
  }

  if (['running', 'attesting'].includes(status)) {
    return Clock
  }

  return Bot
}

function hasDeliverableSummary(run: AgentRun) {
  return Boolean(
    run.deliverables.launchBrief ||
      run.deliverables.developerCopy ||
      run.deliverables.marketSignal
  )
}

function DeliverableCard({ title, value }: { title: string; value?: string }) {
  if (!value) {
    return null
  }

  return (
    <Card className='space-y-3 overflow-hidden'>
      <p className='text-foreground/60 text-xs tracking-[0.16em] uppercase'>
        {title}
      </p>
      <MarkdownViewer
        value={value}
        className='max-h-[34rem] overflow-auto pr-2'
      />
    </Card>
  )
}

function shorten(value: string) {
  if (value.length <= 18) {
    return value
  }

  return `${value.slice(0, 10)}...${value.slice(-8)}`
}
