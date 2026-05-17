import { ConvexHttpClient } from 'convex/browser'
import 'dotenv/config'

import { api } from '../convex/_generated/api'
import type { ApiProduct } from '../src/features/marketplace/products'

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

if (!convexUrl) {
  throw new Error('NEXT_PUBLIC_CONVEX_URL is required.')
}

const client = new ConvexHttpClient(convexUrl)
const products = (await client.query(
  api.apiProducts.listProviderCatalog
)) as ApiProduct[]
let repaired = 0

for (const product of products) {
  const nextProduct = normalizeCliploreProduct(product)

  if (!nextProduct) {
    continue
  }

  const ownerWallet = nextProduct.ownerWallet ?? nextProduct.providerWallet
  let profile = await client.query(api.users.getByWallet, {
    walletAddress: ownerWallet
  })

  if (!profile?._id) {
    profile = await client.mutation(api.users.upsertProfile, {
      walletAddress: ownerWallet,
      fullName: nextProduct.providerName,
      username: nextProduct.providerSlug,
      email: `${nextProduct.providerSlug}@example.com`,
      plan: 'free'
    })
  }

  if (!profile?._id) {
    throw new Error(`Unable to resolve owner profile for ${nextProduct.slug}.`)
  }

  await client.mutation(api.apiProducts.upsertProviderCatalogProduct, {
    userId: profile._id,
    providerSlug: nextProduct.providerSlug,
    slug: nextProduct.slug,
    name: nextProduct.name,
    description: nextProduct.description,
    category: nextProduct.category,
    priceUsd: nextProduct.priceUsd,
    priceLabel: nextProduct.priceLabel,
    endpointUrl: nextProduct.providerEndpointUrl ?? nextProduct.endpointPath,
    method: nextProduct.method,
    estimatedLatency: nextProduct.estimatedLatency,
    executionMode: nextProduct.executionMode,
    settlementModel: nextProduct.settlementModel,
    resultDelivery: nextProduct.resultDelivery,
    authType: nextProduct.providerAuth?.type ?? 'none',
    authHeaderName: nextProduct.providerAuth?.headerName,
    authQueryParam: nextProduct.providerAuth?.queryParam,
    timeoutSeconds: nextProduct.timeoutSeconds,
    requestSchemaJson: JSON.stringify(nextProduct.requestSchema),
    responseSchemaJson: JSON.stringify(nextProduct.responseSchema),
    demoPayloadJson: JSON.stringify(nextProduct.referencePayload),
    productJson: JSON.stringify(nextProduct),
    isX402Protected: nextProduct.isX402Protected,
    isAgentReady: nextProduct.isAgentReady,
    status: nextProduct.status
  })

  repaired += 1
  console.log(
    `Repaired ${nextProduct.slug}: ${nextProduct.providerEndpointUrl}`
  )
}

console.log(`Repaired ${repaired} ClipLore product(s).`)

function normalizeCliploreProduct(product: ApiProduct) {
  const endpointUrl = normalizeCliploreUrl(product.providerEndpointUrl)
  const quoteEndpointUrl = normalizeCliploreUrl(
    product.pricing.quoteEndpointUrl
  )
  const statusEndpointUrl = normalizeCliploreUrl(
    product.polling?.statusEndpointUrl
  )

  if (
    endpointUrl === product.providerEndpointUrl &&
    quoteEndpointUrl === product.pricing.quoteEndpointUrl &&
    statusEndpointUrl === product.polling?.statusEndpointUrl
  ) {
    return null
  }

  return {
    ...product,
    providerEndpointUrl: endpointUrl,
    pricing: {
      ...product.pricing,
      quoteEndpointUrl
    },
    polling: product.polling
      ? {
          ...product.polling,
          statusEndpointUrl
        }
      : product.polling
  }
}

function normalizeCliploreUrl(url: string | undefined) {
  if (!url) {
    return url
  }

  return url
    .replace(
      'https://cliplore.ai/video/jobs',
      'https://cliplore.ai/api/v1/video/jobs'
    )
    .replace(
      'https://cliplore.ai/quotes/video-job',
      'https://cliplore.ai/api/v1/quotes/video-job'
    )
}
