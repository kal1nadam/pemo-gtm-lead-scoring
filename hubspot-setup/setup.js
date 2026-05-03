#!/usr/bin/env node
/**
 * HubSpot setup script
 *
 * Creates the property group + all custom contact and company properties
 * required by the Pemo lead-scoring workflow. Idempotent — safe to re-run.
 *
 * Usage:
 *   1. Ensure ../.env contains HUBSPOT_ACCESS_TOKEN
 *   2. node setup.js              # create everything
 *   3. node setup.js --dry-run    # preview without writing
 *   4. node setup.js --delete     # tear down (removes all pemo_* properties)
 *
 * Requirements: Node 18+ (uses built-in fetch). No npm install needed.
 */

const fs = require("fs");
const path = require("path");

// --- Load .env from repo root ---
const envPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("✗ HUBSPOT_ACCESS_TOKEN missing from .env");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const DELETE = args.has("--delete");

const definitions = require("./properties.json");
const API = "https://api.hubapi.com";

// ---------- API helpers ----------

async function hs(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { /* not json */ }
  return { ok: res.ok, status: res.status, body: json, raw: text };
}

async function ensureGroup(objectType, group) {
  const existing = await hs("GET", `/crm/v3/properties/${objectType}/groups`);
  if (existing.ok && existing.body?.results?.some((g) => g.name === group.groupName)) {
    log(`  group "${group.groupName}" already exists on ${objectType}`);
    return;
  }
  if (DRY_RUN) { log(`  [dry-run] would create group "${group.groupName}" on ${objectType}`); return; }
  const res = await hs("POST", `/crm/v3/properties/${objectType}/groups`, {
    name: group.groupName,
    label: group.groupLabel,
    displayOrder: -1
  });
  if (res.ok) log(`  ✓ created group "${group.groupName}" on ${objectType}`);
  else log(`  ✗ group create failed (${res.status}): ${res.raw}`);
}

async function ensureProperty(objectType, groupName, prop) {
  const existing = await hs("GET", `/crm/v3/properties/${objectType}/${prop.name}`);
  if (existing.ok) {
    log(`  ◦ ${prop.name} already exists`);
    return;
  }
  if (DRY_RUN) { log(`  [dry-run] would create ${objectType}.${prop.name}`); return; }
  const payload = { ...prop, groupName };
  const res = await hs("POST", `/crm/v3/properties/${objectType}`, payload);
  if (res.ok) log(`  ✓ ${prop.name}`);
  else log(`  ✗ ${prop.name} (${res.status}): ${res.raw.slice(0, 200)}`);
}

async function deleteProperty(objectType, propName) {
  if (DRY_RUN) { log(`  [dry-run] would delete ${objectType}.${propName}`); return; }
  const res = await hs("DELETE", `/crm/v3/properties/${objectType}/${propName}`);
  if (res.ok) log(`  ✓ deleted ${propName}`);
  else log(`  ◦ ${propName} not deleted (${res.status})`);
}

function log(msg) { console.log(msg); }

// ---------- Main ----------

(async () => {
  log("");
  log("┌────────────────────────────────────────────────────┐");
  log(`│  HubSpot setup ${DELETE ? "(DELETE mode)" : DRY_RUN ? "(dry-run)" : "             "}                  │`);
  log("└────────────────────────────────────────────────────┘");
  log("");

  // Sanity check token
  const me = await hs("GET", "/crm/v3/properties/contact?limit=1");
  if (!me.ok) {
    console.error(`✗ HubSpot auth failed (${me.status}). Check HUBSPOT_ACCESS_TOKEN scopes.`);
    process.exit(1);
  }
  log("✓ HubSpot token valid");
  log("");

  for (const objectType of ["contact", "company"]) {
    const def = objectType === "contact" ? definitions.contact_properties : definitions.company_properties;
    log(`▸ ${objectType.toUpperCase()} properties`);

    if (DELETE) {
      for (const p of def.properties) await deleteProperty(objectType, p.name);
      log("");
      continue;
    }

    await ensureGroup(objectType, def);
    for (const p of def.properties) {
      await ensureProperty(objectType, def.groupName, p);
    }
    log("");
  }

  log("Done.");
})().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
