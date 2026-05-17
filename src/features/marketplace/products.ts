import { listMarketplaceOrders } from '@/features/marketplace/orders'
import { listSettlementReceipts } from '@/features/marketplace/receipt-store'
import type { MarketplaceReceipt } from '@/features/marketplace/receipts'
import type { MarketplaceOrder } from '@/features/marketplace/types'
import { getConvexClient } from '@/lib/db/convex/client'

import { api } from '../../../convex/_generated/api'

export type ApiProductCategory =
  | 'ai'
  | 'data'
  | 'media'
  | 'agent'
  | 'commerce'
  | 'developer'

export type ApiProductStatus = 'published' | 'draft' | 'paused'
export type ApiProductExecutionMode = 'synchronous' | 'asynchronous'
export type ApiProductSettlementModel =
  | 'pay_on_successful_response'
  | 'pay_on_job_acceptance'
  | 'pay_to_claim_result'
export type ApiProductResultDelivery =
  | 'direct_response'
  | 'poll_or_webhook'
  | 'claim_after_completion'
export type ApiProductAuthType =
  | 'none'
  | 'bearer'
  | 'api_key_header'
  | 'api_key_query'
  | 'basic'
export type ApiProductPricingModel = 'fixed' | 'credit_metered'

export type ApiProductProviderAuth = {
  type: ApiProductAuthType
  headerName?: string
  queryParam?: string
  secret?: string
  username?: string
  password?: string
}

export type ApiProductPollingConfig = {
  statusEndpointUrl?: string
  method: 'GET' | 'POST'
  externalJobIdPath?: string
  statusPath?: string
  resultUrlPath?: string
  errorMessagePath?: string
}

export type ApiProductPricingConfig = {
  model: ApiProductPricingModel
  quoteEndpointUrl?: string
  quoteMethod?: 'GET' | 'POST'
  creditUnitPath?: string
  usageCreditPath?: string
  creditToUsdcRate?: number
  multiplier?: number
  minimumChargeUsd?: number
  maximumChargeUsd?: number
}

export type ApiProduct = {
  slug: string
  name: string
  ownerWallet?: `0x${string}`
  providerName: string
  providerSlug: string
  providerWallet: `0x${string}`
  category: ApiProductCategory
  description: string
  priceUsd: number
  priceLabel: string
  pricing: ApiProductPricingConfig
  method: 'GET' | 'POST'
  endpointPath: string
  providerEndpointUrl?: string
  providerAuth?: ApiProductProviderAuth
  polling?: ApiProductPollingConfig
  timeoutSeconds?: number
  estimatedLatency: string
  executionMode: ApiProductExecutionMode
  settlementModel: ApiProductSettlementModel
  resultDelivery: ApiProductResultDelivery
  requestSchema: Record<string, string>
  responseSchema: Record<string, string>
  referencePayload: Record<string, unknown>
  isX402Protected: boolean
  isAgentReady: boolean
  status: ApiProductStatus
  featured?: boolean
  calls: number
  successRate: string
  revenueUsdc: string
}

const adminProviderWallet =
  '0x7CE33579392AEAF1791c9B0c8302a502B5867688' as const
const adminProviderName = 'Paykubo Labs'
const adminProviderSlug = 'paykubo-labs'

export const marketplaceProducts: ApiProduct[] = [
  {
    slug: 'public-wikipedia-context',
    name: 'Wikipedia Context Search',
    ownerWallet: adminProviderWallet,
    providerName: adminProviderName,
    providerSlug: adminProviderSlug,
    providerWallet: adminProviderWallet,
    category: 'data',
    description:
      'Searches public Wikipedia pages for factual context the agent can use in launch briefs, market summaries, and positioning copy.',
    priceUsd: 0.03,
    priceLabel: '0.03 USDC',
    pricing: { model: 'fixed' },
    method: 'GET',
    endpointPath: '/api/x402/products/public-wikipedia-context/call',
    providerEndpointUrl: 'https://en.wikipedia.org/w/api.php',
    providerAuth: { type: 'none' },
    timeoutSeconds: 20,
    estimatedLatency: '1-3s',
    executionMode: 'synchronous',
    settlementModel: 'pay_on_successful_response',
    resultDelivery: 'direct_response',
    requestSchema: {
      action: '"query"',
      list: '"search"',
      format: '"json"',
      srsearch: 'string',
      srlimit: 'number | undefined'
    },
    responseSchema: {
      query: 'object',
      search: 'array',
      searchinfo: 'object'
    },
    referencePayload: {
      action: 'query',
      list: 'search',
      format: 'json',
      srsearch: 'AI API marketplace',
      srlimit: 5,
      origin: '*'
    },
    isX402Protected: true,
    isAgentReady: true,
    status: 'published',
    calls: 0,
    successRate: '100%',
    revenueUsdc: '0.00'
  },
  {
    slug: 'public-hn-trend-scan',
    name: 'Hacker News Trend Scan',
    ownerWallet: adminProviderWallet,
    providerName: adminProviderName,
    providerSlug: adminProviderSlug,
    providerWallet: adminProviderWallet,
    category: 'data',
    description:
      'Searches public Hacker News story metadata for recent developer interest around a launch topic, technology, or market category.',
    priceUsd: 0.04,
    priceLabel: '0.04 USDC',
    pricing: { model: 'fixed' },
    method: 'GET',
    endpointPath: '/api/x402/products/public-hn-trend-scan/call',
    providerEndpointUrl: 'https://hn.algolia.com/api/v1/search_by_date',
    providerAuth: { type: 'none' },
    timeoutSeconds: 20,
    estimatedLatency: '1-3s',
    executionMode: 'synchronous',
    settlementModel: 'pay_on_successful_response',
    resultDelivery: 'direct_response',
    requestSchema: {
      query: 'string',
      tags: 'string | undefined',
      hitsPerPage: 'number | undefined'
    },
    responseSchema: {
      hits: 'array',
      nbHits: 'number',
      page: 'number'
    },
    referencePayload: {
      query: 'AI agents API marketplace',
      tags: 'story',
      hitsPerPage: 5
    },
    isX402Protected: true,
    isAgentReady: true,
    status: 'published',
    calls: 0,
    successRate: '100%',
    revenueUsdc: '0.00'
  },
  {
    slug: 'public-github-repo-search',
    name: 'GitHub Repository Signal',
    ownerWallet: adminProviderWallet,
    providerName: adminProviderName,
    providerSlug: adminProviderSlug,
    providerWallet: adminProviderWallet,
    category: 'developer',
    description:
      'Searches public GitHub repositories for developer traction signals, related projects, languages, stars, forks, and repo descriptions.',
    priceUsd: 0.04,
    priceLabel: '0.04 USDC',
    pricing: { model: 'fixed' },
    method: 'GET',
    endpointPath: '/api/x402/products/public-github-repo-search/call',
    providerEndpointUrl: 'https://api.github.com/search/repositories',
    providerAuth: { type: 'none' },
    timeoutSeconds: 20,
    estimatedLatency: '1-3s',
    executionMode: 'synchronous',
    settlementModel: 'pay_on_successful_response',
    resultDelivery: 'direct_response',
    requestSchema: {
      q: 'string',
      sort: '"stars" | "updated" | undefined',
      order: '"desc" | "asc" | undefined',
      per_page: 'number | undefined'
    },
    responseSchema: {
      total_count: 'number',
      items: 'array',
      incomplete_results: 'boolean'
    },
    referencePayload: {
      q: 'AI agent API marketplace in:name,description,readme',
      sort: 'stars',
      order: 'desc',
      per_page: 5
    },
    isX402Protected: true,
    isAgentReady: true,
    status: 'published',
    calls: 0,
    successRate: '100%',
    revenueUsdc: '0.00'
  },
  {
    slug: 'public-npm-package-signal',
    name: 'NPM Package Signal',
    ownerWallet: adminProviderWallet,
    providerName: adminProviderName,
    providerSlug: adminProviderSlug,
    providerWallet: adminProviderWallet,
    category: 'developer',
    description:
      'Searches the public npm registry for package names, descriptions, keywords, maintainers, and popularity signals around a developer product category.',
    priceUsd: 0.04,
    priceLabel: '0.04 USDC',
    pricing: { model: 'fixed' },
    method: 'GET',
    endpointPath: '/api/x402/products/public-npm-package-signal/call',
    providerEndpointUrl: 'https://registry.npmjs.org/-/v1/search',
    providerAuth: { type: 'none' },
    timeoutSeconds: 20,
    estimatedLatency: '1-3s',
    executionMode: 'synchronous',
    settlementModel: 'pay_on_successful_response',
    resultDelivery: 'direct_response',
    requestSchema: {
      text: 'string',
      size: 'number | undefined',
      quality: 'number | undefined',
      popularity: 'number | undefined',
      maintenance: 'number | undefined'
    },
    responseSchema: {
      objects: 'array',
      total: 'number',
      time: 'string'
    },
    referencePayload: {
      text: 'AI agent API commerce',
      size: 5,
      quality: 0.65,
      popularity: 0.25,
      maintenance: 0.1
    },
    isX402Protected: true,
    isAgentReady: true,
    status: 'published',
    calls: 0,
    successRate: '100%',
    revenueUsdc: '0.00'
  },
  {
    slug: 'public-openalex-research-scan',
    name: 'OpenAlex Research Scan',
    ownerWallet: adminProviderWallet,
    providerName: adminProviderName,
    providerSlug: adminProviderSlug,
    providerWallet: adminProviderWallet,
    category: 'data',
    description:
      'Searches the public OpenAlex works index for papers and research metadata that can support technical explainers, documentation, and evidence-backed narratives.',
    priceUsd: 0.04,
    priceLabel: '0.04 USDC',
    pricing: { model: 'fixed' },
    method: 'GET',
    endpointPath: '/api/x402/products/public-openalex-research-scan/call',
    providerEndpointUrl: 'https://api.openalex.org/works',
    providerAuth: { type: 'none' },
    timeoutSeconds: 20,
    estimatedLatency: '1-3s',
    executionMode: 'synchronous',
    settlementModel: 'pay_on_successful_response',
    resultDelivery: 'direct_response',
    requestSchema: {
      search: 'string',
      'per-page': 'number | undefined',
      sort: 'string | undefined'
    },
    responseSchema: {
      meta: 'object',
      results: 'array',
      group_by: 'array'
    },
    referencePayload: {
      search: 'AI agents API payments',
      'per-page': 5,
      sort: 'relevance_score:desc'
    },
    isX402Protected: true,
    isAgentReady: true,
    status: 'published',
    calls: 0,
    successRate: '100%',
    revenueUsdc: '0.00'
  },
  {
    slug: 'public-gdelt-news-scan',
    name: 'GDELT News Signal',
    ownerWallet: adminProviderWallet,
    providerName: adminProviderName,
    providerSlug: adminProviderSlug,
    providerWallet: adminProviderWallet,
    category: 'data',
    description:
      'Searches the public GDELT document API for recent news coverage, article URLs, source domains, and topical language around a product or market.',
    priceUsd: 0.05,
    priceLabel: '0.05 USDC',
    pricing: { model: 'fixed' },
    method: 'GET',
    endpointPath: '/api/x402/products/public-gdelt-news-scan/call',
    providerEndpointUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
    providerAuth: { type: 'none' },
    timeoutSeconds: 25,
    estimatedLatency: '2-5s',
    executionMode: 'synchronous',
    settlementModel: 'pay_on_successful_response',
    resultDelivery: 'direct_response',
    requestSchema: {
      query: 'string',
      mode: '"ArtList"',
      format: '"json"',
      maxrecords: 'number | undefined',
      sort: '"HybridRel" | "DateDesc" | undefined'
    },
    responseSchema: {
      articles: 'array'
    },
    referencePayload: {
      query: 'artificial intelligence agents API payments',
      mode: 'ArtList',
      format: 'json',
      maxrecords: 5,
      sort: 'HybridRel'
    },
    isX402Protected: true,
    isAgentReady: true,
    status: 'published',
    calls: 0,
    successRate: '100%',
    revenueUsdc: '0.00'
  }
]

export async function getPublishedProducts() {
  const products = await getAllProducts()

  return products.filter(product => product.status === 'published')
}

export async function getProviderOwnedProducts(ownerWallet?: string | null) {
  if (!ownerWallet) {
    return []
  }

  const normalizedOwner = ownerWallet.toLowerCase()
  const products = await getAllProducts()

  return products.filter(
    product => product.ownerWallet?.toLowerCase() === normalizedOwner
  )
}

export async function getProviderPublishedProducts(
  ownerWallet?: string | null
) {
  const products = await getProviderOwnedProducts(ownerWallet)

  return products.filter(product => product.status === 'published')
}

export async function getAllProducts() {
  const [providerProducts, orders, receipts] = await Promise.all([
    readProviderProducts(),
    listMarketplaceOrders(),
    listSettlementReceipts()
  ])

  return [...providerProducts, ...marketplaceProducts]
    .map(withDisplayPriceLabel)
    .map(product => withUsageMetrics(product, orders, receipts))
}

export async function getFeaturedProduct() {
  const publishedProducts = await getPublishedProducts()
  const cliploreProduct = publishedProducts.find(product => {
    const provider = product.providerName.toLowerCase()
    const slug = product.slug.toLowerCase()

    return (
      provider.includes('cliplore') ||
      provider.includes('clipplorer') ||
      slug.includes('video-generation')
    )
  })

  return (
    cliploreProduct ??
    publishedProducts.find(
      product => product.featured && product.slug !== 'public-wikipedia-context'
    ) ??
    publishedProducts.find(
      product => product.slug !== 'public-wikipedia-context'
    )
  )
}

export async function getProductBySlug(slug: string) {
  const products = await getAllProducts()

  return products.find(product => product.slug === slug)
}

export async function recordProviderProduct({
  product,
  userId
}: {
  product: ApiProduct
  userId: string
}) {
  const created = await getConvexClient().mutation(
    api.apiProducts.createProviderCatalogProduct,
    {
      userId: userId as any,
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

  return normalizeConvexProduct(created) ?? product
}

export async function updateProviderProductStatus(
  slug: string,
  status: ApiProductStatus,
  ownerWallet?: string | null
) {
  if (!ownerWallet) {
    return null
  }

  const product = await getConvexClient().mutation(
    api.apiProducts.updateProviderCatalogStatus,
    { slug, status, ownerWallet }
  )

  return normalizeConvexProduct(product)
}

export async function deleteProviderProduct(
  slug: string,
  ownerWallet?: string | null
) {
  if (!ownerWallet) {
    return null
  }

  const product = await getConvexClient().mutation(
    api.apiProducts.deleteProviderCatalogProduct,
    { slug, ownerWallet }
  )

  return normalizeConvexProduct(product)
}

export async function deleteAdminProviderProducts(slugs: string[]) {
  return await getConvexClient().mutation(
    api.apiProducts.deleteProviderCatalogProducts,
    { slugs }
  )
}

export async function getMarketplaceMetrics() {
  const products = await getPublishedProducts()
  const totalCalls = products.reduce((sum, product) => sum + product.calls, 0)
  const totalRevenue = products.reduce(
    (sum, product) => sum + Number(product.revenueUsdc),
    0
  )

  return {
    productCount: products.length,
    totalCalls,
    totalRevenueUsdc: totalRevenue.toFixed(2),
    platformFeeBps: 500,
    providerShareBps: 9500,
    platformFeeRangeLabel: '1-5%',
    providerShareRangeLabel: '95-99%'
  }
}

export async function getProviderDashboardMetrics(ownerWallet?: string | null) {
  const products = await getProviderOwnedProducts(ownerWallet)
  const [allOrders, allReceipts] = await Promise.all([
    listMarketplaceOrders(),
    listSettlementReceipts()
  ])
  const productSlugs = new Set(products.map(product => product.slug))
  const orders = allOrders.filter(order => productSlugs.has(order.productSlug))
  const receipts = allReceipts.filter(receipt =>
    productSlugs.has(receipt.productSlug)
  )
  const completedOrders = orders.filter(isCompletedProviderOrder)
  const failedOrders = orders.filter(order => order.status === 'failed')
  const processingOrders = orders.filter(order =>
    ['paid', 'processing', 'ready', 'delta_payment_required'].includes(
      order.status
    )
  )
  const providerRevenue = receipts
    .filter(receipt => isProviderEarningReceipt(receipt.orderId, allOrders))
    .reduce((sum, receipt) => sum + parseUsdc(receipt.providerAmountUsdc), 0)
  const grossVolume = receipts.reduce(
    (sum, receipt) => sum + parseUsdc(receipt.amountUsdc),
    0
  )

  return {
    productCount: products.length,
    orderCount: orders.length,
    completedCalls: completedOrders.length,
    failedCalls: failedOrders.length,
    processingCalls: processingOrders.length,
    grossVolumeUsdc: grossVolume.toFixed(2),
    providerRevenueUsdc: providerRevenue.toFixed(2),
    platformFeeUsdc: Math.max(0, grossVolume - providerRevenue).toFixed(2),
    successRate:
      orders.length > 0
        ? `${Math.round((completedOrders.length / orders.length) * 100)}%`
        : 'No calls yet'
  }
}

export async function getProviderOrders(ownerWallet?: string | null) {
  const products = await getProviderOwnedProducts(ownerWallet)
  const orders = await listMarketplaceOrders()
  const productSlugs = new Set(products.map(product => product.slug))

  return orders.filter(order => productSlugs.has(order.productSlug))
}

async function readProviderProducts() {
  try {
    const rows = await getConvexClient().query(
      api.apiProducts.listProviderCatalog,
      {}
    )

    return Array.isArray(rows)
      ? rows
          .map(normalizeConvexProduct)
          .filter((product): product is ApiProduct => Boolean(product))
      : []
  } catch {
    return []
  }
}

function withDisplayPriceLabel(product: ApiProduct): ApiProduct {
  if (product.pricing.model !== 'credit_metered') {
    return product
  }

  if (product.priceLabel === 'Metered quote') {
    return product
  }

  return {
    ...product,
    priceLabel: 'Metered quote'
  }
}

function withUsageMetrics(
  product: ApiProduct,
  orders: MarketplaceOrder[],
  receipts: MarketplaceReceipt[]
): ApiProduct {
  const productOrders = orders.filter(
    order => order.productSlug === product.slug
  )
  const completedOrders = productOrders.filter(isCompletedProviderOrder)
  const productReceipts = receipts.filter(
    receipt => receipt.productSlug === product.slug
  )
  const revenue = productReceipts
    .filter(receipt => isProviderEarningReceipt(receipt.orderId, orders))
    .reduce((sum, receipt) => sum + parseUsdc(receipt.providerAmountUsdc), 0)

  return {
    ...product,
    calls: productOrders.length,
    successRate:
      productOrders.length > 0
        ? `${Math.round((completedOrders.length / productOrders.length) * 100)}%`
        : product.successRate,
    revenueUsdc: revenue.toFixed(2)
  }
}

function isCompletedProviderOrder(order: MarketplaceOrder) {
  return (
    order.status === 'completed' ||
    order.resultReleaseStatus === 'released' ||
    order.escrowStatus === 'released'
  )
}

function isProviderEarningReceipt(orderId: string, orders: MarketplaceOrder[]) {
  const order = orders.find(item => item.id === orderId)

  if (!order) {
    return false
  }

  return isCompletedProviderOrder(order)
}

function parseUsdc(value: string | undefined) {
  const amount = Number((value ?? '').replace(/[^0-9.]/g, ''))

  return Number.isFinite(amount) ? amount : 0
}

function normalizeConvexProduct(value: unknown): ApiProduct | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const product = value as Partial<ApiProduct>

  if (
    typeof product.slug === 'string' &&
    typeof product.name === 'string' &&
    typeof product.providerName === 'string' &&
    typeof product.endpointPath === 'string' &&
    ['draft', 'published', 'paused'].includes(String(product.status))
  ) {
    return product as ApiProduct
  }

  return null
}
