import {
  type HTTPRequestContext,
  type RouteConfig,
  x402HTTPResourceServer,
  x402ResourceServer
} from '@x402/core/server'
import type { Network } from '@x402/core/types'
import { registerExactEvmScheme } from '@x402/evm/exact/server'

import { getMarketplaceOrderById } from '@/features/marketplace/orders'
import { resolveProductPrice } from '@/features/marketplace/pricing'
import { getProductBySlug } from '@/features/marketplace/products'
import {
  defaultX402FacilitatorUrl,
  paymentTokenSymbol,
  toPaymentAssetAmount,
  x402Network
} from '@/lib/config/chains'
import { siteConfig } from '@/lib/config/site'
import { getApiPaymentPayTo } from '@/lib/contracts/api-payment-escrow'
import { envServer } from '@/lib/env/env.server'
import { HmacFacilitatorClient } from '@/lib/x402/hmac-facilitator-client'

const paidCallPattern = '/api/x402/products/:slug/call'
const claimPattern = '/api/x402/orders/:orderId/claim'
const x402MaxTimeoutSeconds = 60
let serverPromise: Promise<x402HTTPResourceServer> | null = null

function getProductSlugFromPath(path: string) {
  const match = path.match(/^\/api\/x402\/products\/([^/]+)\/call$/)

  return match?.[1]
}

function getOrderIdFromClaimPath(path: string) {
  const match = path.match(/^\/api\/x402\/orders\/([^/]+)\/claim$/)

  return match?.[1]
}

async function requireProductFromContext(context: HTTPRequestContext) {
  const slug = getProductSlugFromPath(context.path)
  const product = slug ? await getProductBySlug(slug) : undefined

  if (!product || !(await canPriceProductFromContext(product, context))) {
    throw new Error('Published API product was not found.')
  }

  return product
}

async function canPriceProductFromContext(
  product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>,
  context: HTTPRequestContext
) {
  if (product.status === 'published') {
    return true
  }

  if (product.status !== 'draft') {
    return false
  }

  const orderId = context.adapter.getHeader?.('x-app-order-id')
  const order = orderId ? await getMarketplaceOrderById(orderId) : undefined

  if (!order || order.productSlug !== product.slug) {
    return false
  }

  if (order.isProviderTest) {
    return true
  }

  if (!product.ownerWallet) {
    return true
  }

  return order.buyerWallet.toLowerCase() === product.ownerWallet.toLowerCase()
}

const paidCallRoute: RouteConfig = {
  accepts: {
    scheme: 'exact',
    network: x402Network as Network,
    payTo: async context =>
      getApiPaymentPayTo(await requireProductFromContext(context)),
    price: async context => {
      const product = await requireProductFromContext(context)
      const resolvedPrice = await resolveProductPrice({
        product,
        requestPayload: getRequestPayload(context)
      })

      return toPaymentAssetAmount(resolvedPrice.amountUsd)
    },
    maxTimeoutSeconds: x402MaxTimeoutSeconds
  },
  description: 'Payment-token-settled API call through the x402 protocol.',
  mimeType: 'application/json',
  unpaidResponseBody: async context => {
    const product = await requireProductFromContext(context)
    const requestPayload = getRequestPayload(context)

    const resolvedPrice = await resolveProductPrice({
      product,
      requestPayload
    }).catch(error => ({
      amountUsd: product.priceUsd,
      amountLabel: product.priceLabel,
      model: product.pricing.model,
      source: 'fixed' as const,
      quoteError: error instanceof Error ? error.message : 'Quote failed.'
    }))

    return {
      contentType: 'application/json',
      body: {
        error: `${paymentTokenSymbol} payment required.`,
        product: {
          slug: product.slug,
          name: product.name,
          providerName: product.providerName,
          priceLabel: resolvedPrice.amountLabel,
          endpointPath: product.endpointPath
        },
        pricing: resolvedPrice,
        payment: {
          network: x402Network,
          scheme: 'exact',
          facilitatorUrl:
            envServer.X402_FACILITATOR_URL ?? defaultX402FacilitatorUrl
        }
      }
    }
  },
  settlementFailedResponseBody: (_context, settleResult) => ({
    contentType: 'application/json',
    body: {
      error: `${paymentTokenSymbol} payment settlement failed.`,
      reason: settleResult.errorReason,
      message: settleResult.errorMessage
    }
  })
}

const claimRoute: RouteConfig = {
  accepts: {
    scheme: 'exact',
    network: x402Network as Network,
    payTo: async context => {
      const order = await requireClaimOrderFromContext(context)
      const product = await getProductBySlug(order.productSlug)

      if (!product) {
        throw new Error('Claim product was not found.')
      }

      return product.providerWallet
    },
    price: async context => {
      const order = await requireClaimOrderFromContext(context)
      const amount = parseUsdcAmount(order.deltaAmountUsdc)

      if (amount <= 0) {
        throw new Error('Order does not have a payable metered delta.')
      }

      return toPaymentAssetAmount(amount)
    },
    maxTimeoutSeconds: x402MaxTimeoutSeconds
  },
  description: `${paymentTokenSymbol}-settled result claim for credit-metered API usage that exceeded the prepaid quote.`,
  mimeType: 'application/json',
  unpaidResponseBody: async context => {
    const order = await requireClaimOrderFromContext(context)

    return {
      contentType: 'application/json',
      body: {
        error: `${paymentTokenSymbol} delta payment required.`,
        order: {
          id: order.id,
          productSlug: order.productSlug,
          productName: order.productName,
          deltaAmountUsdc: order.deltaAmountUsdc,
          resultReleaseStatus: order.resultReleaseStatus
        },
        payment: {
          network: x402Network,
          scheme: 'exact',
          facilitatorUrl:
            envServer.X402_FACILITATOR_URL ?? defaultX402FacilitatorUrl
        }
      }
    }
  },
  settlementFailedResponseBody: (_context, settleResult) => ({
    contentType: 'application/json',
    body: {
      error: `${paymentTokenSymbol} delta settlement failed.`,
      reason: settleResult.errorReason,
      message: settleResult.errorMessage
    }
  })
}

async function requireClaimOrderFromContext(context: HTTPRequestContext) {
  const orderId = getOrderIdFromClaimPath(context.path)
  const order = orderId ? await getMarketplaceOrderById(orderId) : undefined

  if (
    !order ||
    order.status !== 'delta_payment_required' ||
    order.resultReleaseStatus !== 'delta_payment_required'
  ) {
    throw new Error('Order does not require a result claim payment.')
  }

  return order
}

function getRequestPayload(context: HTTPRequestContext) {
  return context.adapter.getBody?.() ?? context.adapter.getQueryParams?.() ?? {}
}

export async function getPaymentX402Server() {
  if (!serverPromise) {
    serverPromise = (async () => {
      const facilitator = new HmacFacilitatorClient({
        url: envServer.X402_FACILITATOR_URL ?? defaultX402FacilitatorUrl,
        accessKey: envServer.X402_FACILITATOR_ACCESS_KEY,
        secretKey: envServer.X402_FACILITATOR_SECRET_KEY
      })
      const resourceServer = new x402ResourceServer(facilitator)

      registerExactEvmScheme(resourceServer, {
        networks: [x402Network as Network]
      })

      const httpServer = new x402HTTPResourceServer(resourceServer, {
        [`GET ${paidCallPattern}`]: paidCallRoute,
        [`POST ${paidCallPattern}`]: paidCallRoute,
        [`POST ${claimPattern}`]: claimRoute
      })

      await httpServer.initialize()

      return httpServer
    })()
  }

  return serverPromise
}

function parseUsdcAmount(value: string | undefined) {
  const amount = Number((value ?? '').replace(/[^0-9.]/g, ''))

  return Number.isFinite(amount) ? amount : 0
}

export function getPaymentPaywallConfig(currentUrl: string) {
  return {
    appName: siteConfig.name,
    currentUrl,
    testnet: true
  }
}
