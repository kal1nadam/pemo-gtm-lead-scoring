#!/usr/bin/env node
/**
 * Eval harness for the lead scoring engine.
 *
 * Runs every lead in test-leads.json through score(), prints a results table,
 * and exits non-zero if any expected tier doesn't match.
 *
 * Usage:
 *   node run-tests.js
 *   node run-tests.js --verbose    # full breakdown per lead
 *   node run-tests.js --json       # raw JSON output (for piping/CI)
 */

const fs = require("fs");
const path = require("path");
const { score } = require("./score");

const config = require("./config.json");
const cases = require("./test-leads.json");

const args = new Set(process.argv.slice(2));
const verbose = args.has("--verbose") || args.has("-v");
const jsonOnly = args.has("--json");

// Pin "now" so tests are deterministic
const NOW = new Date("2026-05-01T12:00:00Z");

const results = cases.map((c) => {
  let result;
  let error = null;
  try {
    result = score(c.lead, config, NOW);
  } catch (e) {
    error = e.message;
  }
  const pass = result && result.tier === c.expected_tier;
  return { id: c.id, expected: c.expected_tier, description: c.description, result, error, pass };
});

if (jsonOnly) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}

const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;

console.log("");
console.log("┌────────────────────────────────────────────────────────────────┐");
console.log("│  Pemo Lead Scoring — Eval Harness                              │");
console.log("└────────────────────────────────────────────────────────────────┘");
console.log("");

for (const r of results) {
  const status = r.pass ? "✓ PASS" : "✗ FAIL";
  const total = r.result ? `${r.result.total}/100` : "ERROR";
  const tier = r.result ? r.result.tier : "—";
  const conf = r.result ? `conf=${r.result.confidence.score}` : "";

  console.log(`${status}  ${r.id.padEnd(32)}  ${total.padStart(8)}  tier=${tier.padEnd(5)}  ${conf}`);
  console.log(`        expected: ${r.expected}   ${r.description}`);

  if (r.error) {
    console.log(`        ERROR: ${r.error}`);
  }

  if (verbose && r.result) {
    console.log(`        rationale: ${r.result.rationale_summary}`);
    for (const [k, v] of Object.entries(r.result.breakdown)) {
      console.log(`          ${k.padEnd(15)} ${String(v.weighted).padStart(6)}/${v.max}`);
      for (const sig of v.signals) {
        console.log(`            • ${sig}`);
      }
    }
    if (r.result.confidence.missing_fields.length > 0) {
      console.log(`        missing: ${r.result.confidence.missing_fields.join(", ")}`);
    }
  }
  console.log("");
}

console.log("─".repeat(64));
console.log(`Total: ${results.length}   Passed: ${passed}   Failed: ${failed}`);
console.log("");

process.exit(failed === 0 ? 0 : 1);
