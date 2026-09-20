# command-code-usage

The plugin payload. Full documentation is in the repository root:

- [README.md](../README.md) — English
- [README.zh-CN.md](../README.zh-CN.md) — 简体中文

Quick reference:

| Command | What it does |
|---|---|
| `/quota` | Show the usage panel in the conversation |
| `/usage` | Alias for `/quota` |
| `/quota --md` · `--compact` · `--json` · `--demo hot` | Other renderings |

```bash
# user-scope install (no marketplace needed)
node scripts/install-user-scope.mjs

# the panel, standalone
node scripts/cc-usage.mjs
```

This plugin contains no credentials. The Command Code API key is resolved at runtime from
`COMMAND_CODE_API_KEY`, `~/.commandcode/auth.json`, or the provider already configured in ZCode.
