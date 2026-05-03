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

function formatHours(h) {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  if (h < 168) return `${Math.round(h / 24)}d`;
  return `${Math.round(h / 168)}w`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { scoreEngagement };
