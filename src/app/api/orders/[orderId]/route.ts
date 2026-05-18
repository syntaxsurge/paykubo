import { NextResponse } from 'next/server'

import { getMarketplaceOrderWithAsyncProviderStatus } from '@/features/marketplace/async-provider-status'
import { getPublicAppOrigin } from '@/lib/config/site'

type OrderRouteProps = {
  params: Promise<{
    orderId: string
  }>
}

export async function GET(request: Request, { params }: OrderRouteProps) {
  const { orderId } = await params
  const pollingUrl = new URL(
    `/api/orders/${encodeURIComponent(orderId)}/provider-status`,
    getPublicAppOrigin(request.url)
  ).toString()
  const order = await getMarketplaceOrderWithAsyncProviderStatus(
    orderId,
    pollingUrl
  )

  if (!order) {
    return NextResponse.json({ error: 'Order was not found.' }, { status: 404 })
  }

  return NextResponse.json(order)
}
