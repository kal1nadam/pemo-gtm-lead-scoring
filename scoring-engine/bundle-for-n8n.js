/**
 * Pemo Lead Scoring Engine — bundled for n8n Code node.
 *
 * AUTO-GENERATED. Do not edit directly.
 * Source: scoring-engine/score.js + lib/*.js
 * Config: scoring-engine/config.json
 * Regenerate: node scoring-engine/build-bundle.js
 *
 * Built: 2026-05-03T22:58:03.860Z
 *
 * The source-of-truth is the modular version with unit tests
 * (scoring-engine/run-tests.js — 12/12 passing). This bundle exists
 * solely to satisfy n8n Code node's lack of require() support.
 */

// --- shared helpers (hoisted) ---
function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function formatHours(h) {
  if (h < 1) return Math.round(h * 60) + "m";
  if (h < 24) return Math.round(h) + "h";
  if (h < 168) return Math.round(h / 24) + "d";
  return Math.round(h / 168) + "w";
}

// --- embedded config (config.json snapshot) ---
const CONFIG = {
  "score_version": "1.0.0",
  "weights": {
    "firmographic": 35,
    "intent": 30,
    "source_quality": 20,
    "engagement": 15
  },
  "tiers": {
    "hot": {
      "min": 80,
      "max": 100
    },
    "warm": {
      "min": 50,
      "max": 79
    },
    "cold": {
      "min": 0,
      "max": 49
    }
  },
  "icp": {
    "countries": {
      "tier_1": [
        "AE",
        "SA"
      ],
      "tier_2": [
        "EG"
      ],
      "tier_3": [
        "KW",
        "BH",
        "QA",
        "OM",
        "JO"
      ],
      "out_of_market": []
    },
    "company_size": {
      "ideal": {
        "min": 20,
        "max": 200,
        "score": 1
      },
      "acceptable_lower": {
        "min": 10,
        "max": 19,
        "score": 0.7
      },
      "acceptable_upper": {
        "min": 201,
        "max": 500,
        "score": 0.8
      },
      "marginal_small": {
        "min": 5,
        "max": 9,
        "score": 0.4
      },
      "marginal_large": {
        "min": 501,
        "max": 1000,
        "score": 0.5
      },
      "out_of_fit_small": {
        "min": 0,
        "max": 4,
        "score": 0.1
      },
      "out_of_fit_large": {
        "min": 1001,
        "max": 999999,
        "score": 0.2
      }
    },
    "industries": {
      "high_fit": [
        "saas",
        "software",
        "technology",
        "ecommerce",
        "e-commerce",
        "professional services",
        "consulting",
        "marketing agency",
        "digital agency",
        "media",
        "advertising",
        "fintech",
        "healthtech",
        "edtech",
        "logistics",
        "retail",
        "f&b",
        "food and beverage",
        "hospitality",
        "real estate",
        "construction"
      ],
      "medium_fit": [
        "manufacturing",
        "wholesale",
        "import export",
        "automotive",
        "education",
        "healthcare",
        "legal",
        "accounting"
      ],
      "low_fit": [
        "government",
        "non-profit",
        "ngo",
        "agriculture",
        "mining",
        "personal",
        "freelance"
      ]
    }
  },
  "intent_signals": {
    "high_intent_keywords": [
      "demo",
      "pricing",
      "trial",
      "buy",
      "purchase",
      "implement",
      "deploy",
      "evaluate",
      "compare",
      "switch from",
      "moving from",
      "replacing",
      "this quarter",
      "this month",
      "asap",
      "urgent",
      "immediately",
      "decision maker",
      "rfp",
      "proposal",
      "contract"
    ],
    "medium_intent_keywords": [
      "looking for",
      "interested in",
      "exploring",
      "considering",
      "learn more",
      "tell me about",
      "how does",
      "what is",
      "info"
    ],
    "low_intent_keywords": [
      "just curious",
      "general question",
      "browsing",
      "research",
      "student",
      "academic",
      "homework",
      "thesis"
    ],
    "negative_signals": [
      "unsubscribe",
      "remove me",
      "spam",
      "not interested",
      "wrong person",
      "different company"
    ],
    "high_intent_score": 1,
    "medium_intent_score": 0.6,
    "low_intent_score": 0.2,
    "demo_request_bonus": 0.2,
    "explicit_form_intent_weight": 0.4
  },
  "source_quality": {
    "referral": 1,
    "partner": 0.95,
    "event": 0.9,
    "webinar": 0.85,
    "content_download": 0.7,
    "organic_search": 0.65,
    "direct": 0.6,
    "social_organic": 0.55,
    "paid_search": 0.5,
    "paid_social": 0.45,
    "cold_outbound": 0.3,
    "list_purchase": 0.2,
    "unknown": 0.4
  },
  "engagement": {
    "submission_recency_hours": {
      "fresh": {
        "max_hours": 1,
        "score": 1
      },
      "recent": {
        "max_hours": 24,
        "score": 0.85
      },
      "this_week": {
        "max_hours": 168,
        "score": 0.6
      },
      "stale": {
        "max_hours": 720,
        "score": 0.3
      },
      "very_stale": {
        "max_hours": 999999,
        "score": 0.1
      }
    },
    "repeat_visits": {
      "first_visit": 0.4,
      "few_visits": {
        "min": 2,
        "max": 4,
        "score": 0.7
      },
      "engaged": {
        "min": 5,
        "max": 9,
        "score": 0.9
      },
      "highly_engaged": {
        "min": 10,
        "max": 9999,
        "score": 1
      }
    },
    "submission_recency_weight": 0.6,
    "repeat_visits_weight": 0.4
  },
  "tech_stack_signals": {
    "high_value": [
      "xero",
      "quickbooks",
      "zoho books",
      "tally",
      "sage",
      "netsuite",
      "odoo"
    ],
    "competitor_signal": [
      "brex",
      "ramp",
      "spendesk",
      "pleo",
      "soldo",
      "mesh payments"
    ],
    "low_value": [
      "excel",
      "spreadsheet",
      "google sheets",
      "manual"
    ],
    "high_value_bonus": 0.1,
    "competitor_signal_bonus": 0.15,
    "low_value_bonus": 0.05
  },
  "confidence": {
    "required_fields": [
      "company_name",
      "email",
      "country"
    ],
    "important_fields": [
      "company_size",
      "raw_message",
      "source"
    ],
    "enrichment_fields": [
      "industry",
      "website",
      "tech_stack"
    ],
    "weights": {
      "required": 0.5,
      "important": 0.3,
      "enrichment": 0.2
    }
  }
};

// --- firmographic.js ---
/**
 * Firmographic fit scoring
 * Evaluates: country (ICP region), company size band, industry match
 */

function scoreCountry(lead, config) {
  if (!lead.country) return { score: 0, reason: "country missing" };

  const country = lead.country.trim().toUpperCase();
  const { tier_1, tier_2, tier_3, out_of_market } = config.icp.countries;

  if (out_of_market.includes(country)) {
    return { score: 0, reason: `country ${country} is out-of-market` };
  }
  if (tier_1.includes(country)) {
    return { score: 1.0, reason: `tier-1 market (${country})` };
  }
  if (tier_2.includes(country)) {
    return { score: 0.7, reason: `tier-2 market (${country})` };
  }
  if (tier_3.includes(country)) {
    return { score: 0.4, reason: `tier-3 market (${country})` };
  }
  return { score: 0.15, reason: `country ${country} outside primary ICP` };
}

function scoreCompanySize(lead, config) {
  const size = parseCompanySize(lead.company_size);
  if (size === null) return { score: 0.3, reason: "company size unknown (default 0.3)" };

  const bands = config.icp.company_size;
  for (const [bandName, band] of Object.entries(bands)) {
    if (size >= band.min && size <= band.max) {
      return { score: band.score, reason: `${size} employees → ${bandName.replace(/_/g, " ")}` };
    }
  }
  return { score: 0.1, reason: `${size} employees → no matching band` };
}

function scoreIndustry(lead, config) {
  const industry = (lead.industry || "").toLowerCase().trim();
  if (!industry) return { score: 0.4, reason: "industry unknown (default 0.4)" };

  const { high_fit, medium_fit, low_fit } = config.icp.industries;

  if (high_fit.some((i) => industry.includes(i))) {
    return { score: 1.0, reason: `high-fit industry (${industry})` };
  }
  if (medium_fit.some((i) => industry.includes(i))) {
    return { score: 0.6, reason: `medium-fit industry (${industry})` };
  }
  if (low_fit.some((i) => industry.includes(i))) {
    return { score: 0.15, reason: `low-fit industry (${industry})` };
  }
  return { score: 0.4, reason: `industry "${industry}" not classified` };
}

/**
 * Accepts company_size as number or descriptive string ("11-50", "200+", "small")
 * Returns numeric employee count midpoint, or null if unparseable.
 */
function parseCompanySize(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw;

  const s = String(raw).toLowerCase().trim();

  // explicit numeric
  const num = Number(s);
  if (!Number.isNaN(num)) return num;

  // range "11-50" or "11 to 50"
  const range = s.match(/(\d+)\s*[-–to]+\s*(\d+)/);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);

  // open-ended "200+" or "1000+"
  const plus = s.match(/(\d+)\+/);
  if (plus) return Number(plus[1]) + 50;

  // common descriptors
  const descriptors = {
    "micro": 5, "very small": 8, "small": 25, "smb": 50,
    "medium": 150, "mid-market": 300, "mid market": 300,
    "large": 750, "enterprise": 2000
  };
  for (const [word, val] of Object.entries(descriptors)) {
    if (s.includes(word)) return val;
  }

  return null;
}

function scoreFirmographic(lead, config) {
  const country = scoreCountry(lead, config);
  const size = scoreCompanySize(lead, config);
  const industry = scoreIndustry(lead, config);

  // weighted: country 50%, size 30%, industry 20%
  const raw = country.score * 0.5 + size.score * 0.3 + industry.score * 0.2;

  return {
    raw: round2(raw),
    weighted: round2(raw * config.weights.firmographic),
    max: config.weights.firmographic,
    signals: [
      `country: ${country.reason} (${country.score})`,
      `size: ${size.reason} (${size.score})`,
      `industry: ${industry.reason} (${industry.score})`
    ]
  };
}



// --- intent.js ---
/**
 * Intent signal scoring
 * Evaluates: keywords in raw message, demo request flag, explicit form intent
 */

function scoreIntent(lead, config) {
  const message = (lead.raw_message || "").toLowerCase();
  const cfg = config.intent_signals;

  const matches = {
    high: cfg.high_intent_keywords.filter((k) => message.includes(k)),
    medium: cfg.medium_intent_keywords.filter((k) => message.includes(k)),
    low: cfg.low_intent_keywords.filter((k) => message.includes(k)),
    negative: cfg.negative_signals.filter((k) => message.includes(k))
  };

  // Negative signals are disqualifying — return near-zero
  if (matches.negative.length > 0) {
    return {
      raw: 0,
      weighted: 0,
      max: config.weights.intent,
      signals: [`negative signal detected: "${matches.negative.join(", ")}" — disqualifying intent`]
    };
  }

  // Base keyword score: take highest tier match found
  let keywordScore = 0;
  let keywordReason = "no intent keywords detected";

  if (matches.high.length > 0) {
    keywordScore = cfg.high_intent_score;
    keywordReason = `high-intent keywords: ${matches.high.slice(0, 3).join(", ")}`;
  } else if (matches.medium.length > 0) {
    keywordScore = cfg.medium_intent_score;
    keywordReason = `medium-intent keywords: ${matches.medium.slice(0, 3).join(", ")}`;
  } else if (matches.low.length > 0) {
    keywordScore = cfg.low_intent_score;
    keywordReason = `low-intent keywords: ${matches.low.slice(0, 3).join(", ")}`;
  }

  // Demo request explicit signal — bonus
  const isDemoRequest = looksLikeDemoRequest(lead);
  const demoBonus = isDemoRequest ? cfg.demo_request_bonus : 0;

  // Explicit form intent (when intake form has a "demo" / "pricing" field)
  const explicitIntent = lead.form_intent || lead.inquiry_type || null;
  let explicitBonus = 0;
  let explicitReason = null;
  if (explicitIntent) {
    const ei = explicitIntent.toLowerCase();
    if (["demo", "pricing", "buy", "trial"].some((k) => ei.includes(k))) {
      explicitBonus = cfg.explicit_form_intent_weight;
      explicitReason = `explicit form intent: "${explicitIntent}"`;
    } else if (["info", "general", "question"].some((k) => ei.includes(k))) {
      explicitBonus = cfg.explicit_form_intent_weight * 0.4;
      explicitReason = `general inquiry form intent: "${explicitIntent}"`;
    }
  }

  // Combine — clamp to [0, 1]
  const raw = Math.min(1, keywordScore + demoBonus + explicitBonus);

  const signals = [keywordReason];
  if (isDemoRequest) signals.push(`demo request signal (+${cfg.demo_request_bonus})`);
  if (explicitReason) signals.push(`${explicitReason} (+${round2(explicitBonus)})`);

  return {
    raw: round2(raw),
    weighted: round2(raw * config.weights.intent),
    max: config.weights.intent,
    signals
  };
}

function looksLikeDemoRequest(lead) {
  const message = (lead.raw_message || "").toLowerCase();
  const source = (lead.source || "").toLowerCase();
  const formIntent = (lead.form_intent || lead.inquiry_type || "").toLowerCase();

  const demoTerms = ["demo", "schedule a call", "book a meeting", "see it in action", "walkthrough"];
  return (
    demoTerms.some((t) => message.includes(t)) ||
    source.includes("demo") ||
    formIntent.includes("demo")
  );
}



// --- source.js ---
/**
 * Source quality scoring
 * Evaluates: lead source channel weighted by historical conversion proxy
 */

function scoreSourceQuality(lead, config) {
  const source = normalizeSource(lead.source);
  const weights = config.source_quality;

  const score = weights[source] !== undefined ? weights[source] : weights.unknown;
  const reason = weights[source] !== undefined
    ? `source "${source}" weighted at ${score}`
    : `source "${lead.source || "missing"}" not in registry, defaulted to unknown (${score})`;

  return {
    raw: round2(score),
    weighted: round2(score * config.weights.source_quality),
    max: config.weights.source_quality,
    signals: [reason]
  };
}

/**
 * Map free-form source strings to canonical keys.
 * Handles common variations from different intake channels.
 */
function normalizeSource(raw) {
  if (!raw) return "unknown";

  const s = String(raw).toLowerCase().trim();

  const map = {
    referral: ["referral", "referred", "word of mouth", "existing customer"],
    partner: ["partner", "partnership", "reseller", "channel partner"],
    event: ["event", "conference", "trade show", "expo", "summit"],
    webinar: ["webinar", "virtual event", "online event"],
    content_download: ["content", "download", "ebook", "whitepaper", "guide", "resource"],
    organic_search: ["organic", "seo", "google search", "organic search"],
    direct: [
      "direct", "type-in", "bookmark",
      "website_form", "website form", "website",
      "contact_form", "contact form",
      "lead_form", "lead form",
      "demo_request", "demo request",
      "inbound", "form_submission", "form submission"
    ],
    social_organic: ["social", "linkedin", "twitter", "facebook organic", "instagram"],
    paid_search: ["paid search", "google ads", "sem", "ppc", "cpc"],
    paid_social: ["paid social", "linkedin ads", "facebook ads", "meta ads", "instagram ads"],
    cold_outbound: ["cold", "outbound", "outreach", "sdr", "bdr"],
    list_purchase: ["list", "purchased list", "data provider", "zoominfo", "apollo"]
  };

  for (const [canonical, aliases] of Object.entries(map)) {
    if (aliases.some((a) => s.includes(a))) return canonical;
  }
  return "unknown";
}



// --- engagement.js ---
/**
 * Engagement recency scoring
 * Evaluates: time since submission + repeat visits if available
 */

function scoreEngagement(lead, config, now = new Date()) {
  const cfg = config.engagement;

  const recency = scoreSubmissionRecency(lead, cfg, now);
  const visits = scoreRepeatVisits(lead, cfg);

  const raw = recency.score * cfg.submission_recency_weight + visits.score * cfg.repeat_visits_weight;

  return {
    raw: round2(raw),
    weighted: round2(raw * config.weights.engagement),
    max: config.weights.engagement,
    signals: [recency.reason, visits.reason]
  };
}

function scoreSubmissionRecency(lead, cfg, now) {
  const ts = lead.submitted_at || lead.created_at;
  if (!ts) {
    return { score: 0.5, reason: "submission timestamp missing (default 0.5)" };
  }

  const submittedDate = new Date(ts);
  if (Number.isNaN(submittedDate.getTime())) {
    return { score: 0.5, reason: `unparseable timestamp "${ts}" (default 0.5)` };
  }

  const hoursAgo = (now.getTime() - submittedDate.getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 0) {
    return { score: 0.85, reason: "future timestamp — clock skew, treating as fresh" };
  }

  const bands = cfg.submission_recency_hours;
  for (const [bandName, band] of Object.entries(bands)) {
    if (hoursAgo <= band.max_hours) {
      return { score: band.score, reason: `submitted ${formatHours(hoursAgo)} ago → ${bandName}` };
    }
  }
  return { score: 0.1, reason: `submitted ${formatHours(hoursAgo)} ago → very stale` };
}

function scoreRepeatVisits(lead, cfg) {
  const visits = Number(lead.visit_count || 0);
  if (visits <= 1) return { score: cfg.repeat_visits.first_visit, reason: "first visit" };

  const fv = cfg.repeat_visits.few_visits;
  if (visits >= fv.min && visits <= fv.max) {
    return { score: fv.score, reason: `${visits} visits (few)` };
  }

  const eng = cfg.repeat_visits.engaged;
  if (visits >= eng.min && visits <= eng.max) {
    return { score: eng.score, reason: `${visits} visits (engaged)` };
  }

  const high = cfg.repeat_visits.highly_engaged;
  if (visits >= high.min) {
    return { score: high.score, reason: `${visits} visits (highly engaged)` };
  }

  return { score: 0.4, reason: `${visits} visits` };
}



// --- confidence.js ---
/**
 * Confidence scoring
 * Tracks how complete the input data is.
 * Low confidence → score should be treated cautiously and flagged for review.
 */

function calculateConfidence(lead, config) {
  const cfg = config.confidence;

  const reqPresent = countPresent(lead, cfg.required_fields);
  const impPresent = countPresent(lead, cfg.important_fields);
  const enrPresent = countPresent(lead, cfg.enrichment_fields);

  const reqRatio = reqPresent / cfg.required_fields.length;
  const impRatio = impPresent / cfg.important_fields.length;
  const enrRatio = enrPresent / cfg.enrichment_fields.length;

  const confidence =
    reqRatio * cfg.weights.required +
    impRatio * cfg.weights.important +
    enrRatio * cfg.weights.enrichment;

  const missing = [
    ...cfg.required_fields.filter((f) => !isPresent(lead, f)),
    ...cfg.important_fields.filter((f) => !isPresent(lead, f)),
    ...cfg.enrichment_fields.filter((f) => !isPresent(lead, f))
  ];

  return {
    score: round2(confidence),
    missing_fields: missing,
    breakdown: {
      required: `${reqPresent}/${cfg.required_fields.length}`,
      important: `${impPresent}/${cfg.important_fields.length}`,
      enrichment: `${enrPresent}/${cfg.enrichment_fields.length}`
    }
  };
}

function countPresent(lead, fields) {
  return fields.filter((f) => isPresent(lead, f)).length;
}

function isPresent(lead, field) {
  const v = lead[field];
  if (v === null || v === undefined) return false;
  if (typeof v === "string" && v.trim() === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}



// --- score.js (orchestrator) ---
/**
 * Pemo Lead Scoring Engine
 *
 * Pure function: score(lead, config, [now]) → ScoredLead
 *
 * Design principles:
 *  - Deterministic, testable, no side effects
 *  - Zero runtime dependencies (runs in n8n Code node, Node.js, or browser)
 *  - Configurable weights & ICP via config.json — no logic changes needed to retune
 *  - Component breakdown logged with every score for auditability
 *  - Confidence score signals data completeness — low confidence flags for human review
 *  - Score version stamped for forward-compatibility (re-tune without breaking history)
 *  - AI is intentionally NOT used inside the score itself — scoring is deterministic
 *    and explainable. AI generates the qualification *summary* downstream, given the
 *    breakdown produced here.
 *
 * Tier rules (from config):
 *   Hot  ≥ 80
 *   Warm 50–79
 *   Cold < 50
 *
 * Usage:
 *   const { score } = require("./score");
 *   const config = require("./config.json");
 *   const result = score(lead, config);
 */






function score(lead, config, now = new Date()) {
  validateInput(lead, config);

  const enrichedLead = withTechStackBonus(lead, config);

  const breakdown = {
    firmographic: scoreFirmographic(enrichedLead, config),
    intent: scoreIntent(enrichedLead, config),
    source_quality: scoreSourceQuality(enrichedLead, config),
    engagement: scoreEngagement(enrichedLead, config, now)
  };

  let total = clamp(
    breakdown.firmographic.weighted +
      breakdown.intent.weighted +
      breakdown.source_quality.weighted +
      breakdown.engagement.weighted,
    0,
    100
  );

  // Disqualifying override: negative intent signals (e.g. "remove me", "not interested")
  // force the lead to cold regardless of other signals. Respect the user.
  const disqualified = detectDisqualification(breakdown);
  if (disqualified) {
    total = Math.min(total, 10);
    breakdown.intent.signals.push("DISQUALIFIED — total capped at 10");
  }

  const tier = computeTier(total, config);
  const confidence = calculateConfidence(lead, config);

  return {
    total: round1(total),
    tier,
    breakdown,
    confidence,
    disqualified,
    score_version: config.score_version,
    scored_at: now.toISOString(),
    rationale_summary: buildShortRationale(breakdown, tier, total)
  };
}

/**
 * Tech stack signals act as a small modifier on the firmographic component.
 * Pemo competitors (Brex, Ramp, Spendesk) → strong buying intent for switch.
 * Existing accounting tools → easier integration story.
 * Manual / Excel → biggest pain, prime target.
 */
function withTechStackBonus(lead, config) {
  const stack = (lead.tech_stack || []).map((t) => String(t).toLowerCase());
  if (stack.length === 0) return lead;

  const cfg = config.tech_stack_signals;
  let bonusFactor = 1.0;
  const signals = [];

  if (stack.some((s) => cfg.competitor_signal.some((k) => s.includes(k)))) {
    bonusFactor += cfg.competitor_signal_bonus;
    signals.push("competitor product detected → switch opportunity");
  }
  if (stack.some((s) => cfg.high_value.some((k) => s.includes(k)))) {
    bonusFactor += cfg.high_value_bonus;
    signals.push("modern accounting stack → integration-ready");
  }
  if (stack.some((s) => cfg.low_value.some((k) => s.includes(k)))) {
    bonusFactor += cfg.low_value_bonus;
    signals.push("manual / spreadsheet workflow → high pain");
  }

  return { ...lead, _tech_stack_bonus: bonusFactor, _tech_stack_signals: signals };
}

function detectDisqualification(breakdown) {
  const intentSignals = breakdown.intent.signals.join(" ").toLowerCase();
  return intentSignals.includes("negative signal") || intentSignals.includes("disqualifying");
}

function computeTier(total, config) {
  const { hot, warm } = config.tiers;
  if (total >= hot.min) return "hot";
  if (total >= warm.min) return "warm";
  return "cold";
}

function buildShortRationale(breakdown, tier, total) {
  const top = Object.entries(breakdown)
    .map(([k, v]) => ({ component: k, weighted: v.weighted, max: v.max }))
    .sort((a, b) => b.weighted - a.weighted);

  const strongest = top[0];
  const weakest = top[top.length - 1];

  return [
    `${tier.toUpperCase()} (${total}/100)`,
    `strongest: ${strongest.component} (${strongest.weighted}/${strongest.max})`,
    `weakest: ${weakest.component} (${weakest.weighted}/${weakest.max})`
  ].join(" | ");
}

function validateInput(lead, config) {
  if (!lead || typeof lead !== "object") {
    throw new Error("score(): lead must be an object");
  }
  if (!config || typeof config !== "object") {
    throw new Error("score(): config must be an object");
  }
  if (!config.weights || !config.tiers || !config.icp) {
    throw new Error("score(): config missing required sections (weights, tiers, icp)");
  }
  const sumWeights = Object.values(config.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sumWeights - 100) > 0.01) {
    throw new Error(`score(): config.weights must sum to 100, got ${sumWeights}`);
  }
}



// --- n8n entry point ---
// Reads the lead from the incoming item, runs the scoring engine,
// and merges the result back onto the lead under `scoring`.
const lead = $input.item.json;
const result = score(lead, CONFIG);

return {
  json: {
    ...lead,
    scoring: result
  }
};