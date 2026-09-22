#!/usr/bin/env node
// Standalone CLI for the ADtention OpenCode plugin: `npx @adtention/opencode key` prints this
// install's publisher_id + secret so the user can link it to their account and claim its earnings.
//
// V2 keeps each plugin's durable storage under OpenCode's state directory, so the identity lives in
// <state>/opencode/<channel>/tui/plugin.adtention.sponsor.state.json (channels: latest, dev, beta,
// ...). This CLI scans those files and picks the most recently written identity. It also reads the
// V1 KV (~/.local/state/opencode/kv.json, key "adtention:identity") so pre-V2 installs keep working,
// and falls back to a stable home-dir backup (~/.adtention/opencode-identity.json) that would survive
// a state wipe, but writing that file is a planned follow-up: the TUI does not write it yet, so the
// fallback is currently dormant. The secret is a credential, so it only prints on this explicit,
// user-run command, never in the TUI line.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const stateHome =
  process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
const OPENCODE_STATE = join(stateHome, "opencode");
const LEGACY_KV_PATH = join(OPENCODE_STATE, "kv.json");
const IDENTITY_BACKUP = join(homedir(), ".adtention", "opencode-identity.json");
const STORAGE_FILE = "plugin.adtention.sponsor.state.json";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function hasIdentity(value) {
  return Boolean(value && value.publisher_id && value.secret);
}

// V2: one storage file per channel. Scan them and prefer the newest identity.
function loadV2Identity() {
  let entries;
  try {
    entries = readdirSync(OPENCODE_STATE, { withFileTypes: true });
  } catch {
    return null;
  }
  let best = null;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(OPENCODE_STATE, entry.name, "tui", STORAGE_FILE);
    const state = readJson(file);
    if (!hasIdentity(state && state.identity)) continue;
    let mtime = 0;
    try {
      mtime = statSync(file).mtimeMs;
    } catch {
      /* keep 0 */
    }
    if (!best || mtime > best.mtime) best = { identity: state.identity, mtime };
  }
  return best && best.identity;
}

// V1 KV is a flat object keyed by string; the identity lives under "adtention:identity". The backup
// is the identity object itself.
function loadIdentity() {
  const fromV2 = loadV2Identity();
  if (fromV2) return fromV2;
  const kv = readJson(LEGACY_KV_PATH);
  const fromKv = kv && kv["adtention:identity"];
  if (hasIdentity(fromKv)) return fromKv;
  const backup = readJson(IDENTITY_BACKUP);
  if (hasIdentity(backup)) return backup;
  return null;
}

const cmd = process.argv[2];
if (cmd !== "key") {
  console.log("Usage: npx @adtention/opencode key");
  process.exit(cmd ? 1 : 0);
}

const id = loadIdentity();
if (!id) {
  console.log(
    "adtention: no install identity yet. Open OpenCode and send one prompt to register your install, then run this again.",
  );
  process.exit(1);
}

// Printing the secret is safe by design: it's the one-time claim proof, and linking is write-once
// server-side (a claimed install can't be re-linked to another account), so a secret later seen in
// the terminal is inert. A credential before linking, inert after.
console.log(
  "Your ADtention publisher key. Link it to claim and cash out your earnings.",
);
console.log();
console.log("  publisher_id:  " + id.publisher_id);
console.log("  secret:        " + id.secret);
console.log();
console.log("Link at:  https://app.adtention.ai/earn/link");
