# ADtention for OpenCode

**The OpenCode terminal line that pays you to code.**

> **OpenCode 2 fork.** This is [Bugg4/adtention-opencode](https://github.com/Bugg4/adtention-opencode),
> a port of [adtention-ai/opencode](https://github.com/adtention-ai/opencode) to the OpenCode 2
> plugin API. The original V1 plugin does not load in OpenCode 2; this fork uses the V2 TUI plugin
> API (the `app` slot, plugin storage, keymap layers, and the V2 event stream). Everything below the
> install instructions — the protocol, the privacy model, the economics — is unchanged.

You watch your terminal while the agent works anyway. ADtention adds one quiet sponsor
line to the bottom of OpenCode that earns you credit while you code — and shows your
running balance right next to it.

```
sponsored  Alchemy: APIs for every chain  →  /sponsor to learn more            ⊕ $0.42
```

One line. No popups. No signup to earn. And **nothing about your code ever leaves your
machine**. The rest of this README shows you exactly how, in a way you can verify yourself.

> **OpenCode terminal (CLI) only.** The sponsor line lives in the TUI, so this is
> for the `opencode` terminal app — not the OpenCode desktop app or editor extensions,
> which don't have that surface.

---

## "Wait. An ad plugin reading my code? Hard pass."

Good instinct. Read this part first, then decide.

When you send a prompt, the plugin looks at **the kinds of files in your project folder**
and sorts it into one of six broad buckets — all of it on your machine, no network call:

`web3` · `web` · `devops` · `data` · `systems` · `general`

The **only** thing that ever goes to the server is that one word, plus a random install id
(a pseudonym, not tied to any personal data), so it can pick a relevant sponsor and credit
your balance.

| Leaves your machine           | Never leaves your machine             |
| ----------------------------- | ------------------------------------- |
| One bucket word (e.g. `web3`) | Your code or file contents            |
| A random install id           | Your prompts or the agent's replies   |
|                               | File names, paths, or repo names      |
|                               | Anything identifying you or your work |

**No account, email, or login to install or earn.** The install id is a random string
created locally the first time the plugin runs. Cashing out, once it's available, will mean
creating an account with a payout method — but earning never requires one.

**Don't take our word for it.** The entire plugin is one short file
([`src/tui.tsx`](src/tui.tsx)) that you can read in a few minutes. The line itself just
renders a cached value — it makes _no_ network call. The only outbound request happens once
per prompt, and you can read exactly what it sends: a one-time `register`, then a `serve`.

---

## What you actually get

- **A balance worth watching**: your running ADtention credit, live at the bottom-right of
  the TUI, on every screen.
- **Passive credit while you work**: the sponsor line earns a small amount each time it's
  served on a real prompt. Money trickles in for doing what you were already doing.
- **Zero friction**: one config entry to install, works instantly, no signup.
- **Privacy by architecture, not by promise**: the design makes leaking your code
  impossible, not just against the rules.
- **A clean exit**: remove one entry from your config and it's gone, no trace.

---

## Install

OpenCode 2 loads terminal plugins from `plugins` in your global
`~/.config/opencode/cli.json` (or `$XDG_CONFIG_HOME/opencode/cli.json`).

```jsonc
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["@adtention/opencode"],
}
```

Using this fork from source instead:

```jsonc
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["file:///home/marco/MasterT/adtention-opencode"],
}
```

Relaunch OpenCode and the line appears at the bottom of the terminal.

> Already disabled a plugin with a `-adtention*` entry in `cli.json`? Remove that entry —
> it disables the plugin in every form, including this fork.

---

## How the money works

- You earn a small amount each time the sponsor line is served, **at most once every 15
  seconds**, and **only when you actually send a prompt**.
- An idle terminal earns nothing. Leaving OpenCode open overnight generates zero
  impressions — no farming, no gaming it.
- Your balance accrues to your install and shows live in the line.
- Cashing out is here: link this install to a free account and withdraw once your balance
  passes a threshold (currently **$10**). See [Cash out your earnings](#cash-out-your-earnings).

## Cash out your earnings

Earning needs no account. Withdrawing does, so you cash out by linking this install to a free
ADtention account (Google sign-in):

1. Print your key in a terminal:

   ```
   npx @adtention/opencode key
   ```

   From a source checkout, the same command runs as:

   ```
   node /home/marco/MasterT/adtention-opencode/src/cli.mjs key
   ```

2. Paste the `publisher_id` and `secret` it prints at
   [app.adtention.ai/earn/link](https://app.adtention.ai/earn/link), then sign in with Google.

Your balance is then tied to your account and withdrawable past the threshold. Linking is
one-time (an install can't be moved to another account afterward), so a secret seen after
linking can't be used to steal it.

Upgrading from the V1 plugin on the same machine? The plugin adopts your existing V1
identity (and cached sponsor/balance) on first run, so your install and earnings stay the
same.

It's not a salary. It's beer money that shows up for work you were doing regardless.

---

## How it works under the hood

Two parts, deliberately kept separate so the terminal is never waiting on a server:

- **The line renders from local storage.** It makes no network call, so it's always
  instant and works offline. V2 stores it as durable, plugin-scoped JSON under
  `~/.local/state/opencode/<channel>/tui/plugin.adtention.sponsor.state.json`, shared live
  with every running TUI instance.
- **A `serve` runs once per prompt.** When the session starts working, the plugin does the
  local sorting, calls the server once (dwell-gated to 15s) to fetch a fresh sponsor and
  your latest balance, and updates the cache. Sponsor selection happens server-side, so
  that logic stays off your machine entirely.

It registers into OpenCode's `app` TUI slot — the row below the active route, shown on
every screen — through `context.ui.slot({ append: "app", ... })`. Your publisher identity
is stored in OpenCode's plugin storage and reused across sessions.

---

## `/sponsor`

Terminal lines aren't clickable, so the sponsor link is a command. Run `/sponsor` (or pick
**Open sponsor link** from the `ctrl+p` palette) to open the current sponsor in your
browser. It only ever opens `http(s)` links.

---

## Configuration

Pass options in the object form in `cli.json` if you need to:

```jsonc
{
  "plugins": [
    {
      "package": "@adtention/opencode",
      "options": { "api": "https://api.adtention.ai" },
    },
  ],
}
```

- `api` — base URL of the ADtention server (default `https://api.adtention.ai`). You can
  also set `ADTENTION_API`.
- `demo` — show a sample sponsor line without a server (useful for screenshots).
- `ADTENTION_REF` — a referral code applied to your first registration.

---

## Uninstall

Remove the `@adtention/opencode` (or `file://...`) entry from your `cli.json` and relaunch.
To also clear the cached identity, sponsor, and balance, delete
`plugin.adtention.sponsor.state.json` from `~/.local/state/opencode/<channel>/tui/`.
That's it — no account to close, no residue.

---

## FAQ

**Is this for the OpenCode desktop app or editor extension?**
No — the terminal (`opencode` CLI) only. The line lives in the TUI, which the
desktop app and editor surfaces don't have.

**Is it going to slow down my terminal?**
No. The line never makes a network call — it reads a cached value and renders. The one
request happens in the background when you send a prompt.

**Will it spam me with flashing ads?**
It's one text line at the bottom of the TUI. No popups, no color flashing, no
interruptions, nothing to click.

**Do I need to sign up or hand over an email?**
Not to install or earn — there's no account or login, just a random install id (a
pseudonym, no personal data) generated locally. Cashing out, once it's available, will
require creating an account with a payout method — but earning never does.

**How do I know my code isn't being harvested?**
Because the categorization runs locally and only emits one of six bucket words. The plugin
is one readable file ([`src/tui.tsx`](src/tui.tsx)) — the line itself makes no network
call at all.

**Does this work on OpenCode 1?**
No. This fork is the OpenCode 2 port; use [adtention-ai/opencode](https://github.com/adtention-ai/opencode)
for V1. The two store identity in different places, and the plugin migrates the V1 identity
when it finds one.

**What if I hate it?**
Remove one line from your `cli.json` and relaunch. No trace left behind.

---

Built by [ADtention](https://adtention.ai). Same network as the
[Claude Code status line](https://github.com/adtention-ai/claude). OpenCode 2 port by
[Bugg4](https://github.com/Bugg4/adtention-opencode). MIT — see [LICENSE](LICENSE).
