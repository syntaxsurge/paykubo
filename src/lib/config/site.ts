import { envClient } from '@/lib/env/env.client'

export const siteConfig = {
  name: envClient.NEXT_PUBLIC_APP_NAME ?? 'Paykubo',
  description:
    envClient.NEXT_PUBLIC_APP_DESCRIPTION ??
    'USDC-native API commerce for humans, applications, and AI agents on Morph.',
  url: envClient.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  links: {
    github: 'https://github.com/morph-org',
    twitter: 'https://x.com/MorphNetwork'
  }
}
