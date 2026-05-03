# Architecture

This document covers the system design end to end: components, data flow, multi-workflow rationale, scoring engine internals, and the production migration path.

For decision-by-decision rationale, see [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md). For the scenario walkthroughs, see [`SCENARIOS.md`](SCENARIOS.md).

---

## High-level diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              INBOUND SOURCES                                    │
│   Website form  ·  Partner referral  ·  Event registration  ·  Generic API     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼  POST /webhook/lead-intake
┌─────────────────────────────────────────────────────────────────────────────────┐
│  WF-MAIN  (Pemo: Lead Intake & Routing)                                         │
│                                                                                 │
│  Webhook → Pre-process → Switch on shape → 4 Set mappers → Merge → Validate     │
│         → HubSpot Search (dedup) → Dedup Check → Enrich Lead                    │
│         → Score Lead (bundled engine) → AI Qualify Summary → Attach Summary     │
│         → Build HubSpot Payload → HubSpot Upsert → Process HubSpot Response     │
│         → Build Trello Card → Trello Create Card → Assign Rep                   │
│         → Switch by Tier ──┬── 🔥 Hot   → Execute Workflow ──┐                  │
│                            ├── ☀️ Warm  → Execute Workflow ──┤                  │
│                            └── ❄️ Cold  → Execute Workflow ──┤                  │
└────────────────────────────────────────────────────────────────┼────────────────┘
                                                                 │
                ┌────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────┐  ┌──────────────────────────────┐  ┌────────────────────┐
│ WF-HOT-OUTREACH         │  │ WF-WARM-SEQUENCE             │  │ WF-COLD-NURTURE    │
│                         │  │                              │  │                    │
│ AI email → Gmail send   │  │ Day 0 send → Wait 3d         │  │ IF disqualified?   │
│  → Slack #leads-hot     │  │   → Reply check → IF replied │  │  → Slack notice    │
│  → HubSpot log engagement│ │     → Day 3 send → Wait 4d   │  │  Else:             │
│                         │  │       → Reply check → IF     │  │   AI educ email    │
│                         │  │         → Day 7 send         │  │    → Gmail send    │
│                         │  │           → Slack digest     │  │    → HubSpot log   │
│                         │  │                              │  │    → Slack digest  │
└─────────────────────────┘  └──────────────────────────────┘  └────────────────────┘

                                                                ▲
                                                                │
                                                   Reads pemo_replied
                                                       │
                                                       │
┌────────────────────────────────────────────────────┐ │
│  WF-REPLY (Pemo: Reply Detection)                  │ │
│                                                    │ │
│  Webhook → Validate Reply                          │ │
│   → IF valid → HubSpot Search → IF found           │ │
│       → HubSpot PATCH (pemo_replied=true) ─────────┘
│         → Slack notify rep                         │
└────────────────────────────────────────────────────┘
```

External systems involved at runtime: HubSpot CRM, Trello, Slack workspace, Gmail, OpenAI API. All credentials are stored in n8n's credential vault, never in workflow JSON.

---

## Per-workflow component map

### WF-MAIN: `Pemo: Lead Intake & Routing`

The synchronous core. Everything from inbound webhook to fan-out runs in one execution, typically completing in 3 to 6 seconds depending on LLM latency.

| Block | Nodes | Purpose |
|---|---|---|
| Normalization | Webhook → Pre-process → Switch on shape → 4 Set nodes → Merge → Validate | Convert any inbound shape into a canonical lead schema. Adding a new source = add a Switch branch + Set node. |
| Hydration | HubSpot Search → Dedup Check → Enrich Lead | Look up existing customer match, fill in missing industry / website / tech stack. |
| Decision | Score Lead → AI Qualify Summary → Attach Summary | Deterministic 0-100 score, then LLM-generated 2-3 sentence explanation. |
| Fan-out | Build HubSpot Payload → HubSpot Upsert → Process HubSpot Response → Build Trello Card → Trello Create Card | Push to system of record (HubSpot) and visual ops board (Trello) in sequence. Trello card carries deep link to HubSpot for deep dives. |
| Routing | Assign Rep → Switch by Tier → 3 Execute Workflow nodes | Round-robin within geo x language bucket, then call the appropriate sub-workflow. |

### WF-HOT-OUTREACH: `Pemo: Hot Outreach`

Triggered by Execute Workflow from MAIN's `🔥 Hot` output.

```
Sub-flow Trigger
  → Build Email Context (gathers country-specific value props)
  → AI: Generate Hot Email (OpenAI, JSON output: subject + body)
  → Parse Email (defensive JSON parse with markdown-fence stripping)
  → Gmail: Send Hot Email
  → Slack: Alert Rep (#leads-hot)
  → HubSpot: Log Engagement (creates email engagement on contact timeline)
```

No Wait nodes. Hot leads are time-sensitive; the whole branch completes in seconds.

### WF-WARM-SEQUENCE: `Pemo: Warm Sequence (Day 0 / 3 / 7)`

Triggered when 50 <= score <= 79.

```
Sub-flow Trigger
  → Sequence Config (parameterized waits, demo 60s vs production 259200s/345600s)
  → Day 0 send block:  AI Day 0 → Parse → Gmail → HubSpot Log → HubSpot Mark step
  → Wait 3d
  → Reply Check (HubSpot GET, properties=pemo_replied,...)
  → IF replied:
       true:  Slack stop (D0→D3), end
       false: Day 3 send block (AI Day 3 has different prompt: industry use case, clearer CTA)
              → Wait 4d
              → Reply Check
              → IF replied:
                   true:  Slack stop (D3→D7), end
                   false: Day 7 send block (final-touch prompt, gentle close-loop)
                          → HubSpot Mark sequence completed
                          → Slack digest
```

Each Day's LLM prompt is distinct and tuned for the moment in the relationship: Day 0 is warm intro with soft CTA, Day 3 is value follow-up with industry use case and clearer CTA, Day 7 is respectful close-loop with an opt-out signal.

### WF-COLD-NURTURE: `Pemo: Cold Nurture`

Triggered when score < 50.

```
Sub-flow Trigger
  → IF disqualified?
       true:  Slack: Disqualified Notice (no email sent)
              → HubSpot: Mark Disqualified
              → end
       false: AI: Educational Email (newsletter editor tone, no demo CTA)
              → Parse Cold Email
              → Gmail: Send Cold Email
              → HubSpot: Log Cold Email
              → HubSpot: Mark Cold Sent
              → Slack: Cold Logged (#leads-digest)
```

Single-step nurture by design (rationale in DESIGN_DECISIONS).

### WF-REPLY: `Pemo: Reply Detection`

Triggered by its own webhook (`/webhook/lead-reply`), independent of MAIN.

```
Reply Webhook
  → Validate Reply (must include sender email)
  → IF _valid:
       true:  HubSpot Search (find contact by email)
              → IF total > 0:
                   true:  HubSpot PATCH (pemo_replied=true, pemo_replied_at=now, pemo_sequence_step=reply_received)
                          → Slack: Notify Rep (#leads-alerts) with reply excerpt
                   false: Slack: Unknown Sender (#leads-alerts), manual review
       false: Slack: Invalid Payload (#leads-alerts)
```

The reply check inside Warm Sequence reads `pemo_replied`. Once Reply Detection sets it, the next Wait+Check in the warm flow halts the chain.

---

## Data flow: end-to-end trace of one lead

Tracing a single hot lead from webhook to Gmail send. All systems involved get a slice of the lead, with metadata so we can stitch it back together.

```
Inbound webhook payload (varies by source shape)
   │
   ▼
Canonical lead (after Normalize block)
   │  fields: company_name, contact_name, email, phone, country,
   │          company_size, source, raw_message, language, form_intent,
   │          visit_count, industry, website, tech_stack, submitted_at,
   │          _request_id, _source_shape, _ingested_at, _schema_version
   ▼
After Dedup
   │  + existing_customer, hubspot_contact_id (null if new), _dedup
   ▼
After Enrichment
   │  + filled industry / website / tech_stack (mock or Exa)
   │  + _enrichment metadata (mode, matched_on, fields_filled)
   ▼
After Score Lead
   │  + scoring: { total, tier, breakdown, confidence, disqualified,
   │              score_version, scored_at, rationale_summary }
   ▼
After AI Qualify Summary
   │  + qualification_summary (LLM-generated, 2-3 sentences)
   │  + _ai metadata (model, generated_at)
   ▼
After HubSpot Upsert
   │  + _hubspot: { contact_id, contact_url, created, status, synced_at }
   ▼
After Trello Create Card
   │  + _trello_card: { id, url, shortUrl, idList, idBoard }
   │  + _trello_target: { tier, board_id, list_id, labels_applied }
   ▼
After Assign Rep
   │  + _assignment: { rep_email, rep_name, rep_slack, bucket_reason, assigned_at }
   ▼
At Switch by Tier: lead routed to one of three sub-workflows
   ▼
In WF-HOT-OUTREACH: payload reaches Gmail node and Slack node
   The lead's full enriched + scored + assigned record is the source of truth
   for the LLM prompt context, the Slack message text, and the HubSpot
   engagement log.
```

Throughout, `_request_id` is the join key. Search HubSpot by it to find the contact. Search n8n executions by it to find the workflow run. Search Slack channels by it (in the future) to find related alerts.

---

## Why multi-workflow

The original draft of MAIN had Hot, Warm, and Cold inline. We refactored to four sub-workflows. Reasons:

1. **Symmetry signals seniority.** With Warm and Cold separated, leaving Hot inline created asymmetric architecture. A reviewer scanning the canvas would see: "Warm calls a sub-workflow, Cold calls a sub-workflow, Hot is inline... why?" The asymmetry alone is a smell. With Hot also separated, all three branches are uniform.

2. **MAIN focuses on intake.** With outreach extracted, MAIN's job is clear: receive, normalize, enrich, score, decide, fan out. It is the sales pipeline equivalent of a router, and routers should be small.

3. **Independent scaling and replacement.** If we need to A/B test a new warm sequence, we duplicate WF-WARM-SEQUENCE, point MAIN's Execute Workflow at the new copy, and run both in parallel for measurement. Inline branches don't allow that.

4. **Execution log clarity.** A 7-day warm sequence is a single n8n execution. With sub-workflows, that execution lives in WF-WARM-SEQUENCE, not in MAIN's history. MAIN's execution log stays clean (one execution per lead, completed in seconds), warm's log shows just the sequence runs.

5. **Failure isolation.** A bug in Hot outreach can't take down the intake path. Sub-workflows fail in isolation; MAIN's downstream is the dispatch only.

The cost is two extra hops per lead (MAIN → sub, sub → HubSpot/etc.). Negligible for our volume.

---

## Scoring engine internals

Module structure:

```
scoring-engine/
├── score.js              orchestrator, validates input, calls each component, computes total + tier
├── config.json           weights, ICP, intent keywords, source weights, engagement bands, tech stack signals
├── lib/
│   ├── firmographic.js   country tier (50%), company size band (30%), industry fit (20%) → weighted by 35
│   ├── intent.js         keyword tier matching, demo signal, explicit form intent, negative signal disqualification → weighted by 30
│   ├── source.js         normalize source string to canonical channel, look up weight in config → weighted by 20
│   ├── engagement.js     time-decay on submission timestamp (60%) + repeat visit count (40%) → weighted by 15
│   └── confidence.js     ratio of present fields across required / important / enrichment buckets
├── test-leads.json       12 test cases, each with expected_tier
├── run-tests.js          runs every case through score(), prints results, exits non-zero on failures
├── build-bundle.js       concatenates lib + score + config into bundle-for-n8n.js
├── verify-bundle.js      proves bundle output equals modular output across all 12 test cases
└── bundle-for-n8n.js     auto-generated, pasted into n8n's Score Lead Code node
```

### Output structure

```javascript
score(lead, config, now) returns:

{
  total: 86.6,                       // 0..100, clamped
  tier: "hot",                       // "hot" | "warm" | "cold"
  breakdown: {
    firmographic: { raw: 1.0, weighted: 35, max: 35, signals: [...] },
    intent:        { raw: 1.0, weighted: 30, max: 30, signals: [...] },
    source_quality:{ raw: 0.6, weighted: 12, max: 20, signals: [...] },
    engagement:    { raw: 0.94, weighted: 14.1, max: 15, signals: [...] }
  },
  confidence: {
    score: 1.0,
    missing_fields: [],
    breakdown: { required: "3/3", important: "3/3", enrichment: "3/3" }
  },
  disqualified: false,
  score_version: "1.0.0",
  scored_at: "2026-05-04T...",
  rationale_summary: "HOT (86.6/100) | strongest: firmographic (35/35) | weakest: source_quality (12/20)"
}
```

The `signals` array on each component is the rep-friendly explanation source. The LLM that generates the qualification summary reads these and assembles them into prose.

### Disqualification override

Negative intent signals ("remove me", "not interested", "unsubscribe") are detected in the intent component. When found, the engine:

1. Sets `intent.weighted = 0` regardless of other signals.
2. Sets `disqualified = true` on the output.
3. Caps `total` at 10 (well below the 50 Cold threshold).

This guarantees that disqualified leads always reach Cold tier and trigger the disqualified branch in WF-COLD-NURTURE (no email sent).

### Configurability

Every weight, threshold, and signal list lives in `config.json`. Re-tuning the engine after analyzing funnel conversion data is a JSON edit, not a code change. The `score_version` field stamps each output with the config version, so historical scores remain interpretable when weights change.

---

## Production migration path

The pieces of this system that would change first as Pemo scales beyond demo volume:

1. **Self-hosted n8n.** Cloud trial works for the assignment. Production should self-host (Pemo runs Temporal already, per the team interview, so Kubernetes is in place). Self-hosted n8n supports queue mode for horizontal scaling.

2. **Move scoring engine to a Node service.** The scoring engine has zero n8n dependencies. When request volume justifies it, deploy `scoring-engine/` as an HTTP service (e.g. on Pemo's existing Node infra), have n8n call it via HTTP Request. This separates orchestration from logic.

3. **Replace mock enrichment with Exa or Clearbit.** A single env flag swap. Cache by `email_domain` to amortize cost.

4. **Replace deterministic-hash round-robin with persistent counter.** Either a Google Sheet (simple, slow) or a Redis counter (fast, requires infra). The interface (`pickRep(lead)`) doesn't change.

5. **Real reply detection wiring.** Replace the manual curl with one of: SendGrid Inbound Parse, Mailgun Routes, Postmark Inbound, HubSpot Conversations API, or Gmail watch + Pub/Sub. The webhook contract stays the same.

6. **Add observability dashboard.** Per-tier throughput, per-rep load, per-source funnel conversion. n8n's built-in execution log is adequate for individual runs; for trends we'd ship lead state to BigQuery or PostHog and dashboard from there.

7. **Migrate orchestration to Temporal.** Pemo's existing platform. Temporal handles long-running workflows (the warm sequence's 7-day wait) more robustly than n8n at scale, with stronger retries, durability, and replay. The MAIN workflow logic ports cleanly because the scoring engine is pure JavaScript.

These are migration items, not redo items. Nothing in the current architecture has to be unwound to get there.
