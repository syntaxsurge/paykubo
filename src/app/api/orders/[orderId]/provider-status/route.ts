import { NextResponse } from 'next/server'

import { syncMarketplaceOrderProviderStatus } from '@/features/marketplace/async-provider-status'
import { getPublicAppOrigin } from '@/lib/config/site'

export const dynamic = 'force-dynamic'

type OrderProviderStatusRouteProps = {
  params: Promise<{
    orderId: string
  }>
}

export async function GET(
  request: Request,
  props: OrderProviderStatusRouteProps
) {
  return handleProviderStatus(request, props, { forceProviderCall: false })
}

export async function POST(
  request: Request,
  props: OrderProviderStatusRouteProps
) {
  return handleProviderStatus(request, props, { forceProviderCall: true })
}

async function handleProviderStatus(
  request: Request,
  { params }: OrderProviderStatusRouteProps,
  { forceProviderCall }: { forceProviderCall: boolean }
) {
  const { orderId } = await params
  const pollingUrl = new URL(
    `/api/orders/${encodeURIComponent(orderId)}/provider-status`,
    getPublicAppOrigin(request.url)
  ).toString()
  const result = await syncMarketplaceOrderProviderStatus(orderId, {
    forceProviderCall,
    pollingUrl,
    allowReservedEscrowRecovery: true
  })

  return NextResponse.json(result.body, { status: result.status })
}
