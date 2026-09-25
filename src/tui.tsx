/** @jsxImportSource @opentui/solid */
//
// ADtention sponsor unit for OpenCode 2.
//
// Renders ONE quiet line pinned to the bottom of the OpenCode TUI (the `app`
// slot, mounted below the active route on every screen):
//
//   sponsored  <message>  →  /sponsor to learn more            ⊕ $0.42
//
// Left = the sponsor unit; right = the user's running ADtention balance.
//
// Protocol (shared with the Claude Code client):
//   - POST /v1/register {client, ref?} -> {publisher_id, ...}        (one-time, non-billable)
//   - POST /v1/serve {publisher_id, category, nonce, client}          (THE billable impression)
//       -> {text, balance_usd, click_url, impression_id}
//   - GET  /v1/click/<impression_id>                                 (attributable click)
// `client` is a static originating-tool tag ("opencode"); the server stamps it on the
// publisher (at register) and on each impression (at serve) for traffic attribution.
//
// Economics: a serve is billable, so we only serve on a REAL prompt — the
// `session.execution.started` transition (the durable event OpenCode 2 emits
// when an agent turn begins) — at most once every 15s. An idle terminal earns
// nothing. Category is classified LOCALLY from the project folder; only the
// resulting tag (web3/web/devops/data/systems/general) is sent.
//
// Display is decoupled from billing: the line always renders from the plugin's
// durable storage (instant, offline-safe); a serve only updates that cache.
//
// `/sponsor` (also in the ctrl+p palette) opens the current sponsor's link.
//
// Distributed two ways:
//   - npm:   "plugins": ["@adtention/opencode"]                in cli.json
//   - local: "plugins": ["file:///path/to/adtention-opencode"] in cli.json
//
import { Plugin } from "@opencode/plugin/tui";
import type { Context } from "@opencode/plugin/tui/context";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Show } from "solid-js";
import type { Store } from "solid-js/store";

const id = "adtention.sponsor";

type Sponsor = { text: string; url?: string; cta?: string };
type Identity = { publisher_id?: string; secret?: string } & Record<
  string,
  unknown
>;
type State = {
  identity: Identity | null;
  sponsor: Sponsor | null;
  balance: number;
};

// Shown only with the `demo` option (e.g. for screenshots without a server).
const FALLBACK: Sponsor = {
  text: "Alchemy: APIs for every chain",
  url: "alchemy.com",
};

const DEFAULT_API = "https://api.adtention.ai";
const MIN_DWELL_MS = 15_000;

// Originating-tool tag, sent on register (owning tool) and serve (per-impression). The server
// sanitizes it to a slug and falls back to the publisher's owning tool when omitted.
const CLIENT_TAG = "opencode";

// V1 kept its state in OpenCode's global KV. V2 gives every plugin its own durable storage, so
// adopt the V1 identity (and cached sponsor/balance) once to preserve an upgraded install's
// earnings. The KV is still present in V2 state directories, and reading a missing file is a no-op.
const LEGACY_KV = join(
  process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
  "opencode",
  "kv.json",
);

function loadLegacy(): Partial<State> {
  try {
    const kv = JSON.parse(readFileSync(LEGACY_KV, "utf8")) as Record<
      string,
      unknown
    >;
    const result: Partial<State> = {};
    const identity = kv["adtention:identity"];
    if (identity && typeof (identity as Identity).publisher_id === "string")
      result.identity = identity as Identity;
    const sponsor = kv["adtention:sponsor"];
    if (sponsor && typeof (sponsor as Sponsor).text === "string")
      result.sponsor = sponsor as Sponsor;
    const balance = kv["adtention:balance"];
    if (typeof balance === "number") result.balance = balance;
    return result;
  } catch {
    return {};
  }
}

// ---- small helpers -------------------------------------------------------

// Server copy is untrusted at the terminal boundary: strip control bytes so it
// can't emit escape sequences when rendered.
function sanitize(s: string) {
  return s.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}
// Drop a trailing " → domain" from ad copy; the visible domain is display-only,
// the real destination is the click URL behind /sponsor.
function stripTail(s: string) {
  return s.replace(/\s→\s\S+$/, "").trim();
}
function sanitizeRef(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 32);
}
function makeNonce() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

// Classify the project folder locally — mirrors the Go client. Only the tag is
// ever sent; nothing about the code leaves the machine.
function hasExt(dir: string, ext: string) {
  try {
    return readdirSync(dir).some((f) => f.endsWith(ext));
  } catch {
    return false;
  }
}
function hasPrefix(dir: string, prefix: string) {
  try {
    return readdirSync(dir).some((f) => f.startsWith(prefix));
  } catch {
    return false;
  }
}
function classify(dir: string): string {
  const has = (f: string) => existsSync(join(dir, f));
  if (
    has("foundry.toml") ||
    hasExt(dir, ".sol") ||
    hasPrefix(dir, "hardhat.config.")
  )
    return "web3";
  if (has("Dockerfile") || hasExt(dir, ".tf")) return "devops";
  if (has("package.json")) return "web";
  if (has("requirements.txt") || hasExt(dir, ".py")) return "data";
  if (has("Cargo.toml") || has("go.mod")) return "systems";
  return "general";
}

// Open a URL in the default browser, cross-platform. The TUI owns the screen,
// so we shell out rather than rely on terminal hyperlinks.
function openURL(raw: string) {
  const url = /^[a-z]+:\/\//i.test(raw) ? raw : "https://" + raw;
  if (!/^https?:\/\//i.test(url)) return; // never hand the OS a non-web scheme
  try {
    if (process.platform === "darwin")
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    else if (process.platform === "win32")
      spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
      }).unref();
    else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // best effort
  }
}

// ---- view ----------------------------------------------------------------

function SponsorLine(props: { context: Context; state: Store<State> }) {
  const theme = () => props.context.theme;
  const balance = () =>
    typeof props.state.balance === "number" ? props.state.balance : 0;
  return (
    <box
      width="100%"
      paddingLeft={2}
      paddingRight={2}
      flexDirection="row"
      flexShrink={0}
      gap={1}
    >
      <Show
        when={props.state.sponsor}
        fallback={<text fg={theme().text.subdued}>adtention</text>}
      >
        {(s) => (
          <box flexDirection="row" flexShrink={1} gap={1}>
            <text fg={theme().text.subdued}>sponsored</text>
            <text fg={theme().text.default}>{s().text}</text>
            <Show when={s().url}>
              <text fg={theme().text.subdued}>→</text>
              <text fg={theme().text.action.primary.default}>/sponsor</text>
              <text fg={theme().text.subdued}>
                {s().cta ?? "to learn more"}
              </text>
            </Show>
          </box>
        )}
      </Show>
      <box flexGrow={1} />
      <text fg={theme().text.subdued}>⊕</text>
      <text fg={theme().text.feedback.success.default}>
        ${balance().toFixed(2)}
      </text>
    </box>
  );
}

// ---- plugin --------------------------------------------------------------

export default Plugin.define({
  id,
  setup(context) {
    const opts = context.options as { api?: string; demo?: boolean };
    const apiBase = (
      opts.api ||
      process.env.ADTENTION_API ||
      DEFAULT_API
    ).replace(/\/+$/, "");

    // Durable, plugin-scoped state. V2 storage is JSON on disk, shared live with
    // every running TUI instance, so the line survives restarts and stays in sync.
    const legacy = loadLegacy();
    const hasLegacy = Boolean(
      legacy.identity || legacy.sponsor || legacy.balance,
    );
    const [state, updateState] = context.storage.store<State>("state", {
      initial: { identity: null, sponsor: null, balance: 0 },
    });

    // One-time V1 -> V2 state adoption; a no-op on a fresh install or once filled.
    const hydration = hasLegacy
      ? updateState((draft) => {
          if (!draft.identity && legacy.identity)
            draft.identity = legacy.identity;
          if (!draft.sponsor && legacy.sponsor) draft.sponsor = legacy.sponsor;
          if (!draft.balance && legacy.balance) draft.balance = legacy.balance;
        }).catch(() => {})
      : Promise.resolve();

    let lastServe = 0;
    let registerInFlight: Promise<string> | null = null;

    async function postJSON(path: string, body?: unknown) {
      const res = await fetch(apiBase + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? "" : JSON.stringify(body),
        signal: AbortSignal.timeout(5000), // never let a stalled server hang a request
      });
      return (await res.json()) as any;
    }

    // One-time identity. Registration is non-billable, so it can run eagerly.
    // Single-flighted so a startup call and a first-prompt call can't both
    // register and create two publisher accounts.
    async function ensureRegistered(): Promise<string> {
      const existing = state.identity;
      if (existing && typeof existing.publisher_id === "string")
        return existing.publisher_id;
      if (registerInFlight) return registerInFlight;
      registerInFlight = (async () => {
        await hydration; // let a V1 identity land before registering a new one
        const adopted = state.identity;
        if (adopted && typeof adopted.publisher_id === "string")
          return adopted.publisher_id;
        try {
          const ref = process.env.ADTENTION_REF
            ? sanitizeRef(process.env.ADTENTION_REF)
            : "";
          const data = await postJSON("/v1/register", {
            client: CLIENT_TAG,
            ...(ref ? { ref } : {}),
          });
          if (data && typeof data.publisher_id === "string") {
            await updateState((draft) => {
              draft.identity = data;
            }).catch(() => {});
            return data.publisher_id as string;
          }
        } catch {
          // offline -> retry later
        }
        return "";
      })();
      try {
        return await registerInFlight;
      } finally {
        // Failed or not, the next prompt may try again; a success is cached in state.
        registerInFlight = null;
      }
    }

    // Turn a serve response into cached sponsor + balance. This is the only
    // place display state changes, so the line stays offline-safe.
    function parseSponsor(data: any): Sponsor | undefined {
      const text = stripTail(sanitize(String(data.text)));
      let click = data.click_url
        ? sanitize(String(data.click_url))
        : data.impression_id
          ? "/v1/click/" + data.impression_id
          : "";
      if (click.startsWith("/")) click = apiBase + click;
      if (!/^https?:\/\//i.test(click)) click = "";
      if (!text) return undefined;
      return click ? { text, url: click } : { text };
    }

    function applyServe(data: any) {
      const sponsor =
        typeof data?.text === "string" ? parseSponsor(data) : undefined;
      const balance =
        typeof data?.balance_usd === "number" ? data.balance_usd : undefined;
      if (sponsor === undefined && balance === undefined) return;
      void updateState((draft) => {
        if (balance !== undefined) draft.balance = balance;
        if (sponsor !== undefined) draft.sponsor = sponsor;
      }).catch(() => {});
    }

    async function safeServe(pub: string, category: string) {
      try {
        return await postJSON("/v1/serve", {
          publisher_id: pub,
          category,
          nonce: makeNonce(),
          client: CLIENT_TAG,
        });
      } catch {
        return null;
      }
    }

    // Record a billable impression — only on a real prompt, dwell-gated.
    async function serveImpression() {
      const now = Date.now();
      if (now - lastServe < MIN_DWELL_MS) return;
      lastServe = now;

      const pub = await ensureRegistered();
      if (!pub) {
        lastServe = 0; // registration failed; let the next prompt retry
        return;
      }

      const dir = (() => {
        try {
          return (context.location ?? context.data.location.default())
            .directory;
        } catch {
          return process.cwd();
        }
      })();
      const category = classify(dir);

      let data = await safeServe(pub, category);
      if (data?.error && String(data.error).includes("unknown_publisher")) {
        // self-heal: identity was dropped server-side; re-register and retry once.
        await updateState((draft) => {
          draft.identity = null;
        }).catch(() => {});
        const pub2 = await ensureRegistered();
        if (pub2) data = await safeServe(pub2, category);
      }
      if (data) applyServe(data);
    }

    // 1. Register ahead of the first prompt (non-billable).
    void ensureRegistered();
    if (opts.demo && !state.sponsor)
      void updateState((draft) => void (draft.sponsor = FALLBACK)).catch(
        () => {},
      );

    // 2. Serve on a real prompt. OpenCode 2 marks an agent turn with the durable
    //    `session.execution.*` events (the same ones the host's own session
    //    status is derived from); the older `session.status` busy/idle pair is
    //    kept as a fallback for hosts that still emit it. Subagents carry their
    //    parent's prompt, so only root sessions serve; `active` drops duplicate
    //    signals for the same turn and the dwell gate inside serveImpression
    //    guards rapid repeats.
    const active = new Set<string>();
    function promptStarted(sessionID: string) {
      const session = context.data.session.get(sessionID);
      if (session?.parentID) return; // subagent work belongs to the parent's prompt
      if (active.has(sessionID)) return;
      active.add(sessionID);
      void serveImpression();
    }
    function promptEnded(sessionID: string) {
      active.delete(sessionID);
    }
    const offStatus = context.data.on("session.status", (event) => {
      const type = event.data.status.type;
      if (type === "busy") promptStarted(event.data.sessionID);
      else if (type === "idle") promptEnded(event.data.sessionID);
    });
    const offExecutionStarted = context.data.on(
      "session.execution.started",
      (event) => promptStarted(event.data.sessionID),
    );
    const offExecutionSucceeded = context.data.on(
      "session.execution.succeeded",
      (event) => promptEnded(event.data.sessionID),
    );
    const offExecutionFailed = context.data.on(
      "session.execution.failed",
      (event) => promptEnded(event.data.sessionID),
    );
    const offExecutionInterrupted = context.data.on(
      "session.execution.interrupted",
      (event) => promptEnded(event.data.sessionID),
    );

    // 3. `/sponsor` command + palette entry, and the unit pinned to the bottom
    //    of every screen. The keymap layer is owned by the slot component, so it
    //    lives exactly as long as the plugin does.
    const unregisterSlot = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "adtention.open",
              title: "Open sponsor link",
              group: "ADtention",
              palette: true,
              slash: { name: "sponsor" },
              run() {
                const url = state.sponsor?.url;
                if (url) openURL(url);
              },
            },
          ],
        }));
        return <SponsorLine context={context} state={state} />;
      },
    });

    return () => {
      offStatus();
      offExecutionStarted();
      offExecutionSucceeded();
      offExecutionFailed();
      offExecutionInterrupted();
      unregisterSlot();
    };
  },
});
