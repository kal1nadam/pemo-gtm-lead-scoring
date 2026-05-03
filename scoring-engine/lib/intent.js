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

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { scoreIntent };
