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

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { calculateConfidence };
