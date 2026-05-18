# Build In! Payments Demo Script

Project: Paykubo  
Track: x402 Agentic Payments  
Demo URL: https://paykubo.vercel.app/  
Video Link: [YOUTUBE_OR_X_URL]

One-liner: Paykubo lets API owners sell paid tools, buyers pay with USDC
through x402, and autonomous agents buy those tools from a funded budget on
Morph.

## Project Write-up

Paykubo is a Morph-powered marketplace for paid APIs and autonomous agent
payments. It focuses on the x402 Agentic Payments track by turning existing
HTTPS APIs into USDC-paid tools that people, apps, and AI agents can buy per
request. In the demo, ClipLore becomes a paid video-generation API: a provider
copies its OpenAPI spec, adds an API key, a buyer pays through Paykubo, and the
Video Launch Campaign Agent later buys the same tool from a funded budget. Each
paid action settles in USDC on Morph and creates receipts, provider traces, and
proof-ready records.

Word count: 93

## 2-Minute Cut

### 1.) 0:00-0:20 - Intro

- **Show:** Paykubo homepage with Morph, USDC, x402, marketplace, and agent
  messaging.
- **Voiceover:** Paykubo is our project for the x402 Agentic Payments track. It turns existing APIs, like video generation, into USDC-paid tools on Morph that people and agents can buy per request through x402.

### 2.) 0:20-0:45 - Add ClipLore

- **Show:** cliplore.ai OpenAPI URL, API key page, then Paykubo provider
  product form.
- **Voiceover:** I copy ClipLore's OpenAPI URL first, then generate an API key.
  In Paykubo, I import the spec, choose the video job endpoint, add the key
  server-side, price it in USDC, and publish it as agent-ready.

### 3.) 0:45-1:10 - Run From Marketplace

- **Show:** `/marketplace`, ClipLore product, `/orders/new`, payment console,
  completed order, and result link.
- **Voiceover:** A buyer opens the marketplace, runs the ClipLore video tool, and pays through x402. Paykubo settles USDC on Morph, then returns the ClipLore output link.

### 4.) 1:10-1:35 - Run The Agent

- **Show:** `/agents`, Video Launch Campaign Agent, funding transaction, paid
  actions, receipts, and deliverables.
- **Voiceover:** Next, I run the Video Launch Campaign Agent. I fund it with
  USDC, let it choose paid tools, and run the actions. The agent buys the
  ClipLore API through the same marketplace rails.

### 5.) 1:35-2:00 - Play The Output

- **Show:** Agent deliverable link, ClipLore project page, and generated video
  playback.
- **Voiceover:** Finally, I open the ClipLore link returned by the agent and
  play the generated video. That completes the loop: provider API, buyer
  payment, autonomous agent spend, Morph settlement, receipts, and a real
  output.

## Recording Steps

### 1.) Start On Paykubo

- Open [DEMO_URL]/.
- Show the Paykubo hero, marketplace value, provider earnings, buyer checkout,
  and agent workflow.
- Click `Marketplace`.
- **Voiceover:** Paykubo is a paid API marketplace on Morph. Providers earn
  USDC per call, buyers pay before receiving results, and agents can buy tools
  from a funded budget.

### 2.) Get ClipLore Credentials

- Open `https://cliplore.ai/auth/sign-in?next=/developers/openapi`.
- Sign in.
- Open `https://cliplore.ai/developers/openapi`.
- Copy the OpenAPI URL.
- Open `https://cliplore.ai/dashboard/developers/api-keys`.
- Create a live API key named `Paykubo marketplace`.
- Copy the API key.
- **Voiceover:** ClipLore already has the video API. I copy the OpenAPI URL
  first, then generate the API key needed for Paykubo's server-side provider
  auth.

### 3.) Publish ClipLore On Paykubo

- Open `[DEMO_URL]/provider/products/new`.
- Import `https://cliplore.ai/api/v1/openapi.json`.
- Select `POST /video/jobs`.
- Click `Fill listing`.
- Set auth to bearer with `Authorization`.
- Paste the ClipLore API key in the server-side secret field.
- Use credit-metered pricing with `estimatedCredits` and `0.01` USDC per
  credit.
- Set visibility to `Published`.
- Enable `Agent ready`.
- Save the product.
- **Voiceover:** The API key stays server-side. Buyers and agents never see it;
  they only see the paid ClipLore product and its USDC price.

### 4.) Run ClipLore From Marketplace

- Open `/marketplace`.
- Search `ClipLore` or `video`.
- Open the ClipLore product.
- Click `Run with wallet`.
- Use the sample payload.
- Set the prompt to: `Create a short launch video explaining Paykubo paid APIs,
  Morph USDC settlement, and autonomous agent payments.`
- Click `Test run`.
- On the order page, click `Run`.
- Confirm the wallet prompts.
- Wait for quote, approval, settlement, provider result, receipt, and ClipLore
  link.
- **Voiceover:** The buyer pays through x402 before ClipLore starts work.
  Paykubo settles USDC on Morph, records the receipt, polls the async job, and
  returns the ClipLore project link.

### 5.) Show The ClipLore Output

- Click the ClipLore result link.
- Confirm the public project page loads.
- Play or preview the generated video.
- Return to the Paykubo order.
- Open the receipt.
- Show buyer wallet, provider wallet, USDC amount, fee split, and Morph
  transaction.
- **Voiceover:** The result is real output, not just JSON. The receipt proves
  who paid, who earned, how much settled, and which Morph transaction completed
  the payment.

### 6.) Run The Video Launch Campaign Agent

- Open `/agents`.
- Select `Video Launch Campaign Agent`.
- Choose `AI decides`.
- Objective: `Create a video launch campaign for Paykubo showing ClipLore API
  publishing, x402 checkout, Morph USDC receipts, and autonomous agent proof.`
- Source context: `Paykubo is a Morph-powered marketplace for paid APIs, x402
  payments, USDC settlement, provider revenue, browser checkout, developer
  integration, and autonomous agent runs.`
- Budget: `1.35`.
- Actions: `4`.
- Create the run.
- Click `Fund agent`.
- Confirm the funding transaction.
- Click `Run actions`.
- Wait until all selected tools complete.
- **Voiceover:** The agent uses the same marketplace rails. It spends only from
  the funded USDC budget, buys paid tools through x402, and records receipts for
  each paid action.

### 7.) Play The Agent Video

- Open the completed agent deliverable.
- Click the ClipLore project or output link.
- Play the generated video.
- Optionally return to Paykubo and attest the proof if time allows.
- **Voiceover:** This is the full Paykubo loop: a provider publishes a real API,
  a buyer pays for it, an agent buys it autonomously, and the final ClipLore
  video proves the paid action produced real work.

## Pacing Notes

- Keep the two-minute cut focused on ClipLore output.
- Do not show the raw ClipLore API key in the final recording.
- Use prepared wallets, balances, products, orders, and agent runs if live
  wallet prompts are slow.
- Do not end on a queued job ID. Wait for a completed ClipLore project or output
  link.
