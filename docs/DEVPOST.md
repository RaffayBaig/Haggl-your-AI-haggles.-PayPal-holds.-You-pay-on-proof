# Devpost submission draft: Haggl

> Edit anything that isn't true for your team before submitting, especially "Built with" and the APIMatic section.

**Tagline:** Your AI haggles. PayPal holds. You pay on proof.

## Inspiration
In Pakistan, and across South Asia, the Middle East and Africa, buying means bargaining, and nobody pays before seeing the goods. Online marketplaces dropped both: fixed prices, and pay first, hope later. Small sellers and freelancers deal with non-delivery and "wrong item" scams constantly, so trust is the real bottleneck. We wanted agentic commerce that feels like a real bazaar and is safe by design.

## What it does
- Every listing gets an **AI seller agent** that knows the seller's secret lowest price.
- A buyer briefs their own **AI buyer agent** with a secret budget and a style (polite, tough, charming).
- The agents **negotiate live**. Each turn they get a different tactic and write private strategy notes the other side never sees.
- If the numbers can never work, Haggl **detects the deadlock** (or an agent walks away) and the negotiation fails cleanly. Nobody is charged.
- When they agree, the buyer approves with **PayPal Checkout using intent AUTHORIZE**, so the money is held, not sent.
- After delivery, the buyer uploads a photo. An **AI vision inspector** compares it with the listing and returns structured checks and a confidence score.
- Code decides: match and ≥70% confidence → **capture** (seller paid). Otherwise → **void** (buyer pays nothing).

## The core idea: the AI can talk, but only code can move money
LLM agents can be prompt-injected. So the seller's floor and the buyer's budget are never trusted to the prompt alone; every agent move passes through a deterministic guardrail layer. The demo includes a **prompt-injection button** and a **"simulate fully jailbroken seller" button**. Both show unsafe moves being blocked and replaced with safe ones. The amount sent to PayPal always comes from the server's deal record, never from the browser or the model.

## How we built it
- **PayPal Orders v2**: create order (`intent: AUTHORIZE`), JS SDK buttons for approval, `/authorize`, then `/v2/payments/authorizations/{id}/capture` or `/void`. Idempotency via `PayPal-Request-Id`.
- **AI**: Groq (Llama 3.3 70B for negotiation, Qwen 3.8 vision for the inspector), with Google Gemini and Anthropic Claude switchable by one setting. Strict JSON outputs.
- **Backend**: zero-dependency Node.js server; negotiation engine, guardrails, JSON storage, full audit trail.
- **Frontend**: vanilla JS, live chat-style negotiation, a price meter showing offers converging, and a seller dashboard.
- **APIMatic**: *(Only include this if you actually use it.)* We used APIMatic's Context Plugin in our AI coding assistant to give it accurate PayPal API and SDK context while building the PayPal integration.

## Challenges
- Getting two LLM agents to haggle naturally without caving instantly or looping forever (concession rules, round limits, agreement detection when offers cross).
- Keeping secrets secret: the floor price is never sent to the buyer side, the API, or the browser.
- Mapping a fuzzy AI judgement onto an irreversible money decision: structured checks plus a confidence threshold, with the final rule in code.

## Accomplishments
- A complete authorize → verify → capture/void loop on PayPal sandbox.
- Live, visible defence against prompt injection in a payments flow.


## What we learned
PayPal's authorization model is a natural fit for agent-driven commerce: agents can agree on a price quickly, while the money waits for proof.

## What's next
Seller onboarding with PayPal multiparty, shipping-tracking signals alongside photos, PayPal dispute evidence generated from the audit trail, and WhatsApp agents for sellers who live on their phones.

## Built with
paypal, paypal-orders-api, paypal-javascript-sdk, groq, llama, qwen, google-gemini, anthropic-claude, node.js, javascript, html, css, render
