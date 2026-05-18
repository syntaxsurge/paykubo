import { createHash } from 'node:crypto'

import {
  getMarketplaceOrderById,
  updateMarketplaceOrder
} from '@/features/marketplace/orders'
import { resolveFinalUsageDelta } from '@/features/marketplace/pricing'
import { getProductBySlug } from '@/features/marketplace/products'
import { resolveProviderFeeSplit } from '@/features/marketplace/provider-fees'
import {
  getMarketplaceReceiptById,
  recordMarketplaceReceipt
} from '@/features/marketplace/receipt-store'
import {
  buildExplorerUrl,
  buildReceiptAmounts
} from '@/features/marketplace/receipts'
import type {
  MarketplaceAsyncPollingResponse,
  MarketplaceOrder
} from '@/features/marketplace/types'
import { getProviderAdapter } from '@/features/provider-adapters/registry'
import { classifyProviderFailure } from '@/features/provider-adapters/retry-policy'
import type { ProviderAdapterResult } from '@/features/provider-adapters/types'
import { x402Network } from '@/lib/config/chains'
import {
  getApiPaymentPayTo,
  getEscrowPaymentDetails,
  getEscrowPaymentId,
  getEscrowPaymentState,
  refundEscrowPayment,
  releaseEscrowPayment
} from '@/lib/contracts/api-payment-escrow'
import { omitIndexedCharacterMaps } from '@/lib/utils/json-payload'

export type MarketplaceProviderStatusResponse = {
  order?: MarketplaceOrder | null
  provider?: ProviderAdapterResult | Record<string, unknown>
  pricing?: {
    actual: unknown
    deltaAmountUsdc: string
    resultReleaseStatus: MarketplaceOrder['resultReleaseStatus']
  }
  escrow?: {
    refund: EscrowStatusWrite | null
    release: EscrowStatusWrite | null
  }
  error?: string
}

type EscrowStatusWrite = {
  txHash: `0x${string}`
  explorerUrl: string | null
}

type SyncProviderStatusOptions = {
  forceProviderCall?: boolean
  pollingUrl?: string
  allowReservedEscrowRecovery?: boolean
}

type ReservedEscrowRecovery = {
  receiptId: string
  paymentId: `0x${string}`
  escrowAddress: string
  settlementTxHash: `0x${string}`
  buyerWallet: string
}

export async function syncMarketplaceOrderProviderStatus(
  orderId: string,
  {
    forceProviderCall = false,
    pollingUrl,
    allowReservedEscrowRecovery = false
  }: SyncProviderStatusOptions = {}
): Promise<{ status: number; body: MarketplaceProviderStatusResponse }> {
  const order = await getMarketplaceOrderById(orderId)

  if (!order) {
    return {
      status: 404,
      body: { error: 'Order was not found.' }
    }
  }

  const adapter = await getProviderAdapter(order.productSlug)
  const product = await getProductBySlug(order.productSlug)
  const isRetryingProviderCall =
    order.resultReleaseStatus === 'provider_retrying'
  const isManualProviderRetry =
    forceProviderCall && canRetryPaidProviderCall(order)
  const recovery =
    allowReservedEscrowRecovery && product
      ? await findReservedEscrowRecovery(order, product)
      : null
  const canRecoverProviderHandoff =
    Boolean(recovery) &&
    Boolean(order.requestPayloadJson) &&
    !order.externalJobId &&
    !isRetryingProviderCall &&
    !isManualProviderRetry

  if (
    !order.externalJobId &&
    !isRetryingProviderCall &&
    !isManualProviderRetry &&
    !canRecoverProviderHandoff
  ) {
    return {
      status: 400,
      body: {
        order,
        error: forceProviderCall
          ? 'This paid order is not eligible for a provider retry.'
          : 'This order does not have an async provider job.'
      }
    }
  }

  if (!adapter) {
    return {
      status: 400,
      body: {
        order,
        error: 'This provider adapter is not configured.'
      }
    }
  }

  if (!product) {
    return {
      status: 400,
      body: {
        order,
        error: 'This product is not configured.'
      }
    }
  }

  const effectiveOrder = recovery
    ? await persistRecoveredReservedOrder(order, product, recovery)
    : order
  const paidAmountUsd = parseUsdcLabel(
    effectiveOrder.paidAmountUsdc ?? effectiveOrder.amountUsdc
  )
  const requestPayload = parseJsonOrEmpty(effectiveOrder.requestPayloadJson)
  const providerResult =
    effectiveOrder.externalJobId && adapter.getStatus && !isManualProviderRetry
      ? await adapter.getStatus(
          effectiveOrder.externalJobId,
          effectiveOrder.productSlug
        )
      : (isRetryingProviderCall ||
            isManualProviderRetry ||
            canRecoverProviderHandoff) &&
          effectiveOrder.receiptId
        ? await adapter.call({
            productSlug: effectiveOrder.productSlug,
            orderId: effectiveOrder.id,
            requestId: effectiveOrder.requestId,
            providerIdempotencyKey:
              effectiveOrder.providerIdempotencyKey ??
              createProviderIdempotencyKey({
                orderId: effectiveOrder.id,
                requestId: effectiveOrder.requestId
              }),
            requestPayload,
            buyerWallet: effectiveOrder.buyerWallet,
            receiptId: effectiveOrder.receiptId
          })
        : null

  if (!providerResult) {
    return {
      status: 400,
      body: {
        order: effectiveOrder,
        error: 'This provider does not expose a retryable status adapter.'
      }
    }
  }

  const usageDelta =
    providerResult.status === 'completed'
      ? await resolveFinalUsageDelta({
          product,
          requestPayload,
          providerResponse: providerResult.responsePayload,
          paidAmountUsd
        }).catch(() => null)
      : null
  const failurePolicy =
    providerResult.status === 'failed'
      ? classifyProviderFailure({ providerResult, order: effectiveOrder })
      : null
  const shouldHoldRetryableFailure =
    failurePolicy?.retryable === true && !failurePolicy.expired
  const resultReleaseStatus = shouldHoldRetryableFailure
    ? 'provider_retrying'
    : providerResult.status === 'failed'
      ? effectiveOrder.escrowStatus === 'reserved'
        ? 'refunded'
        : 'refundable'
      : usageDelta?.releaseStatus === 'delta_payment_required'
        ? 'delta_payment_required'
        : usageDelta?.releaseStatus === 'credit_due'
          ? 'credit_due'
          : providerResult.status === 'completed'
            ? 'released'
            : providerResult.status === 'processing'
              ? 'reserved'
              : effectiveOrder.resultReleaseStatus
  const nextStatus =
    resultReleaseStatus === 'delta_payment_required'
      ? ('delta_payment_required' as const)
      : shouldHoldRetryableFailure
        ? ('processing' as const)
        : providerResult.status
  const responsePayload =
    resultReleaseStatus === 'delta_payment_required'
      ? {
          status: 'ready',
          message:
            'Final usage exceeded the prepaid quote. Pay the delta before the gateway reveals the provider result.',
          externalJobId:
            providerResult.externalJobId ?? effectiveOrder.externalJobId
        }
      : omitIndexedCharacterMaps(
          providerResult.responsePayload ?? effectiveOrder.responsePayload
        )
  const escrowPaymentId = isHexBytes32(effectiveOrder.escrowPaymentId)
    ? effectiveOrder.escrowPaymentId
    : null
  const shouldRefundEscrow =
    providerResult.status === 'failed' &&
    !shouldHoldRetryableFailure &&
    effectiveOrder.escrowStatus === 'reserved' &&
    Boolean(escrowPaymentId)
  const shouldReleaseEscrow =
    providerResult.status === 'completed' &&
    effectiveOrder.escrowStatus === 'reserved' &&
    resultReleaseStatus !== 'delta_payment_required' &&
    Boolean(escrowPaymentId)
  const escrowRefund = shouldRefundEscrow
    ? await refundReservedEscrowPayment(escrowPaymentId!)
    : null
  const escrowRelease = shouldReleaseEscrow
    ? await releaseEscrowPayment(escrowPaymentId!).catch(error => ({
        error: describeUnknownError(error)
      }))
    : null
  const refundedEscrow = isEscrowWriteResult(escrowRefund) ? escrowRefund : null
  const releasedEscrow = isEscrowWriteResult(escrowRelease)
    ? escrowRelease
    : null
  const receipt = effectiveOrder.receiptId
    ? await getMarketplaceReceiptById(effectiveOrder.receiptId)
    : undefined

  if (receipt && (refundedEscrow || releasedEscrow || shouldRefundEscrow)) {
    await recordMarketplaceReceipt({
      ...receipt,
      escrowStatus: shouldRefundEscrow
        ? refundedEscrow
          ? 'refunded'
          : 'failed'
        : releasedEscrow
          ? 'released'
          : receipt.escrowStatus,
      escrowRefundTxHash: refundedEscrow?.txHash,
      escrowRefundExplorerUrl: refundedEscrow?.explorerUrl,
      escrowReleaseTxHash: releasedEscrow?.txHash,
      escrowReleaseExplorerUrl: releasedEscrow?.explorerUrl
    })
  }

  const poll = buildMarketplaceAsyncPollingResponse({
    order: effectiveOrder,
    pollingUrl,
    httpStatus: 200,
    providerResult,
    orderStatus: nextStatus,
    resultReleaseStatus,
    responsePayload,
    resultUrl:
      resultReleaseStatus === 'delta_payment_required'
        ? undefined
        : (providerResult.resultUrl ?? effectiveOrder.resultUrl)
  })
  const nextOrder = await updateMarketplaceOrder(effectiveOrder.id, {
    status: nextStatus,
    externalJobId: providerResult.externalJobId ?? effectiveOrder.externalJobId,
    responsePayload,
    providerRequest:
      providerResult.providerRequest ?? effectiveOrder.providerRequest,
    lockedResponsePayload:
      resultReleaseStatus === 'delta_payment_required'
        ? omitIndexedCharacterMaps(providerResult.responsePayload)
        : effectiveOrder.lockedResponsePayload,
    resultUrl:
      resultReleaseStatus === 'delta_payment_required'
        ? undefined
        : (providerResult.resultUrl ?? effectiveOrder.resultUrl),
    lockedResultUrl:
      resultReleaseStatus === 'delta_payment_required'
        ? providerResult.resultUrl
        : effectiveOrder.lockedResultUrl,
    actualCredits:
      usageDelta?.actualPrice?.creditValue ?? effectiveOrder.actualCredits,
    actualAmountUsdc:
      usageDelta?.actualPrice?.amountLabel ?? effectiveOrder.actualAmountUsdc,
    deltaAmountUsdc:
      usageDelta && usageDelta.deltaUsd !== 0
        ? usageDelta.deltaLabel
        : effectiveOrder.deltaAmountUsdc,
    resultReleaseStatus,
    providerRetry:
      failurePolicy?.retryable === true
        ? {
            retryable: true,
            reason: failurePolicy.reason,
            firstFailureAt:
              effectiveOrder.providerRetry?.firstFailureAt ??
              new Date().toISOString(),
            lastFailureAt: new Date().toISOString(),
            retryAfterSeconds: failurePolicy.retryAfterSeconds,
            retryUntil: failurePolicy.retryUntil,
            attempts: failurePolicy.attempts
          }
        : providerResult.status === 'completed'
          ? undefined
          : providerResult.status === 'processing'
            ? undefined
            : effectiveOrder.providerRetry,
    escrowStatus: shouldRefundEscrow
      ? refundedEscrow
        ? 'refunded'
        : 'failed'
      : shouldReleaseEscrow
        ? releasedEscrow
          ? 'released'
          : 'failed'
        : effectiveOrder.escrowStatus,
    escrowRefundTxHash: refundedEscrow ? refundedEscrow.txHash : undefined,
    escrowRefundExplorerUrl: refundedEscrow
      ? refundedEscrow.explorerUrl
      : undefined,
    escrowReleaseTxHash: releasedEscrow ? releasedEscrow.txHash : undefined,
    escrowReleaseExplorerUrl: releasedEscrow
      ? releasedEscrow.explorerUrl
      : undefined,
    refundAmountUsdc: refundedEscrow
      ? effectiveOrder.paidAmountUsdc
      : effectiveOrder.refundAmountUsdc,
    latestAsyncPollingResponse: poll
  })

  const orderForResponse = nextOrder ?? effectiveOrder

  return {
    status: 200,
    body: {
      order: orderForResponse,
      provider:
        resultReleaseStatus === 'delta_payment_required'
          ? {
              status: 'ready',
              externalJobId:
                providerResult.externalJobId ?? effectiveOrder.externalJobId,
              errorMessage:
                'Final usage exceeded the prepaid quote. The result is locked until the delta is paid.'
            }
          : shouldHoldRetryableFailure
            ? {
                ...providerResult,
                status: 'processing',
                retryable: true,
                retryUntil:
                  failurePolicy?.retryable === true
                    ? failurePolicy.retryUntil
                    : undefined,
                retryAfterSeconds:
                  failurePolicy?.retryable === true
                    ? failurePolicy.retryAfterSeconds
                    : undefined,
                errorMessage:
                  failurePolicy?.retryable === true
                    ? failurePolicy.reason
                    : providerResult.errorMessage
              }
            : providerResult,
      pricing: {
        actual: usageDelta?.actualPrice ?? null,
        deltaAmountUsdc:
          usageDelta && usageDelta.deltaUsd !== 0
            ? usageDelta.deltaLabel
            : '0.00 USDC',
        resultReleaseStatus
      },
      escrow: {
        refund: refundedEscrow
          ? {
              txHash: refundedEscrow.txHash,
              explorerUrl: refundedEscrow.explorerUrl
            }
          : null,
        release: releasedEscrow
          ? {
              txHash: releasedEscrow.txHash,
              explorerUrl: releasedEscrow.explorerUrl
            }
          : null
      }
    }
  }
}

export async function getMarketplaceOrderWithAsyncProviderStatus(
  orderId: string,
  pollingUrl?: string
) {
  const order = await getMarketplaceOrderById(orderId)

  if (!order || isTerminalOrder(order)) {
    return order
  }

  if (
    order.externalJobId ||
    order.resultReleaseStatus === 'provider_retrying' ||
    order.status === 'payment_required' ||
    order.status === 'paid' ||
    order.status === 'processing'
  ) {
    const result = await syncMarketplaceOrderProviderStatus(order.id, {
      pollingUrl,
      allowReservedEscrowRecovery: true
    })

    return result.body.order ?? order
  }

  return order
}

function buildMarketplaceAsyncPollingResponse({
  order,
  pollingUrl,
  httpStatus,
  providerResult,
  orderStatus,
  resultReleaseStatus,
  responsePayload,
  resultUrl
}: {
  order: MarketplaceOrder
  pollingUrl?: string
  httpStatus: number
  providerResult: ProviderAdapterResult
  orderStatus: MarketplaceOrder['status']
  resultReleaseStatus: MarketplaceOrder['resultReleaseStatus']
  responsePayload: unknown
  resultUrl?: string
}): MarketplaceAsyncPollingResponse {
  const priorAttempt = order.latestAsyncPollingResponse?.attempt ?? 0

  return {
    id: `poll_${Date.now().toString(36)}_${priorAttempt + 1}`,
    attempt: priorAttempt + 1,
    polledAt: new Date().toISOString(),
    pollingUrl,
    request: {
      method: 'GET',
      url: pollingUrl,
      headers: { Accept: 'application/json' },
      params: { orderId: order.id }
    },
    httpStatus,
    orderStatus,
    resultReleaseStatus,
    externalJobId: providerResult.externalJobId ?? order.externalJobId,
    resultUrl,
    response: {
      status: orderStatus,
      resultReleaseStatus,
      externalJobId: providerResult.externalJobId ?? order.externalJobId,
      resultUrl,
      errorMessage: providerResult.errorMessage,
      provider: {
        status: providerResult.status,
        externalJobId: providerResult.externalJobId,
        resultUrl: providerResult.resultUrl,
        errorMessage: providerResult.errorMessage
      },
      responsePayload
    }
  }
}

async function findReservedEscrowRecovery(
  order: MarketplaceOrder,
  product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>
): Promise<ReservedEscrowRecovery | null> {
  if (
    product.pricing.model !== 'credit_metered' ||
    product.executionMode !== 'asynchronous' ||
    !order.requestPayloadJson
  ) {
    return null
  }

  const escrowAddress = getApiPaymentPayTo(product)

  if (!escrowAddress) {
    return null
  }

  for (const candidate of getEscrowRecoveryCandidates(order, product)) {
    const details = await getEscrowPaymentDetails(candidate.paymentId).catch(
      () => null
    )

    if (details?.state !== 'reserved') {
      continue
    }

    return {
      receiptId: candidate.receiptId,
      paymentId: candidate.paymentId,
      escrowAddress,
      settlementTxHash: details.settlementTxHash,
      buyerWallet: details.payer
    }
  }

  return null
}

async function persistRecoveredReservedOrder(
  order: MarketplaceOrder,
  product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>,
  recovery: ReservedEscrowRecovery
) {
  const existingReceipt = await getMarketplaceReceiptById(recovery.receiptId)

  if (!existingReceipt) {
    const feeSplit = await resolveProviderFeeSplit(product)
    const amountUsd = parseUsdcLabel(
      order.paidAmountUsdc ?? order.quotedAmountUsdc ?? order.amountUsdc
    )

    await recordMarketplaceReceipt({
      id: recovery.receiptId,
      orderId: order.id,
      requestId: order.requestId,
      productSlug: order.productSlug,
      productName: order.productName,
      providerName: order.providerName,
      buyerWallet: recovery.buyerWallet || order.buyerWallet,
      providerWallet: order.providerWallet ?? product.providerWallet ?? '',
      amountUsdc: order.quotedAmountUsdc ?? order.amountUsdc,
      ...buildReceiptAmounts(amountUsd, feeSplit.platformFeeBps),
      providerPlan: feeSplit.planKey,
      platformFeeBps: feeSplit.platformFeeBps,
      providerShareBps: feeSplit.providerShareBps,
      network: x402Network,
      txHash: recovery.settlementTxHash,
      explorerUrl: buildExplorerUrl(recovery.settlementTxHash),
      escrowAddress: recovery.escrowAddress,
      escrowPaymentId: recovery.paymentId,
      escrowStatus: 'reserved',
      createdAt: new Date().toISOString()
    })
  }

  return (
    (await updateMarketplaceOrder(order.id, {
      status: 'paid',
      paidAmountUsdc: order.paidAmountUsdc ?? order.quotedAmountUsdc,
      reservedAmountUsdc: order.reservedAmountUsdc ?? order.quotedAmountUsdc,
      resultReleaseStatus: 'reserved',
      escrowStatus: 'reserved',
      escrowAddress: recovery.escrowAddress,
      escrowPaymentId: recovery.paymentId,
      requestPayloadJson: order.requestPayloadJson,
      receiptId: recovery.receiptId,
      explorerUrl: buildExplorerUrl(recovery.settlementTxHash)
    })) ?? order
  )
}

function getEscrowRecoveryCandidates(
  order: MarketplaceOrder,
  product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>
) {
  const currentReceiptId =
    order.receiptId ?? createReceiptId(order.id, order.requestId)
  const candidates = [
    {
      receiptId: currentReceiptId,
      paymentId: getEscrowPaymentId(order.id, currentReceiptId)
    }
  ]
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(parseJsonOrEmpty(order.requestPayloadJson)))
    .update(product.slug)
    .digest('hex')
    .slice(0, 12)
  const legacyOrderId = `ord_${payloadHash}`
  const legacyRequestId = `req_${payloadHash}`
  const legacyReceiptId = createReceiptId(legacyOrderId, legacyRequestId)
  const legacyPaymentId = getEscrowPaymentId(legacyOrderId, legacyReceiptId)

  if (!candidates.some(candidate => candidate.paymentId === legacyPaymentId)) {
    candidates.push({
      receiptId: order.receiptId ?? createReceiptId(order.id, order.requestId),
      paymentId: legacyPaymentId
    })
  }

  return candidates
}

function createReceiptId(orderId: string, requestId: string) {
  return `rcpt_${createHash('sha256')
    .update(orderId)
    .update(requestId)
    .digest('hex')
    .slice(0, 12)}`
}

function parseUsdcLabel(value: string | undefined) {
  const amount = Number((value ?? '').replace(/[^0-9.]/g, ''))

  return Number.isFinite(amount) ? amount : 0
}

function createProviderIdempotencyKey({
  orderId,
  requestId
}: {
  orderId: string
  requestId: string
}) {
  return `app_${orderId}_${requestId}`
}

function parseJsonOrEmpty(value: string | undefined) {
  if (!value) {
    return {}
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return {}
  }
}

function canRetryPaidProviderCall(order: {
  status: string
  receiptId?: string
  requestPayloadJson?: string
  resultReleaseStatus?: string
}) {
  return (
    order.status === 'failed' &&
    Boolean(order.receiptId) &&
    Boolean(order.requestPayloadJson) &&
    order.resultReleaseStatus !== 'refunded'
  )
}

function isTerminalOrder(order: MarketplaceOrder) {
  return ['completed', 'failed', 'expired', 'delta_payment_required'].includes(
    order.status
  )
}

function isHexBytes32(
  value: string | null | undefined
): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{64}$/.test(value ?? '')
}

function describeUnknownError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isEscrowWriteResult(value: unknown): value is EscrowStatusWrite {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'txHash' in value &&
      typeof value.txHash === 'string'
  )
}

async function refundReservedEscrowPayment(paymentId: `0x${string}`) {
  const state = await getEscrowPaymentState(paymentId).catch(() => 'none')

  if (state !== 'reserved') {
    return {
      error:
        state === 'none'
          ? 'Escrow payment is not reserved on-chain, so no refund transaction was submitted.'
          : `Escrow payment is already ${state}, so no refund transaction was submitted.`
    }
  }

  return await refundEscrowPayment(paymentId).catch(error => ({
    error: describeUnknownError(error)
  }))
}
