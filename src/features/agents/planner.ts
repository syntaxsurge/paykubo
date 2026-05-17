import type {
  AgentAction,
  AgentPlannerMode,
  AgentRun,
  AgentSkippedTool
} from '@/features/agents/types'
import type { ApiProduct } from '@/features/marketplace/products'
import { getProductBySlug } from '@/features/marketplace/products'
import { envServer } from '@/lib/env/env.server'

export const AGENT_PLANNER_PROMPT = [
  'You are Paykubo Launch Pack Agent.',
  'Goal: choose the smallest useful set of paid API tools that can complete the user objective inside the USDC budget.',
  'Rules:',
  '1. Prefer real data/research tools before expensive media tools.',
  '2. Use async media generation only when the objective asks for launch assets, video, creative collateral, or a media deliverable.',
  '3. Skip tools that are unrelated to the objective even if they are allowed.',
  '4. Never exceed the max paid action count.',
  '5. Every chosen tool must produce an auditable paid action and receipt when production signing is configured.'
].join('\n')

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_AGENT_MODEL = 'gpt-5.2'

type PlannedTool = {
  product: ApiProduct
  score: number
  rationale: string
}

export type AgentPlanMetadata = {
  plannerMode: AgentPlannerMode
  plannerModel?: string
  plannerResponseId?: string
  planningPrompt: string
  toolSelectionRationale: string
  skippedTools: AgentSkippedTool[]
  expectedDeliverables: string[]
  budgetInstruction: string
  budgetStrategy: string
  synthesisInstructions: string
}

export type AgentPlanResult = {
  actions: AgentAction[]
  metadata: AgentPlanMetadata
}

type OpenAiPlanResponse = {
  selectedTools: {
    slug: string
    priority: number
    rationale: string
    requestPayloadJson: string
  }[]
  skippedTools: { slug: string; reason: string }[]
  expectedDeliverables: string[]
  budgetStrategy: string
  finalSynthesisInstructions: string
}

const categoryWeights: Partial<Record<ApiProduct['category'], number>> = {
  data: 14,
  developer: 13,
  ai: 11,
  media: 9,
  agent: 8,
  commerce: 6
}

const objectiveSignals = {
  media: [
    'video',
    'launch pack',
    'asset',
    'clip',
    'storyboard',
    'project',
    'render',
    'creative'
  ],
  market: [
    'market',
    'trend',
    'competitor',
    'launch',
    'audience',
    'research',
    'positioning',
    'signal'
  ],
  developer: [
    'api',
    'developer',
    'sdk',
    'github',
    'repo',
    'code',
    'integration',
    'technical'
  ],
  proof: ['proof', 'receipt', 'audit', 'attestation', 'settle', 'payment']
}

export async function buildAgentPlan(run: AgentRun): Promise<AgentPlanResult> {
  if (envServer.AGENT_LLM_API_KEY) {
    const openAiPlan = await buildOpenAiAgentPlan(run).catch(error => {
      console.warn(
        'OpenAI planner failed; using deterministic fallback.',
        error
      )
      return null
    })

    if (openAiPlan) {
      return openAiPlan
    }
  }

  return await buildDeterministicAgentPlan(run)
}

export async function buildDeterministicAgentPlan(
  run: AgentRun
): Promise<AgentPlanResult> {
  const now = new Date().toISOString()
  const plannedTools = (await rankAllowedTools(run)).slice(
    0,
    run.maxPaidActions
  )
  const actions = plannedTools.map(({ product, score, rationale }, index) => ({
    id: `act_${run.id.slice(4)}_${index + 1}`,
    runId: run.id,
    productSlug: product.slug,
    productName: product.name,
    providerName: product.providerName,
    status: 'planned',
    amountUsdc: product.priceLabel,
    objective: `Fallback planner chose ${product.name}: ${rationale}`,
    planningRationale: rationale,
    plannerScore: score,
    requestPayload: buildPayloadForProduct(product, product.slug, run),
    startedAt: now
  })) satisfies AgentAction[]

  return {
    actions,
    metadata: buildPlannerSummary(run, actions, {
      mode: 'deterministic',
      skippedTools: buildDeterministicSkippedTools(run, actions),
      expectedDeliverables: defaultExpectedDeliverables(),
      budgetStrategy: `Use the highest-ranked relevant tools without exceeding ${run.budgetCapUsdc.toFixed(2)} USDC.`,
      synthesisInstructions:
        'Summarize the paid tool outputs into a launch brief, developer copy, market signal, and optional project link.'
    })
  }
}

export function buildPlannerSummary(
  run: AgentRun,
  actions: AgentAction[],
  options?: {
    mode?: AgentPlannerMode
    model?: string
    responseId?: string
    planningPrompt?: string
    skippedTools?: AgentSkippedTool[]
    expectedDeliverables?: string[]
    budgetStrategy?: string
    synthesisInstructions?: string
  }
): AgentPlanMetadata {
  const plannerMode = options?.mode ?? 'deterministic'
  const chosen = actions
    .map(action => {
      const score =
        typeof action.plannerScore === 'number'
          ? `score ${action.plannerScore}`
          : 'selected'

      return `${action.productName} (${score}): ${
        action.planningRationale ?? 'matched the objective'
      }`
    })
    .join('\n')

  return {
    plannerMode,
    plannerModel: options?.model,
    plannerResponseId: options?.responseId,
    planningPrompt: options?.planningPrompt ?? AGENT_PLANNER_PROMPT,
    toolSelectionRationale:
      chosen ||
      'No paid tools were selected because the allowed tool set did not match the objective.',
    skippedTools:
      options?.skippedTools ?? buildDeterministicSkippedTools(run, actions),
    expectedDeliverables:
      options?.expectedDeliverables ?? defaultExpectedDeliverables(),
    budgetInstruction: `Spend no more than ${run.budgetCapUsdc.toFixed(2)} USDC across at most ${run.maxPaidActions} paid action(s).`,
    budgetStrategy:
      options?.budgetStrategy ??
      `Run the most relevant tools first and stop before exceeding ${run.budgetCapUsdc.toFixed(2)} USDC.`,
    synthesisInstructions:
      options?.synthesisInstructions ??
      'Turn completed paid tool outputs into a concise launch pack and proof explanation.'
  }
}

async function buildOpenAiAgentPlan(
  run: AgentRun
): Promise<AgentPlanResult | null> {
  const products = run.allowedTools.map(slug => getProductBySlug(slug))
  const resolvedProducts = await Promise.all(products)
  const availableProducts = resolvedProducts
    .filter((product): product is ApiProduct => Boolean(product))
    .filter(product => product.status === 'published' && product.isAgentReady)

  if (availableProducts.length === 0) {
    return null
  }

  const model = envServer.AGENT_LLM_MODEL || DEFAULT_AGENT_MODEL
  const planningPrompt = buildOpenAiPlannerPrompt()
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${envServer.AGENT_LLM_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'developer',
          content: [{ type: 'input_text', text: planningPrompt }]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify(
                buildOpenAiPlannerContext(run, availableProducts)
              )
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'paykubo_agent_plan',
          strict: true,
          schema: buildOpenAiPlanSchema(availableProducts, run.maxPaidActions)
        }
      }
    })
  })

  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!response.ok) {
    throw new Error(
      `OpenAI planner failed with ${response.status} ${response.statusText}: ${JSON.stringify(body)}`
    )
  }

  const plan = parseOpenAiJson<OpenAiPlanResponse>(body)

  if (!plan) {
    throw new Error('OpenAI planner did not return valid structured JSON.')
  }

  const actions = buildActionsFromOpenAiPlan({
    run,
    products: availableProducts,
    plan,
    model
  })

  if (actions.length === 0) {
    return null
  }

  return {
    actions,
    metadata: buildPlannerSummary(run, actions, {
      mode: 'openai',
      model,
      responseId: typeof body?.id === 'string' ? body.id : undefined,
      planningPrompt,
      skippedTools: normalizeSkippedTools(
        plan.skippedTools,
        availableProducts,
        actions
      ),
      expectedDeliverables: plan.expectedDeliverables,
      budgetStrategy: plan.budgetStrategy,
      synthesisInstructions: plan.finalSynthesisInstructions
    })
  }
}

function buildActionsFromOpenAiPlan({
  run,
  products,
  plan,
  model
}: {
  run: AgentRun
  products: ApiProduct[]
  plan: OpenAiPlanResponse
  model: string
}): AgentAction[] {
  const now = new Date().toISOString()
  const bySlug = new Map(products.map(product => [product.slug, product]))
  const seen = new Set<string>()

  return [...plan.selectedTools]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, run.maxPaidActions)
    .reduce<AgentAction[]>((actions, tool, index) => {
      const product = bySlug.get(tool.slug)

      if (!product || seen.has(product.slug)) {
        return actions
      }

      seen.add(product.slug)

      actions.push({
        id: `act_${run.id.slice(4)}_${index + 1}`,
        runId: run.id,
        productSlug: product.slug,
        productName: product.name,
        providerName: product.providerName,
        status: 'planned',
        amountUsdc: product.priceLabel,
        objective: `OpenAI ${model} chose ${product.name}: ${tool.rationale}`,
        planningRationale: tool.rationale,
        plannerScore: Math.max(1, 100 - index),
        requestPayload:
          parsePayloadJson(tool.requestPayloadJson) ??
          buildPayloadForProduct(product, product.slug, run),
        startedAt: now
      })

      return actions
    }, [])
}

function buildOpenAiPlannerPrompt() {
  return [
    AGENT_PLANNER_PROMPT,
    '',
    'You are the AI planning brain. Return only structured JSON that matches the schema.',
    'Choose only from the provided tool slugs. Do not invent tools.',
    'Generate each requestPayloadJson as a valid JSON object string suitable for the selected tool request schema.',
    'Prefer useful public data tools before expensive or async media tools unless the objective clearly needs a media deliverable.',
    'If a tool is irrelevant, skip it and explain why.',
    'The platform will quote and pay the selected tools after your plan, so your plan must respect the budget and max action count.'
  ].join('\n')
}

function buildOpenAiPlannerContext(run: AgentRun, products: ApiProduct[]) {
  return {
    objective: run.objective,
    sourceText: run.sourceText ?? '',
    budgetCapUsdc: run.budgetCapUsdc,
    maxPaidActions: run.maxPaidActions,
    availableTools: products.map(product => ({
      slug: product.slug,
      name: product.name,
      providerName: product.providerName,
      category: product.category,
      description: product.description,
      priceLabel: product.priceLabel,
      priceUsd: product.priceUsd,
      pricingModel: product.pricing.model,
      executionMode: product.executionMode,
      resultDelivery: product.resultDelivery,
      requestSchema: product.requestSchema,
      referencePayload: buildPayloadForProduct(product, product.slug, run)
    }))
  }
}

function buildOpenAiPlanSchema(products: ApiProduct[], maxActions: number) {
  const slugs = products.map(product => product.slug)

  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'selectedTools',
      'skippedTools',
      'expectedDeliverables',
      'budgetStrategy',
      'finalSynthesisInstructions'
    ],
    properties: {
      selectedTools: {
        type: 'array',
        minItems: 1,
        maxItems: Math.max(1, maxActions),
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['slug', 'priority', 'rationale', 'requestPayloadJson'],
          properties: {
            slug: { type: 'string', enum: slugs },
            priority: { type: 'integer', minimum: 1, maximum: maxActions },
            rationale: { type: 'string' },
            requestPayloadJson: { type: 'string' }
          }
        }
      },
      skippedTools: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['slug', 'reason'],
          properties: {
            slug: { type: 'string', enum: slugs },
            reason: { type: 'string' }
          }
        }
      },
      expectedDeliverables: {
        type: 'array',
        minItems: 1,
        items: { type: 'string' }
      },
      budgetStrategy: { type: 'string' },
      finalSynthesisInstructions: { type: 'string' }
    }
  }
}

function normalizeSkippedTools(
  skippedTools: OpenAiPlanResponse['skippedTools'],
  products: ApiProduct[],
  actions: AgentAction[]
) {
  const selected = new Set(actions.map(action => action.productSlug))
  const productBySlug = new Map(
    products.map(product => [product.slug, product])
  )
  const explicit = skippedTools
    .filter(tool => !selected.has(tool.slug))
    .map(tool => ({
      slug: tool.slug,
      productName: productBySlug.get(tool.slug)?.name,
      reason: tool.reason
    }))

  const explicitSlugs = new Set(explicit.map(tool => tool.slug))
  const implicit = products
    .filter(
      product => !selected.has(product.slug) && !explicitSlugs.has(product.slug)
    )
    .map(product => ({
      slug: product.slug,
      productName: product.name,
      reason:
        'OpenAI did not need this tool for the current objective and budget.'
    }))

  return [...explicit, ...implicit]
}

function buildDeterministicSkippedTools(
  run: AgentRun,
  actions: AgentAction[]
): AgentSkippedTool[] {
  const selected = new Set(actions.map(action => action.productSlug))

  return run.allowedTools
    .filter(slug => !selected.has(slug))
    .map(slug => {
      return {
        slug,
        reason:
          'The fallback planner ranked other allowed tools higher for this objective.'
      }
    })
}

function defaultExpectedDeliverables() {
  return [
    'Launch brief',
    'Developer-facing copy',
    'Market or developer signal summary',
    'Optional project or media handoff link',
    'Proof explanation with receipt references'
  ]
}

function parsePayloadJson(value: string) {
  let parsed: unknown

  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    return null
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }

  return null
}

export function parseOpenAiJson<T>(
  body: Record<string, unknown> | null
): T | null {
  const directText =
    typeof body?.output_text === 'string'
      ? body.output_text
      : findFirstOutputText(body?.output)

  if (!directText) {
    return null
  }

  return JSON.parse(directText) as T
}

function findFirstOutputText(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null
  }

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const content = (item as { content?: unknown }).content

    if (!Array.isArray(content)) {
      continue
    }

    for (const contentItem of content) {
      if (
        contentItem &&
        typeof contentItem === 'object' &&
        typeof (contentItem as { text?: unknown }).text === 'string'
      ) {
        return (contentItem as { text: string }).text
      }
    }
  }

  return null
}

async function rankAllowedTools(run: AgentRun): Promise<PlannedTool[]> {
  const objective = normalizeText(`${run.objective} ${run.sourceText ?? ''}`)
  const products = (
    await Promise.all(run.allowedTools.map(tool => getProductBySlug(tool)))
  ).filter((product): product is ApiProduct => Boolean(product))

  return products
    .map(product => {
      const productText = normalizeText(
        `${product.name} ${product.description} ${product.category} ${product.providerName}`
      )
      const categoryScore = categoryWeights[product.category] ?? 5
      const keywordScore = scoreKeywordOverlap(objective, productText)
      const signalScore = scoreSignals(objective, product)
      const costPenalty = Math.min(product.priceUsd * 3, 8)
      const score = Number(
        Math.max(
          0,
          categoryScore + keywordScore + signalScore - costPenalty
        ).toFixed(2)
      )

      return {
        product,
        score,
        rationale: buildRationale({ objective, product, score })
      }
    })
    .filter(tool => tool.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.product.priceUsd - b.product.priceUsd
    )
}

function scoreKeywordOverlap(objective: string, productText: string) {
  return tokenize(objective).reduce(
    (score, token) => score + (productText.includes(token) ? 2 : 0),
    0
  )
}

function scoreSignals(objective: string, product: ApiProduct) {
  let score = 0

  if (hasSignal(objective, objectiveSignals.media)) {
    score +=
      product.category === 'media' ||
      product.resultDelivery !== 'direct_response'
        ? 14
        : 0
  }

  if (hasSignal(objective, objectiveSignals.market)) {
    score += product.category === 'data' ? 10 : 0
  }

  if (hasSignal(objective, objectiveSignals.developer)) {
    score += product.category === 'developer' ? 10 : 0
  }

  if (hasSignal(objective, objectiveSignals.proof)) {
    score += product.isX402Protected ? 4 : 0
  }

  return score
}

function buildRationale({
  objective,
  product,
  score
}: {
  objective: string
  product: ApiProduct
  score: number
}) {
  const reasons = []

  if (product.category === 'data') {
    reasons.push('it gives the agent external market context')
  }

  if (product.category === 'developer') {
    reasons.push('it validates developer and repository signals')
  }

  if (product.category === 'media') {
    reasons.push('it can produce the final creative deliverable')
  }

  if (
    hasSignal(objective, objectiveSignals.media) &&
    product.category === 'media'
  ) {
    reasons.push('the objective asks for launch assets or video output')
  }

  if (product.priceUsd <= 0.06) {
    reasons.push('it is cheap enough to run before larger paid actions')
  }

  return `${reasons.join(', ') || 'it matches the objective'}; planner score ${score}.`
}

export async function buildPayloadForTool(tool: string, run: AgentRun) {
  const product = await getProductBySlug(tool)

  return buildPayloadForProduct(product, tool, run)
}

function buildPayloadForProduct(
  product: ApiProduct | null | undefined,
  tool: string,
  run: AgentRun
) {
  const source = run.sourceText?.trim() || run.objective
  const query = deriveSearchQuery(`${run.objective} ${source}`)

  if (tool === 'public-wikipedia-context') {
    return {
      action: 'query',
      list: 'search',
      format: 'json',
      srsearch: query,
      srlimit: 5,
      origin: '*'
    }
  }

  if (tool === 'public-hn-trend-scan') {
    return {
      query,
      tags: 'story',
      hitsPerPage: 5
    }
  }

  if (tool === 'public-github-repo-search') {
    return {
      q: `${query} in:name,description,readme`,
      sort: 'stars',
      order: 'desc',
      per_page: 5
    }
  }

  if (tool === 'public-npm-package-signal') {
    return {
      text: query,
      size: 5,
      quality: 0.65,
      popularity: 0.25,
      maintenance: 0.1
    }
  }

  if (tool === 'public-openalex-research-scan') {
    return {
      search: query,
      'per-page': 5,
      sort: 'relevance_score:desc'
    }
  }

  if (tool === 'public-gdelt-news-scan') {
    return {
      query,
      mode: 'ArtList',
      format: 'json',
      maxrecords: 5,
      sort: 'HybridRel'
    }
  }

  return enrichReferencePayload(product?.referencePayload ?? {}, {
    objective: run.objective,
    source,
    query
  })
}

function enrichReferencePayload(
  payload: Record<string, unknown>,
  context: { objective: string; source: string; query: string }
) {
  const nextPayload = { ...payload }

  for (const key of Object.keys(nextPayload)) {
    const normalized = key.toLowerCase()

    if (
      normalized.includes('prompt') ||
      normalized.includes('objective') ||
      normalized.includes('topic')
    ) {
      nextPayload[key] = context.objective
    }

    if (
      normalized === 'q' ||
      normalized.includes('query') ||
      normalized.includes('search')
    ) {
      nextPayload[key] = context.query
    }

    if (
      normalized.includes('document') ||
      normalized.includes('source') ||
      normalized.includes('text')
    ) {
      nextPayload[key] = context.source
    }
  }

  if (Object.keys(nextPayload).length === 0) {
    return {
      objective: context.objective,
      sourceText: context.source
    }
  }

  return nextPayload
}

function deriveSearchQuery(input: string) {
  const tokens = tokenize(normalizeText(input)).slice(0, 8)

  return tokens.length > 0 ? tokens.join(' ') : 'AI API marketplace'
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')
}

function tokenize(value: string) {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'from',
    'into',
    'where',
    'can',
    'create',
    'make',
    'build',
    'launch',
    'pack'
  ])

  return value
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 2 && !stopWords.has(token))
}

function hasSignal(objective: string, signals: string[]) {
  return signals.some(signal => objective.includes(signal))
}
