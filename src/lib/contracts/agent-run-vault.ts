import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  isAddress,
  keccak256,
  parseUnits,
  toBytes,
  type Address,
  type Hex
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { buildExplorerUrl } from '@/features/marketplace/receipts'
import {
  defaultAppChain,
  getExplorerAddressUrl,
  morphUsdcTokenAddress
} from '@/lib/config/chains'
import { envClient } from '@/lib/env/env.client'
import { envServer } from '@/lib/env/env.server'

export type AgentVaultWriteResult = {
  txHash: Hex
  explorerUrl: string | null
}

export const agentRunVaultAbi = [
  {
    type: 'function',
    name: 'fundRun',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'runId', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'agentSigner', type: 'address' },
      { name: 'expiresAt', type: 'uint256' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'markRunning',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'runId', type: 'bytes32' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'recordSpend',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'runId', type: 'bytes32' },
      { name: 'paymentId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'recordSpendRefund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'runId', type: 'bytes32' },
      { name: 'paymentId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'markCompleted',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'runId', type: 'bytes32' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'cancelRun',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'runId', type: 'bytes32' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'refundUnused',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'runId', type: 'bytes32' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'budgetOf',
    stateMutability: 'view',
    inputs: [{ name: 'runId', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'owner', type: 'address' },
          { name: 'agentSigner', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'fundedAmount', type: 'uint256' },
          { name: 'spentAmount', type: 'uint256' },
          { name: 'refundedAmount', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'state', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' }
        ]
      }
    ]
  }
] as const

export const erc20ApprovalAbi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  }
] as const

const publicClient = createPublicClient({
  chain: defaultAppChain.viemChain,
  transport: http(defaultAppChain.viemChain.rpcUrls.default.http[0])
})

export function getAgentRunVaultAddress() {
  const address = envClient.NEXT_PUBLIC_AGENT_RUN_VAULT_ADDRESS

  return address && isAddress(address) ? address : null
}

export function getAgentRunVaultExplorerUrl() {
  return getExplorerAddressUrl(getAgentRunVaultAddress(), defaultAppChain.id)
}

export function getAgentRunVaultOperatorPrivateKey() {
  const privateKey = envServer.AGENT_RUN_VAULT_OPERATOR_PRIVATE_KEY

  if (!privateKey) {
    return null
  }

  return privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
}

export function getAgentSignerAddress() {
  const privateKey = envServer.AGENT_SPENDER_PRIVATE_KEY

  if (!privateKey) {
    return null
  }

  return privateKeyToAccount(
    (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex
  ).address
}

export function getAgentRunBytes32(runId: string) {
  return keccak256(toBytes(runId))
}

export function getAgentVaultPaymentId(runId: string, actionId: string) {
  return keccak256(toBytes(`${runId}:${actionId}`))
}

export function parseUsdcToAtomic(amountUsdc: number | string) {
  return parseUnits(Number(amountUsdc).toFixed(6), 18)
}

export function formatAtomicUsdc(amount: bigint) {
  return `${Number(formatUnits(amount, 18)).toFixed(2)} USDC`
}

export function getUsdcTokenAddress() {
  return morphUsdcTokenAddress as Address
}

export async function writeAgentRunVault({
  functionName,
  args
}: {
  functionName:
    | 'markRunning'
    | 'recordSpend'
    | 'recordSpendRefund'
    | 'markCompleted'
    | 'cancelRun'
    | 'refundUnused'
  args: readonly [Hex] | readonly [Hex, Hex, bigint]
}): Promise<AgentVaultWriteResult | null> {
  const address = getAgentRunVaultAddress()
  const privateKey = getAgentRunVaultOperatorPrivateKey()

  if (!address || !privateKey) {
    return null
  }

  const account = privateKeyToAccount(privateKey as Hex)
  const walletClient = createWalletClient({
    account,
    chain: defaultAppChain.viemChain,
    transport: http(defaultAppChain.viemChain.rpcUrls.default.http[0])
  })
  const { request } = await publicClient.simulateContract({
    address,
    abi: agentRunVaultAbi,
    functionName,
    args,
    account
  })
  const txHash = await walletClient.writeContract(request)

  await publicClient.waitForTransactionReceipt({ hash: txHash })

  return {
    txHash,
    explorerUrl: buildExplorerUrl(txHash)
  }
}
