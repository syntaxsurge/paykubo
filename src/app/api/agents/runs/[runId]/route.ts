import { NextResponse } from 'next/server'

import { deleteAgentRun, getAgentRun } from '@/features/agents/store'

export const dynamic = 'force-dynamic'

type AgentRunRouteProps = {
  params: Promise<{
    runId: string
  }>
}

export async function GET(_request: Request, { params }: AgentRunRouteProps) {
  const run = await getAgentRun((await params).runId)

  if (!run) {
    return NextResponse.json(
      { error: 'Agent run was not found.' },
      { status: 404 }
    )
  }

  return NextResponse.json(run)
}

export async function DELETE(
  _request: Request,
  { params }: AgentRunRouteProps
) {
  const deleted = await deleteAgentRun((await params).runId)

  if (!deleted) {
    return NextResponse.json(
      { error: 'Agent run was not found.' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    deletedRunId: deleted.id,
    stopped: true
  })
}
