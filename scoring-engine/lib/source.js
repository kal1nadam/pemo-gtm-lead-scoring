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

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { scoreSourceQuality, normalizeSource };
