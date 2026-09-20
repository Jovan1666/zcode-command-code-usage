# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

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
