---
description: 查看 Command Code 额度用量（5 小时窗口 / 每周窗口 / 余额）
argument-hint: "[--md | --compact | --json | --demo hot]"
---

```bash
CC_SCRIPT="@@CC_USAGE_SCRIPT@@"
ROOT="${ZCODE_PLUGIN_ROOT:-$CLAUDE_PLUGIN_ROOT}"
[ -f "$CC_SCRIPT" ] || CC_SCRIPT="$ROOT/scripts/cc-usage.mjs"
if [ ! -f "$CC_SCRIPT" ]; then
  # 兜底：只找 ZCode 自己的插件目录。本仓库自带这份脚本，若捡到为别的宿主装的副本，
  # 执行的就是本仓库管不到的代码。
  CC_SCRIPT=$(find "$HOME/.zcode" -maxdepth 6 -type f -name cc-usage.mjs \( -path '*commandcode*' -o -path '*command-code*' \) -print -quit 2>/dev/null)
fi
[ -f "$CC_SCRIPT" ] || { echo "找不到 cc-usage.mjs，插件可能未正确安装。"; exit 2; }
node "$CC_SCRIPT" $ARGUMENTS
```

面板已经在上面了。**不要再重复输出一遍**——用 1 到 3 行给出结论即可：
最紧的是哪个窗口、还剩多少、什么时候重置。出现 `⚠` 告警时才多说一句风险。
