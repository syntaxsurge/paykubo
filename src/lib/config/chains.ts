import type { Chain } from 'viem'
import { defineChain, parseUnits } from 'viem'

import { envClient } from '@/lib/env/env.client'

export type SupportedChainKey = 'morphHoodi'

export type AppChain = {
  key: SupportedChainKey
  id: number
  name: string
  shortName: string
  nativeCurrency: Chain['nativeCurrency']
  viemChain: Chain
  explorer: {
    name: string
    baseUrl: string
  }
}

export const appChains = {
  morphHoodi: {
    key: 'morphHoodi',
    id: envClient.NEXT_PUBLIC_MORPH_HOODI_CHAIN_ID ?? 2910,
    name: 'Morph Hoodi Testnet',
    shortName: 'Morph Hoodi',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    viemChain: defineChain({
      id: envClient.NEXT_PUBLIC_MORPH_HOODI_CHAIN_ID ?? 2910,
      name: 'Morph Hoodi Testnet',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18
      },
      rpcUrls: {
        default: {
          http: [
            envClient.NEXT_PUBLIC_MORPH_HOODI_RPC_URL ??
              'https://rpc-hoodi.morph.network'
          ]
        }
      },
      blockExplorers: {
        default: {
          name: 'Morph Hoodi Explorer',
          url:
            envClient.NEXT_PUBLIC_MORPH_HOODI_EXPLORER_URL ??
            'https://explorer-hoodi.morph.network'
        }
      },
      testnet: true
    }),
    explorer: {
      name: 'Morph Hoodi Explorer',
      baseUrl:
        envClient.NEXT_PUBLIC_MORPH_HOODI_EXPLORER_URL ??
        'https://explorer-hoodi.morph.network'
    }
  }
} as const satisfies Record<SupportedChainKey, AppChain>

export const supportedAppChains = Object.values(appChains)
export const supportedViemChains = [appChains.morphHoodi.viemChain] as const
export const defaultAppChain = appChains.morphHoodi
export const x402Network = envClient.NEXT_PUBLIC_X402_NETWORK ?? 'eip155:2910'
const defaultMorphHoodiTokenAddress =
  '0x7433b41C6c5e1d58D4Da99483609520255ab661B'
const defaultMorphHoodiTokenDomainName = 'USDC'
export const morphUsdcTokenAddress =
  envClient.NEXT_PUBLIC_USDC_TOKEN_ADDRESS ?? defaultMorphHoodiTokenAddress
const configuredMorphUsdcTokenName = envClient.NEXT_PUBLIC_USDC_TOKEN_NAME
export const morphUsdcTokenName =
  configuredMorphUsdcTokenName ?? defaultMorphHoodiTokenDomainName
export const morphUsdcTokenVersion =
  envClient.NEXT_PUBLIC_USDC_TOKEN_VERSION ?? '2'
export const morphUsdcTokenDecimals =
  envClient.NEXT_PUBLIC_USDC_TOKEN_DECIMALS ?? 6

export function toUsdcAssetAmount(amountUsd: number) {
  return {
    amount: parseUnits(
      amountUsd.toFixed(Math.min(morphUsdcTokenDecimals, 6)),
      morphUsdcTokenDecimals
    ).toString(),
    asset: morphUsdcTokenAddress,
    extra: {
      name: morphUsdcTokenName,
      version: morphUsdcTokenVersion
    }
  }
}

export function getAppChainById(chainId?: number | null) {
  return (
    supportedAppChains.find(chain => chain.id === chainId) ?? defaultAppChain
  )
}

export function getSubscriptionChain() {
  return getAppChainById(envClient.NEXT_PUBLIC_SUBSCRIPTION_CHAIN_ID)
}

export function getExplorerAddressUrl(
  address: string | null | undefined,
  chainId = getSubscriptionChain().id
) {
  if (!address) {
    return null
  }

  return `${getAppChainById(chainId).explorer.baseUrl}/address/${address}`
}

export function getExplorerTransactionUrl(
  hash: string | null | undefined,
  chainId = getSubscriptionChain().id
) {
  if (!hash) {
    return null
  }

  return `${getAppChainById(chainId).explorer.baseUrl}/tx/${hash}`
}
