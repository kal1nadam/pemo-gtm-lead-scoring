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

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { scoreFirmographic, parseCompanySize };
