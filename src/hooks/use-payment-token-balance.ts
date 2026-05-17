'use client'

import * as React from 'react'

import { createPublicClient, formatUnits, http, parseAbi } from 'viem'

import {
  defaultAppChain,
  getExplorerAddressUrl,
  paymentTokenAddress,
  paymentTokenDecimals,
  paymentTokenSymbol
} from '@/lib/config/chains'

const paymentTokenAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)'
])

const paymentTokenClient = createPublicClient({
  chain: defaultAppChain.viemChain,
  transport: http(defaultAppChain.viemChain.rpcUrls.default.http[0])
})

export type PaymentTokenBalanceState = {
  rawBalance: bigint | null
  decimals: number
  formattedBalance: string
  symbol: string
  tokenAddress: string
  tokenExplorerUrl: string | null
  chainName: string
  isLoading: boolean
  error: string
  refresh: () => Promise<void>
}

export function usePaymentTokenBalance(
  walletAddress: string | null | undefined
): PaymentTokenBalanceState {
  const normalizedWallet = walletAddress?.trim() || null
  const [rawBalance, setRawBalance] = React.useState<bigint | null>(null)
  const [decimals, setDecimals] = React.useState(paymentTokenDecimals)
  const [isLoading, setIsLoading] = React.useState(Boolean(normalizedWallet))
  const [error, setError] = React.useState('')

  const refresh = React.useCallback(async () => {
    if (!normalizedWallet || !isHexAddress(normalizedWallet)) {
      setRawBalance(null)
      setDecimals(paymentTokenDecimals)
      setIsLoading(false)
      setError('')
      return
    }

    if (!isHexAddress(paymentTokenAddress)) {
      setRawBalance(null)
      setDecimals(paymentTokenDecimals)
      setIsLoading(false)
      setError('The configured payment token address is invalid.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const [nextBalance, nextDecimals] = await Promise.all([
        paymentTokenClient.readContract({
          address: paymentTokenAddress,
          abi: paymentTokenAbi,
          functionName: 'balanceOf',
          args: [normalizedWallet]
        }),
        paymentTokenClient.readContract({
          address: paymentTokenAddress,
          abi: paymentTokenAbi,
          functionName: 'decimals'
        })
      ])

      setRawBalance(nextBalance)
      setDecimals(Number(nextDecimals))
    } catch {
      setRawBalance(null)
      setDecimals(paymentTokenDecimals)
      setError('Could not load the payment token balance.')
    } finally {
      setIsLoading(false)
    }
  }, [normalizedWallet])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    rawBalance,
    decimals,
    formattedBalance:
      rawBalance === null ? '0' : formatTokenAmount(rawBalance, decimals),
    symbol: paymentTokenSymbol,
    tokenAddress: paymentTokenAddress,
    tokenExplorerUrl: getExplorerAddressUrl(
      paymentTokenAddress,
      defaultAppChain.id
    ),
    chainName: defaultAppChain.shortName,
    isLoading,
    error,
    refresh
  }
}

function formatTokenAmount(amount: bigint, decimals: number) {
  return Number(formatUnits(amount, decimals)).toLocaleString(undefined, {
    maximumFractionDigits: 6
  })
}

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}
