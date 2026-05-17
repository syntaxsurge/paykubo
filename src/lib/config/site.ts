import { envClient } from '@/lib/env/env.client'

const productionAppUrl = 'https://platform.vercel.app'
const localHostnames = new Set(['localhost', '127.0.0.1', '::1'])

export const siteConfig = {
  name: envClient.NEXT_PUBLIC_APP_NAME ?? 'App',
  description:
    envClient.NEXT_PUBLIC_APP_DESCRIPTION ??
    'USDC-native API commerce for humans, applications, and AI agents.',
  url: envClient.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  links: {
    github: 'https://github.com/morph-org',
    twitter: 'https://x.com/MorphNetwork'
  }
}

export function getPublicAppOrigin(fallbackUrl = siteConfig.url) {
  const configuredOrigin = new URL(fallbackUrl).origin

  if (!localHostnames.has(new URL(configuredOrigin).hostname)) {
    return configuredOrigin
  }

  return new URL(resolveVercelProductionUrl() ?? productionAppUrl).origin
}

function resolveVercelProductionUrl() {
  const value =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL

  if (!value) {
    return undefined
  }

  return value.startsWith('http') ? value : `https://${value}`
}
