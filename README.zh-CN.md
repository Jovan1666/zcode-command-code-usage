# Command Code Usage

[English](README.md) · [简体中文](README.zh-CN.md) · [![Check](https://github.com/Jovan1666/zcode-command-code-usage/actions/workflows/check.yml/badge.svg)](https://github.com/Jovan1666/zcode-command-code-usage/actions/workflows/check.yml)

在对话里直接看 **Command Code** 套餐还剩多少用量，不用离开对话、不用开网页。
**ZCode 与 Claude Code 都支持。**

Command Code 的套餐（Go / GOAT / Pro / Max / Teams）除了月度额度，还压着两个**滚动窗口**：
5 小时上限和每周上限。窗口从你第一次请求开始计时，到点重置，**不跟自然日/周走**，用量也不跨
窗口结转。所以「这个任务还能不能跑完」光看月度余额是答不出来的——要看**当前窗口**还剩多少、
什么时候重置。

这个插件把这三个数读出来，渲染在你本来就在看的地方。

```
Command Code · GOAT                             09-21 00:45 · 周期剩 30 天
──────────────────────────────────────────────────────────────────────────
账号  your-name <you@example.com>

5 小时窗口  ██░░░░░░░░░░░░░░░░░░░░░░   6.3%    $0.89 / $14.00
            重置 04:29 · 3h 43m 后
每周窗口    █░░░░░░░░░░░░░░░░░░░░░░░   2.5%    $0.89 / $35.00
            重置 09-27 23:29 · 6d 22h 后
月度额度    ░░░░░░░░░░░░░░░░░░░░░░░░   1.3%    $0.89 / $70.00
            剩 $69.11

本周期  330 次请求 · 成功率 100% · 入 96.3M / 出 306.9K tokens
预估  按本周期均单价 $0.0026 估算还能跑：5 小时窗口 ≈ 5,064 次
      （基于你本周期实际的模型组合；换更贵的模型次数会明显变少）
```

当消耗速度足以在重置前撞上限时，它会直说：

```
⚠ 按当前速度（$4.30/小时），5 小时窗口会在重置前用完，约 15m 20s 后耗尽
```

## 为什么是「在对话里」而不是网页

ZCode 没有给插件留常驻显示位，这不是猜的，是它自己的代码写的：

- 插件清单能执行的就五样——`commands`、`skills`、`hooks`、`mcpServers`、`agents`，
  没有状态栏、侧边栏或仪表盘槽位；
- `app.asar` 里 2271 处 `statusBar.*` 全是内置编辑器的主题色变量（如 `statusBar.background`），
  不是可挂载组件；
- 打包目录里确实有 `output-styles`，但真正运行的那段代码里 `outputStyles` 字段出现 **0 次**——
  纸面上认，实际不执行；
- hook 会在对话里渲染成一行记录，但它的数据结构只有状态、耗时、名称，**没有输出字段**，
  所以 hook 也显示不了动态数字。

剩下的只有斜杠命令——它的输出会渲染在对话里。所以面板就放在那里。不开浏览器，也不用去轮询官网。

## 环境要求

- **一个支持命令与技能的 agent** —— ZCode 或 Claude Code，两者都已验证；清单与目录用的是
  标准布局（`.zcode-plugin` / `.claude-plugin`），其他兼容的 agent 应该也能用。
- **一个 Command Code 套餐。** 没有套餐就没数可读。如果你是按量计费而非订阅，插件照样能用，
  只是显示余额而不是窗口。
- **Node.js** —— 只用来跑插件自带的脚本。脚本只用 Node 内置模块，**不需要 `npm install`**。

## 安装

### ZCode：从插件市场装（推荐）

1. ZCode 里打开 **插件市场 → 添加 → 添加插件市场**。
2. 粘贴本仓库：

   ```
   Jovan1666/zcode-command-code-usage
   ```

3. 到 **个人 → Command Code Usage → 安装**。
4. **完全退出 ZCode 再打开**，然后新建任务，输入 `/quota`。

### Claude Code

```
/plugin marketplace add Jovan1666/zcode-command-code-usage
/plugin install command-code-usage@command-code-usage
```

### 方式 B：本地安装脚本（ZCode，不走市场）

先克隆仓库，然后：

```bash
node command-code-usage/scripts/install-user-scope.mjs
```

它把命令和技能装进你的用户级 ZCode 目录（`~/.zcode/commands/`、`~/.zcode/skills/`）——
ZCode 扫描这些目录时**优先级最高**。

加 `--workspace <目录>` 可以同时装进 `<目录>/.zcode/commands`。其他开关：

```bash
node command-code-usage/scripts/install-user-scope.mjs --dry-run     # 只显示会写哪些文件
node command-code-usage/scripts/install-user-scope.mjs --uninstall   # 移除副本
node command-code-usage/scripts/verify-discoverable.cjs .            # 验证 ZCode 能否发现这些命令
```

安装器**绝不覆盖你自己的内容**：它记录每次写入的哈希，只有「在自己安装清单里、且自写入后没被
改动过」的文件才更新。你自己写的同名命令、或你事后改过的文件，都会被拒绝并说明原因，而不是被清掉。

> **本地安装与市场安装别同时用。** 用户级副本的发现优先级高于插件，同时存在时本地副本会遮蔽市场
> 版本，市场的「更新」按钮对你的命令就不生效了。要切到市场方式，先跑一次 `--uninstall`。

### 在 ZCode 里装完之后：重启应用

ZCode 在**会话启动时**对命令与技能清单做快照。应用运行期间新建的插件目录，光靠「新建任务」是
读不到的——而且 ZCode 有托盘图标，关窗口往往只是最小化、进程还活着。**要完全退出**
（托盘右键退出，或在任务管理器确认没有 `ZCode` 进程残留）再打开。

## 用法

| 命令 | 作用 |
|---|---|
| `/quota` | 上面那个面板 |
| `/usage` | 同上，别名 |
| `/quota --md` | Markdown 表格，方便复制 |
| `/quota --compact` | 一行：`CC GOAT · 5h 6%（≈4,829） · 周 2% · 月 1.2% · 剩 $69.16` |
| `/quota --json` | 归一化字段，外加原始接口响应 |
| `/quota --demo hot` | 样例数据，不联网也能预览告警长什么样 |

也可以不打命令，直接问：

> 我 Command Code 额度还剩多少？够不够把手上这个做完？

插件里的技能会教 agent 取面板，并且**用剩余次数估算**而不是月度余额来回答「够不够」。

## Token 成本，以及零成本的替代方式

自定义命令本质上就是一段 prompt。`/quota` 会注入命令正文，agent 运行脚本，面板文本再经过模型。
实测一次调用约 **390 tokens**：命令正文约 100、工具调用约 80、面板文本约 180、回复约 40。
正文刻意写得很短，并且明确要求 agent **不要复述面板**——工具调用的输出本来就显示在界面上。
（第一版会复述，约 680 tokens。）

**想完全不花 token**，就把面板当成本地页面、在 ZCode 内置浏览器面板里打开：

```bash
node command-code-usage/scripts/cc-usage.mjs --serve
# 然后打开 http://127.0.0.1:8787/
```

每 30 秒自动刷新，环形仪表盘和对话里的一样，完全不经过模型。这是目前唯一零 token 的方式：
ZCode 没有给插件留应用内组件位，hook 也显示不了内容——它渲染的那条记录只有状态、耗时和名称，
**没有输出字段**（我在 `resources/glm/zcode.cjs` 里核对过）。

ZCode 的命令正文**确实支持内联 shell 展开**（`` !`cmd` `` 或 ```` ```! ```` 围栏块），会在
构建 prompt 之前本地执行。这里没用它，是因为 **Windows 上那个 shell 是 `cmd.exe` 而不是 bash**，
只有把脚本路径写死才可用，而走市场安装的路径是动态的、会直接硬失败。为了省那约 80 tokens
不值得引入这种脆弱性。

## 两个有用的数是怎么来的

**「还能跑约 N 次」** = 剩余额度 ÷ 本周期均单价。均单价取自**你自己**这个周期的实际用量，
所以它自动适配任何套餐、任何模型组合，不需要把每个模型的费率硬编码进来。

正因为基准是你自己的均值，**一换模型它就不再成立**——面板里写明了这一点。Command Code 的
`/provider/v1/models` 只返回模型清单，不含额度系数或单价，所以「某个特定模型还能跑几次」从接口层
就算不出来。

**告警**按当前消耗速度外推。这条路有个陷阱值得知道：窗口刚开一小时，拿这一小时的速度去推七天，
必然天天喊「周窗口要超限了」——纯噪音。所以脚本设了最小采样门槛：**不足窗口时长的 5% 就不出结论**。
因此「没有告警」的意思是「样本还不够判断」，而不是「你安全」。

## 它怎么适配不同账号形态

脚本按账号实际形态决定显示什么，不硬套模板：

| 情况 | 显示 |
|---|---|
| 有订阅、套餐在已知表里 | 月度额度进度条 + 两个窗口 |
| 有订阅、套餐不在表里（新套餐/企业套餐） | 显示「额度」，并明说总额是按「已花 + 剩余」推算 |
| 无有效订阅（按量计费 / 企业池） | 只显示余额，不套没有意义的百分比 |
| 组织配置了消费上限 | 追加限额行（认不出的字段形状直接跳过，不猜） |
| 本周期还没有请求 | 不给次数估算，并说明原因 |

## 凭证

按顺序解析，命中即用。**不写入磁盘、不打印、不提交。**

1. 环境变量 `COMMAND_CODE_API_KEY`、`CMD_API_KEY` 或 `COMMANDCODE_API_KEY`
2. `~/.commandcode/auth.json` —— 登录 Command Code CLI 后生成
3. `~/.zcode/v2/provider_config.json` —— 其中 `api.baseUrl` 指向 `commandcode.ai` 的 provider。
   **如果你已经在 ZCode 里配好了这个 provider，就什么都不用做**，插件直接复用那把 key，
   不需要二次登录。

实际用了哪个来源，`--verbose` 和 HTML 面板底部都会显示。密钥只会出现在 `Authorization: Bearer`
请求头里。

## 它读的接口

`https://api.commandcode.ai` 上四个只读端点，都需要 `Authorization: Bearer <key>`：

| 端点 | 内容 |
|---|---|
| `/alpha/whoami?limits=1` | 用户、组织、组织级 `orgLimits` |
| `/alpha/billing/credits` | `credits`（余额）与 `windowLimits`（两个滚动窗口） |
| `/alpha/billing/subscriptions` | `planId`、`status`、计费周期起止 |
| `/alpha/usage/summary?orgId=&since=` | 本周期请求数、成本、token、成功率 |

`/provider/v1/*` 是推理接口（OpenAI 与 Anthropic 兼容），**不提供**任何用量数据——
额度只挂在 `/alpha/*` 下。

两个最容易搞反的字段：`credits.credits.monthlyCredits` 是**剩余**而不是已用；
窗口的 `used` / `cap` 是**美元价值**而不是请求条数。

## 脱离 ZCode 单独使用

脚本不依赖 ZCode：

```bash
node command-code-usage/scripts/cc-usage.mjs                    # 面板
node command-code-usage/scripts/cc-usage.mjs --compact          # 一行
node command-code-usage/scripts/cc-usage.mjs --json > s.json    # 存快照
node command-code-usage/scripts/cc-usage.mjs --from-json s.json # 离线重放快照
node command-code-usage/scripts/cc-usage.mjs --demo hot         # 样例数据，不联网
```

可选——真想要个大屏时再用，多数人用不到：

```bash
node command-code-usage/scripts/cc-usage.mjs --html --open   # 生成 HTML 面板
node command-code-usage/scripts/cc-usage.mjs --serve         # 起本地服务，每 30s 刷新
```

## 排查

| 现象 | 原因与处理 |
|---|---|
| `/` 菜单里找不到 `/quota` | 命令清单是安装前做的快照。完全退出 ZCode 再打开（见上文）。 |
| 输入 `/quota` 被当成普通消息发出去 | 命令没被发现。跑 `verify-discoverable.cjs .`——它复刻了 ZCode 自己的解析器，会报出诊断。 |
| 提示找不到凭证 | 按上面三种来源提供其一。若用 ZCode provider，检查它的 `baseUrl` 是否含 `commandcode.ai`。 |
| 每个端点都 HTTP 401 | key 无效或已过期。重新登录，或在 ZCode provider 设置里重新填。 |
| 数字看着不新 | 窗口重置时间一直在走。重新跑一次命令，别复用几分钟前的读数。 |
| 请求被限流（429） | 看哪个窗口报告 `exceeded`，然后等重置、买额外额度、或升级套餐。 |

`/quota` 与 `/usage` 都已确认**不在** ZCode 的保留命令名里。完整保留名集合备查：`clear, compact,
compress, continue, dwf, effort, expert, fork, goal, help, init, language, locale, login, logout,
mcp, mode, model, new, plan, plugin, plugins, resume, rewind, skill, target, variant`。

## 仓库结构

```
.
├── marketplace.json                  ZCode 侧市场清单（仓库根目录即市场根目录）
├── .claude-plugin/marketplace.json   Claude 侧市场清单（共享字段完全一致，strict 零警告）
├── README.md / README.zh-CN.md
├── LICENSE / CHANGELOG.md
├── .github/workflows/check.yml       CI：三平台矩阵 + 发布检查 + 离线冒烟
├── scripts/check.mjs                 发布门禁（CI 与本地共用同一个脚本）
└── command-code-usage/               插件本体
    ├── .zcode-plugin/plugin.json     ZCode 读这个（优先）
    ├── .claude-plugin/plugin.json    Claude Code 读这个
    ├── commands/
    │   ├── quota.md                  /quota
    │   └── usage.md                  /usage
    ├── skills/command-code-usage/SKILL.md
    └── scripts/
        ├── cc-usage.mjs              取数 + 渲染（终端 / Markdown / JSON / HTML）
        ├── install-user-scope.mjs    用户级安装、同步与卸载
        └── verify-discoverable.cjs   诊断：复刻 ZCode 的命令解析器
```

### 为什么有些文件有两份

插件清单和市场清单各有一个 ZCode 副本、一个 Claude Code 副本——因为两个生态看的位置不同、
接受的字段也不同：

- ZCode 先读 `.zcode-plugin/plugin.json`，读不到才回退到 `.claude-plugin/`；Claude Code 只读
  `.claude-plugin/`。
- ZCode 的市场条目支持 `displayName_i18n`、`description_i18n`、`examplePrompts`、`examplePrompts_i18n`
  这些展示字段，而 Claude Code 会把这些视为未知字段并给出警告，`--strict` 下直接失败。

所以 ZCode 那份保留了本地化显示名（中文用户看到中文标签），Claude 那份保持 strict 零警告，
以便通过审核流水线跑的同一个校验。两份共有的字段——name、version、description、source、
category、homepage、author——完全一致，一旦漂移 `scripts/check.mjs` 会让构建失败。提交前跑：

```bash
node scripts/check.mjs
```

`commands/*.md` 里含有 `@@CC_USAGE_SCRIPT@@` 这个占位符。用安装脚本装时，它会被替换成
`cc-usage.mjs` 的绝对路径；走任一市场安装时占位符保持原样，命令正文里的 shell 片段会自动到
各 agent 的已知目录（`~/.zcode`、`~/.claude`、`~/.agents`、`~/.codex`）里找脚本——所以每条
安装路线都能用。

## 分发状态

| 渠道 | 状态 |
|---|---|
| **把本仓库添加为市场** | **已可用。** 在任一 agent 里粘贴 `Jovan1666/zcode-command-code-usage`。 |
| ZCode 官方市场（`zcode-plugins-official`） | 未投稿。它的描述写着收录社区插件，但 Z.ai 没有公开的投稿流程——没有表单，应用里也没有可提交的入口。 |
| Claude Code 社区市场（`anthropics/claude-plugins-community`） | 未投稿。那个仓库是只读镜像，投稿走 Console 表单、需要账号登录，所以这是维护者的动作，CI 或脚本做不到。官方市场是邀请制：文档明确写了没有申请流程。 |

## 状态与范围

已在 Windows 上验证：接口取数、全部输出模式（终端、`--md`、`--compact`、`--json`、
`--from-json`、HTML、serve）、各账号形态分支、凭证解析、所有错误路径，以及安装器的冲突处理
（全新安装、重复安装、被改过的文件、外来同名文件）。另外还做过一次从已发布仓库出发的
干净环境端到端验证（克隆 → 安装 → 发现 → 执行）。

CI 另外在 **Ubuntu、Windows、macOS** 三个平台跑发布门禁、离线冒烟、安装并发现校验，
以及安装器的冲突保护。

尚未验证：第二个人通过市场界面安装，以及在真实 Claude Code 会话里执行命令。
如果遇到问题，请带上 `node scripts/check.mjs` 的输出（命令发现类问题用
`command-code-usage/scripts/verify-discoverable.cjs .`）和你看到的确切报错开 issue。

与 Command Code 官方无关。它通过官方 CLI 使用的同一批端点读取你自己账号的用量，
不做代理、不修改、也不向其他任何地方传输数据。

## 许可证

[MIT](LICENSE)
