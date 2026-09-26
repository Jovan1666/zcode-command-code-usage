# Security Policy

## Supported versions

The latest commit on `main` is supported. Fixes land there; there are no backport
branches and no maintained older releases.

## Reporting a vulnerability

Report privately through GitHub: open the **Security** tab of
<https://github.com/Jovan1666/zcode-command-code-usage> and choose **Report a
vulnerability**. If that channel is not available to you, open a normal issue that
says only that you have a security report and how to reach you — put no details in
the issue itself.

## What this plugin does on your machine

| | |
|---|---|
| Reads | the credential files listed below, and the local transcript path only if the host passes one (the last 128 KB, only for the `message.model` field of recent entries — no message content is kept or sent) |
| Writes | nothing by default. The script can keep a local snapshot at `~/.commandcode-usage/last-report.json` and a 24 h cache of the public model catalog at `~/.commandcode-usage/models.json`; **those are written by the script's status-line/hook modes, which this platform's commands never invoke**. `--html` writes one file, only when you pass the flag, to the path you choose |
| Sends | only to `https://api.commandcode.ai`, over HTTPS, with your own key. No other host is contacted, and there is no telemetry |
| Collects | nothing. There is no analytics, no crash reporting, and no phone-home of any kind |
| Host config | **not written.** The plugin installs through ZCode's own plugin mechanism and never edits ZCode's settings, command directory or any other host configuration file |
| Install time | runs no scripts. Nothing executes at install time; the commands run the bundled script only when you invoke them |

## API calls it makes

Four authenticated, read-only `GET`s on `https://api.commandcode.ai`:

| Endpoint | Contents |
|---|---|
| `/alpha/whoami?limits=1` | user, org, organisation-level `orgLimits` |
| `/alpha/billing/credits` | `credits` (balance) and `windowLimits` (both rolling windows) |
| `/alpha/billing/subscriptions` | `planId`, `status`, billing period start and end |
| `/alpha/usage/summary?orgId=&since=` | request count, cost, tokens, success rate for the period |

Plus one unauthenticated call, `/provider/v1/models`, which returns the public model
catalog and carries no credential. These endpoints under `/alpha/` are not part of
Command Code's documented provider API; they are read because they carry the plan
windows. If one changes shape the panel reports the failure instead of guessing.
`--demo` contacts nothing at all.

There is no MCP server, no hook, no background daemon and no listening socket, except
the loopback-only server you start yourself with `--serve`.

## Credentials

The key is discovered read-only, first hit wins:

1. the environment variables `COMMAND_CODE_API_KEY`, `CMD_API_KEY` or `COMMANDCODE_API_KEY`
2. `~/.commandcode/auth.json`, written by logging into the Command Code CLI
3. `~/.zcode/v2/provider_config.json` — a provider whose `api.baseUrl` points at `commandcode.ai`
4. failing those, provider configs other agent tools leave behind
   (`~/.claude/settings.json`, `~/.pi/agent/settings.json`, `~/.config/opencode/*`,
   `~/.dsh/*.yaml`, `~/.codex/config.toml`, `~/.grok/config.toml`)

**The key is never written to a log, a cache or a rendered result.** It is only ever
placed in an `Authorization: Bearer` header. The snapshot cache stores a short
non-cryptographic digest used to tell whether the cache belongs to the current
account — never the key itself. `--verbose` reports which *source* was used, never the
key. The repository contains no credentials.

## Out of scope

- Vulnerabilities in Command Code's own API or service, or in ZCode itself.
- Anything requiring an attacker to already run code as you on your machine, or to
  have read access to your credential files — at that point the key is theirs to read
  regardless of this plugin.
- Rate limiting, quota exhaustion or billing questions: those are Command Code's
  account behaviour, not a security issue here.
- The accuracy of the numbers: they come from Command Code's own endpoints.

## Scope

In scope: credential leakage from this plugin (a key reaching a log, cache, rendered
output, subprocess argument list, or the network — other than `api.commandcode.ai`),
any request to a host other than `api.commandcode.ai`, command or path injection
through the plugin's own scripts, and unintended writes to host configuration.

Not affiliated with Command Code. The plugin reads your own account's usage through
the same endpoints the official CLI uses.
