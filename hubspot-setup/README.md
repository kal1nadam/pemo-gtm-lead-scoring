# HubSpot Setup

Provisions the custom property group and properties needed by the lead-scoring workflow. Idempotent, safe to run multiple times.

## What it creates

A property group `pemo_gtm` on both **Contacts** and **Companies**, populated with the full Pemo lead-scoring data model.

### Contact properties (Pemo GTM group, 24 total)

Scoring:
- `pemo_lead_score` (numeric 0-100)
- `pemo_lead_tier` (enum: hot, warm, cold)
- `pemo_score_version`, `pemo_last_scored_at`
- `pemo_score_rationale` (deterministic component breakdown JSON)
- `pemo_qualification_summary` (AI-generated narrative)
- `pemo_firmographic_score`, `pemo_intent_score`, `pemo_source_score`, `pemo_engagement_score` (subscores)
- `pemo_confidence` (data-completeness, 0-1)
- `pemo_disqualified` (bool, true for opt-out / not-interested signals)

Routing:
- `pemo_country_tier` (tier_1, tier_2, tier_3, out_of_market)
- `pemo_lead_source_channel` (canonical enum)
- `pemo_form_intent` (raw form selection)
- `pemo_inbound_source_shape` (audit trail of which payload shape was detected)
- `pemo_language` (en, ar)
- `pemo_company_size_band` (denormalized at contact level for routing)
- `pemo_visit_count`
- `pemo_existing_customer` (bool, set at intake from dedup)
- `pemo_assigned_rep_email`

Audit:
- `pemo_request_id` (join key across n8n logs, HubSpot, Slack, Trello)
- `pemo_raw_message`
- `pemo_tech_stack_signals` (comma-separated detected tools)

Operations:
- `pemo_trello_card_url`
- `pemo_replied`, `pemo_replied_at` (set by WF-REPLY)
- `pemo_sequence_step` (last sent step, used by WF-MONITORING for stale detection)

### Company properties (Pemo GTM group, 5 total)
- `pemo_company_size_band`
- `pemo_industry_fit`
- `pemo_tech_stack`
- `pemo_tech_stack_signal`
- `pemo_existing_customer`

All definitions live in `properties.json` and are version-controlled.

## Usage

```bash
node setup.js --dry-run      # preview without writing
node setup.js                # create everything (idempotent)
node setup.js --delete       # tear down (removes all pemo_* custom properties)
```

Requires Node 18+ (uses built-in fetch, no npm install).

Reads `HUBSPOT_ACCESS_TOKEN` from the repo-root `.env` file.

## Notes on token type

HubSpot recently moved Private Apps under "Legacy Apps" (developer platform consolidation). The script accepts the access token from either:

- Private Apps (older HubSpot UI): `pat-...`
- Legacy Apps (current UI): `pat-...` (same format)

In n8n, the corresponding credential type is **HubSpot Service Key** (despite being labeled "Service Key" in the UI, it accepts the access token format used by Private/Legacy Apps).

## Why a script and not click-through

- **Reproducible.** Another engineer pulls the repo, runs one command, has the same HubSpot setup.
- **Versioned.** Property changes show up in git diffs, not in someone's memory.
- **Idempotent.** Re-running is safe; only creates what's missing.
- **Reviewable.** HubSpot reviewer can read `properties.json` to see exactly what we provision.
