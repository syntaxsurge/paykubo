import { createHmac } from 'node:crypto'

import type { FacilitatorClient } from '@x402/core/server'
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse
} from '@x402/core/types'

type MorphFacilitatorClientOptions = {
  url: string
  accessKey?: string
  secretKey?: string
}

export class MorphFacilitatorClient implements FacilitatorClient {
  readonly url: string
  private readonly accessKey?: string
  private readonly secretKey?: string

  constructor({ url, accessKey, secretKey }: MorphFacilitatorClientOptions) {
    this.url = url.replace(/\/+$/, '')
    this.accessKey = accessKey
    this.secretKey = secretKey
  }

  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ) {
    return this.post<VerifyResponse>('verify', {
      x402Version: paymentPayload.x402Version,
      paymentPayload,
      paymentRequirements
    })
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ) {
    return this.post<SettleResponse>('settle', {
      x402Version: paymentPayload.x402Version,
      paymentPayload,
      paymentRequirements
    })
  }

  async getSupported() {
    const response = await fetch(`${this.url}/supported`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow'
    })

    return parseFacilitatorResponse<SupportedResponse>(response, 'supported')
  }

  private async post<T>(endpoint: 'verify' | 'settle', body: unknown) {
    const bodyText = JSON.stringify(toJsonSafe(body))
    const url = new URL(`${this.url}/${endpoint}`)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.createAuthHeaders({
        method: 'POST',
        path: url.pathname,
        rawQuery: url.search.slice(1),
        rawBody: bodyText
      })
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      redirect: 'follow',
      body: bodyText
    })

    return parseFacilitatorResponse<T>(response, endpoint)
  }

  private createAuthHeaders({
    method,
    path,
    rawQuery,
    rawBody
  }: {
    method: string
    path: string
    rawQuery: string
    rawBody: string
  }): Record<string, string> {
    if (!this.accessKey || !this.secretKey) {
      return {}
    }

    const timestamp = Date.now().toString()
    const signMap: Record<string, unknown> = {
      'MORPH-ACCESS-KEY': this.accessKey,
      'MORPH-ACCESS-TIMESTAMP': timestamp,
      'MORPH-ACCESS-METHOD': method,
      'MORPH-ACCESS-PATH': path
    }

    if (rawQuery) {
      const params = new URLSearchParams(rawQuery)

      for (const [key, value] of params) {
        const existing = signMap[key]

        signMap[key] = Array.isArray(existing) ? [...existing, value] : [value]
      }
    }

    if (rawBody) {
      signMap['MORPH-ACCESS-BODY'] = JSON.parse(rawBody) as unknown
    }

    const signature = createHmac('sha256', this.secretKey)
      .update(JSON.stringify(sortObject(signMap)))
      .digest('base64')

    return {
      'MORPH-ACCESS-KEY': this.accessKey,
      'MORPH-ACCESS-TIMESTAMP': timestamp,
      'MORPH-ACCESS-SIGN': signature
    }
  }
}

async function parseFacilitatorResponse<T>(response: Response, label: string) {
  const text = await response.text()
  const data = text ? (JSON.parse(text) as T) : ({} as T)

  if (!response.ok) {
    throw new Error(
      `Morph x402 ${label} failed (${response.status}): ${text.slice(0, 500)}`
    )
  }

  return data
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject)
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortObject((value as Record<string, unknown>)[key])

        return sorted
      }, {})
  }

  return value
}

function toJsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (Array.isArray(value)) {
    return value.map(toJsonSafe)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJsonSafe(item)])
    )
  }

  return value
}
