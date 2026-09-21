# Moved → [commandcode-usage](https://github.com/Jovan1666/commandcode-usage)

This plugin lives in the **commandcode-usage** monorepo now, under
[`plugins/zcode`](https://github.com/Jovan1666/commandcode-usage/tree/main/plugins/zcode),
next to adapters for six other agents — Claude Code, Codex, Grok Build, opencode, pi and
DeepSeek Harness.

Same `/quota` panel, same skill, same command names.

## Install

Add the monorepo as a marketplace, then install the plugin from it:

```
/plugin marketplace add Jovan1666/commandcode-usage
/plugin install command-code-usage
```

## Already installed from this repository?

Your installed copy keeps working; nothing here was deleted from your machine. Add the
monorepo as a marketplace as above and install from there when you want updates — the
plugin name (`command-code-usage`) is unchanged, so the two are interchangeable.

## Reproducing an old setup

The last version published from this repository is tagged
[`v1.2.0-final`](../../releases/tag/v1.2.0-final). Point a marketplace at that tag if you
need to reproduce a setup exactly as it was:

```
/plugin marketplace add Jovan1666/zcode-command-code-usage#v1.2.0-final
```

## This repository is archived

Issues, pull requests and questions belong in the
[monorepo](https://github.com/Jovan1666/commandcode-usage/issues).

Licensed MIT — see [LICENSE](LICENSE).
