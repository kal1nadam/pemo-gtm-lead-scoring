# Trello Setup

Synchronizes lists and labels across the three tier boards (Hot / Warm / Cold). Idempotent — safe to re-run.

## What it provisions

### Lists (per board)
`New → Assigned → Contacted → Replied → Qualified → Lost`

Standard pipeline stages every sales rep recognizes. Cards move left-to-right as the lead progresses.

### Labels (per board, ~25 total)

**Country**: UAE, KSA, EGY, GCC, Other
**Language**: EN, AR
**Source**: Referral, Partner, Event, Webinar, Content, Organic, Direct, Social, Paid Search, Paid Social, Cold Outbound
**Flags**: Demo Request, Low Confidence, Existing Customer, Disqualified, Stale

Color choices are deliberate — green = high-quality channels, yellow = neutral, pink/red = lower-priority or operational flags. Reps can scan a board and triage instantly.

## Usage

```bash
node setup.js                # apply to all 3 boards
node setup.js --dry-run      # preview only
node setup.js --hot-only     # apply to Hot board (useful for iterating)
```

Reads from repo-root `.env`:
- `TRELLO_API_KEY`, `TRELLO_TOKEN`
- `TRELLO_BOARD_HOT_ID`, `TRELLO_BOARD_WARM_ID`, `TRELLO_BOARD_COLD_ID`

Requires Node 18+ (uses built-in fetch).

## Why a script

- **Consistent across boards** — Hot, Warm, and Cold all share identical list & label structure
- **Versioned** — labels and stages live in `structure.json`, not in someone's memory
- **Idempotent** — re-running is safe; only adds what's missing, recolors mismatches
- **Repeatable** — onboarding a new tier or duplicating for a new region takes one command
