'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

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
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Undo2,
  WalletCards
} from 'lucide-react'
import {
  createPublicClient,
  encodeFunctionData,
  http,
  isAddress,
  numberToHex,
  type Address,
  type Hex
} from 'viem'

import { JsonViewer } from '@/components/data-display/json-viewer'
import { MarkdownViewer } from '@/components/data-display/markdown-viewer'
import { Button, buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { WalletAddressConsumer } from '@/components/wallet/wallet-address-consumer'
import {
  agentActionStatusLabels,
  agentRunStatusDetails,
  agentRunStatusLabels
} from '@/features/agents/status'
import type { AgentLedgerEvent, AgentRun } from '@/features/agents/types'
import { useAutoPolling } from '@/hooks/use-auto-polling'
import { defaultAppChain } from '@/lib/config/chains'
import {
  agentRunVaultAbi,
  erc20ApprovalAbi
} from '@/lib/contracts/agent-run-vault'

type AgentOutputItem = {
  id: string
  label: string
  kind: 'text' | 'video' | 'image' | 'link'
  value: string
  source: string
}

type AgentOutputCandidate = {
  id: string
  label: string
  source: string
  value?: string
  kind?: AgentOutputItem['kind']
}

type ExtractedOutput = {
  path: string
  value: string
  kind: AgentOutputItem['kind']
}

type AgentRunClientProps = {
  runId: string
  initialRun: AgentRun | null
}

type EthereumProvider = {
  isMetaMask?: boolean
  providers?: EthereumProvider[]
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
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
const AGENT_RUN_POLL_INTERVAL_MS = 4000
const agentRunPollingStatuses = new Set<AgentRun['status']>([
  'running',
  'attesting'
])

export function AgentRunClient({ runId, initialRun }: AgentRunClientProps) {
  return (
    <WalletAddressConsumer>
      {({ address }) => (
        <AgentRunContent
          runId={runId}
          initialRun={initialRun}
          address={address}
        />
      )}
    </WalletAddressConsumer>
  )
}

function AgentRunContent({
  runId,
  initialRun,
  address
}: AgentRunClientProps & { address: string | null }) {
  const [run, setRun] = useState<AgentRun | null>(initialRun)
  const [status, setStatus] = useState('')
  const [isFunding, setIsFunding] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isRefunding, setIsRefunding] = useState(false)
  const [isAttesting, setIsAttesting] = useState(false)
  const [isRefreshingRun, setIsRefreshingRun] = useState(false)
  const refreshInFlightRef = useRef(false)

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
  const shouldPollRun =
    Boolean(run) &&
    (isRunning ||
      isAttesting ||
      agentRunPollingStatuses.has(run?.status ?? 'planned'))

  useAutoPolling({
    enabled: shouldPollRun,
    intervalMs: AGENT_RUN_POLL_INTERVAL_MS,
    onPoll: refreshRun
  })

  async function refreshRun() {
    if (refreshInFlightRef.current) {
      return
    }

    refreshInFlightRef.current = true
    setIsRefreshingRun(true)

    try {
      const response = await fetch(`/api/agents/runs/${runId}`, {
        headers: {
          Accept: 'application/json'
        }
      })
      const body = (await response.json()) as AgentRun & { error?: string }

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to refresh the agent run.')
      }

      persistRun(body)

      if (['completed', 'failed', 'attested'].includes(body.status)) {
        setStatus(
          body.status === 'completed'
            ? 'Agent run completed paid actions and prepared deliverables.'
            : body.status === 'attested'
              ? 'Proof hash attested on Morph and ready for public audit.'
              : body.summary
        )
      }
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to refresh the agent run.'
      )
    } finally {
      refreshInFlightRef.current = false
      setIsRefreshingRun(false)
    }
  }

  async function fundRun() {
    setIsFunding(true)
    setStatus('Preparing the agent budget vault transaction.')

    try {
      const fundingWallet = await requestFundingWalletAddress(address)
      const prepareResponse = await fetch(
        `/api/agents/runs/${runId}/funding/prepare`,
        { method: 'POST' }
      )
      const prepared = (await prepareResponse.json()) as FundingPrepareResponse

      if (!prepareResponse.ok || prepared.error) {
        throw new Error(prepared.error ?? 'Unable to prepare agent funding.')
      }

      setRun(prepared.run)
      setStatus('Open MetaMask and approve USDC for the agent run vault.')
      const approvalTxHash = await sendBrowserWalletTransaction({
        from: fundingWallet,
        to: prepared.funding.tokenAddress,
        data: encodeFunctionData({
          abi: erc20ApprovalAbi,
          functionName: 'approve',
          args: [prepared.funding.vaultAddress, BigInt(prepared.funding.amount)]
        })
      })

      await publicClient.waitForTransactionReceipt({ hash: approvalTxHash })

      setStatus('Open MetaMask again to fund the agent run vault.')
      const fundingTxHash = await sendBrowserWalletTransaction({
        from: fundingWallet,
        to: prepared.funding.vaultAddress,
        data: encodeFunctionData({
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
        if (body.id) {
          persistRun(body)
        }

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
  const finalOutputs = collectFinalOutputs(run)

  return (
    <div className='space-y-5'>
      <section className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]'>
        <div className='space-y-5'>
          <RunSummaryCard
            run={run}
            completedPaidActions={completedPaidActions}
          />
        </div>

        <RunControlPanel
          run={run}
          address={address}
          status={status}
          isFunding={isFunding}
          isRunning={isRunning}
          isRefunding={isRefunding}
          isAttesting={isAttesting}
          isRefreshingRun={isRefreshingRun}
          canRun={canRun}
          canRefund={canRefund}
          onFund={fundRun}
          onRun={executeRun}
          onRefund={refundUnusedBudget}
          onAttest={attestRun}
        />
      </section>

      <ExecutionSection run={run} />

      <AdvancedRunDetails run={run} />

      <FinalOutputSection outputs={finalOutputs} run={run} />
    </div>
  )
}

async function requestFundingWalletAddress(expectedAddress: string | null) {
  const provider = getBrowserEthereumProvider()

  if (!provider) {
    throw new Error(
      'MetaMask was not detected. Open Paykubo in a browser with MetaMask installed, then click Fund agent again.'
    )
  }

  const accounts = (await provider.request({
    method: 'eth_requestAccounts'
  })) as unknown
  const selectedAddress = Array.isArray(accounts)
    ? accounts.find(
        (account): account is Address =>
          typeof account === 'string' && isAddress(account)
      )
    : null

  if (!selectedAddress) {
    throw new Error('MetaMask did not return a funding wallet address.')
  }

  if (
    expectedAddress &&
    selectedAddress.toLowerCase() !== expectedAddress.toLowerCase()
  ) {
    throw new Error(
      `MetaMask is using ${shorten(
        selectedAddress
      )}, but this Paykubo session is connected as ${shorten(
        expectedAddress
      )}. Switch MetaMask to the connected wallet, then fund again.`
    )
  }

  return selectedAddress
}

async function sendBrowserWalletTransaction({
  from,
  to,
  data
}: {
  from: Address
  to: Address
  data: Hex
}) {
  const provider = getBrowserEthereumProvider()

  if (!provider) {
    throw new Error('MetaMask was not detected.')
  }

  await ensureBrowserWalletChain(provider)
  const txHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from,
        to,
        data,
        value: '0x0'
      }
    ]
  })

  if (typeof txHash !== 'string' || !txHash.startsWith('0x')) {
    throw new Error('MetaMask did not return a transaction hash.')
  }

  return txHash as Hex
}

async function ensureBrowserWalletChain(provider: EthereumProvider) {
  const chainId = numberToHex(defaultAppChain.id)

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }]
    })
    return
  } catch (error) {
    if (getWalletErrorCode(error) !== 4902) {
      throw error
    }
  }

  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId,
        chainName: defaultAppChain.name,
        nativeCurrency: defaultAppChain.nativeCurrency,
        rpcUrls: defaultAppChain.viemChain.rpcUrls.default.http,
        blockExplorerUrls: [defaultAppChain.explorer.baseUrl]
      }
    ]
  })

  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId }]
  })
}

function getBrowserEthereumProvider() {
  if (typeof window === 'undefined') {
    return null
  }

  const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum

  if (!ethereum) {
    return null
  }

  return (
    ethereum.providers?.find(
      (provider: EthereumProvider) => provider.isMetaMask
    ) ?? ethereum
  )
}

function getWalletErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error
    ? Number((error as { code?: unknown }).code)
    : null
}

function RunSummaryCard({
  run,
  completedPaidActions
}: {
  run: AgentRun
  completedPaidActions: number
}) {
  return (
    <Card className='overflow-hidden p-0'>
      <div className='border-border/70 bg-background/35 border-b p-5 sm:p-6'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='min-w-0 space-y-3'>
            <div className='text-primary flex items-center gap-2'>
              <Bot className='h-5 w-5' aria-hidden />
              <span className='text-xs font-semibold tracking-[0.18em] uppercase'>
                Agent workspace
              </span>
            </div>
            <div>
              <h2 className='font-display max-w-4xl text-2xl leading-tight font-semibold text-balance sm:text-3xl'>
                {run.title}
              </h2>
              <p className='text-foreground/65 mt-2 max-w-3xl text-sm leading-6'>
                {run.objective}
              </p>
            </div>
          </div>
          <StatusPill status={run.status} />
        </div>
      </div>

      <div className='space-y-5 p-5 sm:p-6'>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          <SummaryStat
            icon={WalletCards}
            label='Funded'
            value={run.fundedAmountUsdc}
          />
          <SummaryStat
            icon={CircleDollarSign}
            label='Spent'
            value={run.spentAmountUsdc}
          />
          <SummaryStat
            icon={Undo2}
            label='Available'
            value={run.availableAmountUsdc}
          />
          <SummaryStat
            icon={Sparkles}
            label='Planner'
            value={formatPlanner(run)}
          />
        </div>

        <StatusNotice run={run} completedPaidActions={completedPaidActions} />
      </div>
    </Card>
  )
}

function StatusNotice({
  run,
  completedPaidActions
}: {
  run: AgentRun
  completedPaidActions: number
}) {
  const Icon = statusIcon(run.status)

  return (
    <div className='border-border/80 bg-muted/20 rounded-lg border p-4'>
      <div className='flex items-start gap-3'>
        <span className='bg-primary/10 text-primary mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full'>
          <Icon className='h-4 w-4' aria-hidden />
        </span>
        <div className='min-w-0'>
          <p className='font-semibold'>{agentRunStatusLabels[run.status]}</p>
          <p className='text-foreground/65 mt-1 text-sm leading-6'>
            {agentRunStatusDetails[run.status]}
          </p>
          {run.status === 'failed' && completedPaidActions === 0 ? (
            <p className='mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm leading-6 text-red-600 dark:text-red-300'>
              No paid tool completed with a receipt, so Paykubo is showing
              diagnostics instead of treating generated copy as verified output.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function RunControlPanel({
  run,
  address,
  status,
  isFunding,
  isRunning,
  isRefunding,
  isAttesting,
  isRefreshingRun,
  canRun,
  canRefund,
  onFund,
  onRun,
  onRefund,
  onAttest
}: {
  run: AgentRun
  address: string | null
  status: string
  isFunding: boolean
  isRunning: boolean
  isRefunding: boolean
  isAttesting: boolean
  isRefreshingRun: boolean
  canRun: boolean
  canRefund: boolean
  onFund: () => void
  onRun: () => void
  onRefund: () => void
  onAttest: () => void
}) {
  return (
    <aside className='xl:sticky xl:top-28 xl:self-start'>
      <Card className='space-y-5'>
        <div className='space-y-1'>
          <p className='text-foreground/60 text-xs tracking-[0.16em] uppercase'>
            Run controls
          </p>
          <h3 className='text-lg font-semibold'>Fund, run, prove</h3>
          <p className='text-foreground/60 text-sm leading-6'>
            Spend is capped by the funded budget and each paid tool records a
            receipt.
          </p>
        </div>

        <div className='grid gap-2'>
          <Button
            className='w-full'
            onClick={onFund}
            disabled={
              isFunding ||
              !['unfunded', 'funding_pending', 'refund_available'].includes(
                run.fundingStatus
              ) ||
              (run.fundingStatus === 'refund_available' &&
                run.availableAmountUsdc !== '0.00 USDC')
            }
          >
            <WalletCards className='h-4 w-4' aria-hidden />
            {isFunding ? 'Funding' : 'Fund agent'}
          </Button>
          <Button
            className='w-full'
            onClick={onRun}
            disabled={isRunning || !canRun}
          >
            <Play className='h-4 w-4' aria-hidden />
            {isRunning
              ? 'Running'
              : run.status === 'failed'
                ? 'Retry actions'
                : 'Run actions'}
          </Button>
          <div className='grid grid-cols-2 gap-2'>
            <Button
              className='w-full px-3'
              variant='outline'
              onClick={onRefund}
              disabled={isRefunding || !canRefund}
            >
              <Undo2 className='h-4 w-4' aria-hidden />
              {isRefunding ? 'Refunding' : 'Refund'}
            </Button>
            <Button
              className='w-full px-3'
              variant='outline'
              onClick={onAttest}
              disabled={
                isAttesting || !['completed', 'attesting'].includes(run.status)
              }
            >
              <FileCheck2 className='h-4 w-4' aria-hidden />
              {isAttesting ? 'Writing' : 'Attest'}
            </Button>
          </div>
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
        </div>

        {status ? (
          <p
            className='border-border bg-muted/35 rounded-lg border p-3 text-sm leading-6 break-words'
            role='status'
          >
            {status}
          </p>
        ) : null}
        {isRefreshingRun ? (
          <p className='text-foreground/60 flex items-center gap-2 text-sm'>
            <RefreshCw
              className='text-primary h-4 w-4 animate-spin'
              aria-hidden
            />
            Refreshing agent progress
          </p>
        ) : null}

        <div className='border-border/80 grid gap-2 rounded-lg border p-3 text-sm'>
          <div className='flex items-center justify-between gap-3'>
            <span className='text-foreground/60'>Funding</span>
            <span className='font-semibold'>{run.fundingStatus}</span>
          </div>
          <div className='flex items-center justify-between gap-3'>
            <span className='text-foreground/60'>Wallet</span>
            <span className='max-w-36 truncate font-semibold'>
              {address ?? 'Not connected'}
            </span>
          </div>
        </div>
      </Card>
    </aside>
  )
}

function ExecutionSection({ run }: { run: AgentRun }) {
  return (
    <section className='space-y-3'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <p className='text-primary text-xs font-semibold tracking-[0.16em] uppercase'>
            Execution
          </p>
          <h3 className='mt-1 text-xl font-semibold'>Tool calls</h3>
        </div>
        <span className='text-foreground/60 text-sm'>
          {run.actions.length} planned action
          {run.actions.length === 1 ? '' : 's'}
        </span>
      </div>
      {run.actions.length === 0 ? (
        <div className='border-border text-foreground/65 rounded-lg border border-dashed p-5 text-sm leading-6'>
          Actions appear here after the planner chooses tools.
        </div>
      ) : (
        <div className='grid gap-3'>
          {run.actions.map(action => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      )}
    </section>
  )
}

function AdvancedRunDetails({ run }: { run: AgentRun }) {
  return (
    <section className='space-y-3'>
      <details className='group border-border/80 bg-card/75 overflow-hidden rounded-lg border'>
        <summary className='flex cursor-pointer list-none items-center justify-between gap-4 p-4 [&::-webkit-details-marker]:hidden'>
          <span className='flex items-center gap-2 font-semibold'>
            <ShieldCheck className='text-primary h-4 w-4' aria-hidden />
            Funding and skipped-tool details
          </span>
          <span className='text-foreground/55 text-sm group-open:hidden'>
            Expand
          </span>
          <span className='text-foreground/55 hidden text-sm group-open:inline'>
            Collapse
          </span>
        </summary>
        <div className='border-border/70 space-y-5 border-t p-4'>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
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
          <SkippedTools tools={run.deliverables.skippedTools ?? []} />
        </div>
      </details>

      <JsonViewer
        title='Planner, receipts, and deliverable diagnostics'
        value={run.deliverables}
        defaultOpen={false}
        copyLabel='Copy diagnostics'
      />
    </section>
  )
}

function SummaryStat({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className='border-border/70 bg-background/45 rounded-lg border p-3'>
      <div className='flex items-center gap-2'>
        <Icon className='text-primary h-4 w-4' aria-hidden />
        <p className='text-foreground/60 text-xs tracking-[0.14em] uppercase'>
          {label}
        </p>
      </div>
      <p className='mt-2 text-sm font-semibold break-words'>{value}</p>
    </div>
  )
}

function SkippedTools({
  tools
}: {
  tools: NonNullable<AgentRun['deliverables']['skippedTools']>
}) {
  if (tools.length === 0) {
    return null
  }

  return (
    <div className='space-y-3'>
      <p className='font-semibold'>Skipped tools</p>
      <div className='grid gap-3 md:grid-cols-2'>
        {tools.map(tool => (
          <div
            key={tool.slug}
            className='border-border bg-muted/20 rounded-lg border p-3 text-sm'
          >
            <p className='font-semibold'>{tool.productName ?? tool.slug}</p>
            <p className='text-foreground/65 mt-1 leading-6'>{tool.reason}</p>
          </div>
        ))}
      </div>
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
  const outputItems = collectActionOutputs(action)

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
      {outputItems.length > 0 ? (
        <div className='mt-4'>
          <p className='text-foreground/60 text-xs tracking-[0.14em] uppercase'>
            Tool output
          </p>
          <OutputGallery outputs={outputItems} className='mt-3' compact />
        </div>
      ) : null}
      <div className='mt-4 grid gap-3 lg:grid-cols-2'>
        <JsonViewer
          title='Tool request'
          value={action.requestPayload}
          defaultOpen={false}
          copyLabel='Copy request'
        />
        <JsonViewer
          title='Tool response'
          value={
            action.responsePayload ?? {
              status: action.status,
              errorMessage:
                action.errorMessage ?? 'No response payload recorded yet.'
            }
          }
          defaultOpen={false}
          copyLabel='Copy response'
        />
      </div>
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

function FinalOutputSection({
  outputs,
  run
}: {
  outputs: AgentOutputItem[]
  run: AgentRun
}) {
  const completedActions = run.actions.filter(
    action => action.status === 'completed'
  )

  return (
    <Card className='space-y-4 overflow-hidden'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <p className='text-foreground/60 text-xs tracking-[0.16em] uppercase'>
            Final deliverable
          </p>
          <h3 className='mt-1 text-lg font-semibold'>Final agent output</h3>
          <p className='text-foreground/65 mt-1 max-w-2xl text-sm leading-6'>
            Completed project links, rendered media, and final text extracted
            after async tools finish and the agent synthesis is ready.
          </p>
        </div>
        <span className='bg-muted rounded-md px-2 py-1 text-xs font-semibold'>
          {completedActions.length} completed tool
          {completedActions.length === 1 ? '' : 's'}
        </span>
      </div>
      {outputs.length > 0 ? (
        <OutputGallery outputs={outputs} />
      ) : (
        <p className='border-border text-foreground/65 rounded-lg border border-dashed p-4 text-sm leading-6'>
          Final deliverables appear here after paid tools return completed text,
          image, video, or project URLs. Use the tool response panels above to
          inspect failed or pending calls.
        </p>
      )}
    </Card>
  )
}

function OutputGallery({
  outputs,
  className,
  compact = false
}: {
  outputs: AgentOutputItem[]
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={[
        'grid gap-3',
        compact ? 'md:grid-cols-2' : 'lg:grid-cols-2',
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {outputs.map(output => (
        <OutputPreview key={output.id} output={output} compact={compact} />
      ))}
    </div>
  )
}

function OutputPreview({
  output,
  compact
}: {
  output: AgentOutputItem
  compact?: boolean
}) {
  return (
    <div className='border-border bg-background/60 overflow-hidden rounded-lg border'>
      <div className='border-border/80 flex flex-wrap items-start justify-between gap-2 border-b p-3'>
        <div className='min-w-0'>
          <p className='font-semibold break-words'>{output.label}</p>
          <p className='text-foreground/55 mt-1 text-xs'>{output.source}</p>
        </div>
        <span className='bg-muted rounded-md px-2 py-1 text-xs font-semibold'>
          {output.kind}
        </span>
      </div>
      {output.kind === 'video' ? (
        <div className='bg-black'>
          <video
            src={output.value}
            controls
            playsInline
            className={compact ? 'max-h-56 w-full' : 'max-h-96 w-full'}
          />
        </div>
      ) : null}
      {output.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={output.value}
          alt={output.label}
          className={
            compact
              ? 'max-h-56 w-full object-contain'
              : 'max-h-96 w-full object-contain'
          }
        />
      ) : null}
      {output.kind === 'text' ? (
        <div className='max-h-96 overflow-auto p-3'>
          <MarkdownViewer value={output.value} />
        </div>
      ) : null}
      <div className='p-3'>
        {output.kind === 'link' ? (
          <a
            href={output.value}
            target='_blank'
            rel='noreferrer'
            className='text-primary inline-flex max-w-full items-center gap-2 font-semibold break-all underline-offset-4 hover:underline'
          >
            {output.value}
            <ExternalLink className='h-4 w-4 shrink-0' aria-hidden />
          </a>
        ) : output.kind === 'image' || output.kind === 'video' ? (
          <a
            href={output.value}
            target='_blank'
            rel='noreferrer'
            className='text-primary inline-flex max-w-full items-center gap-2 text-sm font-semibold break-all underline-offset-4 hover:underline'
          >
            Open source
            <ExternalLink className='h-4 w-4 shrink-0' aria-hidden />
          </a>
        ) : (
          <p className='text-foreground/55 text-xs'>
            Text output rendered from the agent result.
          </p>
        )}
      </div>
    </div>
  )
}

function collectFinalOutputs(run: AgentRun) {
  const outputs: AgentOutputItem[] = []
  const seen = new Set<string>()

  addOutput(outputs, seen, {
    id: 'deliverable-video-url',
    label: 'Synthesized video result',
    source: 'Agent deliverables',
    value: run.deliverables.videoResultUrl,
    kind: classifyUrl(run.deliverables.videoResultUrl, 'videoResultUrl')
  })

  for (const action of run.actions) {
    for (const output of collectActionOutputs(action)) {
      addOutput(outputs, seen, {
        ...output,
        id: `final-${output.id}`
      })
    }
  }

  addOutput(outputs, seen, {
    id: 'launch-brief',
    label: 'Launch brief',
    source: 'Agent synthesis',
    value: run.deliverables.launchBrief,
    kind: 'text'
  })
  addOutput(outputs, seen, {
    id: 'developer-copy',
    label: 'Developer copy',
    source: 'Agent synthesis',
    value: run.deliverables.developerCopy,
    kind: 'text'
  })
  addOutput(outputs, seen, {
    id: 'market-signal',
    label: 'Market signal',
    source: 'Agent synthesis',
    value: run.deliverables.marketSignal,
    kind: 'text'
  })

  return outputs
}

function collectActionOutputs(action: AgentRun['actions'][number]) {
  if (!action.responsePayload) {
    return []
  }

  const outputs: AgentOutputItem[] = []
  const seen = new Set<string>()

  for (const candidate of extractResponseOutputs(action.responsePayload)) {
    addOutput(outputs, seen, {
      id: `${action.id}-${candidate.path}`,
      label: humanizePath(candidate.path),
      source: action.productName,
      value: candidate.value,
      kind: candidate.kind
    })
  }

  return outputs
}

function extractResponseOutputs(
  value: unknown,
  path = 'response',
  depth = 0
): ExtractedOutput[] {
  if (depth > 5 || value == null) {
    return []
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    const kind = classifyValue(trimmed, path)

    if (!kind) {
      return []
    }

    return [{ path, value: trimmed, kind }]
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      extractResponseOutputs(item, `${path}.${index}`, depth + 1)
    )
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, item]) => extractResponseOutputs(item, `${path}.${key}`, depth + 1)
    )
  }

  return []
}

function addOutput(
  outputs: AgentOutputItem[],
  seen: Set<string>,
  output: AgentOutputCandidate
) {
  if (!output.value) {
    return
  }

  const value = output.value.trim()

  if (!value || seen.has(`${output.kind}:${value}`)) {
    return
  }

  seen.add(`${output.kind}:${value}`)
  outputs.push({
    ...output,
    value,
    kind: output.kind ?? classifyValue(value, output.label) ?? 'text'
  })
}

function classifyValue(
  value: string,
  path: string
): AgentOutputItem['kind'] | null {
  if (isUrl(value)) {
    return classifyUrl(value, path) ?? null
  }

  const lowerPath = path.toLowerCase()

  if (
    value.length >= 24 &&
    /summary|brief|copy|signal|result|output|text|description|message|content/.test(
      lowerPath
    )
  ) {
    return 'text'
  }

  return null
}

function classifyUrl(
  value: string | undefined,
  path: string
): AgentOutputItem['kind'] | undefined {
  if (!value || !isUrl(value)) {
    return undefined
  }

  const lowerUrl = value.toLowerCase().split('?')[0] ?? ''
  const lowerPath = path.toLowerCase()

  if (/\.(mp4|webm|mov|m4v|ogg|ogv)$/.test(lowerUrl)) {
    return 'video'
  }

  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(lowerUrl)) {
    return 'image'
  }

  if (
    /video|movie|render/.test(lowerPath) &&
    !/thumbnail|image/.test(lowerPath)
  ) {
    return 'link'
  }

  if (/image|thumbnail|poster|preview/.test(lowerPath)) {
    return 'image'
  }

  return 'link'
}

function isUrl(value: string) {
  try {
    const url = new URL(value)

    return ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}

function humanizePath(path: string) {
  const key = path.split('.').at(-1) ?? path

  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\d+$/, index => `Result ${Number(index) + 1}`)
    .replace(/\b\w/g, char => char.toUpperCase())
}

function shorten(value: string) {
  if (value.length <= 18) {
    return value
  }

  return `${value.slice(0, 10)}...${value.slice(-8)}`
}
