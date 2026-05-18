import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { deleteProviderProduct } from '@/features/marketplace/products'
import { WALLET_ADDRESS_COOKIE } from '@/lib/auth/wallet-session'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string')
    : []

  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'Select at least one provider-created product.' },
      { status: 400 }
    )
  }

  const cookieStore = await cookies()
  const ownerWallet = cookieStore.get(WALLET_ADDRESS_COOKIE)?.value

  if (!ownerWallet) {
    return NextResponse.json(
      { error: 'Connect a provider wallet before deleting products.' },
      { status: 401 }
    )
  }

  const deletedIds: string[] = []

  for (const id of ids) {
    try {
      const product = await deleteProviderProduct(id, ownerWallet)

      if (product) {
        deletedIds.push(product.slug)
      }
    } catch (error) {
      console.error('Unable to delete provider product', { id, error })
    }
  }

  return NextResponse.json({
    deleted: deletedIds.length,
    deletedIds,
    requested: ids.length
  })
}
