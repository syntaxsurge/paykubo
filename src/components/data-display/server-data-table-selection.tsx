'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'nextjs-toploader/app'

import { notifyServerTableSelectionUpdated } from '@/components/data-display/server-data-table-master-checkbox'
import { Button } from '@/components/ui/button'

export type ServerDataTableBulkAction = {
  label: string
  endpoint: string
  method?: 'POST' | 'DELETE'
  confirmMessage?: string
}

export function ServerDataTableSelection({
  tableId,
  bulkActions = [],
  selectedIds,
  onSelectionChange,
  currentPageIds,
  selectedLabel = 'selected on this page'
}: {
  tableId: string
  bulkActions?: ServerDataTableBulkAction[]
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  currentPageIds?: string[]
  selectedLabel?: string
}) {
  const router = useRouter()
  const masterCheckboxRef = useRef<HTMLInputElement>(null)
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([])
  const effectiveSelectedIds = selectedIds ?? internalSelectedIds
  const selectedSet = useMemo(
    () => new Set(effectiveSelectedIds),
    [effectiveSelectedIds]
  )
  const visibleIds = currentPageIds ?? []
  const selectedVisibleCount = visibleIds.filter(id =>
    selectedSet.has(id)
  ).length
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length
  const hasPartialVisibleSelection =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length

  function getCheckboxes() {
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(
        `[data-table-id="${tableId}"][data-row-checkbox]`
      )
    )
  }

  useEffect(() => {
    const checkboxes = getCheckboxes()

    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', syncFromDom)
    })

    return () => {
      checkboxes.forEach(checkbox => {
        checkbox.removeEventListener('change', syncFromDom)
      })
    }
  })

  useEffect(() => {
    const checkboxes = getCheckboxes()

    checkboxes.forEach(checkbox => {
      checkbox.checked = selectedSet.has(checkbox.value)
    })

    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.checked = allVisibleSelected
      masterCheckboxRef.current.indeterminate = hasPartialVisibleSelection
    }

    notifyServerTableSelectionUpdated(tableId)
  }, [
    allVisibleSelected,
    hasPartialVisibleSelection,
    selectedSet,
    tableId,
    visibleIds
  ])

  function syncFromDom() {
    const checkboxes = getCheckboxes()
    const pageIds = checkboxes.map(checkbox => checkbox.value)
    const visibleSelectedIds = checkboxes
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.value)
    const nextIds = [
      ...effectiveSelectedIds.filter(id => !pageIds.includes(id)),
      ...visibleSelectedIds
    ]

    updateSelection(dedupeIds(nextIds))
  }

  function updateSelection(nextIds: string[]) {
    notifyServerTableSelectionUpdated(tableId)

    if (onSelectionChange) {
      onSelectionChange(nextIds)
      return
    }

    setInternalSelectedIds(nextIds)
  }

  function toggleCurrentPage(checked: boolean) {
    const pageIds = getCheckboxes().map(checkbox => checkbox.value)
    const nextIds = checked
      ? dedupeIds([...effectiveSelectedIds, ...pageIds])
      : effectiveSelectedIds.filter(id => !pageIds.includes(id))

    updateSelection(nextIds)
  }

  async function runBulkAction(action: ServerDataTableBulkAction) {
    if (effectiveSelectedIds.length === 0) {
      return
    }

    if (action.confirmMessage && !window.confirm(action.confirmMessage)) {
      return
    }

    const response = await fetch(action.endpoint, {
      method: action.method ?? 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: effectiveSelectedIds })
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      window.alert(body?.error ?? 'Bulk action failed.')
      return
    }

    updateSelection([])
    router.refresh()
  }

  return (
    <div className='border-border bg-card/90 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between'>
      <label className='flex items-center gap-3 text-sm font-semibold'>
        <input
          ref={masterCheckboxRef}
          type='checkbox'
          className='border-border text-primary focus:ring-ring h-4 w-4 rounded'
          aria-label='Select all rows on this page'
          onChange={event => toggleCurrentPage(event.currentTarget.checked)}
        />
        <span>
          {effectiveSelectedIds.length} {selectedLabel}
        </span>
      </label>
      {bulkActions.length > 0 ? (
        <div className='flex flex-wrap gap-2'>
          {bulkActions.map(action => (
            <Button
              key={action.label}
              type='button'
              variant='outline'
              size='sm'
              disabled={selectedSet.size === 0}
              onClick={() => void runBulkAction(action)}
            >
              <Trash2 className='h-4 w-4' aria-hidden />
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
      <span className='sr-only' aria-live='polite'>
        {effectiveSelectedIds.length} rows selected
      </span>
    </div>
  )
}

function dedupeIds(ids: string[]) {
  return Array.from(new Set(ids))
}
