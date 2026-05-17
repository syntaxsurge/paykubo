import { NextResponse } from 'next/server'

import { deleteAgentRun } from '@/features/agents/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string')
    : []

  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'Select at least one agent run.' },
      { status: 400 }
    )
  }

  const deleted = (await Promise.all(ids.map(id => deleteAgentRun(id)))).filter(
    Boolean
  )

  return NextResponse.json({
    deleted: deleted.length,
    requested: ids.length
  })
}
