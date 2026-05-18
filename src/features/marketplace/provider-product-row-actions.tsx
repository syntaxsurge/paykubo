'use client'

import Link from 'next/link'
import * as React from 'react'

import { Loader2, MoreVertical, Settings, Trash2 } from 'lucide-react'
import { useRouter } from 'nextjs-toploader/app'

import {
  removeServerDataTableRowsFromDom,
  updateServerDataTableResultCount
} from '@/components/data-display/server-data-table-dom'
import { Button, buttonClasses } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { ApiProduct } from '@/features/marketplace/products'

export function ProviderProductRowActions({
  product
}: {
  product: ApiProduct
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [error, setError] = React.useState('')
  const menuRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const [menuPosition, setMenuPosition] = React.useState<{
    top: number
    right: number
  } | null>(null)

  React.useEffect(() => {
    if (!menuOpen) {
      return
    }

    function syncMenuPosition() {
      const rect = buttonRef.current?.getBoundingClientRect()

      if (!rect) {
        return
      }

      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      })
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    syncMenuPosition()
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', syncMenuPosition)
    window.addEventListener('scroll', syncMenuPosition, true)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', syncMenuPosition)
      window.removeEventListener('scroll', syncMenuPosition, true)
    }
  }, [menuOpen])

  async function deleteProduct() {
    setIsDeleting(true)
    setError('')

    try {
      const response = await fetch(
        `/api/providers/self/products/${encodeURIComponent(product.slug)}`,
        {
          method: 'DELETE',
          headers: { Accept: 'application/json' }
        }
      )
      const body = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(body?.error ?? 'Unable to delete this API product.')
      }

      const row = document.querySelector(
        `[data-table-row-id="${CSS.escape(product.slug)}"]`
      )
      const tableId = row
        ?.closest('[data-server-table-id]')
        ?.getAttribute('data-server-table-id')

      removeServerDataTableRowsFromDom([product.slug])
      if (tableId) {
        updateServerDataTableResultCount(tableId, 1)
      }
      setDeleteOpen(false)
      router.refresh()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to delete this API product.'
      )
    } finally {
      setIsDeleting(false)
    }
  }

  function toggleMenu() {
    const nextOpen = !menuOpen

    if (nextOpen) {
      const rect = buttonRef.current?.getBoundingClientRect()

      if (rect) {
        setMenuPosition({
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right
        })
      }
    }

    setMenuOpen(nextOpen)
  }

  return (
    <div className='relative' ref={menuRef}>
      <button
        ref={buttonRef}
        type='button'
        aria-label={`Open actions for ${product.name}`}
        aria-haspopup='menu'
        aria-expanded={menuOpen}
        onClick={toggleMenu}
        className={buttonClasses({
          variant: 'ghost',
          size: 'sm',
          className: 'h-9 w-9 px-0'
        })}
      >
        <MoreVertical className='h-4 w-4' aria-hidden />
      </button>

      {menuOpen ? (
        <div
          role='menu'
          style={
            menuPosition
              ? { top: menuPosition.top, right: menuPosition.right }
              : undefined
          }
          className='border-border bg-card fixed z-50 w-48 rounded-lg border p-1 text-left shadow-xl'
        >
          <Link
            href={`/provider/products/${product.slug}`}
            role='menuitem'
            className='hover:bg-muted flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm'
            onClick={() => setMenuOpen(false)}
          >
            <Settings className='h-4 w-4' aria-hidden />
            Manage listing
          </Link>
          <button
            type='button'
            role='menuitem'
            onClick={() => {
              setMenuOpen(false)
              setDeleteOpen(true)
            }}
            className='hover:bg-muted flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 dark:text-red-400'
          >
            <Trash2 className='h-4 w-4' aria-hidden />
            Delete listing
          </button>
        </div>
      ) : null}

      <Dialog
        open={deleteOpen}
        onOpenChange={open => {
          if (!open && !isDeleting) {
            setDeleteOpen(false)
            setError('')
          }
        }}
        title='Delete API product'
        description='This removes the provider-created listing from product management and marketplace discovery.'
        className='max-w-xl'
      >
        <div className='space-y-5'>
          <div className='rounded-lg border border-red-500/25 bg-red-500/10 p-4'>
            <p className='font-semibold'>Delete {product.name}?</p>
            <p className='text-muted-foreground mt-2 text-sm leading-6'>
              Existing receipts and historical orders remain available, but
              buyers and agents will no longer be able to discover or call this
              listing.
            </p>
            <p className='text-muted-foreground mt-3 font-mono text-xs break-all'>
              {product.slug}
            </p>
          </div>

          {error ? (
            <p
              className='rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300'
              role='alert'
            >
              {error}
            </p>
          ) : null}

          <div className='flex flex-col-reverse gap-3 sm:flex-row sm:justify-end'>
            <Button
              type='button'
              variant='outline'
              disabled={isDeleting}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type='button'
              disabled={isDeleting}
              className='bg-red-600 text-white shadow-red-950/20 hover:bg-red-700'
              onClick={() => void deleteProduct()}
            >
              {isDeleting ? (
                <Loader2 className='h-4 w-4 animate-spin' aria-hidden />
              ) : (
                <Trash2 className='h-4 w-4' aria-hidden />
              )}
              Delete listing
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
