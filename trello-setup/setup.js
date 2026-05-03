#!/usr/bin/env node
/**
 * Trello setup script
 *
 * Synchronizes lists and labels across the three tier boards (Hot / Warm / Cold).
 * Idempotent — safe to re-run. Will not duplicate existing lists or labels.
 *
 * Usage:
 *   node setup.js              # apply structure to all 3 boards
 *   node setup.js --dry-run    # preview only
 *   node setup.js --hot-only   # apply to Hot board only (handy for testing)
 *
 * Reads from ../.env:
 *   TRELLO_API_KEY, TRELLO_TOKEN
 *   TRELLO_BOARD_HOT_ID, TRELLO_BOARD_WARM_ID, TRELLO_BOARD_COLD_ID
 */

const fs = require("fs");
const path = require("path");

// --- load .env ---
const envPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const BOARDS = {
  hot:  process.env.TRELLO_BOARD_HOT_ID,
  warm: process.env.TRELLO_BOARD_WARM_ID,
  cold: process.env.TRELLO_BOARD_COLD_ID
};

if (!KEY || !TOKEN) {
  console.error("✗ TRELLO_API_KEY or TRELLO_TOKEN missing from .env");
  process.exit(1);
}
for (const [name, id] of Object.entries(BOARDS)) {
  if (!id) { console.error(`✗ TRELLO_BOARD_${name.toUpperCase()}_ID missing from .env`); process.exit(1); }
}

const args = new Set(process.argv.slice(2));
const DRY_RUN  = args.has("--dry-run");
const HOT_ONLY = args.has("--hot-only");

const definitions = require("./structure.json");
const API = "https://api.trello.com/1";

// ---------- API helper ----------
async function trello(method, urlPath, query = {}) {
  const params = new URLSearchParams({ key: KEY, token: TOKEN, ...query });
  const url = `${API}${urlPath}?${params}`;
  const res = await fetch(url, { method });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { /* */ }
  return { ok: res.ok, status: res.status, body: json, raw: text };
}

// ---------- Operations ----------
async function ensureList(boardId, listDef) {
  const existing = await trello("GET", `/boards/${boardId}/lists`);
  if (!existing.ok) throw new Error(`list fetch failed: ${existing.raw}`);

  const found = existing.body.find((l) => l.name.toLowerCase() === listDef.name.toLowerCase());
  if (found) {
    log(`    ◦ list "${listDef.name}" exists`);
    return;
  }
  if (DRY_RUN) { log(`    [dry-run] would create list "${listDef.name}"`); return; }

  const res = await trello("POST", "/lists", {
    name: listDef.name,
    idBoard: boardId,
    pos: listDef.pos !== undefined ? String(listDef.pos * 1000) : "bottom"
  });
  if (res.ok) log(`    ✓ created list "${listDef.name}"`);
  else log(`    ✗ list "${listDef.name}" failed: ${res.raw.slice(0, 200)}`);
}

async function ensureLabel(boardId, labelDef, category, existingLabels) {
  // Match on name (case-insensitive). Trello labels are unique per board.
  const taggedName = labelDef.name; // we keep names plain — categories are conceptual
  const found = existingLabels.find((l) => (l.name || "").toLowerCase() === taggedName.toLowerCase());
  if (found) {
    if (found.color !== labelDef.color) {
      if (DRY_RUN) { log(`    [dry-run] would recolor "${taggedName}" → ${labelDef.color}`); return; }
      const upd = await trello("PUT", `/labels/${found.id}`, { color: labelDef.color });
      if (upd.ok) log(`    ✓ recolored "${taggedName}" → ${labelDef.color}`);
    } else {
      log(`    ◦ label "${taggedName}" exists [${category}]`);
    }
    return;
  }
  if (DRY_RUN) { log(`    [dry-run] would create label "${taggedName}" (${labelDef.color}) [${category}]`); return; }

  const res = await trello("POST", "/labels", {
    name: taggedName,
    color: labelDef.color,
    idBoard: boardId
  });
  if (res.ok) log(`    ✓ label "${taggedName}" [${category}]`);
  else log(`    ✗ label "${taggedName}" failed: ${res.raw.slice(0, 200)}`);
}

async function applyToBoard(label, boardId) {
  log(`▸ Board: ${label} (${boardId})`);

  // Lists
  log(`  Lists:`);
  for (const list of definitions.lists) {
    await ensureList(boardId, list);
  }

  // Labels
  log(`  Labels:`);
  const existing = await trello("GET", `/boards/${boardId}/labels`, { limit: 1000 });
  if (!existing.ok) throw new Error(`label fetch failed: ${existing.raw}`);

  for (const [category, labels] of Object.entries(definitions.labels)) {
    if (category.startsWith("_")) continue;
    for (const label of labels) {
      await ensureLabel(boardId, label, category, existing.body);
    }
  }
  log("");
}

function log(msg) { console.log(msg); }

// ---------- Main ----------
(async () => {
  log("");
  log("┌─────────────────────────────────────────────────────────┐");
  log(`│  Trello setup ${DRY_RUN ? "(dry-run)" : "             "}                              │`);
  log("└─────────────────────────────────────────────────────────┘");
  log("");

  // sanity check token
  const me = await trello("GET", "/members/me");
  if (!me.ok) {
    console.error(`✗ Trello auth failed (${me.status})`);
    process.exit(1);
  }
  log(`✓ Authed as @${me.body.username}`);
  log("");

  const targets = HOT_ONLY ? [["Hot", BOARDS.hot]] : [["Hot", BOARDS.hot], ["Warm", BOARDS.warm], ["Cold", BOARDS.cold]];

  for (const [label, id] of targets) {
    await applyToBoard(label, id);
  }

  log("Done.");
})().catch((e) => { console.error("Fatal:", e); process.exit(1); });
