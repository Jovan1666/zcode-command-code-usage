# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [1.3.2] — 2026-09-26

The plugin is maintained here again. This release restores the full plugin into this repository
and merges the changes that were made after it moved into the shared `commandcode-usage` repo.

### Added

- **`--serve`, kept deliberately.** The panel can still be served as a local page
  (`node command-code-usage/scripts/cc-usage.mjs --serve`, default port 8787, `--port <n>` to
  change it), refreshing every 30 s for ZCode's built-in browser pane — the zero-token way to
  watch the numbers.
  The shared implementation dropped its top-level `node:http` import to save startup time,
  because in hosts that run the script once per message that cost is paid on every turn. This
  plugin is not one of those: `/quota` and `/usage` run only when you ask for them, so startup
  cost is not a reason to lose the feature. It is now resolved **lazily**, inside `serve()`,
  with the `createRequire` the script already had — so every other mode keeps the faster start
  and `--serve` still works.
- **`SECURITY.md`** — what the plugin reads, writes and sends, and how to report a problem
  privately.
- **`docs/FINDINGS.md`** — the shared implementation's cross-host research notes, carried here
  because this repository now owns its own copy of the implementation.

### Changed

- **`cc-usage.mjs` is now the current shared implementation** (2101 lines) with this
  repository's `--serve` on top, instead of the older 1380-line revision. The visible
  consequences:
  - **Faster startup.** Internal modules load through `createRequire` rather than ESM static
    imports, about 11 ms less per run.
  - **A corrected plan table.** Pro is $80 (the `individual-pro-v1` alias is kept so older
    accounts still resolve), `Max 10x` / `Max 20x` and their aliases are recognised, and
    Provider is treated as pay-as-you-go. Window caps still come from the API; the table is only
    a fallback for the monthly total.
  - **Wider credential discovery.** After the environment, `~/.commandcode/auth.json` and
    `~/.zcode/v2/provider_config.json`, the script also reads the provider configs other agent
    tools leave behind — so a machine that has already used Command Code elsewhere needs no
    second login. The key still only ever goes into an `Authorization: Bearer` header.
  - **`--html --open` and `--serve --open` are safer.** The opener is invoked with an argv
    array instead of a shell command string, so a path containing quotes or `&` can no longer
    break the launch.
  - The status-line and hook engine, and the local cache under `~/.commandcode-usage/`
    (snapshot plus a 24 h model-catalog cache), came with the new base. This plugin's commands
    never call those paths — ZCode exposes neither a status-line seat nor a hook output field —
    so a `/quota` run still writes nothing.
- **The commands and the skill are the current revisions.** The command body now resolves the
  script through `$ZCODE_PLUGIN_ROOT` first and falls back to searching the known agent
  directories; the local install route still injects the absolute path, so a user-scope install
  keeps working.
- **`scripts/check.mjs` grew the release gate's own suites** — status-line rendering (width
  adaptation, never any ANSI), the route decision table, threshold and hook output, the output
  formats, and the secret/personal-path scan — on top of the manifest, version, command-parse
  and installer checks it already had. It now also asserts `--serve` end to end: a stub API on
  loopback, a real server start, one request, and an assertion that the response is the HTML
  panel.
- **Version 1.3.2 everywhere** — both plugin manifests, both marketplace catalogues, the
  script's `VERSION` constant and this file. `scripts/check.mjs` fails the build if they drift.
- **CI** pins both actions to commit hashes, runs Node 18 and 22 across Ubuntu, Windows and
  macOS, and keeps the offline smoke tests for every output mode.
- `verify-discoverable.cjs` no longer reports a missing script path when the command body is
  still carrying the install-time placeholder.

## [1.2.0] — 2026-09-21

### Changed
- **`/quota` costs about 43% fewer tokens.** The command body was cut from 731 to 311 characters,
  and the agent is now told not to restate the panel — it is already visible from the tool call.
  Measured cost per invocation dropped from roughly 680 to 390 tokens.
- Documented the cost, and the zero-token alternative (`--serve` in the built-in browser pane), in
  both READMEs.

## [1.1.0] — 2026-09-21

A second manifest family, so the plugin is not tied to one agent's layout.

### Added
- **A `.claude-plugin/` manifest alongside the ZCode one.** The plugin now ships a
  `.claude-plugin/plugin.json` next to the ZCode manifest, plus a strict-clean
  `.claude-plugin/marketplace.json` that passes the other validator with zero warnings.
- **Cross-platform CI** (`.github/workflows/check.yml`) running on Ubuntu, Windows and macOS: the
  release gate, offline smoke tests for every output mode, an install-and-discover check against a
  throwaway home directory, and the installer's conflict guard.
- **`scripts/check.mjs`** — a release gate shared by CI and local runs. It compares the duplicated
  fields between the ZCode and `.claude-plugin/` manifests, enforces version consistency across all
  five places that carry a version, checks the command/skill files against ZCode's actual parsing
  rules (name pattern, allowed frontmatter keys, reserved command names), and fails on any leaked
  secret or machine-specific path.

### Changed
- The command body's script lookup now searches the known agent directories — `~/.zcode`,
  `~/.claude`, `~/.agents`, `~/.codex` — instead of only ZCode's, so the same command works
  wherever the plugin was installed from.

## [1.0.0] — 2026-09-21

First public release.

### Added
- `/quota` (and the `/usage` alias): render Command Code usage in the ZCode conversation —
  5-hour rolling window, weekly rolling window, monthly allowance or balance.
- A **remaining-requests estimate** derived from the account's own average cost per request, so it
  adapts to any plan and any model mix without hard-coded per-model rates.
- A **burn-rate warning** for windows projected to run out before they reset, gated on a minimum
  sample (under 5% of the window elapsed draws no conclusion, to avoid false alarms).
- Account-shape handling: known plans, unknown/new/enterprise plans, pay-as-you-go balances,
  organisation spend caps, and accounts with no requests yet.
- Output modes: terminal panel, `--md` Markdown table, `--compact` one-liner, `--json` normalised
  fields plus raw responses, `--from-json` offline replay, `--demo` sample data.
- Optional HTML dashboard (`--html`, `--serve`) for people who want a big screen.
- `install-user-scope.mjs` — user-scope install, sync and uninstall, with a content-hash based
  guard that refuses to overwrite files the user wrote or edited.
- `verify-discoverable.cjs` — diagnostic that re-implements ZCode's own command parser so
  discovery problems can be reported with evidence.
- Bilingual documentation (English and Simplified Chinese).

### Notes
- No credentials are stored, printed or committed. The key is resolved at runtime from the
  environment, the Command Code CLI auth file, or the provider already configured in ZCode.
- ZCode snapshots its command catalogue at session start, and closing the window may only minimise
  it to the tray. Restart the app fully after installing.
