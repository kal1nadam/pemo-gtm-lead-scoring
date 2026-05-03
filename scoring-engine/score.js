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

const { scoreFirmographic } = require("./lib/firmographic");
const { scoreIntent } = require("./lib/intent");
const { scoreSourceQuality } = require("./lib/source");
const { scoreEngagement } = require("./lib/engagement");
const { calculateConfidence } = require("./lib/confidence");

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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

module.exports = { score, computeTier };
