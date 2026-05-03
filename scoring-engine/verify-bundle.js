#!/usr/bin/env node
/**
 * Smoke-test the bundled n8n script: runs the same 12 leads through the
 * bundled engine and compares tier outcomes to the modular engine.
 *
 * If they diverge, the build script broke something during concatenation.
 *
 * Usage:
 *   node verify-bundle.js
 */

const fs = require("fs");
const path = require("path");

const cases = require("./test-leads.json");
const { score: scoreModular } = require("./score");
const config = require("./config.json");

const NOW = new Date("2026-05-01T12:00:00Z");

const bundleSource = fs.readFileSync(path.join(__dirname, "bundle-for-n8n.js"), "utf8");

// Extract everything BEFORE the n8n wrapper (we don't want $input here).
const cutPoint = bundleSource.indexOf("// --- n8n entry point ---");
const bundleWithoutWrapper = bundleSource.slice(0, cutPoint);

// Eval bundle in a sandboxed scope and grab `score`.
const scoreFromBundle = (function () {
  const ctx = {};
  const fn = new Function(`${bundleWithoutWrapper}\nreturn { score, CONFIG };`);
  return fn();
})();

let mismatches = 0;
for (const c of cases) {
  const a = scoreModular(c.lead, config, NOW);
  const b = scoreFromBundle.score(c.lead, scoreFromBundle.CONFIG, NOW);
  const match = a.tier === b.tier && Math.abs(a.total - b.total) < 0.01;
  console.log(
    (match ? "✓" : "✗") +
      "  " +
      c.id.padEnd(32) +
      "  modular=" + String(a.total).padStart(5) + " " + a.tier.padEnd(5) +
      "  bundle=" + String(b.total).padStart(5) + " " + b.tier
  );
  if (!match) mismatches++;
}

console.log("");
console.log(mismatches === 0 ? "✓ Bundle matches modular engine on all cases." : `✗ ${mismatches} mismatch(es).`);
process.exit(mismatches === 0 ? 0 : 1);
