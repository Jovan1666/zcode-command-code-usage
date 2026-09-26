# Command Code Usage (command-code-usage)

[English](./README.md)

在对话里直接看 Command Code 套餐用量——5 小时与每周滚动窗口、月度额度或余额，
以及各自什么时候重置——不用离开终端，也不用打开账单页。

## 快速开始

在 ZCode 的插件市场里安装 **Command Code Usage**，然后跑一条命令，或者直接把想问的说出来：

> 我的 5 小时窗口还剩多少？什么时候重置？

两条命令都把面板渲染在对话里（用户级安装注册的是短的 `/quota`、`/usage`，效果相同）：

| 命令 | 作用 |
| --- | --- |
| `/command-code-usage:quota` | 面板本体：5 小时窗口、每周窗口、月度额度或余额、重置时间、剩余次数估算，以及某个窗口消耗快于重置时的告警 |
| `/command-code-usage:usage` | 同一个面板——别名，两个名字都能用 |

两者接受相同的可选参数——`--compact`、`--md`、`--json`、`--html`、`--verbose`，或
`--demo hot` 用离线样例预览。完整选项以 `--help` 为准。

| 技能 | 作用 |
| --- | --- |
| `command-code-usage` | 读取额度，并回答关于窗口、重置时间、额度与消耗速度的问题 |

没有 hook、没有 MCP server、没有 agent、没有后台常驻进程。

## 环境要求

| | |
| --- | --- |
| 宿主 | ZCode |
| 运行时 | Node.js 18 或更新版本——脚本用的是内置 `fetch`，不安装任何依赖 |
| 套餐 | 一把有权调用额度接口的 Command Code key。没有 API 权限时这些端点会返回 `403`/`407`，面板会照实说明，而不是编一个数字出来 |

## 数据来源与鉴权

只有一个主机：**`https://api.commandcode.ai`**（HTTPS）。它读取的端点是
`/alpha/whoami`、`/alpha/billing/credits`、`/alpha/billing/subscriptions`、
`/alpha/usage/summary` 与 `/provider/v1/models`。最后那个不带凭证，只用来判断当前模型是否
路由到了 Command Code。

`/alpha/` 下的端点不属于 Command Code 公开的 provider API。读它们是因为套餐窗口在这些端点里；
一旦某个端点改了形状，面板会报出失败，而不是拿旧数据估算。`--demo` 不调用任何接口。

key 只读发现，按顺序命中即用：

1. 环境变量 `COMMANDCODE_API_KEY`、`COMMAND_CODE_API_KEY`、`CMD_API_KEY`
2. `~/.commandcode/auth.json`
3. `~/.zcode/v2/provider_config.json`
4. 以上都没有时，其他 agent 工具留下的 provider 配置——`~/.claude/settings.json`、
   `~/.pi/agent/settings.json`、`~/.config/opencode/*`、`~/.dsh/*.yaml`、
   `~/.codex/config.toml`、`~/.grok/config.toml`

key 只会发往 `api.commandcode.ai`，不会被复制到别处、不会回显在输出里、也不会写进日志。

## 它在你机器上做什么

| | |
| --- | --- |
| 钩子 | 无——不安装任何 hook，也不拦截你的工具调用 |
| MCP server | 无——没有 `.mcp.json`，没有常驻服务进程 |
| 网络 | 只有 `api.commandcode.ai` 一个主机，且只在渲染面板时；`--demo` 不发起任何请求 |
| 执行 | `node <插件目录>/scripts/cc-usage.mjs`，参数就是你传的那些。命令先按安装路径找脚本，找不到就在 `~/.zcode`、`~/.claude`、`~/.codex`、`~/.grok`、`~/.dsh` 里找 `command-code*` / `commandcode*` 路径下的副本。除此之外不执行任何东西 |
| 读取 | 上面列出的凭证文件；当宿主传入 transcript 路径时，读该文件最后 128 KB，只为取出近期条目的 `message.model` / `modelId` 字段。消息内容不落盘、不外传 |
| 写入文件 | 默认不写任何文件。`--html` 只在你显式传参时写一个文件到你指定的路径。脚本的状态栏与钩子模式会在 `~/.commandcode-usage/` 下保留本地缓存（一份快照与一份 24 小时的模型目录缓存）；本插件的命令不会走那两条路径 |
| 宿主配置 | 从不改写——插件走 ZCode 自己的插件机制安装 |
| 优雅降级 | 没有 key、套餐没有 API 权限、响应无法解析，都会给出说明原因的消息，不编数字 |

## 附带脚本

除了命令执行的那个脚本，插件还带两个独立工具。它们不会自动运行，只在下列场景下由你手动使用。

- `scripts/cc-usage.mjs` —— 面板本体。可直接运行：`node scripts/cc-usage.mjs --compact`。
- `scripts/install-user-scope.mjs` —— 把命令与技能装进你的用户级 ZCode 目录
  （`~/.zcode/commands`、`~/.zcode/skills`），供不想走市场的用户使用。它写入这些文件、把
  `cc-usage.mjs` 的绝对路径注入命令正文，并保留一份「我写过什么」的小清单以便日后更新或卸载。
  **不要在市场安装之上再跑它**：用户级副本的发现优先级更高，会遮蔽已安装的插件。
  `--uninstall` 可移除。
- `scripts/verify-discoverable.cjs` —— 只读诊断工具，复刻了 ZCode 自己的命令解析器，
  这样「我的命令不出现」这类问题可以带着证据来报。它只读文件、打印报告，不写任何东西。

## Token 成本，以及零成本的替代方式

自定义命令本质上是一段 prompt：正文被注入，agent 运行脚本，面板文本再经过模型。实测一次
`/quota` 约 **390 tokens**——命令正文约 100、工具调用约 80、面板文本约 180、回复约 40。
正文刻意写得很短，并明确要求 agent **不要复述面板**，因为工具调用的结果本来就显示在界面上。

**想完全不花 token**，把面板当成本地页面、在 ZCode 的内置浏览器面板里打开：

```bash
node scripts/cc-usage.mjs --serve               # 然后打开 http://127.0.0.1:8787/
node scripts/cc-usage.mjs --serve --port 8788   # 8787 被占用时
```

每 30 秒自动刷新，环形仪表盘与对话里一致，完全不经过模型。只绑回环地址，Ctrl+C 停止。
ZCode 没有给插件留应用内组件位，hook 也显示不了内容——它渲染的记录只有状态、耗时和名称，
没有输出字段。

## 第三方代码、素材与服务

没有引入任何第三方代码或素材；命令、技能与脚本都是本项目自己的。唯一的外部服务是
Command Code 自己的 API，其条款与可用性由 Command Code 负责。MIT 许可——见仓库里的
`LICENSE`。

安全策略，以及本插件到底碰了什么：见仓库里的 `SECURITY.md`。安装路线、排查与发布门禁：
见仓库的 README。
