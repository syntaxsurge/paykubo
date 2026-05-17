import {
  BarChart3,
  BookOpenCheck,
  Clapperboard,
  FileSearch,
  Megaphone,
  MonitorCheck,
  PackageSearch,
  RadioTower,
  Video
} from 'lucide-react'

export type AgentTemplate = {
  id: string
  title: string
  category: string
  summary: string
  objective: string
  sourceText: string
  recommendedBudgetUsdc: number
  maxPaidActions: number
  toolStrategy: string
  deliverables: string[]
  icon: typeof Megaphone
}

export const agentTemplates: AgentTemplate[] = [
  {
    id: 'launch-pack',
    title: 'Launch Pack Agent',
    category: 'Go-to-market',
    summary:
      'Researches developer signals, writes launch copy, and prepares an auditable proof package.',
    objective: 'Create a launch pack for my USDC-native paid API product.',
    sourceText:
      'The product sells premium API responses to AI agents and records USDC receipts on Morph.',
    recommendedBudgetUsdc: 0.9,
    maxPaidActions: 4,
    toolStrategy:
      'Start with public developer data tools, then add media only when the goal asks for creative collateral.',
    deliverables: ['Positioning brief', 'Developer copy', 'Market signal'],
    icon: Megaphone
  },
  {
    id: 'market-radar',
    title: 'Market Radar Agent',
    category: 'Research',
    summary:
      'Scans public discussion and repository activity to summarize demand, competitors, and launch angles.',
    objective:
      'Research the market for an API product and summarize developer demand, competitors, and launch channels.',
    sourceText:
      'Focus on current developer conversations, public repositories, and useful positioning signals.',
    recommendedBudgetUsdc: 0.35,
    maxPaidActions: 3,
    toolStrategy:
      'Prioritize low-cost public data tools and skip expensive media generation.',
    deliverables: ['Demand summary', 'Competitor map', 'Launch keywords'],
    icon: BarChart3
  },
  {
    id: 'docs-brief',
    title: 'Documentation Brief Agent',
    category: 'Developer experience',
    summary:
      'Turns product context and research into quickstart copy, integration steps, and FAQ content.',
    objective:
      'Create a developer documentation brief for my API, including quickstart steps, integration guidance, and FAQ copy.',
    sourceText:
      'The target reader is a developer integrating a paid API into a backend, CLI, or autonomous agent.',
    recommendedBudgetUsdc: 0.4,
    maxPaidActions: 3,
    toolStrategy:
      'Use public context and repository signals to keep the documentation grounded in real developer expectations.',
    deliverables: ['Quickstart outline', 'Integration notes', 'FAQ copy'],
    icon: BookOpenCheck
  },
  {
    id: 'api-readiness',
    title: 'API Readiness Agent',
    category: 'Operations',
    summary:
      'Checks whether a listed API is positioned, priced, documented, and safe for agent usage.',
    objective:
      'Review my paid API listing for launch readiness and produce a prioritized fix list for pricing, docs, reliability, and agent compatibility.',
    sourceText:
      'Evaluate the API as if external developers and autonomous agents will buy it from the marketplace.',
    recommendedBudgetUsdc: 0.3,
    maxPaidActions: 3,
    toolStrategy:
      'Use developer and public data tools to compare expected marketplace ergonomics before recommending fixes.',
    deliverables: ['Readiness score', 'Risk list', 'Fix plan'],
    icon: MonitorCheck
  },
  {
    id: 'video-promo',
    title: 'Video Promo Agent',
    category: 'Creative',
    summary:
      'Plans a short promotional concept and may use async media tools when budget allows.',
    objective:
      'Create a short promotional video concept and supporting launch copy for my API product.',
    sourceText:
      'The video should explain the product in a concise developer-friendly style and produce a shareable project handoff when media tools are available.',
    recommendedBudgetUsdc: 1.2,
    maxPaidActions: 4,
    toolStrategy:
      'Use research tools first, then use media generation only if the remaining budget can cover the quote.',
    deliverables: ['Video concept', 'Project handoff', 'Social copy'],
    icon: Video
  },
  {
    id: 'video-launch-campaign',
    title: 'Video Launch Campaign Agent',
    category: 'Creative',
    summary:
      'Combines developer/news/package signals with an async video-generation job for a richer launch asset.',
    objective:
      'Create a video-first launch campaign for my API product, including research-backed positioning, a short video project, social copy, and developer launch notes.',
    sourceText:
      'Use public developer, package, repository, and news signals before deciding the video prompt. The final output should include a cloneable video project handoff when a media tool is available.',
    recommendedBudgetUsdc: 1.35,
    maxPaidActions: 4,
    toolStrategy:
      'Let OpenAI select a compact research set first, then spend on async video generation only if the quote fits the remaining funded budget.',
    deliverables: [
      'Research-backed angle',
      'Video handoff',
      'Social launch copy'
    ],
    icon: Clapperboard
  },
  {
    id: 'ecosystem-map',
    title: 'Ecosystem Map Agent',
    category: 'Research',
    summary:
      'Maps packages, repositories, research, and discussion clusters around a product category.',
    objective:
      'Create an ecosystem map for my product category, including adjacent open-source projects, package ecosystems, research themes, and developer discussion channels.',
    sourceText:
      'Focus on practical integration opportunities and public evidence that can guide partnerships, docs, and launch positioning.',
    recommendedBudgetUsdc: 0.45,
    maxPaidActions: 4,
    toolStrategy:
      'Use no-key public data tools across GitHub, npm, OpenAlex, Hacker News, and Wikipedia; avoid media generation.',
    deliverables: ['Project map', 'Package map', 'Integration shortlist'],
    icon: PackageSearch
  },
  {
    id: 'newsroom-brief',
    title: 'Newsroom Brief Agent',
    category: 'Communications',
    summary:
      'Finds public news and developer context, then drafts a concise press-style narrative and FAQ.',
    objective:
      'Prepare a newsroom-style launch brief for my API product with market context, proof points, concise messaging, and FAQ responses.',
    sourceText:
      'The brief should be factual, conservative, and easy for non-technical judges, partners, and customers to understand.',
    recommendedBudgetUsdc: 0.45,
    maxPaidActions: 4,
    toolStrategy:
      'Blend news, encyclopedia, and developer data signals before writing the brief.',
    deliverables: ['Press brief', 'Proof points', 'FAQ'],
    icon: RadioTower
  },
  {
    id: 'integration-playbook',
    title: 'Integration Playbook Agent',
    category: 'Developer experience',
    summary:
      'Turns public package and repository signals into integration examples, docs priorities, and API marketplace guidance.',
    objective:
      'Create an integration playbook for developers adopting my API, including target stacks, example use cases, docs priorities, and marketplace listing improvements.',
    sourceText:
      'Prioritize developer experience, server-side integrations, agent tool usage, and practical onboarding steps.',
    recommendedBudgetUsdc: 0.4,
    maxPaidActions: 4,
    toolStrategy:
      'Use package, repository, and public context tools to identify stacks and documentation gaps.',
    deliverables: ['Target stacks', 'Docs plan', 'Integration examples'],
    icon: FileSearch
  }
]

export function getAgentTemplate(templateId: string | null | undefined) {
  return agentTemplates.find(template => template.id === templateId)
}
