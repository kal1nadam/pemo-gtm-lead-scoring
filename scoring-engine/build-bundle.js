#!/usr/bin/env node
/**
 * Build a single self-contained bundle of the scoring engine for n8n.
 *
 * Why: n8n Code nodes can't require() local files. Source-of-truth lives
 * in the modular form (lib/*.js + score.js) with full unit-test coverage
 * (run-tests.js). This script flattens that into a single file ready to
 * paste into an n8n Code node.
 *
 * Output: ./bundle-for-n8n.js
 *
 * Usage:
 *   node build-bundle.js
 */

const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const read = (p) => fs.readFileSync(path.join(HERE, p), "utf8");

// Strip CommonJS plumbing — require() and module.exports — so we can concat.
function stripModuleSyntax(src) {
  return src
    .replace(/^const\s*\{[^}]+\}\s*=\s*require\([^)]+\);?\s*$/gm, "")
    .replace(/^module\.exports\s*=\s*\{[^}]+\};?\s*$/gm, "")
    .trim();
}

// Helper functions are defined per-file in the source — for the bundle we
// hoist a single canonical copy at the top and strip duplicates from libs.
function stripDuplicateHelpers(src) {
  return src
    .replace(/function round2\(n\)\s*\{[^}]+\}\s*/g, "")
    .replace(/function round1\(n\)\s*\{[^}]+\}\s*/g, "")
    .replace(/function clamp\(n,\s*min,\s*max\)\s*\{[^}]+\}\s*/g, "")
    .replace(/function formatHours\(h\)\s*\{[\s\S]*?\n\}\s*/g, "");
}

const config = JSON.parse(read("config.json"));

const HEADER = `/**
 * Pemo Lead Scoring Engine — bundled for n8n Code node.
 *
 * AUTO-GENERATED. Do not edit directly.
 * Source: scoring-engine/score.js + lib/*.js
 * Config: scoring-engine/config.json
 * Regenerate: node scoring-engine/build-bundle.js
 *
 * Built: ${new Date().toISOString()}
 *
 * The source-of-truth is the modular version with unit tests
 * (scoring-engine/run-tests.js — 12/12 passing). This bundle exists
 * solely to satisfy n8n Code node's lack of require() support.
 */`;

const SHARED_UTILS = `// --- shared helpers (hoisted) ---
function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function formatHours(h) {
  if (h < 1) return Math.round(h * 60) + "m";
  if (h < 24) return Math.round(h) + "h";
  if (h < 168) return Math.round(h / 24) + "d";
  return Math.round(h / 168) + "w";
}`;

const CONFIG_BLOCK = `// --- embedded config (config.json snapshot) ---
const CONFIG = ${JSON.stringify(config, null, 2)};`;

const libOrder = ["firmographic.js", "intent.js", "source.js", "engagement.js", "confidence.js"];
const libBlocks = libOrder
  .map((f) => `// --- ${f} ---\n${stripDuplicateHelpers(stripModuleSyntax(read(`lib/${f}`)))}`)
  .join("\n\n");

const scoreBlock = `// --- score.js (orchestrator) ---\n${stripDuplicateHelpers(stripModuleSyntax(read("score.js")))}`;

const N8N_WRAPPER = `// --- n8n entry point ---
// Reads the lead from the incoming item, runs the scoring engine,
// and merges the result back onto the lead under \`scoring\`.
const lead = $input.item.json;
const result = score(lead, CONFIG);

return {
  json: {
    ...lead,
    scoring: result
  }
};`;

const bundle = [HEADER, SHARED_UTILS, CONFIG_BLOCK, libBlocks, scoreBlock, N8N_WRAPPER].join("\n\n");

const outPath = path.join(HERE, "bundle-for-n8n.js");
fs.writeFileSync(outPath, bundle);
console.log(`✓ Wrote ${path.relative(process.cwd(), outPath)} (${bundle.length} chars)`);
