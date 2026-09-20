# Command Code Usage

[English](README.md) · [简体中文](README.zh-CN.md) · [![Check](https://github.com/Jovan1666/zcode-command-code-usage/actions/workflows/check.yml/badge.svg)](https://github.com/Jovan1666/zcode-command-code-usage/actions/workflows/check.yml)

Check how much of your **Command Code** plan you have left, without leaving the conversation.
Works in **ZCode** and **Claude Code**.

Command Code plans (Go / GOAT / Pro / Max / Teams) pace your monthly credits with two **rolling
windows**: a 5-hour cap and a weekly cap. A window opens on your first request and resets a fixed
time later — it does not follow calendar days, and usage never carries over between windows. So
"can I still finish this task?" cannot be answered from the monthly balance alone: what matters is
how much of the *current* window is left and when it resets.

This plugin reads all three numbers and renders them where you are already looking.

```
Command Code · GOAT                             09-21 00:45 · 30d left in period
──────────────────────────────────────────────────────────────────────────
account  your-name <you@example.com>

5-hour window  ██░░░░░░░░░░░░░░░░░░░░░░   6.3%    $0.89 / $14.00
               resets 04:29 · in 3h 43m
weekly window  █░░░░░░░░░░░░░░░░░░░░░░░   2.5%    $0.89 / $35.00
               resets 09-27 23:29 · in 6d 22h
monthly        ░░░░░░░░░░░░░░░░░░░░░░░░   1.3%    $0.89 / $70.00
               $69.11 remaining

this period  330 requests · 100% success · 96.3M in / 306.9K out tokens
estimate      at your $0.0026 average, room for ≈ 5,064 more requests in the 5-hour window
              (based on your actual model mix this period; pricier models go much shorter)
```

When you are burning fast enough that a window will run out before it resets, it says so:

```
⚠ at the current $4.30/h, the 5-hour window runs out before it resets — exhausted in ~15m 20s
```

## Why it lives in the conversation

ZCode has no plugin API for a persistent in-app widget, and that is not a guess — it is what the
app's own code shows:

- a plugin manifest can contribute exactly five executable things — `commands`, `skills`, `hooks`,
  `mcpServers`, `agents`. There is no status-bar, sidebar or dashboard slot.
- every `statusBar.*` string in `app.asar` (2271 of them) is a bundled editor theme colour token,
  not a mountable component.
- `output-styles` exists as a packaged directory, but the `outputStyles` field appears **zero** times
  in the code that runs — recognised on paper, never executed.
- hooks do render as a row in the transcript, but the hook entity carries only state, duration and
  name — **it has no output field**, so a hook cannot display a live number either.

That leaves the slash command, whose output is rendered in the conversation. So that is where this
plugin puts the panel. No browser tab, no website to poll.

## Requirements

- **An agent that supports commands and skills** — ZCode or Claude Code. Both are verified; the
  layout is the standard `.zcode-plugin` / `.claude-plugin` one, so other compatible agents should
  work too.
- **A Command Code plan.** Without one the panel has nothing to show. If you are on
  pay-as-you-go rather than a subscription, it still works but shows a balance instead of windows.
- **Node.js** — only to run the bundled scripts. They use nothing but Node built-ins, so there is no
  `npm install`.

## Install

### ZCode — from the marketplace (recommended)

1. Open **Plugin Marketplace → Add → Add Plugin Marketplace**.
2. Paste this repository:

   ```
   Jovan1666/zcode-command-code-usage
   ```

3. Go to **Personal → Command Code Usage → Install**.
4. **Fully quit and reopen ZCode**, then start a new task and run `/quota`.

### Claude Code

```
/plugin marketplace add Jovan1666/zcode-command-code-usage
/plugin install command-code-usage@command-code-usage
```

### Option B — local install script (ZCode, no marketplace needed)

Clone the repo, then:

```bash
node command-code-usage/scripts/install-user-scope.mjs
```

This copies the commands and the skill into your user-scope ZCode directories
(`~/.zcode/commands/`, `~/.zcode/skills/`), which ZCode scans with the **highest** priority.

Add `--workspace <dir>` to also install into `<dir>/.zcode/commands`. Other switches:

```bash
node command-code-usage/scripts/install-user-scope.mjs --dry-run     # show the file plan, write nothing
node command-code-usage/scripts/install-user-scope.mjs --uninstall   # remove the copies
node command-code-usage/scripts/verify-discoverable.cjs .            # check ZCode will see the commands
```

The installer **never overwrites your own content**: it records a hash of everything it writes and
only updates a file that is both in its own install manifest *and* unchanged since it wrote it. A
same-named command you wrote yourself, or a file you edited afterwards, is refused with a reason
instead of being clobbered.

> **Do not use both a local install and the marketplace route at once.** User-scope copies are
> discovered before plugin-provided ones, so a local copy shadows the marketplace version and the
> Update button stops affecting your commands. Run `--uninstall` before switching.

### After installing in ZCode: restart the app

ZCode snapshots the command and skill catalogue when a session starts. A plugin directory created
while the app is running is not picked up by merely opening a new task — and since ZCode keeps a
tray icon, closing the window often just minimises it and leaves the process alive. **Quit the app
fully** (tray → Quit, or confirm no `ZCode` process remains in Task Manager) and reopen it.

## Usage

| Command | What it does |
|---|---|
| `/quota` | The panel above |
| `/usage` | Same thing, alias |
| `/quota --md` | Markdown table, easier to copy |
| `/quota --compact` | One line: `CC GOAT · 5h 6%（≈4,829） · weekly 2% · monthly 1.2% · $69.16 left` |
| `/quota --json` | Normalised fields, plus the raw API responses |
| `/quota --demo hot` | Sample data, previews the warning state without touching the network |

You can also skip the command entirely and just ask:

> How much Command Code quota do I have left? Is it enough to finish what we are doing?

The bundled skill teaches the agent to fetch the panel and to answer "is it enough" from the
remaining-requests estimate rather than from the monthly balance.

## Token cost, and the zero-token alternative

A custom command is ultimately a prompt. `/quota` injects its body, the agent runs the script, and
the panel text passes through the model. Measured, one invocation costs roughly **390 tokens**: about
100 for the command body, 80 for the tool call, 180 for the panel text, 40 for the reply. The body is
deliberately short and the agent is told **not to restate the panel** — it is already visible from the
tool call. (The first version restated it and cost about 680.)

**To spend no tokens at all**, run the panel as a local page and open it in ZCode's built-in browser
pane:

```bash
node command-code-usage/scripts/cc-usage.mjs --serve
# then open http://127.0.0.1:8787/
```

It refreshes every 30 seconds, shows the same ring gauges, and never touches the model. This is the
only zero-token option available: ZCode exposes no plugin-contributed in-app widget, and a hook cannot
display content either — the hook record it renders carries status, duration and name, with no output
field (verified in `resources/glm/zcode.cjs`).

ZCode *does* support inline shell expansion in command bodies (`` !`cmd` `` or a fenced `!` block),
which runs locally before the prompt is built. It is not used here: on Windows that shell is
`cmd.exe`, not bash, so it would only work with a hard-coded script path and would fail hard for
marketplace installs. Not worth the fragility for the ~80 tokens it would save.

## How the two useful numbers are derived

**"Room for ≈ N more requests"** = remaining allowance ÷ your average cost per request *this
period*. The average comes from your own usage, so the estimate adapts to any plan and any model
mix without hard-coding per-model rates.

Because the baseline is your own average, **it stops holding the moment you switch models** — the
panel says so. Command Code's `/provider/v1/models` returns a model list with no allowance factors
or prices, so "how many requests of model X specifically" cannot be computed from the API.

**The warning** extrapolates your current burn rate. That path has a trap worth knowing about: an
hour after a window opens, extrapolating one hour of activity across seven days will always scream
that the weekly cap is about to blow. Pure noise. So the script enforces a minimum sample — **under
5% of the window elapsed it draws no conclusion at all**. No warning therefore means "not enough
data yet", not "you are safe".

## Account shapes it handles

The script reads what your account actually is instead of forcing one template:

| Situation | What is shown |
|---|---|
| Subscription, plan in the known table | monthly allowance bar plus both windows |
| Subscription, plan not in the table (new or enterprise) | "allowance" plus an explicit note that the total is inferred from spent + remaining |
| No active subscription (pay-as-you-go, enterprise pool) | balance only, no meaningless percentage |
| Organisation spend caps configured | extra limit rows (shapes it cannot recognise are skipped, never guessed) |
| No requests yet this period | no request-count estimate, and it says why |

## Credentials

Resolved in order, first hit wins. **Nothing is ever written to disk, printed, or committed.**

1. Environment variable `COMMAND_CODE_API_KEY`, `CMD_API_KEY` or `COMMANDCODE_API_KEY`
2. `~/.commandcode/auth.json` — written by logging into the Command Code CLI
3. `~/.zcode/v2/provider_config.json` — a ZCode provider whose `api.baseUrl` points at
   `commandcode.ai`. **If you already configured the provider in ZCode, you are done** — the plugin
   reuses that key, and there is no second login.

Whichever source was used is shown by `--verbose` and at the bottom of the HTML panel. The key only
ever appears in an `Authorization: Bearer` header.

## The API it reads

Four read-only endpoints on `https://api.commandcode.ai`, all needing `Authorization: Bearer <key>`:

| Endpoint | Contents |
|---|---|
| `/alpha/whoami?limits=1` | user, org, organisation-level `orgLimits` |
| `/alpha/billing/credits` | `credits` (balance) and `windowLimits` (both rolling windows) |
| `/alpha/billing/subscriptions` | `planId`, `status`, billing period start and end |
| `/alpha/usage/summary?orgId=&since=` | request count, cost, tokens, success rate for the period |

`/provider/v1/*` is the inference API (OpenAI- and Anthropic-compatible) and exposes **no** usage
data — allowance lives only under `/alpha/*`.

Two field semantics that are easy to get backwards: `credits.credits.monthlyCredits` is the
**remaining** amount, not the used one; and a window's `used` / `cap` are **dollar values**, not
request counts.

## Standalone use

The scripts work without ZCode:

```bash
node command-code-usage/scripts/cc-usage.mjs                    # panel
node command-code-usage/scripts/cc-usage.mjs --compact          # one line
node command-code-usage/scripts/cc-usage.mjs --json > s.json    # snapshot
node command-code-usage/scripts/cc-usage.mjs --from-json s.json # replay a snapshot offline
node command-code-usage/scripts/cc-usage.mjs --demo hot         # sample data, no network
```

Optional, if you actually want a big screen — most people never need these:

```bash
node command-code-usage/scripts/cc-usage.mjs --html --open   # write an HTML dashboard
node command-code-usage/scripts/cc-usage.mjs --serve         # serve it, refreshes every 30s
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `/quota` is missing from the `/` menu | The catalogue was snapshotted before installation. Fully quit ZCode and reopen (see above). |
| Typing `/quota` sends it as a normal message | The command was not discovered. Run `verify-discoverable.cjs .` — it re-implements ZCode's own parser and reports diagnostics. |
| "No Command Code credentials found" | Provide one of the three sources above. If you use the provider configured in ZCode, check that its `baseUrl` contains `commandcode.ai`. |
| HTTP 401 for every endpoint | The key is invalid or expired. Re-login, or re-enter it in the ZCode provider settings. |
| Numbers look stale | Window reset times move. Re-run the command; do not reuse a reading from minutes ago. |
| Requests are being rate-limited (429) | Check which window reports `exceeded`, then either wait for the reset, buy extra credits, or upgrade. |

`/quota` and `/usage` are both confirmed **free** of ZCode's reserved command names. The full
reserved set, for reference: `clear, compact, compress, continue, dwf, effort, expert, fork, goal,
help, init, language, locale, login, logout, mcp, mode, model, new, plan, plugin, plugins, resume,
rewind, skill, target, variant`.

## Repository layout

```
.
├── marketplace.json                  ZCode-catalogue (repo root = marketplace root)
├── .claude-plugin/marketplace.json   Claude-catalogue (identical shared fields, strict-clean)
├── README.md / README.zh-CN.md
├── LICENSE / CHANGELOG.md
├── .github/workflows/check.yml       CI: 3 platforms, release checks, offline smoke tests
├── scripts/check.mjs                 release gate (shared with CI)
└── command-code-usage/               the plugin
    ├── .zcode-plugin/plugin.json     manifest read by ZCode (checked first)
    ├── .claude-plugin/plugin.json    manifest read by Claude Code
    ├── commands/
    │   ├── quota.md                  /quota
    │   └── usage.md                  /usage
    ├── skills/command-code-usage/SKILL.md
    └── scripts/
        ├── cc-usage.mjs              fetch + render (terminal / markdown / JSON / HTML)
        ├── install-user-scope.mjs    user-scope install, sync and uninstall
        └── verify-discoverable.cjs   diagnostic: re-implements ZCode's command parser
```

### Why some files exist twice

The plugin and the catalogue each have a ZCode copy and a Claude Code copy, because the two
ecosystems look in different places and accept different fields:

- ZCode reads `.zcode-plugin/plugin.json` first, then falls back to `.claude-plugin/`.
  Claude Code only reads `.claude-plugin/`.
- ZCode's catalogue accepts presentational fields Claude Code ignores —
  `displayName_i18n`, `description_i18n`, `examplePrompts`, `examplePrompts_i18n`. Claude Code's
  validator reports those as unknown fields, and fails under `--strict`.

So the ZCode catalogue keeps the localized display names (its users see Chinese labels), and the
Claude catalogue stays strict-clean so it passes the validator the review pipeline runs. Everything
the two share — name, version, description, source, category, homepage, author — is identical, and
`scripts/check.mjs` fails the build if that ever drifts. Run it before committing:

```bash
node scripts/check.mjs
```

`commands/*.md` contain the token `@@CC_USAGE_SCRIPT@@`. The install script substitutes it with the
absolute path of `cc-usage.mjs`; when the plugin arrives through either marketplace the token is left
alone and the shell snippet searches the known agent directories (`~/.zcode`, `~/.claude`,
`~/.agents`, `~/.codex`) for the script instead — so every route works.

## Distribution status

| Channel | State |
|---|---|
| **This repo added as a marketplace** | **Live.** Paste `Jovan1666/zcode-command-code-usage` in either agent. |
| ZCode official marketplace (`zcode-plugins-official`) | Not submitted. Its description says it carries community plugins, but Z.ai exposes no public submission process — there is no form, and nothing in the app to submit through. |
| Claude Code community marketplace (`anthropics/claude-plugins-community`) | Not submitted. That repo is a read-only mirror; submissions go through a Console form that needs an account login, so it is a maintainer action, not something CI or a script can do. The official marketplace is invitation-only: its docs state there is no application process. |

## Status and scope

Tested on Windows: the API integration, all output modes (terminal, `--md`, `--compact`, `--json`,
`--from-json`, HTML, serve), the account-shape branches, credential resolution, every error path,
and the installer's conflict handling (fresh install, re-install, edited file, foreign file).
A clean-machine install from the published repo was also exercised end to end (clone → install →
discovery → execution).

CI additionally runs the release gate, the offline smoke tests, an install-and-discover check, and
the installer's conflict guard on **Ubuntu, Windows and macOS**.

Not yet verified: a second person installing through a marketplace UI, and running the commands
inside a live Claude Code session. If something misbehaves, please open an issue with the output of
`node scripts/check.mjs` (or `command-code-usage/scripts/verify-discoverable.cjs .` for discovery
problems) and the exact message you saw.

Not affiliated with Command Code. It reads your own account's usage through the same endpoints the
official CLI uses; it does not proxy, modify or transmit anything anywhere else.

## License

[MIT](LICENSE)
