# 已迁移 → [commandcode-usage](https://github.com/Jovan1666/commandcode-usage)

本插件现在住在 **commandcode-usage** 这个 monorepo 里，位置是
[`plugins/zcode`](https://github.com/Jovan1666/commandcode-usage/tree/main/plugins/zcode)，
和另外六个 agent 的适配器放在一起——Claude Code、Codex、Grok Build、opencode、pi、DeepSeek Harness。

`/quota` 面板、skill、命令名都没有变化。

## 安装

把 monorepo 加为插件市场，再从里面装：

```
/plugin marketplace add Jovan1666/commandcode-usage
/plugin install command-code-usage
```

## 已经从本仓库装过了？

已安装的那份照常工作，本仓库没有从你机器上删掉任何东西。想跟更新时，按上面的方式加上
monorepo 市场再装一次即可——插件名（`command-code-usage`）没变，两者可以互换。

## 想复现旧的环境

本仓库发布的最后一个版本打了标签
[`v1.2.0-final`](../../releases/tag/v1.2.0-final)，需要完全按旧样子复现时把市场指向那个标签：

```
/plugin marketplace add Jovan1666/zcode-command-code-usage#v1.2.0-final
```

## 本仓库已归档

问题、PR 和讨论请到 [monorepo](https://github.com/Jovan1666/commandcode-usage/issues)。

MIT 许可——见 [LICENSE](LICENSE)。
