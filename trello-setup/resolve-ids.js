#!/usr/bin/env node
/**
 * Trello ID resolver — fetches all list and label IDs from each tier board
 * (Hot / Warm / Cold) and writes them to resolved-ids.json.
 *
 * Why this exists: n8n workflows need stable references (board_id + list_id)
 * to create cards. Hardcoding IDs in the workflow makes it brittle (boards
 * get rebuilt, IDs change). Hardcoding them in .env makes the .env huge.
 *
 * This script discovers them once at setup time and produces a single JSON
 * file the n8n Code nodes can reference at runtime via HTTP fetch or by
 * embedding in a Code node constant.
 *
 * Re-run any time boards/lists/labels change. Idempotent.
 *
 * Usage:
 *   node resolve-ids.js
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
  console.error("✗ TRELLO_API_KEY / TRELLO_TOKEN missing");
  process.exit(1);
}

const API = "https://api.trello.com/1";

async function trello(urlPath, query = {}) {
  const params = new URLSearchParams({ key: KEY, token: TOKEN, ...query });
  const res = await fetch(`${API}${urlPath}?${params}`);
  if (!res.ok) throw new Error(`${urlPath} → ${res.status} ${await res.text()}`);
  return res.json();
}

(async () => {
  const resolved = {
    _generated_at: new Date().toISOString(),
    boards: {}
  };

  for (const [tier, boardId] of Object.entries(BOARDS)) {
    if (!boardId) { console.warn(`! ${tier}: TRELLO_BOARD_${tier.toUpperCase()}_ID missing, skipping`); continue; }

    const lists  = await trello(`/boards/${boardId}/lists`);
    const labels = await trello(`/boards/${boardId}/labels`, { limit: 1000 });

    const listMap  = Object.fromEntries(lists.map((l)  => [l.name, l.id]));
    const labelMap = Object.fromEntries(labels.map((l) => [l.name || `unnamed_${l.color}`, l.id]));

    resolved.boards[tier] = {
      board_id: boardId,
      lists: listMap,
      labels: labelMap
    };
    console.log(`✓ ${tier}: ${Object.keys(listMap).length} lists, ${Object.keys(labelMap).length} labels`);
  }

  const outPath = path.join(__dirname, "resolved-ids.json");
  fs.writeFileSync(outPath, JSON.stringify(resolved, null, 2));
  console.log(`\n✓ Wrote ${path.relative(process.cwd(), outPath)}`);
})().catch((e) => { console.error("Fatal:", e); process.exit(1); });
