# Build In! Payments Demo Script

Project: Paykubo  
Track: x402 Agentic Payments  
Demo URL: https://paykubo.vercel.app/  
Video Link: [YOUTUBE_OR_X_URL]

One-liner: Paykubo is a Morph-powered marketplace where API owners list paid
tools, buyers pay with USDC through x402, and autonomous agents buy those tools
from a funded budget with receipts and public proof.

## Project Write-up

Paykubo is a Morph-powered marketplace for paid APIs and autonomous agent
payments. It focuses on the x402 Agentic Payments track: useful APIs and
digital services are difficult for humans, apps, and AI agents to buy one
request at a time without subscriptions, invoices, or custom billing systems.
Providers publish existing HTTPS APIs, buyers receive x402 payment
requirements, and successful calls settle in USDC on Morph Hoodi. In the demo,
ClipLore becomes a paid video-generation API: a buyer pays through Paykubo,
receives the generated project link, and an autonomous Video Launch Campaign
Agent later buys the same tool from a funded budget. Each paid action produces
receipts, provider traces, and proof-ready records.

Word count: 111

## Fast 2-Minute Recording Cut

### 0:00-0:25 - Problem And Morph Use Case

- **Start on:** `/`
- **Show:** Paykubo branding, Morph Hoodi, USDC, x402 Agentic Payments, and
  the marketplace/agent promise.
- **Voiceover:**
  > "Paykubo is our Build In! Payments project for the x402 Agentic Payments
  > track. The problem is specific: APIs like video generation are hard for
  > people and agents to buy one request at a time. Paykubo turns an existing
  > API into a USDC-paid tool on Morph, with x402 payment requirements,
  > receipts, and proof-ready agent actions."

### 0:25-0:50 - Add ClipLore As A Paid API

- **Show:** ClipLore API key page, copied key, OpenAPI URL, then Paykubo
  provider product form.
- **Voiceover:**
  > "First, I go to cliplore.ai, generate an API key, and copy the OpenAPI URL.
  > In Paykubo, I import the ClipLore spec, select the video job endpoint, paste
  > the API key into the server-side auth field, price it in USDC, and publish
  > it as an agent-ready marketplace tool."

### 0:50-1:15 - Run ClipLore From The Marketplace

- **Show:** `/marketplace`, ClipLore product detail, `/orders/new`, payment
  console, completed order, and ClipLore result link.
- **Voiceover:**
  > "Now a buyer wallet opens the marketplace, chooses the ClipLore video tool,
  > uses the sample payload, and pays through x402. Paykubo settles USDC on
  > Morph before starting the provider job, then returns the ClipLore project
  > output link."

### 1:15-1:45 - Run The Video Launch Campaign Agent

- **Show:** `/agents`, "Video Launch Campaign Agent", funding transaction,
  completed paid actions, and deliverables.
- **Voiceover:**
  > "Then I use the Video Launch Campaign Agent. I fund the run with USDC, let
  > the agent choose the paid tools, and run the actions. The agent buys the
  > ClipLore video API from the same marketplace rails and records each paid
  > action as a receipt-backed step."

### 1:45-2:00 - Play The Generated Video

- **Show:** Agent deliverable link, ClipLore public project page, and generated
  video playback.
- **Voiceover:**
  > "Finally, I open the ClipLore link returned by the agent and play the
  > generated video. That completes the loop: provider API, buyer payment,
  > autonomous agent spend, USDC receipts, and a real output."

## Detailed Recording Runbook

## 1. Show The Marketplace Value

- **URL:** /
- **Shot:** Paykubo homepage with the marketplace promise, USDC payment story,
  provider earning story, buyer checkout story, agent workflow, and Morph
  settlement context.
- **Steps:**
  1. **Current page:** Browser start page - open URL directly: [DEMO_URL]/.
  2. **Current page:** / - confirm the Paykubo hero is visible.
  3. **Current page:** / - scroll once through the marketplace, provider
     earning, buyer payment, and agent workflow sections.
  4. **Current page:** / - click "Marketplace" in the top navigation, then
     lands on /marketplace.
  5. **Verify on-screen:** The marketplace heading and paid API listings are
     visible.
- **Voiceover:**
  > "This is Paykubo. It is a marketplace for paid APIs and autonomous agent
  > payments on Morph. Providers can list an existing API and earn USDC per
  > call. Buyers can pay before receiving a result. Agents can do the same thing
  > automatically from a funded budget, with receipts and proof records for each
  > paid action."

## 2. Get The ClipLore API Key And OpenAPI URL

- **URL:** https://cliplore.ai/dashboard/developers/api-keys
- **Shot:** ClipLore developer dashboard with API keys, Create key form, New
  API key panel, Copy key button, and OpenAPI reference with Copy OpenAPI URL.
- **Steps:**
  1. **Current page:** /marketplace - confirm the Paykubo marketplace is
     visible.
  2. **Current page:** /marketplace - open URL directly:
     https://cliplore.ai/auth/sign-in?next=/dashboard/developers/api-keys.
  3. **Current page:** /auth/sign-in - confirm the ClipLore sign-in page is
     visible.
  4. **Enter values:**
     - Email = [CLIPLORE_EMAIL=owner@example.com]
     - Password = [CLIPLORE_PASSWORD=your_password]
  5. **Current page:** /auth/sign-in - click "Sign in" and wait for the
     developer dashboard.
  6. **Current page:** /dashboard/developers/api-keys - confirm the "API keys"
     heading is visible.
  7. **Enter values:**
     - Name = Paykubo marketplace
     - Environment = Live
  8. **Current page:** /dashboard/developers/api-keys - click "Create key" and
     wait for the "New API key" panel.
  9. **Current page:** /dashboard/developers/api-keys - click "Copy key" and
     wait for the copied confirmation.
  10. **Current page:** /dashboard/developers/api-keys - open URL directly:
      https://cliplore.ai/developers/openapi.
  11. **Current page:** /developers/openapi - confirm "OpenAPI URL" is visible.
  12. **Current page:** /developers/openapi - click "Copy OpenAPI URL" and wait
      for the copied confirmation.
  13. **Verify on-screen:** ClipLore shows the copied API key confirmation and
      copied OpenAPI URL confirmation.
- **Voiceover:**
  > "First, I go to ClipLore as the API owner. I sign in, create a live API key
  > named Paykubo marketplace, and copy it. Then I open the ClipLore OpenAPI
  > reference and copy the OpenAPI URL. These two values are enough to turn an
  > existing ClipLore API into a paid Paykubo marketplace listing."

## 3. Publish The ClipLore API On Paykubo

- **URL:** /provider/products/new
- **Shot:** Paykubo provider listing page with Import OpenAPI, operation
  selector, product details, provider authentication, pricing, async polling,
  visibility, agent-ready setting, and Save API product.
- **Steps:**
  1. **Current page:** https://cliplore.ai/developers/openapi - confirm "OpenAPI
     URL" is visible.
  2. **Current page:** https://cliplore.ai/developers/openapi - open URL
     directly: [DEMO_URL]/provider/products/new.
  3. **Current page:** /provider/products/new - confirm "Import OpenAPI" is
     visible.
  4. **Enter values:**
     - OpenAPI URL = https://cliplore.ai/api/v1/openapi.json
     - Override Server URL = leave empty
  5. **Current page:** /provider/products/new - click "Import spec" and wait
     for "Imported operations" to appear.
  6. **Current page:** /provider/products/new - click the imported operation
     dropdown and select "POST /video/jobs".
  7. **Current page:** /provider/products/new - click "Fill listing" and wait
     for the listing fields to populate.
  8. **Enter values:**
     - Auth type = bearer
     - Header name = Authorization
     - Auth secret or API key = [CLIPLORE_API_KEY=clip_live_your_key]
     - Pricing model = Credit metered
     - Credit value path = estimatedCredits
     - USDC per credit = 0.01
     - Visibility = Published
     - Agent ready = enabled
  9. **Current page:** /provider/products/new - click "Save API product" and
     wait for the product saved confirmation.
  10. **Verify on-screen:** The product management page shows the ClipLore
      product with a "Published" status badge and the connected provider
      wallet.
- **Voiceover:**
  > "Now I switch back to Paykubo as the provider. I paste the ClipLore OpenAPI
  > URL, import the spec, choose the video job endpoint, and fill the listing.
  > Then I paste the private ClipLore API key into the server-side auth field.
  > I set credit-metered pricing in USDC, publish it, and mark it agent-ready so
  > the same API can be bought by a person or by an autonomous agent."

## 4. Run The ClipLore API From The Marketplace

- **URL:** /marketplace
- **Shot:** Paykubo marketplace with the published ClipLore listing, product
  detail page, Run with wallet action, order form, payment console, and
  completed provider result.
- **Steps:**
  1. **Current page:** /provider/products/[productId] - confirm the "Published"
     status badge is visible.
  2. **Current page:** Paykubo header - click "Marketplace" in the top
     navigation, then lands on /marketplace.
  3. **Current page:** /marketplace - search for "video" or "ClipLore".
  4. **Current page:** /marketplace - click "View" on the ClipLore video
     product row, then lands on /marketplace/[slug].
  5. **Current page:** /marketplace/[slug] - confirm provider, endpoint, price,
     and "Run with wallet" are visible.
  6. **Current page:** /marketplace/[slug] - click "Run with wallet", then
     lands on /orders/new?product=[PRODUCT_SLUG].
  7. **Current page:** /orders/new?product=[PRODUCT_SLUG] - click "Use sample
     payload".
  8. **Enter values:**
     - Prompt = Create a short launch video explaining Paykubo paid APIs,
       Morph USDC settlement, and autonomous agent payments.
     - Format = portrait
     - Duration Seconds = 30
     - Workflow Mode = automatic
     - Finalization Mode = auto_project
  9. **Current page:** /orders/new?product=[PRODUCT_SLUG] - click "Test run" and
     wait for the Run and Pay page.
  10. **Current page:** /orders/[orderId] - click "Run" in the payment console.
  11. **Current page:** MetaMask - approve or confirm the required USDC/x402
      wallet prompts.
  12. **Current page:** /orders/[orderId] - wait for Quote, Approve, Sign,
      Settle, and Result to complete.
  13. **Verify on-screen:** The page shows the Morph transaction link, receipt
      ID, async job status, and a public ClipLore project result link.
- **Voiceover:**
  > "This is the buyer experience. Paykubo builds the request form from the
  > provider schema, I use a sample payload, and I pay with my wallet. The buyer
  > pays before ClipLore starts the video job. Paykubo settles USDC through
  > x402 on Morph, creates a receipt, starts the provider job, polls the async
  > status, and returns a public ClipLore project link when the generated video
  > is ready."

## 5. Open The ClipLore Output

- **URL:** https://cliplore.ai/share/api-projects/[jobId]
- **Shot:** ClipLore public project handoff page with completed status,
  generated project preview, Clone to my account or View workflow, and playable
  video output when available.
- **Steps:**
  1. **Current page:** /orders/[orderId] - confirm the public project result
     link is visible.
  2. **Current page:** /orders/[orderId] - click "Open result" or the public
     project URL, then lands on https://cliplore.ai/share/api-projects/[jobId].
  3. **Current page:** /share/api-projects/[jobId] - confirm the "Public API
     project" badge and completed status are visible.
  4. **Current page:** /share/api-projects/[jobId] - play or preview the
     generated video output.
  5. **Verify on-screen:** ClipLore shows the generated project and playable
     video result.
- **Voiceover:**
  > "The paid API result is not only JSON. The buyer gets a ClipLore project
  > link and can open the generated video. This proves the marketplace call
  > produced real work from a third-party API, while Paykubo handled payment,
  > settlement, and receipts."

## 6. Verify The Receipt And Provider Earnings

- **URL:** /receipts/[receiptId]
- **Shot:** Paykubo receipt page with receipt ID, buyer wallet, provider
  wallet, product, USDC amount, platform fee, provider amount, network, and
  Morph explorer link.
- **Steps:**
  1. **Current page:** ClipLore result page - return to the Paykubo order tab.
  2. **Current page:** /orders/[orderId] - click the visible receipt ID, then
     lands on /receipts/[receiptId].
  3. **Current page:** /receipts/[receiptId] - click the Morph transaction
     link.
  4. **Current page:** Morph explorer - confirm the transaction page opens.
  5. **Current page:** /receipts/[receiptId] - return to the receipt page.
  6. **Verify on-screen:** The receipt shows buyer wallet, provider wallet,
     USDC amount, fee split, product, and transaction hash.
- **Voiceover:**
  > "After the result, we verify the business side. The receipt shows the buyer
  > wallet, provider wallet, USDC amount, platform fee, provider share, and
  > Morph transaction. This proves the API seller can earn from each paid call
  > while the buyer gets a real output and a verifiable payment record."

## 7. Create And Fund The Video Launch Campaign Agent

- **URL:** /agents
- **Shot:** Agent templates page, Video Launch Campaign Agent template, agent
  creation form, connected owner wallet, budget, max actions, and funding flow.
- **Steps:**
  1. **Current page:** /receipts/[receiptId] - confirm the receipt details are
     visible.
  2. **Current page:** /receipts/[receiptId] - click "Agents" in the top
     navigation, then lands on /agents.
  3. **Current page:** /agents - click "Templates".
  4. **Current page:** /agents - click "Use template" on "Video Launch Campaign
     Agent", then lands on /agents/new?template=video-launch-campaign.
  5. **Current page:** /agents/new - choose "AI decides".
  6. **Enter values:**
     - Objective = Create a video launch campaign for Paykubo showing ClipLore
       API publishing, x402 checkout, Morph USDC receipts, and autonomous agent
       proof.
     - Source context = Paykubo is a Morph-powered marketplace for paid APIs,
       x402 payments, USDC settlement, provider revenue, browser checkout,
       developer integration, and autonomous agent runs.
     - Budget = 1.35
     - Actions = 4
  7. **Current page:** /agents/new - click "Create run" and wait for the run
     page to load.
  8. **Current page:** /agents/[runId] - click "Fund agent" and confirm the
     wallet funding transaction.
  9. **Verify on-screen:** The funding ledger shows the agent run was funded,
     and the budget card shows 1.35 USDC.
- **Voiceover:**
  > "Now I show the autonomous version of the same workflow. I open the Video
  > Launch Campaign Agent, let AI choose from the paid tool catalog, set a 1.35
  > USDC budget, and fund the agent vault. The agent cannot spend until the
  > user funds it, and it cannot exceed the funded budget."

## 8. Run The Agent And Wait For All Tools To Complete

- **URL:** /agents/[runId]
- **Shot:** Agent run page with planner, selected tools, budget ledger, paid
  action cards, receipts, async ClipLore status, completed deliverables, and
  final ClipLore project/output link.
- **Steps:**
  1. **Current page:** /agents/[runId] - confirm the funded budget card and
     "Run actions" button are visible.
  2. **Current page:** /agents/[runId] - click "Run actions".
  3. **Current page:** /agents/[runId] - wait for action cards to move through
     planned, quoted, paid, completed, skipped, or failed.
  4. **Current page:** /agents/[runId] - keep the page open until the ClipLore
     or media-generation action completes and returns a project, render,
     preview, clone, or output URL.
  5. **Current page:** /agents/[runId] - open "Planner, receipts, and
     deliverable diagnostics".
  6. **Current page:** /agents/[runId] - confirm selected tools, receipt IDs,
     paid action results, and rendered deliverables are visible.
  7. **Verify on-screen:** The completed run includes a final ClipLore project
     or output link.
- **Voiceover:**
  > "The agent is the automation layer on top of the marketplace. It plans the
  > launch campaign, quotes paid tools, spends USDC from the funded vault, and
  > waits for the ClipLore video job to finish. When all selected tools are
  > complete, the run page shows receipts, diagnostics, launch copy, and the
  > generated ClipLore link."

## 9. Open The Agent's ClipLore Link And Play The Video

- **URL:** https://cliplore.ai/share/api-projects/[jobId]
- **Shot:** Agent deliverables on Paykubo, opened ClipLore project page, and
  playable generated video.
- **Steps:**
  1. **Current page:** /agents/[runId] - confirm the completed deliverable link
     is visible.
  2. **Current page:** /agents/[runId] - click the ClipLore project or output
     URL returned by the agent.
  3. **Current page:** https://cliplore.ai/share/api-projects/[jobId] - confirm
     the generated project loads.
  4. **Current page:** ClipLore project page - play the generated video.
  5. **Verify on-screen:** The final video generated by the agent is visible and
     playable.
- **Voiceover:**
  > "Finally, I open the ClipLore link returned by the agent and play the
  > generated video. This is the full Paykubo loop: a real third-party API is
  > published, a buyer pays for it, an autonomous agent later buys the same kind
  > of tool from a funded budget, and each paid action has a USDC receipt on
  > Morph."

## Optional Proof Shot

- **URL:** /proofs/[proofId]
- **Shot:** Agent run page with Attest proof button, then public proof page
  with proof hash, receipt IDs, funding metadata, spend, refund metadata, and
  Morph attestation transaction.
- **Steps:**
  1. **Current page:** /agents/[runId] - click "Attest proof" after the run is
     complete.
  2. **Current page:** /agents/[runId] - wait for the proof transaction to
     complete.
  3. **Current page:** /agents/[runId] - click the proof link, then lands on
     /proofs/[proofId].
  4. **Verify on-screen:** The proof page shows proof hash, receipts, vault
     funding metadata, spend/refund metadata, and Morph attestation transaction.
- **Voiceover:**
  > "If there is time, I attest the run and open the public proof page. Anyone
  > can audit the receipts and proof metadata without seeing private API keys,
  > private prompts, or provider secrets."

## Pacing Notes

- Keep the final two-minute cut focused on the real ClipLore output, not every
  form field.
- Use a pre-created provider wallet, buyer wallet, ClipLore account, and funded
  wallet balances before recording.
- Do not show the raw ClipLore API key in the final video. Blur or avoid the
  one-time key value after copying it.
- If wallet prompts are slow, use an already completed order and agent run, but
  still show the receipt and Morph transaction link.
- Wait for the agent media action to return a completed project or output URL
  before opening ClipLore. Do not end on only a queued job ID.
