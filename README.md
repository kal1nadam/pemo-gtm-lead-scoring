# Pemo GTM Lead Scoring & Routing

An end-to-end automation system that captures inbound leads from heterogeneous sources, enriches them, scores them with a deterministic engine, generates AI-personalized outreach, and routes them through tier-appropriate sequences. Built for the Pemo (Dubai-based fintech) AI Automation Engineer GTM technical assignment.

The brief asked for a working system, not a slide deck. Every integration in this repo is real: n8n Cloud orchestration, HubSpot CRM with 25+ custom Pemo properties, Trello tier boards with labels and lists, Slack alerts, Gmail send, OpenAI for AI summaries and email personalization (English + Arabic).

---

## Table of contents

- [What it does](#what-it-does)
- [Repo layout](#repo-layout)
- [How to run](#how-to-run)
- [Scoring engine](#scoring-engine)
- [The five workflows](#the-five-workflows)
- [Approach and key design decisions](#approach-and-key-design-decisions)
- [Edge case handling](#edge-case-handling)
- [Scaling to 10x lead volume](#scaling-to-10x-lead-volume)
- [Sample scenarios](#sample-scenarios)
- [Known issues and future improvements](#known-issues-and-future-improvements)

---

## What it does

A lead lands on a webhook (website form, partner referral, event registration, or any flat shape). The system:

1. **Normalizes** the payload into a canonical lead schema regardless of source shape.
2. **Detects language** (English or Arabic) from the inbound message.
3. **Deduplicates** against HubSpot by email.
4. **Enriches** the lead with industry, website, and tech-stack signals (mock by default, swap-in for Exa via env flag).
5. **Scores** the lead deterministically across four components (firmographic, intent, source quality, engagement) and assigns a tier (Hot / Warm / Cold).
6. **Generates** an AI qualification summary explaining the score in plain language.
7. **Pushes** the enriched, scored lead to HubSpot (single batch upsert with all custom properties).
8. **Creates** a Trello card on the tier-appropriate board with full context, labels for country / language / source / flags.
9. **Assigns** a sales rep via round-robin within a geography x language bucket.
10. **Routes** the lead to a tier-appropriate outreach workflow:
    - Hot: immediate Slack alert, AI-personalized email with Calendly link, sent via Gmail, logged as HubSpot engagement.
    - Warm: 3-step nurture sequence (Day 0 / Day 3 / Day 7) with reply checks before each step.
    - Cold: single educational email, or no email at all if disqualified (negative intent signals like "remove me, not interested").
11. **Detects replies** via a separate webhook workflow that updates HubSpot (`pemo_replied=true`) and notifies the rep on Slack. Active sequences halt on the next reply check.

The whole pipeline produces auditable, actionable lead state in HubSpot and Trello within seconds of the inbound webhook firing.

---

## Repo layout

```
pemo-gtm-lead-scoring/
├── README.md                          (this file, the primary documentation)
├── .env.example                       (env template, real .env is gitignored)
├── scoring-engine/
│   ├── README.md                      (engine internals, weights rationale)
│   ├── score.js                       (pure-function entry point)
│   ├── config.json                    (weights, ICP definition, all tunables)
│   ├── lib/
│   │   ├── firmographic.js
│   │   ├── intent.js
│   │   ├── source.js
│   │   ├── engagement.js
│   │   └── confidence.js
│   ├── test-leads.json                (12 test cases covering all tiers and edges)
│   ├── run-tests.js                   (eval harness, all 12 currently passing)
│   ├── build-bundle.js                (concatenates modular code into n8n-ready bundle)
│   ├── verify-bundle.js               (verifies bundle output matches modular engine)
│   └── bundle-for-n8n.js              (auto-generated, pasted into n8n Code node)
├── hubspot-setup/
│   ├── properties.json                (25+ custom Pemo property definitions)
│   ├── setup.js                       (idempotent provisioner, uses .env)
│   └── README.md
├── trello-setup/
│   ├── structure.json                 (lists + labels per tier board)
│   ├── setup.js                       (idempotent list/label provisioner)
│   ├── resolve-ids.js                 (one-shot ID discovery, writes resolved-ids.json)
│   ├── resolved-ids.json              (snapshot of board / list / label IDs)
│   └── README.md
├── workflows/
│   ├── wf-main-lead-intake.json       (intake, score, fan-out)
│   ├── wf-hot-outreach.json           (instant Slack + Gmail + Calendly)
│   ├── wf-warm-sequence.json          (Day 0 / 3 / 7 with reply checks)
│   ├── wf-cold-nurture.json           (single educational email or skip if disqualified)
│   ├── wf-reply-detection.json        (webhook, marks replied, halts sequences)
│   └── snippets/                      (clean expression snippets for paste)
├── samples/
│   ├── payload-website-form.json
│   ├── payload-partner-referral-arabic.json
│   ├── payload-event-registration.json
│   ├── payload-generic-flat.json
│   ├── payload-cold-out-of-market.json
│   ├── payload-cold-disqualified.json
│   └── payload-reply.json
└── docs/
    ├── ARCHITECTURE.md                (system design, data flow, multi-workflow rationale)
    ├── DESIGN_DECISIONS.md            (every meaningful choice with rationale)
    ├── SCENARIOS.md                   (3 required scenarios walked through with screenshots)
    └── screenshots/
        ├── workflows/                 (canvas screenshots of each workflow)
        ├── main-detail/               (zoom-ins on key MAIN blocks)
        ├── system/                    (HubSpot, Trello, Slack, Gmail, eval tests)
        └── scenarios/
            ├── 1-uae-hot/
            ├── 2-ksa-arabic-warm/
            └── 3-reply-detection/
```

---

## How to run

### Prerequisites

- Node.js 18+ (for the scoring engine, build script, setup scripts)
- n8n Cloud account (or self-hosted)
- HubSpot account (free tier is enough)
- Trello account (free)
- Slack workspace with a Bot user
- OpenAI API key
- Gmail account (for outbound email send)

### Setup

```bash
git clone <repo>
cd pemo-gtm-lead-scoring
cp .env.example .env
# Fill in the values in .env (HubSpot token, Trello key+token, Slack bot token, OpenAI key, etc.)

# Provision HubSpot custom properties (idempotent, safe to re-run)
node hubspot-setup/setup.js

# Provision Trello lists + labels on Hot/Warm/Cold boards (idempotent)
node trello-setup/setup.js

# Resolve Trello list and label IDs into resolved-ids.json (used by MAIN workflow)
node trello-setup/resolve-ids.js

# Verify the scoring engine
node scoring-engine/run-tests.js
# Expected: Total: 12   Passed: 12   Failed: 0

# Build (or rebuild) the n8n bundle from modular code
node scoring-engine/build-bundle.js
# Optional: confirm bundle matches modular engine on every test case
node scoring-engine/verify-bundle.js
```

### Import workflows into n8n

For each file in `workflows/`:

1. n8n: New Workflow, then ⋯ menu, then Import from File.
2. After import, click each node showing a credential warning and select the matching credential by name.
3. Save.

### Wire up

The MAIN workflow's three Switch outputs (`🔥 Hot`, `☀️ Warm`, `❄️ Cold`) each call an `Execute Workflow` node pointing to the corresponding sub-workflow. After importing, double-check those references are pointing at the right workflow IDs in your account.

### Test

```bash
# Hot lead (UAE, demo request, perfect ICP)
curl -X POST <YOUR_N8N_TEST_URL>/webhook-test/lead-intake \
  -H "Content-Type: application/json" \
  -d @samples/payload-website-form.json

# Warm lead (Saudi, Arabic, partner referral)
curl -X POST <YOUR_N8N_TEST_URL>/webhook-test/lead-intake \
  -H "Content-Type: application/json" \
  -d @samples/payload-partner-referral-arabic.json

# Reply detection (after the hot lead above, simulate a reply)
curl -X POST <YOUR_N8N_TEST_URL>/webhook-test/lead-reply \
  -H "Content-Type: application/json" \
  -d @samples/payload-reply.json
```

See [`docs/SCENARIOS.md`](docs/SCENARIOS.md) for a step-by-step walkthrough with screenshots.

---

## Scoring engine

The scoring engine is the centerpiece of the assignment, and the centerpiece of this codebase. It lives in `scoring-engine/` as a pure-function JavaScript module with zero runtime dependencies, designed to be:

- **Deterministic**: same input always produces the same output. No LLM in the scoring loop.
- **Configurable**: every weight, ICP threshold, and signal lives in `config.json`. Retuning is a config change, not a code change.
- **Auditable**: every score returns a per-component breakdown with the human-readable signals that contributed.
- **Testable**: 12 test cases in `test-leads.json` cover each tier, edge cases, and the disqualification path. The eval harness (`run-tests.js`) prints results and exits non-zero if any tier doesn't match expectation.
- **Versioned**: the engine stamps `score_version` on every output. When weights change, historical scores remain interpretable.

### Components and weights

| Component | Default weight | What it evaluates |
|---|---|---|
| Firmographic fit | 35 | Country in ICP (UAE/KSA tier 1, EG tier 2, other GCC tier 3), company size band, industry match |
| Intent | 30 | High/medium/low intent keywords in raw message, demo request flag, explicit form intent |
| Source quality | 20 | Lead source channel weighted by historical conversion proxy (referral 1.0 ... list purchase 0.2) |
| Engagement recency | 15 | Time-decay on submission timestamp + repeat visit count |

Weights sum to 100. Tier thresholds: Hot 80+, Warm 50 to 79, Cold below 50. Negative intent signals (unsubscribe, "not interested") force `disqualified=true` and cap the total at 10, which lands the lead in Cold and routes it through the disqualified branch in WF-COLD-NURTURE (no email sent).

### Why deterministic, not AI scoring

The temptation with an AI engineer brief is to throw an LLM at every decision. We deliberately did not:

- Sales reps and finance auditors need to explain why a lead got the tier it got. A deterministic engine produces a transparent breakdown. An LLM produces a black box.
- Weights need to be tuned by humans based on funnel data. That's straightforward in JSON, painful in prompt engineering.
- Reproducibility matters. The same lead must always produce the same tier, otherwise A/B comparisons of routing strategies are meaningless.

The LLM is used downstream of scoring, not inside it. It generates the human-friendly qualification summary that explains the deterministic breakdown to the rep, and it personalizes outreach content. Scoring decides; AI explains.

### Modular source, n8n bundle

The engine is structured as one module per scoring component (`lib/firmographic.js`, `lib/intent.js`, etc.) plus a thin orchestrator (`score.js`). Tests run against the modular form. n8n Code nodes cannot `require()` local files, so a build script (`build-bundle.js`) concatenates the modular code into a single self-contained file (`bundle-for-n8n.js`) that gets pasted into the n8n Code node. A separate verification script (`verify-bundle.js`) re-runs the test harness against the bundled code to prove the two stay equivalent.

This pattern keeps the engine genuinely modular and unit-tested while satisfying n8n's runtime constraint.

---

## The five workflows

### MAIN: `Pemo: Lead Intake & Routing`

Synchronous part of the pipeline. Runs in seconds per lead.

```
Webhook
  → Pre-process (detect shape, language, generate request_id)
  → Switch on shape
       ├── Map: Website Form
       ├── Map: Partner Referral
       ├── Map: Event
       └── Map: Generic
  → Merge
  → Validate & Finalize
  → HubSpot Search (dedup)
  → Dedup Check (mark existing_customer if matched)
  → Enrich Lead (mock or Exa-ready)
  → Score Lead (bundled scoring engine)
  → AI Qualify Summary (OpenAI)
  → Attach Summary
  → Build HubSpot Payload
  → HubSpot: Upsert Contact (HTTP, batch upsert with 25+ properties)
  → Process HubSpot Response
  → Build Trello Card (selects tier board, country / language / source / flag labels)
  → Trello: Create Card (native node)
  → Assign Rep (round-robin within geo x language bucket)
  → Switch: Route by Tier
       ├── 🔥 Hot  → Execute Workflow (Pemo: Hot Outreach)
       ├── ☀️ Warm → Execute Workflow (Pemo: Warm Sequence)
       └── ❄️ Cold → Execute Workflow (Pemo: Cold Nurture)
```

### `Pemo: Hot Outreach`

Triggered when score >= 80. Instant, no waits.

1. Build email context with country-specific value props
2. AI generates personalized first-touch email (subject + body, language matches the lead)
3. Parse email JSON
4. Gmail sends the email
5. Slack alerts the assigned rep in `#leads-hot` with full lead context and a Calendly booking link
6. HubSpot logs the email as an engagement on the contact timeline

### `Pemo: Warm Sequence (Day 0 / 3 / 7)`

Triggered when 50 <= score <= 79. Time-delayed.

```
Day 0 send (AI, Parse, Gmail, Log, Mark step)
  → Wait 3 days (configurable in seconds for demo, days in production)
  → Reply Check (HubSpot GET, look at pemo_replied)
  → IF replied
       true:  Slack stop notification, end
       false: Day 3 send
                → Wait 4 days
                → Reply Check
                → IF replied
                     true:  Slack stop notification, end
                     false: Day 7 send (final), Slack sequence-complete digest
```

Each Day uses a distinct LLM prompt: Day 0 is warm intro with a soft CTA, Day 3 follows up with industry-specific use case, Day 7 is a respectful close-loop with an easy out.

Wait durations live in a `Sequence Config` Set node at the top. Demo uses 60 seconds. Flip two numbers for production (259200 and 345600 seconds, i.e. 3 and 4 days). One config change, no logic refactor.

### `Pemo: Cold Nurture`

Triggered when score < 50. First branches on disqualified flag.

- Disqualified path (negative intent signals like "remove me"): no email sent. HubSpot updated, Slack notified for audit. Respect the user.
- Otherwise: a single AI-generated educational email (newsletter editor tone, no demo CTA, opt-out included), Gmail sent, HubSpot logged, Slack digest entry posted.

We deliberately do not multi-step cold leads. Multiple emails to a low-intent prospect burn brand more than they generate pipeline. Long-term nurture happens through the newsletter, not through more outbound emails.

### `Pemo: Reply Detection`

Triggered by a separate webhook (`/webhook/lead-reply`). In production this would be wired to inbound email parsing (SendGrid Inbound Parse, Mailgun Routes, Postmark, or HubSpot's native reply tracking). For the demo, we accept a simple JSON payload via curl to simulate a reply.

```
Webhook
  → Validate Reply (must include sender email)
  → IF valid
       true:  HubSpot Search by email
                → IF contact found
                     true:  HubSpot PATCH (pemo_replied=true, pemo_replied_at, pemo_sequence_step=reply_received)
                              → Slack notify rep with reply excerpt
                     false: Slack alert "Reply from unknown sender" for manual review
       false: Slack alert "Invalid reply payload"
```

The reply check inside the Warm Sequence reads `pemo_replied` from HubSpot. Once Reply Detection sets it to true, the next Wait+Check in the sequence stops the chain. Loop closed.

---

## Approach and key design decisions

A condensed summary follows. The full rationale for each decision lives in [`docs/DESIGN_DECISIONS.md`](docs/DESIGN_DECISIONS.md).

1. **Deterministic scoring, AI explanation.** The engine is pure JavaScript, fully tested and configurable. The LLM only generates the human-readable summary that explains the score. This is auditable, reproducible, and stays explainable to non-engineers.

2. **Multi-workflow architecture, not one monolith.** MAIN handles synchronous intake to routing. Hot, Warm, Cold, and Reply Detection are separate workflows. Sub-workflows are called by Execute Workflow nodes from MAIN. This keeps MAIN's execution log focused on intake-stage debugging rather than 7-day-old sequence runs, isolates failure surfaces, and lets each branch evolve independently.

3. **Native nodes vs HTTP request, mixed by intent.** Native Trello, Gmail, Slack, OpenAI nodes are used for happy-path single-record operations (clean abstraction, free updates from n8n maintainers). HTTP Request is used for HubSpot batch upsert (25+ custom properties is cleaner in a Code node that builds a typed payload than in a native node UI) and for HubSpot search by email (predictable empty-result handling). Mixing both is a deliberate signal of pragmatism rather than ideology.

4. **Source-shape isolation via Switch + Set.** The Pre-process node detects the inbound payload shape, then a Switch routes to one of four shape-specific Set nodes that map fields into the canonical schema. Adding a new lead source (e.g. LinkedIn lead form) means adding one branch, not editing 200 lines of normalization code.

5. **HubSpot is system of record, Trello is operations board.** Both receive the lead, but with different purposes: HubSpot stores the full Pemo metadata (25+ custom properties) and is queried at every reply check; Trello shows the rep a Kanban view with country / language / source / flag labels and a markdown-rich card body. Two-system design, intentional.

6. **Configurable wait durations.** Warm sequence delays live in a `Sequence Config` Set node at the top of the warm workflow. Demo uses 60 seconds for testable demos. Production flips two numbers and no logic changes. Same workflow, two modes.

7. **Reply detection as a separate workflow.** Different trigger (webhook), different lifecycle, can scale and be replaced independently. The other half of the loop, the reply check inside Warm Sequence, looks at the HubSpot property that Reply Detection sets.

8. **Soft-fail validation.** Invalid leads (missing email, company, country) flow through with `_validation.valid=false` instead of crashing the workflow. Routing layer can decide what to do with them (typically log to a rejects channel, do not push to CRM). Separating "what's wrong" from "how to handle it" makes policy easier to change.

9. **Round-robin assignment via deterministic hash.** Real round-robin requires a persistent counter (Google Sheet, Redis, n8n static data). For the demo we hash the request_id and modulo into the eligible bucket. Same lead always lands with the same rep (debugging and re-runs are reproducible), distribution at scale is even, and there is no coordination overhead. The production upgrade path is documented.

10. **No em-dashes in prose.** Sales-tone writing benefits from periods and commas; em-dashes are a stylistic tell of AI output. We avoid them in user-facing content and in this documentation.

---

## Edge case handling

| Edge case | Handling |
|---|---|
| Same lead submitted twice in minutes | Dedup search by email at intake. Existing matches update, not create new. |
| Existing customer submits new inquiry | `existing_customer=true` flagged on lead and on Trello card label. (See "Known issues" for the full Account Manager routing improvement still pending.) |
| Missing required fields (email, company, country) | Validate node sets `_validation.valid=false`. Lead still flows but routing layer can quarantine. |
| Arabic input | Language auto-detected from the message body (Unicode block scan). Lead routed only to reps whose language list includes `ar`. LLM prompts force Arabic-only output for `ar` leads, no mixing with English. |
| Enrichment API fails | Continue On Fail set on the enrichment HTTP node. Score runs on what we have, confidence drops, qualification summary mentions the gap. |
| LLM call fails or returns malformed JSON | Parse node has defensive markdown-fence stripping and a try/catch that falls back to a templated subject/body. The pipeline never blocks on LLM failure. |
| Disqualifying intent ("remove me, not interested") | Scoring engine forces `disqualified=true` and caps total at 10. Lead enters Cold workflow, takes the disqualified branch, no email is sent, Slack alert raised for audit. Respect the user. |
| No matching rep in geo x language bucket | Round-robin falls back to a global pool rep with `countries=["*"]`. If even the global pool is empty, lead is marked `unassigned` and an alert fires. |
| Future-dated submission timestamp (clock skew) | Engagement scorer treats it as fresh (0.85) rather than crashing or returning negative durations. |
| Webhook payload malformed | Code node validates and either short-circuits with an error structure (Reply Detection) or treats as Generic shape (MAIN). |
| Reply from address not in HubSpot | Reply Detection routes to the "Unknown Sender" branch with a Slack alert for manual review, no silent drop. |
| HubSpot batch upsert hits an enum that doesn't exist | Source channel is canonicalized in Build HubSpot Payload (`website_form` to `direct`, etc.) before HubSpot sees it. The HubSpot enum stays clean. |

---

## Scaling to 10x lead volume

The current architecture is designed to handle a 10x increase in lead volume without a refactor. The relevant levers:

1. **Decoupled workflows.** MAIN, Hot, Warm, Cold, and Reply Detection are independent. If volume causes MAIN to bottleneck, we scale MAIN workers without touching the others. n8n self-hosted with queue mode does this transparently.

2. **Async fan-out.** MAIN's Execute Workflow calls to Hot/Warm/Cold are asynchronous from MAIN's perspective. MAIN finishes and returns, the sub-workflow runs on its own. This keeps webhook response latency under 100ms regardless of how heavy outreach is.

3. **Batch upsert.** HubSpot Contact Upsert uses the batch endpoint. Today it sends one lead per call. The batch endpoint accepts up to 100 records per call, so the same node can be re-pointed at a buffered queue (e.g. write incoming leads to a Set node in n8n, drain every 30 seconds in batches of 50) without changing the downstream flow.

4. **Enrichment caching.** Today the mock enrichment is in-memory in the workflow. At scale, enrichment results would be cached by `email_domain` (a company's enrichment doesn't change between submissions). 1000 leads per day with average 3 leads per company means 67% cache hit rate, cutting LLM/Exa cost by two-thirds.

5. **LLM cost control.** Qualification summary is cached per lead-version (the `score_version` plus a content hash). If the lead's score doesn't change, the summary doesn't regenerate. For outreach, we already use `gpt-4o-mini` (cheap, fast). Higher volume would justify caching prompts and fine-tuning on Pemo's actual successful sales emails.

6. **Migration path off n8n.** The scoring engine is pure JavaScript with no n8n dependencies. The build script proves it: same code runs in n8n's Code node, in Node.js for tests, and would run unchanged in a Cloudflare Worker, AWS Lambda, or a dedicated Node service. When n8n becomes the bottleneck (typically at 100k+ leads per day), the orchestration layer can move to Temporal (Pemo already uses Temporal in production, per the team interview) while the scoring code stays put.

7. **Observability before scale.** Every scored lead has a `_request_id` in HubSpot, a Trello card linked to the HubSpot contact, and a Slack notification. Every workflow execution logs in n8n. Grepping by `_request_id` across all three systems traces a lead end-to-end. Before adding throughput, we'd add a dashboard that aggregates per-tier throughput, per-rep load, and per-source funnel conversion. Without it, scaling is flying blind.

8. **Idempotency at the webhook layer.** Today the dedup check happens at the Code node level (HubSpot search by email). At higher volume we'd add an idempotency key to the webhook itself (hash of email + content + 5-minute window) to short-circuit duplicate requests before they cost a HubSpot search.

For the assignment scope this is the architecture. For 100x volume, more rework is needed; the points above are the ones I'd actually do first, in priority order.

---

## Sample scenarios

Three end-to-end scenarios are required by the assignment. Each is documented in [`docs/SCENARIOS.md`](docs/SCENARIOS.md) with payloads, expected behavior, and screenshots.

1. **Scenario 1: UAE Hot.** 200-person UAE logistics company submits a demo request. Score 86.6, tier Hot. Result: HubSpot contact created with all Pemo properties, Trello card on Hot board with 4 labels, Slack `#leads-hot` alert, Gmail email sent in seconds.

2. **Scenario 2: Saudi Arabic Warm.** Small Saudi retail company arrives via partner referral with an Arabic-only inbound message. Score 65.7, tier Warm, language detected as `ar`. Result: full warm sequence runs in Arabic (Day 0, 3, 7), no reply received, Slack digest fires "warm sequence completed without reply" at the end.

3. **Scenario 3: Reply Detection.** After Scenario 1, we curl the reply webhook simulating that Ahmed replied. Result: HubSpot updates `pemo_replied=true` and `pemo_replied_at`, Slack `#leads-alerts` posts the reply excerpt with the rep tag, any active sequence (none in this case, hot leads don't have a sequence) would halt at its next reply check.

---

## Known issues and future improvements

Acknowledging gaps is part of the deliverable. These are documented for transparency and would be fixed in a v1.1.

| Item | Current state | v1.1 fix |
|---|---|---|
| `pemo_assigned_rep_email` is not pushed to HubSpot at upsert time | Reason: Assign Rep node runs after HubSpot Upsert. Slack reply notification therefore shows "Assigned rep: unassigned" for hot leads. | Add a small HubSpot PATCH node after Assign Rep that updates `pemo_assigned_rep_email`. ~5 minutes. |
| Dedup matches only on exact email | Assignment hint suggested "email domain + company name". Current logic catches the obvious cases (same person re-submitting) but misses the edge case where one person uses two emails at the same company. | Extend Dedup Check to do a second HubSpot search by company domain + fuzzy company name, merge results. ~15 minutes. |
| Existing customer routing | Current state: `existing_customer=true` is flagged on the lead and on the Trello card. Routing still goes through tier-based outreach. | Add an IF node before Switch on Tier: if `existing_customer=true`, route to a new "Account Manager Path" branch (different rep selection, different LLM prompt that acknowledges the existing relationship). ~20 minutes. |
| Rep availability flag | Round-robin doesn't skip reps marked unavailable (vacation, out of office). | Add `available: true` to the rep registry, filter out before bucket selection. ~5 minutes. |
| Pipeline alerting (assignment "nice to have") | Not yet built. | Cron-triggered workflow: hot leads not contacted in 1 hour, leads stuck in stage > 48 hours, weekly digest by source/country/tier. ~45 minutes. |
| Real Exa integration | Currently mock enrichment based on email domain lookup. | Swap-in is a single env flag (`ENRICHMENT_MODE=exa`) plus uncommented Exa HTTP call. The interface is identical. ~10 minutes once Exa account is set up. |

The fact that these are scoped in minutes rather than days reflects the modular shape of the system. The architecture absorbs change well; what's missing is a few targeted nodes, not a refactor.

---

## License

MIT (the LICENSE file is the GitHub default, but treat the work as yours to inspect and reuse for evaluation purposes).
