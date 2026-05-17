import Link from 'next/link'

import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CircleDollarSign,
  Code2,
  FileCheck2,
  Globe2,
  ReceiptText,
  ShieldCheck,
  Store,
  WalletCards,
  Zap
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const judgeLinks: Array<{
  label: string
  href: string
  Icon: LucideIcon
}> = [
  { label: 'Provider dashboard', href: '/provider', Icon: Store },
  { label: 'Billing ledger', href: '/billing', Icon: ReceiptText },
  { label: 'Agent runs', href: '/agents', Icon: FileCheck2 }
]

const flowSteps = [
  {
    icon: Bot,
    title: 'Agent plans work',
    detail:
      'A buyer gives an objective, budget cap, and tool policy. the gateway selects agent-ready APIs that fit the task.'
  },
  {
    icon: CircleDollarSign,
    title: 'x402 quote appears',
    detail:
      'The API returns HTTP 402 with Morph Hoodi network, USDC asset, amount, recipient, and timeout requirements.'
  },
  {
    icon: WalletCards,
    title: 'Wallet signs payment',
    detail:
      'The buyer or configured agent signer authorizes the payment without creating a platform billing account.'
  },
  {
    icon: ReceiptText,
    title: 'Provider gets paid',
    detail:
      'the gateway forwards the request, records the receipt, and exposes proof-ready transaction metadata.'
  }
]

const demoReceipts = [
  ['Track', 'x402 Agentic Payments'],
  ['Network', 'Morph Hoodi'],
  ['Settlement asset', 'USDC'],
  ['Use case', 'AI-native API micropayments'],
  ['Region', 'Philippines and Southeast Asia']
]

const judgeSignals = [
  {
    icon: Globe2,
    title: 'Real payment problem',
    detail:
      'Small teams can monetize useful APIs without card onboarding, subscriptions, or manual invoicing.'
  },
  {
    icon: ShieldCheck,
    title: 'Onchain accounting',
    detail:
      'Every successful paid call produces receipt metadata, fee split data, and an explorer-linked transaction.'
  },
  {
    icon: Code2,
    title: 'API-first workflow',
    detail:
      'Providers can import OpenAPI specs, keep upstream keys server-side, and expose x402-paid endpoints.'
  }
]

export default function HackathonDemoPage() {
  return (
    <div className='bg-app-grid'>
      <section className='container-page py-14 sm:py-18 lg:py-20'>
        <div className='max-w-4xl space-y-7'>
          <Badge className='w-fit'>
            <Zap className='h-3.5 w-3.5' aria-hidden />
            Build In! Payments demo
          </Badge>
          <div className='space-y-5'>
            <h1 className='font-display text-4xl leading-tight font-semibold text-balance sm:text-5xl lg:text-6xl'>
              the gateway is the money layer for agent-ready APIs on Morph.
            </h1>
            <p className='text-lead max-w-2xl'>
              This public demo shows the x402 Agentic Payments use case without
              requiring judges to connect a wallet before understanding the
              product.
            </p>
          </div>
          <div className='flex flex-wrap gap-3'>
            <Link href='/marketplace' className={buttonClasses({ size: 'lg' })}>
              Open live marketplace
              <ArrowRight className='h-4 w-4' aria-hidden />
            </Link>
            <Link
              href='/agents/new'
              className={buttonClasses({ variant: 'outline', size: 'lg' })}
            >
              Start live agent run
            </Link>
          </div>
        </div>

        <div className='mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
          {demoReceipts.map(([label, value]) => (
            <div
              key={label}
              className='border-border bg-card/95 rounded-lg border p-4 shadow-sm'
            >
              <p className='text-muted-foreground text-xs tracking-[0.16em] uppercase'>
                {label}
              </p>
              <p className='text-foreground mt-2 font-semibold'>{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className='container-page grid gap-4 pb-12 md:grid-cols-4'>
        {flowSteps.map(({ icon: Icon, title, detail }) => (
          <Card key={title} className='min-h-56'>
            <div className='bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-lg'>
              <Icon className='h-5 w-5' aria-hidden />
            </div>
            <h2 className='mt-5 text-lg font-semibold'>{title}</h2>
            <p className='text-muted-foreground mt-2 text-sm leading-6'>
              {detail}
            </p>
          </Card>
        ))}
      </section>

      <section className='container-page pb-16'>
        <div className='grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-start'>
          <div className='space-y-4'>
            <Badge className='w-fit'>Judging alignment</Badge>
            <h2 className='font-display text-3xl font-semibold text-balance'>
              Built for working demos, not whitepapers.
            </h2>
            <p className='text-muted-foreground max-w-xl text-sm leading-6'>
              The live app keeps wallet-protected production paths for actual
              x402 calls, while this route gives reviewers a complete no-login
              overview of the payment architecture.
            </p>
          </div>
          <div className='grid gap-3 sm:grid-cols-3'>
            {judgeSignals.map(({ icon: Icon, title, detail }) => (
              <Card key={title} className='p-5'>
                <Icon className='text-primary h-5 w-5' aria-hidden />
                <h3 className='mt-4 font-semibold'>{title}</h3>
                <p className='text-muted-foreground mt-2 text-sm leading-6'>
                  {detail}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className='container-page pb-20'>
        <div className='border-border bg-card/95 rounded-lg border p-5 shadow-sm lg:p-7'>
          <div className='grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-center'>
            <div>
              <Badge className='w-fit'>
                <BadgeCheck className='h-3.5 w-3.5' aria-hidden />
                Simulated receipt preview
              </Badge>
              <h2 className='font-display mt-4 text-3xl font-semibold text-balance'>
                Agent run paid an API, provider returned a result, and the
                gateway recorded proof metadata.
              </h2>
              <p className='text-muted-foreground mt-3 max-w-2xl text-sm leading-6'>
                In the live flow, the same data comes from the x402 settlement
                response, provider adapter, Convex ledger, and optional Morph
                attestation contract.
              </p>
            </div>
            <div className='grid gap-3 text-sm'>
              {[
                ['Order', 'ord_demo_agentic_402'],
                ['Amount', '0.04 USDC'],
                ['Provider share', '0.038 USDC'],
                ['Platform fee', '0.002 USDC'],
                ['Proof', 'Morph transaction + response hash']
              ].map(([label, value]) => (
                <div
                  key={label}
                  className='border-border/80 bg-background/60 flex items-center justify-between gap-4 rounded-lg border p-3'
                >
                  <span className='text-muted-foreground'>{label}</span>
                  <span className='text-right font-semibold'>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className='container-page grid gap-4 pb-20 sm:grid-cols-3'>
        {judgeLinks.map(({ label, href, Icon: LinkIcon }) => {
          return (
            <Link
              key={label}
              href={href}
              className='border-border bg-card/95 hover:border-primary/50 focus-visible:ring-primary rounded-lg border p-5 shadow-sm transition focus-visible:ring-2 focus-visible:outline-none'
            >
              <LinkIcon className='text-primary h-5 w-5' aria-hidden />
              <p className='mt-4 font-semibold'>{label}</p>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
