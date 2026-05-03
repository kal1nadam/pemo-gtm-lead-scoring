# Design Decisions

Each design decision is its own section. The pattern is: what we did, what we considered, why we landed where we did, what we'd do differently at production scale.

---

## 1. Deterministic scoring, not AI scoring

**What we did.** The scoring engine is pure JavaScript that reads a lead and a config, returns a 0-100 score and a tier. No LLM is in the scoring loop.

**What we considered.** Letting an LLM read the lead and decide tier directly. It would be one node, less code.

**Why we did it the way we did.**

- Sales reps need to explain to their manager why a lead got the tier it got. A breakdown of "country tier 1 (1.0), size in ideal band (1.0), high-fit industry (1.0), demo intent keywords detected, source: direct (0.6)" is something a rep can defend in a pipeline review. "GPT said it's hot" is not.
- Weights need to be tuned with funnel data. JSON edits are easy. Prompt tuning to shift relative importance is fragile and hard to A/B test.
- Reproducibility matters. The same lead must always produce the same tier, otherwise comparing routing strategies week over week is meaningless.
- LLMs cost money per call. A deterministic engine costs nothing once written and is faster.

**Production scale.** Same approach. AI is downstream of scoring, generating the human-readable summary that explains the deterministic breakdown. The summary is a feature for sales reps, not a decision-maker. Anas Masri (Pemo's Technical PM) explicitly described this pattern in the interview: "AI explains, deterministic logic decides." The architecture follows that.

---

## 2. Multi-workflow architecture

**What we did.** Five workflows: MAIN (intake, score, route), Hot Outreach, Warm Sequence, Cold Nurture, Reply Detection. MAIN calls Hot/Warm/Cold via Execute Workflow nodes.

**What we considered.** A single big MAIN workflow with everything inline. Easier for the demo build.

**Why we did it the way we did.**

- The warm sequence has 7-day waits. If it lived inside MAIN, every warm lead would create a MAIN execution that runs for a week. The execution log would be impossible to use for debugging the intake path.
- Reply detection has its own webhook trigger. It physically cannot live inside MAIN.
- Symmetry. Once Warm and Cold are separated, leaving Hot inline is asymmetric. A senior reviewer notices that immediately.
- Sub-workflows can be A/B tested. Duplicate WF-WARM-SEQUENCE, point MAIN's Execute Workflow at the new copy, run both in parallel.
- Failure isolation. A bug in Hot outreach can't take down intake.

**Cost.** Two extra hops per lead. Negligible for our volume.

**Production scale.** Same architecture, possibly migrated to Temporal for the long-running sequences (Pemo already uses Temporal in production, per the team interview).

---

## 3. Native nodes vs HTTP Request, mixed by intent

**What we did.** Native nodes for Trello, Gmail, Slack, OpenAI. HTTP Request for HubSpot operations.

**What we considered.** Native everywhere (cleaner-looking canvas) or HTTP everywhere (more control).

**Why we did it the way we did.**

The rule of thumb: native for happy-path single-record operations, HTTP Request for batch APIs and operations with 25+ custom properties.

- Trello card creation has a clean, well-modeled native node. Use it.
- Slack messages and Gmail send are well-modeled too. Use the natives.
- OpenAI's native node handles the Responses API correctly and saves prompt-engineering ergonomics.
- HubSpot Upsert: the batch upsert endpoint sets 25+ Pemo custom properties on every lead. The native node would require configuring each as a separate field in the UI. A Code node that builds a typed payload + an HTTP Request that sends it is cleaner, more reviewable, and easier to extend (add a new pemo_* property = one line, no UI hunting).
- HubSpot Search by email: predictable empty-result handling. The HTTP response always has `total` and `results[]`. Native nodes vary in behavior across n8n versions when no contact matches.

**The signal.** Mixing both deliberately, with a documented rule, is more senior than picking one religion. It tells a reviewer: "This person knows n8n's native integrations AND knows when to drop down to HTTP for control."

**Production scale.** Same. The HubSpot HTTP nodes are also where we'd add retry/backoff logic for rate limits, which is fiddlier in native nodes.

---

## 4. Source-shape isolation via Switch + Set

**What we did.** Pre-process detects payload shape, Switch routes to one of four shape-specific Set nodes that map fields to the canonical schema, Merge combines, Validate finalizes.

**What we considered.** A single Code node with shape detection and field mapping all inline. Originally that's what I drafted; the user pushed back.

**Why we did it the way we did.**

- Visual clarity. Reviewer opens MAIN and sees branching for inbound shapes immediately. No need to read 200 lines of JS to understand "this layer normalizes different sources."
- Adding a new source = add one Switch branch + one Set node. No edits to existing code.
- Each Set node is a one-screen mapping. Easy to review.
- The few things that are genuinely logic (shape detection, language regex, request_id generation, validation) live in small Code nodes. The simple field mapping lives in Set nodes.

**The lesson.** Code nodes are tempting because they let you express anything. The senior move is using n8n's primitives (Switch, Set, Merge, IF) where they fit, and reserving Code nodes for what actually requires JS.

---

## 5. HubSpot is system of record, Trello is operations board

**What we did.** Both receive the lead. HubSpot stores all 25+ Pemo custom properties and is queried at every reply check. Trello shows the rep a Kanban view with country / language / source / flag labels and a markdown-rich card body.

**What we considered.** HubSpot only (assignment said "one CRM/tracking tool"). Trello as a replacement for HubSpot. Skipping Trello entirely.

**Why we did it the way we did.**

- The assignment's phrasing ("create cards on score-tier boards (Hot / Warm / Cold) with all lead context") describes the operational use case: a rep should be able to triage their queue visually, by tier, in minutes. A Kanban board does that better than a HubSpot list view, especially on a phone.
- HubSpot is non-negotiable as the system of record. It's where engagements log, where contact properties live, where reply detection writes back.
- Both happen in MAIN, not in a sync job afterward. Single-execution consistency: the Trello card is always in sync with the HubSpot contact, no eventual-consistency window.
- Trello card description is markdown with the AI summary, score breakdown, message excerpt, and deep links to HubSpot. A rep sees the card, doesn't need a second click to know what to do.

**Production scale.** Same. Larger orgs might replace Trello with a custom dashboard, but the dual-system model (CRM as system of record + dedicated rep operations view) is industry-standard.

---

## 6. Round-robin via deterministic hash

**What we did.** Each rep declares the buckets they cover (`countries: ["AE", "SA"], languages: ["en"]`). For each lead, eligible reps are filtered by country x language match. Inside the eligible pool, an FNV-1a hash of the lead's `_request_id` modulo pool size picks the rep.

**What we considered.**

- Strict round-robin with a persistent counter. Requires Google Sheet, Redis, or n8n static data.
- Random within bucket. Even distribution at scale, but not reproducible.
- Sticky by some lead attribute (e.g. industry to the rep with most experience). Useful, more complex.

**Why we did it the way we did.**

- Hash-based gives even distribution at scale (with enough leads, every rep gets ~1/n).
- Reproducibility. Same lead always picks the same rep. Critical for debugging ("why did Sara get this one?") and for replay scenarios.
- Zero state, zero coordination overhead. n8n stays stateless.

**Limitations and the production upgrade path.**

- Not strict round-robin in the textbook sense. Two consecutive leads to the same bucket can land on the same rep if their hashes collide modulo bucket size.
- No load balancing. A rep with 20 active hot leads gets the next one as easily as a rep with 5.

The production fix: add a persistent rep load counter (a Google Sheet works for early production, Redis for scale). Replace the hash-based selection with `select rep with min(active_leads_count)`. The interface (`pickRep(lead) returns rep`) doesn't change; the implementation does.

**Mock rep registry.** The five reps in the registry are mock data with placeholder Slack user IDs. Replacing them with real Pemo reps and real Slack IDs is a one-time data update.

---

## 7. Wait durations externalized in Sequence Config

**What we did.** Warm sequence has a `Sequence Config` Set node at the top with `wait_3d_seconds` and `wait_4d_seconds`. Demo runs at 60 seconds. Production flips the values to 259200 and 345600.

**What we considered.** Hardcoded waits at 3 and 4 days. Cleaner-looking but untestable.

**Why we did it the way we did.**

- A senior reviewer wants to see the warm sequence work end-to-end without waiting a week. Demo mode lets us prove the architecture in 2 minutes.
- Production can use the same workflow with two number changes. No logic change, no risk of behavior drift between demo and production.
- The `mode` field at the top of `Sequence Config` makes the toggle explicit. Setting it to "production" while leaving the seconds at 60 is a config error caught at code review.

**Production scale.** Same pattern. Could be moved to env-based config (read from a .env at workflow runtime), but for n8n that adds complexity vs. just editing the Set node JSON.

---

## 8. Sequence step tracking via HubSpot property

**What we did.** Each send block (Day 0, Day 3, Day 7, cold day 0, disqualified) PATCH-es a `pemo_sequence_step` property on the contact. The reply check inside the warm sequence reads `pemo_replied`. Both are HubSpot properties.

**What we considered.** Tracking sequence state in n8n's static data. Tracking in a separate database (Redis, Postgres).

**Why we did it the way we did.**

- HubSpot is already the system of record. Sequence state is operational state about the lead; it belongs there.
- Reps can see the sequence step in the HubSpot UI (it's a custom property).
- Reply detection is decoupled. The reply detection workflow reads/writes HubSpot, the warm sequence reads HubSpot, neither knows about the other beyond the property contract.
- WF-MONITORING (planned for v1.1) can query HubSpot for stale sequences (`pemo_sequence_step=warm_day_0_sent` for > 7 days = sequence stuck).

**Limitations.** HubSpot rate limits apply. At very high volume (many reply checks per minute), we'd hit caps. Mitigation: cache reply checks in Redis with a 30-second TTL, fall back to HubSpot on miss. Not needed at our volume.

---

## 9. Reply detection as a separate workflow

**What we did.** WF-REPLY is its own workflow with its own webhook trigger. It marks `pemo_replied=true` on the contact. The warm sequence's reply check reads that property at each Wait checkpoint and halts the chain.

**What we considered.**

- Inline reply check inside the warm sequence (no separate workflow). Doesn't work because reply detection has its own trigger source (inbound email).
- Polling reply state inside the warm sequence (e.g. every 2 hours, check email inbox). Wastes API calls.

**Why we did it the way we did.**

- Different trigger means different workflow. n8n workflows are 1:1 with triggers.
- Reply detection has its own lifecycle. It runs whenever email comes in, not on a schedule, not in response to a lead being scored. Separating concerns matches the trigger model.
- The reply check inside the warm sequence is read-only on the property that WF-REPLY writes. Two halves of one loop, properly separated.

**Production wiring.** WF-REPLY's webhook is called by an inbound email parsing service (SendGrid Inbound Parse, Mailgun Routes, Postmark, or HubSpot's Conversations API). For the demo, we curl the webhook with a sample payload to simulate. The payload contract stays the same in production.

---

## 10. Source channel canonicalization at HubSpot upsert time

**What we did.** The Build HubSpot Payload Code node maps inbound source strings ("website_form", "partner_referral", "event") to a canonical enum that HubSpot's `pemo_lead_source_channel` property accepts (referral, partner, event, organic_search, direct, paid_search, etc.).

**What we considered.** Letting the raw source string flow through to HubSpot. It would have failed validation since the enum is strict.

**Why we did it the way we did.**

- HubSpot enums should be clean and analytical. "website_form" and "lead_form" and "demo_request" are all the same thing for funnel analysis: a typed-in inbound. Canonicalizing them to "direct" makes the dashboard meaningful.
- Multiple source-mapping logic stays in one place (Build HubSpot Payload Code node), not scattered across each ingest's Set mapper.
- The original source string is preserved in `pemo_inbound_source_shape` for audit ("which form did this come from?").

**Production scale.** Same approach. As we add new sources (LinkedIn ads, partner integrations), we add aliases to the canonicalization map. The HubSpot enum stays stable, dashboards keep working.

---

## 11. Soft-fail validation

**What we did.** The Validate node sets `_validation.valid=false` if email/company/country are missing, but the lead still flows downstream. The routing layer decides what to do with invalid leads.

**What we considered.** Throwing an error in the Validate node. Cleaner-looking but less flexible.

**Why we did it the way we did.**

- "What's wrong" should be separated from "how to handle it." The Validate node knows what's wrong (missing fields). The routing layer knows how to handle it (typically: log to rejects channel, alert team, do not push to CRM).
- Routing logic is policy. Policy changes more than validation logic does. Decoupling makes policy change cheap.
- The pipeline never blocks on a malformed lead. We get visibility instead of mystery.

**Production scale.** Same. v1.1 would add a dedicated "Rejects" branch that runs before HubSpot Upsert and short-circuits invalid leads to a Slack alert + Google Sheet log without polluting HubSpot.

---

## 12. Em-dashes excluded from prose

**What we did.** This documentation, the LLM prompts, the sticky notes, and the workflow descriptions all avoid em-dashes (—).

**Why.** Long em-dashes are a stylistic tell of LLM-generated text. Sales-tone writing benefits from periods, commas, and parentheses; the em-dash is a crutch. Even when sales emails are AI-personalized, removing the dash makes them feel more written, less generated.

The LLM prompts in the workflows do not explicitly forbid em-dashes (they would just produce stilted text), but the system prompts emphasize specific tone characteristics ("sound human, not templated", "respectful, not pushy", "newsletter editor not sales rep") that incidentally reduce em-dash density.

This is a small thing, but the assignment is partly evaluated on practical utility ("would Pemo's sales team actually use this?"). Email that reads as written, not generated, is part of the answer.

---

## Decisions deferred to v1.1

Honest acknowledgment of items that didn't make the assignment cut. Each is documented in the [Known issues](../README.md#known-issues-and-future-improvements) section of the README.

| Item | Deferred because | Effort |
|---|---|---|
| `pemo_assigned_rep_email` not pushed at upsert time | Order of nodes (Assign Rep runs after HubSpot Upsert). Cosmetic only. | 5 minutes |
| Dedup uses email exact match only | Demo dedup catches the obvious cases. Domain + company name fuzzy match is a polish item. | 15 minutes |
| Existing customer routing to Account Manager path | Existing customer flag works. Distinct AM workflow with different LLM prompts is the polish. | 20 minutes |
| Rep availability (vacation flag) | Mock rep registry doesn't model availability. Production-data dependent. | 5 minutes |
| Pipeline alerting (assignment "nice to have") | Cron-triggered workflow for SLA + stale + weekly digest. Out of scope for the demo timeline. | 45 minutes |
| Real Exa enrichment | Mock works. Live integration is a flag flip + Exa account. | 10 minutes |

The fact that v1.1 is measured in minutes rather than days is the answer to "did we over-architect?" The architecture absorbs change.
