# Command Code Usage (command-code-usage)

[简体中文](./README_CN.md)

See your Command Code plan usage inside the conversation — the 5-hour and weekly rolling
windows, monthly credits or balance, and when each one resets — without leaving the terminal
or opening a billing page.

## Quick start

Install **Command Code Usage** from the ZCode plugin manager, then either run a command or
just describe what you want to know:

> How much of my 5-hour window is left, and when does it reset?

Both commands render the panel straight into the conversation (a user-scope install registers the
bare `/quota` and `/usage` instead; either form does the same thing):

| Command | What it does |
| --- | --- |
| `/command-code-usage:quota` | The panel: 5-hour window, weekly window, monthly credits or balance, reset times, a remaining-requests estimate, and a warning when a window is burning faster than it resets |
| `/command-code-usage:usage` | The same panel — an alias, so either name works |

Both take the same optional arguments — `--compact`, `--md`, `--json`, `--html`, `--verbose`,
or `--demo hot` for offline sample data. `--help` lists the authoritative set.

| Skill | Role |
| --- | --- |
| `command-code-usage` | Reads the quota and answers questions about the windows, reset times, credits and burn rate |

No hooks, no MCP servers, no agents, no background processes.

## Requirements

| | |
| --- | --- |
| Host | ZCode |
| Runtime | Node.js 18 or newer — the script uses the built-in `fetch` and installs nothing |
| Plan | A Command Code plan whose key may call the usage endpoints. Without API access those endpoints answer `403`/`407` and the panel says so instead of printing a number. |

## Data sources and authentication

One host only: **`https://api.commandcode.ai`** (HTTPS). The endpoints it reads are
`/alpha/whoami`, `/alpha/billing/credits`, `/alpha/billing/subscriptions`,
`/alpha/usage/summary`, and `/provider/v1/models`. The last one sends no credential and is
used only to tell whether the current model is routed to Command Code.

Endpoints under `/alpha/` are not part of Command Code's documented provider API. They are
read because they carry the plan windows; if one changes shape the panel reports the failure
rather than estimating from stale data. `--demo` calls nothing.

The key is discovered read-only, first hit wins:

1. `COMMANDCODE_API_KEY`, then `COMMAND_CODE_API_KEY`, then `CMD_API_KEY`, from the environment
2. `~/.commandcode/auth.json`
3. `~/.zcode/v2/provider_config.json`
4. failing those, provider configs other agent tools leave behind — `~/.claude/settings.json`,
   `~/.pi/agent/settings.json`, `~/.config/opencode/*`, `~/.dsh/*.yaml`, `~/.codex/config.toml`,
   `~/.grok/config.toml`

The key is sent to `api.commandcode.ai` and nowhere else. It is never copied to another
location, never echoed into the output, and never logged.

## What it does on your machine

| | |
| --- | --- |
| Hooks | none — the plugin installs no hooks and does not intercept your tools |
| MCP servers | none — no `.mcp.json`, no server process |
| Network | one host, `api.commandcode.ai`, and only while rendering the panel; `--demo` makes no calls |
| Executes | `node <plugin>/scripts/cc-usage.mjs` with the flags you passed. The command looks for that script at its installed path and, failing that, searches `~/.zcode`, `~/.claude`, `~/.codex`, `~/.grok` and `~/.dsh` for a copy under a `command-code*` or `commandcode*` path. Nothing else is executed. |
| Reads | the credential files listed above, and — when the host passes a transcript path — the last 128 KB of that transcript, only to pick up the `message.model` / `modelId` field of recent entries. No message content is stored or sent anywhere. |
| Writes files | nothing by default. `--html` writes one file, only when you pass the flag, to the path you choose. The script's status-line and hook modes keep local caches under `~/.commandcode-usage/` (a snapshot and a 24 h model-catalog cache); this plugin's commands never call those modes. |
| Host config | never modified — the plugin installs through ZCode's own plugin mechanism |
| Degrades gracefully | a missing key, a plan without API access, and an unparsable response each produce a message naming the cause. It does not invent a figure. |

## Bundled scripts

Besides the script the commands run, the plugin ships two standalone tools. Neither runs on
its own; they exist for the cases described here.

- `scripts/cc-usage.mjs` — the panel itself. Runnable directly:
  `node scripts/cc-usage.mjs --compact`.
- `scripts/install-user-scope.mjs` — installs the commands and the skill into your user-scope
  ZCode directories (`~/.zcode/commands`, `~/.zcode/skills`) for people who would rather not go
  through the marketplace. It writes those files, substitutes the absolute path of
  `cc-usage.mjs` into the command body, and keeps a small manifest of what it wrote so it can
  update or remove them later. **Do not run it on top of a marketplace installation**:
  user-scope copies are discovered first and would shadow the installed plugin. `--uninstall`
  removes them.
- `scripts/verify-discoverable.cjs` — a read-only diagnostic that re-implements ZCode's own
  command parser, so a "my command does not show up" report can come with evidence. It reads
  files and prints a report; it writes nothing.

## Token cost, and the zero-token alternative

A custom command is ultimately a prompt: the body is injected, the agent runs the script, and
the panel text passes through the model. Measured, one `/quota` costs roughly **390 tokens** —
about 100 for the command body, 80 for the tool call, 180 for the panel text, 40 for the reply.
The body is deliberately short and the agent is told **not to restate the panel**, because the
tool result is already visible.

**To spend no tokens at all**, run the panel as a local page and open it in ZCode's built-in
browser pane:

```bash
node scripts/cc-usage.mjs --serve            # then open http://127.0.0.1:8787/
node scripts/cc-usage.mjs --serve --port 8788   # if 8787 is taken
```

It refreshes every 30 seconds, shows the same ring gauges, and never touches the model. It
binds to loopback only and stops with Ctrl+C. ZCode exposes no plugin-contributed in-app
widget, and a hook cannot display content either — the hook record it renders carries status,
duration and name, with no output field.

## Third-party code, assets and services

No third-party code or assets are vendored; the commands, the skill and the script are this
project's own. The only external service is Command Code's own API, and its terms and
availability are Command Code's. Licensed MIT — see the `LICENSE` file in the repository.

Security policy, and the full list of what this plugin touches: see `SECURITY.md` in the
repository. Installation routes, troubleshooting and the release gate: see the repository's
README.
