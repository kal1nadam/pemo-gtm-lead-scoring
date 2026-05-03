# Scoring Engine

The scoring engine is the centerpiece of the Pemo GTM lead scoring system. It's a pure-function JavaScript module with zero runtime dependencies, designed to be deterministic, configurable, auditable, and testable.

For the system-level context, see the [top-level README](../README.md). For the rationale behind the design, see [`docs/DESIGN_DECISIONS.md`](../docs/DESIGN_DECISIONS.md).

---

## Files

```
scoring-engine/
├── score.js                 entry point, orchestrator
├── config.json              weights, ICP, thresholds, all tunable values
├── lib/
│   ├── firmographic.js      country tier, company size band, industry fit
│   ├── intent.js            keyword tier matching, demo flag, disqualification
│   ├── source.js            source channel canonicalization and weighting
│   ├── engagement.js        time-decay recency + repeat visits
│   └── confidence.js        data-completeness scoring
├── test-leads.json          12 test cases covering all tiers and edges
├── run-tests.js             eval harness, prints results, exits non-zero on fail
├── build-bundle.js          concatenates lib + score + config into bundle-for-n8n.js
├── verify-bundle.js         proves bundle output equals modular output across all 12 cases
└── bundle-for-n8n.js        auto-generated, paste into n8n Code node
```

---

## Public API

```javascript
const { score } = require('./score');
const config = require('./config.json');

const lead = {
  email: 'ahmed@falconlogistics.ae',
  company_name: 'Falcon Logistics LLC',
  country: 'AE',
  company_size: 200,
  industry: 'logistics',
  source: 'referral',
  raw_message: 'Need a demo this quarter...',
  language: 'en',
  visit_count: 4,
  submitted_at: '2026-05-01T08:00:00Z',
  // ... full canonical lead schema
};

const result = score(lead, config);
// {
//   total: 96.9,
//   tier: 'hot',
//   breakdown: { firmographic: {...}, intent: {...}, source_quality: {...}, engagement: {...} },
//   confidence: { score: 1.0, missing_fields: [], breakdown: {...} },
//   disqualified: false,
//   score_version: '1.0.0',
//   scored_at: '2026-05-01T...',
//   rationale_summary: 'HOT (96.9/100) | strongest: ...'
// }
```

The function is pure: same `lead` and `config` always produce the same result. No side effects, no I/O. Easy to test, easy to embed.

The optional third argument `now` (a Date) is exposed so tests can pin time and produce deterministic outputs. Default is `new Date()`.

---

## Components and weights

| Component | Default weight | What it evaluates | Sub-weighting |
|---|---|---|---|
| Firmographic fit | 35 | Country tier (UAE/KSA = tier 1, EG = tier 2, other GCC = tier 3, rest out-of-market), company size band (ideal 20-200, smaller = penalty, larger = different penalty), industry fit (high/medium/low based on a curated list). | country 50%, size 30%, industry 20% (within the 35 total) |
| Intent | 30 | High-intent keywords ("demo", "pricing", "this quarter", "urgent"), medium-intent ("looking for", "exploring"), low-intent ("just curious", "browsing"). Negative signals ("remove me", "not interested") force disqualification. Demo request flag adds +0.2. Explicit form intent ("demo" / "pricing" form selection) adds +0.4. | first matching tier wins, then bonuses |
| Source quality | 20 | Lead source canonicalized to one of 13 channels (referral, partner, event, webinar, content_download, organic_search, direct, social_organic, paid_search, paid_social, cold_outbound, list_purchase, unknown), each with a conversion-proxy weight. | direct lookup |
| Engagement recency | 15 | Time-decay on submission timestamp (fresh < 1h: 1.0, recent < 24h: 0.85, this week < 168h: 0.6, stale < 720h: 0.3, very stale: 0.1) plus repeat visit count (first visit: 0.4, few 2-4: 0.7, engaged 5-9: 0.9, highly engaged 10+: 1.0). | recency 60%, visits 40% |

Total = sum of weighted components. Tier thresholds: Hot >= 80, Warm 50 to 79, Cold < 50.

### Disqualification override

Negative intent signals trigger a hard override:

```
intent.signals contains "negative signal detected: ..."
  → total = min(total, 10)
  → tier = cold
  → output.disqualified = true
```

The downstream cold workflow checks `disqualified=true` and routes to a separate branch that does not send any email. Respect for the "remove me" signal.

---

## Why deterministic, not AI

Three reasons:

1. **Auditability.** Sales reps and finance auditors need to explain why a lead got the tier it got. A breakdown of "country tier-1 (1.0), size in ideal band (1.0), high-fit industry (1.0)" is something a rep can defend in a pipeline review. "GPT said it's hot" is not.

2. **Tunability.** Weights live in JSON, not in prompts. Funnel data drives weight changes. JSON edits are reviewable, prompt-engineering changes are not.

3. **Reproducibility.** The same lead must always produce the same tier. Otherwise A/B comparisons of routing strategies are meaningless.

The LLM is used downstream of scoring, not inside it. The qualification summary explains the deterministic breakdown to the rep in plain language.

---

## Running tests

```bash
node scoring-engine/run-tests.js
```

Expected:

```
┌────────────────────────────────────────────────────────────────┐
│  Pemo Lead Scoring — Eval Harness                              │
└────────────────────────────────────────────────────────────────┘

✓ PASS  hot-1-uae-demo                    96.9/100  tier=hot    conf=1
✓ PASS  warm-1-ksa-arabic-referral        65.7/100  tier=warm   conf=1
✓ PASS  duplicate-existing-customer       60.7/100  tier=warm   conf=1
✓ PASS  hot-2-egypt-saas                  90.8/100  tier=hot    conf=1
✓ PASS  warm-2-uae-paid                   75.4/100  tier=warm   conf=1
✓ PASS  cold-1-out-of-market              36.8/100  tier=cold   conf=0.93
✓ PASS  cold-2-student                    41.6/100  tier=cold   conf=0.83
✓ PASS  warm-3-low-confidence             65.3/100  tier=warm   conf=0.7
✓ PASS  warm-4-stale-good-fit             79.3/100  tier=warm   conf=1
✓ PASS  cold-4-negative-signal              10/100  tier=cold   conf=1
✓ PASS  hot-3-large-uae                   97.3/100  tier=hot    conf=1
✓ PASS  edge-future-timestamp             82.6/100  tier=hot    conf=1

Total: 12   Passed: 12   Failed: 0
```

Verbose mode (full per-component breakdown):

```bash
node scoring-engine/run-tests.js --verbose
```

JSON output (for piping or CI):

```bash
node scoring-engine/run-tests.js --json
```

---

## Building the n8n bundle

n8n Code nodes can't `require()` local files. The build script flattens the modular code into a single self-contained file:

```bash
node scoring-engine/build-bundle.js
```

This produces `bundle-for-n8n.js`. Open the file, copy contents, paste into n8n's Score Lead Code node.

To verify the bundle is functionally equivalent to the modular code:

```bash
node scoring-engine/verify-bundle.js
```

This re-runs the 12 test cases against both the modular form and the bundled form, then compares tier and total. Any drift fails the script.

---

## Adding a new component

To add a fifth scoring component (e.g. "company growth signals" based on hiring data):

1. Create `lib/growth.js` with `function scoreGrowth(lead, config) { ... return { raw, weighted, max, signals } }`.
2. Add `growth` to `config.weights` (and reduce another component to keep the total at 100).
3. Wire it into `score.js`:
   ```javascript
   const { scoreGrowth } = require('./lib/growth');
   // inside score():
   const breakdown = {
     firmographic: scoreFirmographic(lead, config),
     intent: scoreIntent(lead, config),
     source_quality: scoreSourceQuality(lead, config),
     engagement: scoreEngagement(lead, config, now),
     growth: scoreGrowth(lead, config)   // <-- new
   };
   ```
4. Add test cases that exercise the new component.
5. Re-run tests, re-build bundle, re-verify.

The build script auto-picks up new lib files if they're added to its `libOrder` array.

---

## Adding a new test case

Append to `test-leads.json`:

```json
{
  "id": "your-test-id",
  "expected_tier": "hot|warm|cold",
  "description": "Plain-English what this case proves",
  "lead": { "company_name": "...", ... full canonical lead ... }
}
```

Run `run-tests.js`. If your `expected_tier` matches, it passes. If not, either your expectation is wrong or the engine has a bug. Both are valuable.

---

## Notes on weight choices

The default weights (35/30/20/15) were chosen with the following logic, in order of evidence:

1. **Firmographic fit (35) is the heaviest** because Pemo's market is geographically concentrated (UAE + KSA + Egypt) and ICP is well-defined (SMEs, 20-200 employees, specific industries). A lead from outside this profile should never be hot, no matter how interested they are.

2. **Intent (30) is second** because the assignment specifically calls out "demo requested vs. general inquiry" as a key signal. A clear demo request from someone who fits the ICP is the gold-standard hot lead. We weight intent heavily so it can lift a marginal-fit lead into Hot if the intent is strong.

3. **Source quality (20) is third** because referral and partner channels convert dramatically better than paid or cold outbound (industry-standard 3x to 5x ratio). This isn't enough to override fit + intent, but it's a meaningful tiebreaker in the Warm-vs-Cold zone.

4. **Engagement (15) is lowest** because it has the most noise. Multi-visit signals are easy to fake (a single lead visiting 10 times from work + home + phone), and submission recency only matters at the extremes (very fresh = hot, ancient = cold). 15 is enough to nudge but not dominate.

These weights should be re-tuned every quarter based on actual conversion data from HubSpot. Examples of legitimate adjustments:

- If referral conversion turns out to be 10x organic (instead of the assumed 3x), bump source quality to 25 and reduce one of the others.
- If demo requests close at 80%+ vs general inquiries at 5%, bump intent to 35.
- If MENA market expansion adds new tier-1 countries (Bahrain, Qatar), edit `config.icp.countries.tier_1` to include them.

The version stamp on every score (`score_version`) makes historical analysis straightforward when weights change.
