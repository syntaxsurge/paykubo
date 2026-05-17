'use client'

import type { MouseEvent } from 'react'
import { useMemo, useState } from 'react'

import { Braces, Check, Copy } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { omitIndexedCharacterMaps } from '@/lib/utils/json-payload'

type JsonViewerProps = {
  value: unknown
  title?: string
  defaultOpen?: boolean
  className?: string
  maxHeightClassName?: string
  copyLabel?: string
  copiedLabel?: string
  normalizeEscapedStrings?: boolean
}

const maxStringParseDepth = 8

export function JsonViewer({
  value,
  title = 'JSON',
  defaultOpen = true,
  className,
  maxHeightClassName = 'max-h-96',
  copyLabel = 'Copy JSON',
  copiedLabel = 'Copied',
  normalizeEscapedStrings = true
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false)
  const displayText = useMemo(
    () => formatJsonDisplayValue(value, { normalizeEscapedStrings }),
    [normalizeEscapedStrings, value]
  )

  async function copyText(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()

    await navigator.clipboard.writeText(displayText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <details
      open={defaultOpen}
      className={cn(
        'group border-border/80 bg-card/75 overflow-hidden rounded-xl border shadow-sm',
        className
      )}
    >
      <summary className='flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden'>
        <span className='flex min-w-0 items-center gap-2 text-sm font-semibold'>
          <Braces className='text-primary h-4 w-4 shrink-0' aria-hidden />
          <span className='truncate'>{title}</span>
        </span>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={copyText}
          className='shrink-0'
        >
          {copied ? (
            <Check className='h-4 w-4' aria-hidden />
          ) : (
            <Copy className='h-4 w-4' aria-hidden />
          )}
          {copied ? copiedLabel : copyLabel}
        </Button>
      </summary>
      <div className='border-border/70 border-t p-4'>
        <pre
          className={cn(
            'bg-muted/80 text-foreground max-w-full overflow-auto rounded-lg p-4 text-xs leading-6 break-words whitespace-pre-wrap',
            maxHeightClassName
          )}
        >
          {displayText}
        </pre>
      </div>
    </details>
  )
}

export function formatJsonDisplayValue(
  value: unknown,
  { normalizeEscapedStrings = true }: { normalizeEscapedStrings?: boolean } = {}
) {
  const displayValue = omitIndexedCharacterMaps(
    normalizeEscapedStrings ? normalizeJsonDisplayValue(value) : value
  )

  if (typeof displayValue === 'string') {
    return displayValue
  }

  return JSON.stringify(displayValue, null, 2)
}

export function normalizeJsonDisplayValue(value: unknown, depth = 0): unknown {
  if (depth > maxStringParseDepth) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = parseNestedJsonString(value)

    if (parsed === value) {
      return value
    }

    return normalizeJsonDisplayValue(parsed, depth + 1)
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeJsonDisplayValue(item, depth + 1))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeJsonDisplayValue(item, depth + 1)
      ])
    )
  }

  return value
}

function parseNestedJsonString(value: string): unknown {
  let current = value

  for (let index = 0; index < maxStringParseDepth; index += 1) {
    const trimmed = current.trim()

    if (!shouldAttemptStringParse(trimmed)) {
      return current
    }

    try {
      const parseTarget = trimmed.startsWith('\\"') ? `"${trimmed}"` : trimmed
      const parsed = JSON.parse(parseTarget) as unknown

      if (typeof parsed !== 'string') {
        return parsed
      }

      if (parsed === current) {
        return parsed
      }

      current = parsed
    } catch {
      return current
    }
  }

  return current
}

function shouldAttemptStringParse(value: string) {
  return (
    value.startsWith('{') ||
    value.startsWith('[') ||
    value.startsWith('"') ||
    value.startsWith('\\"')
  )
}
