import { ConvexHttpClient } from 'convex/browser'
import 'dotenv/config'

import { api } from '../convex/_generated/api'
import {
  createOpenApiImportCandidates,
  parseOpenApiDocument
} from '../src/features/marketplace/openapi-import'
import type {
  ApiProduct,
  ApiProductAuthType
} from '../src/features/marketplace/products'

const openApiUrl =
  process.env.CLIPLORE_OPENAPI_URL ?? 'https://cliplore.ai/api/v1/openapi.json'
const providerWallet =
  process.env.CLIPLORE_PROVIDER_WALLET ??
  '0x7CE33579392AEAF1791c9B0c8302a502B5867688'
const providerName = process.env.CLIPLORE_PROVIDER_NAME ?? 'ClipLore Provider'
const providerUsername =
  process.env.CLIPLORE_PROVIDER_USERNAME ?? 'cliplore-provider'
const providerEmail =
  process.env.CLIPLORE_PROVIDER_EMAIL ?? 'provider@cliplore.ai'
const productSlug = 'create-a-video-generation-job'

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

if (!convexUrl) {
  throw new Error('NEXT_PUBLIC_CONVEX_URL is required to seed ClipLore.')
}

const client = new ConvexHttpClient(convexUrl)
const existingRow = await client.query(api.apiProducts.getBySlug, {
  slug: productSlug
})
const existingProduct = parseProductJson(existingRow?.productJson)
const providerAuthSecret =
  process.env.CLIPLORE_PROVIDER_AUTH_SECRET ??
  existingProduct?.providerAuth?.secret

const specResponse = await fetch(openApiUrl, {
  cache: 'no-store',
  headers: {
    Accept: 'application/json, application/yaml, text/yaml, text/plain',
    'Cache-Control': 'no-cache'
  }
})

if (!specResponse.ok) {
  throw new Error(`ClipLore OpenAPI URL returned HTTP ${specResponse.status}.`)
}

const document = parseOpenApiDocument(await specResponse.text())
const candidate = createOpenApiImportCandidates({
  document,
  sourceUrl: openApiUrl
}).find(item => item.slug === productSlug)

if (!candidate) {
  throw new Error(`Could not find ${productSlug} in ${openApiUrl}.`)
}

const profile = await client.mutation(api.users.upsertProfile, {
  walletAddress: providerWallet,
  fullName: providerName,
  username: providerUsername,
  email: providerEmail,
  plan: 'plus'
})

if (!profile) {
  throw new Error('Unable to create or load the ClipLore provider profile.')
}

const authType = candidate.authType as ApiProductAuthType

if (authType !== 'none' && !providerAuthSecret?.trim()) {
  throw new Error(
    'ClipLore requires provider auth. Set CLIPLORE_PROVIDER_AUTH_SECRET in .env.local or seed after listing once with an API key.'
  )
}

const product: ApiProduct = {
  slug: candidate.slug,
  name: candidate.name,
  ownerWallet: profile.walletAddress as `0x${string}`,
  providerName: profile.fullName,
  providerSlug: profile.username,
  providerWallet: profile.walletAddress as `0x${string}`,
  category: candidate.category,
  description:
    'Creates an asynchronous ClipLore video project from a prompt, optional script, source family preferences, voice selection, background selection, palette selection, and webhook metadata.',
  priceUsd: 0.05,
  priceLabel: 'Metered quote',
  pricing: {
    model: candidate.pricingModel,
    quoteEndpointUrl: candidate.pricingQuoteEndpointUrl,
    quoteMethod: candidate.pricingQuoteMethod,
    creditUnitPath: candidate.pricingCreditUnitPath || 'estimatedCredits',
    usageCreditPath: candidate.pricingUsageCreditPath || 'chargedCredits',
    creditToUsdcRate: Number(candidate.pricingCreditToUsdcRate) || 0.01,
    multiplier: Number(candidate.pricingMultiplier) || 1,
    minimumChargeUsd:
      Number(candidate.pricingMinimumChargeUsd) > 0
        ? Number(candidate.pricingMinimumChargeUsd)
        : 0.05,
    maximumChargeUsd:
      candidate.pricingMaximumChargeUsd === ''
        ? undefined
        : Number(candidate.pricingMaximumChargeUsd)
  },
  method: candidate.method,
  endpointPath: `/api/x402/products/${candidate.slug}/call`,
  providerEndpointUrl: candidate.endpointUrl,
  providerAuth: {
    type: authType,
    headerName:
      authType === 'bearer' || authType === 'api_key_header'
        ? candidate.authHeaderName || 'Authorization'
        : undefined,
    queryParam:
      authType === 'api_key_query' ? candidate.authQueryParam : undefined,
    secret: providerAuthSecret
  },
  polling: {
    statusEndpointUrl: candidate.statusEndpointUrl,
    method: candidate.statusMethod,
    externalJobIdPath: candidate.externalJobIdPath,
    statusPath: candidate.statusPath,
    resultUrlPath: candidate.resultUrlPath,
    errorMessagePath: candidate.errorMessagePath
  },
  timeoutSeconds: 300,
  estimatedLatency: candidate.estimatedLatency,
  executionMode: candidate.executionMode,
  settlementModel: candidate.settlementModel,
  resultDelivery: candidate.resultDelivery,
  requestSchema: candidate.requestSchema,
  responseSchema: candidate.responseSchema,
  referencePayload: {
    ...candidate.referencePayload,
    prompt: 'Create a short documentary about sea turtles'
  },
  isX402Protected: true,
  isAgentReady: true,
  status: 'published',
  featured: true,
  calls: existingProduct?.calls ?? 0,
  successRate: existingProduct?.successRate ?? 'No calls yet',
  revenueUsdc: existingProduct?.revenueUsdc ?? '0.00'
}

const seeded = await client.mutation(
  api.apiProducts.upsertProviderCatalogProduct,
  {
    userId: profile._id,
    providerSlug: product.providerSlug,
    slug: product.slug,
    name: product.name,
    description: product.description,
    category: product.category,
    priceUsd: product.priceUsd,
    priceLabel: product.priceLabel,
    endpointUrl: product.providerEndpointUrl ?? product.endpointPath,
    method: product.method,
    estimatedLatency: product.estimatedLatency,
    executionMode: product.executionMode,
    settlementModel: product.settlementModel,
    resultDelivery: product.resultDelivery,
    authType: product.providerAuth?.type ?? 'none',
    authHeaderName: product.providerAuth?.headerName,
    authQueryParam: product.providerAuth?.queryParam,
    timeoutSeconds: product.timeoutSeconds,
    requestSchemaJson: JSON.stringify(product.requestSchema),
    responseSchemaJson: JSON.stringify(product.responseSchema),
    demoPayloadJson: JSON.stringify(product.referencePayload),
    productJson: JSON.stringify(product),
    isX402Protected: product.isX402Protected,
    isAgentReady: product.isAgentReady,
    status: product.status
  }
)

console.log(
  JSON.stringify(
    {
      slug: seeded?.slug,
      endpointUrl: product.providerEndpointUrl,
      quoteEndpointUrl: product.pricing.quoteEndpointUrl,
      status: seeded?.status,
      hasProviderAuthSecret: Boolean(providerAuthSecret)
    },
    null,
    2
  )
)

function parseProductJson(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown

    return parsed && typeof parsed === 'object'
      ? (parsed as Partial<ApiProduct>)
      : null
  } catch {
    return null
  }
}
