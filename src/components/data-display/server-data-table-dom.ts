'use client'

export function removeServerDataTableRowsFromDom(ids: string[]) {
  ids.forEach(id => {
    document.querySelector(`[data-table-row-id="${CSS.escape(id)}"]`)?.remove()
  })
}

export function updateServerDataTableResultCount(
  tableId: string,
  removedCount: number
) {
  const element = document.querySelector<HTMLElement>(
    `[data-table-result-count="${CSS.escape(tableId)}"]`
  )

  if (!element) {
    return
  }

  const current = Number(element.dataset.tableTotalRows ?? 0)
  const next = Math.max(0, current - removedCount)

  element.dataset.tableTotalRows = String(next)
  element.textContent = `${next.toLocaleString()} result${next === 1 ? '' : 's'}`
}
