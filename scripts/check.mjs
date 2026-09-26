#!/usr/bin/env node
/**
 * 一条命令给出这个仓库的结论。
 *
 *   node scripts/check.mjs            全部套件
 *   node scripts/check.mjs --quiet    每个套件只打一行
 *
 * CI 直接调这个文件，所以本地和线上是同一套判定——不会出现「本地过了 CI 挂」。
 * 不联网、不需要真实凭证：--serve 那条也是对着本机回环上的桩接口跑的。
 *
 * 套件：
 *   manifests      四个清单的重复字段、版本号、ZCode 解析规则
 *   commands       命令与技能的 frontmatter / 命名 / 脚本定位
 *   static         全仓 JSON 合法性与 node --check
 *   secrets        密钥、本机绝对路径、邮箱
 *   statusline     状态栏渲染（宽度自适应、绝不带 ANSI）
 *   gating         「这一轮走没走 Command Code」的判定表
 *   threshold+hook --threshold 静默与钩子的 JSON 形状
 *   formats        各输出模式与 --help 的选项清单
 *   serve          --serve 端到端：起服务、请求一次、断言返回 HTML、关掉
 *   installer      用户级安装器的冲突保护与安装/卸载
 *
 * 只用 Node 内置模块。退出码 0 = 通过。
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = path.join(ROOT, 'command-code-usage');
const CORE = path.join(PLUGIN, 'scripts', 'cc-usage.mjs');
const QUIET = process.argv.includes('--quiet');

const suites = [];
const record = (name, fn) => suites.push({ name, fn });

/* ---------------------------------------------------------------- 工具 */

let failures = [];
let checks = 0;

function ok(condition, label, detail) {
  checks++;
  if (condition) {
    if (!QUIET) console.log(`  \u2714 ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  \u2718 ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}

function newSection(name) {
  if (!QUIET) console.log(`\n${name}`);
}

/** 跑一次脚本（不联网）并返回去掉 ANSI 的 stdout。 */
function runCore(args, env = {}) {
  const r = spawnSync(process.execPath, [CORE, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 30_000,
  });
  if (r.error) throw r.error;
  return String(r.stdout || '').replace(/\x1b\[[0-9;]*m/g, '');
}

/** 显示宽度：CJK/全角算 2，其余算 1，与脚本内部口径一致。 */
function displayWidth(text) {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    w += cp >= 0x1100 && (
      cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6)
    ) ? 2 : 1;
  }
  return w;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.devdeps') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch (err) {
    ok(false, `${rel}: 不是合法 JSON`, err.message);
    return null;
  }
}

/* ------------------------------------------------------- 1. 清单与版本 */

record('manifests', () => {
  newSection('清单与版本');
  const zPlugin = readJson('command-code-usage/.zcode-plugin/plugin.json');
  const cPlugin = readJson('command-code-usage/.claude-plugin/plugin.json');
  const zMarket = readJson('marketplace.json');
  const cMarket = readJson('.claude-plugin/marketplace.json');
  if (!zPlugin || !cPlugin || !zMarket || !cMarket) return '清单缺失或损坏，其余检查已跳过';

  // 版本号：四处清单 + 脚本里的 VERSION，必须说同一件事。
  const srcVersion = /const VERSION = '([0-9.]+)'/.exec(fs.readFileSync(CORE, 'utf8'))?.[1];
  const versions = {
    '.zcode-plugin/plugin.json': zPlugin.version,
    '.claude-plugin/plugin.json': cPlugin.version,
    'marketplace.json': zMarket.plugins[0]?.version,
    '.claude-plugin/marketplace.json': cMarket.plugins[0]?.version,
    'cc-usage.mjs VERSION': srcVersion,
  };
  const distinct = [...new Set(Object.values(versions))];
  ok(distinct.length === 1, `五处版本号一致（${distinct.join(' / ')}）`, JSON.stringify(versions));

  // 双生态：重复字段必须完全一致，漂移了就要在这里拦住。
  const pluginFields = ['name', 'version', 'description', 'author', 'license', 'homepage', 'repository'];
  for (const f of pluginFields) {
    const same = JSON.stringify(zPlugin[f]) === JSON.stringify(cPlugin[f]);
    ok(same, `插件清单 .${f} 一致`, same ? '' : `.zcode-plugin=${JSON.stringify(zPlugin[f])}\n      .claude-plugin=${JSON.stringify(cPlugin[f])}`);
  }
  const entryFields = ['name', 'source', 'version', 'description', 'displayName', 'category', 'homepage', 'author'];
  for (const f of entryFields) {
    const a = zMarket.plugins[0][f];
    const b = cMarket.plugins[0][f];
    const same = JSON.stringify(a) === JSON.stringify(b);
    ok(same, `市场条目 .${f} 一致`, same ? '' : `root=${JSON.stringify(a)}\n      .claude-plugin=${JSON.stringify(b)}`);
  }
  ok(zMarket.name === cMarket.name, '两个市场文件的市场名一致');

  // ZCode 自己的清单规则。
  const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
  ok(NAME_RE.test(zPlugin.name), `插件名符合 ZCode 规则 (${zPlugin.name})`);
  ok(NAME_RE.test(zMarket.name), `市场名符合 ZCode 规则 (${zMarket.name})`);
  ok(path.basename(PLUGIN) === zPlugin.name, '插件目录名 == 清单里的 name');
  ok(zMarket.plugins[0].name === zPlugin.name, '市场条目名 == 插件名');

  const source = zMarket.plugins[0].source;
  const resolved = path.resolve(ROOT, source);
  ok(resolved.startsWith(ROOT + path.sep), `marketplace source 未逃出仓库根 (${source})`);
  ok(fs.existsSync(path.join(resolved, '.zcode-plugin', 'plugin.json')), 'source 指向真实插件');

  // 这几个字段 ZCode「只认不执行」，写进去会让使用者以为生效了。
  const inert = ['channels', 'lspServers', 'outputStyles', 'settings'].filter((k) => k in zPlugin);
  ok(inert.length === 0, '插件清单不含 ZCode 只认不执行的字段', inert.join(', '));

  // ZCode 实际支持的抽屉字段，写错会静默失效。
  const zcodeEntryAllowed = new Set([
    'name', 'source', 'version', 'description', 'displayName', 'displayName_i18n', 'description_i18n',
    'icon', 'category', 'homepage', 'privacyPolicy', 'termsOfService', 'heroImage', 'author',
    'examplePrompts', 'examplePrompts_i18n', 'requiresPaidPlan',
    // 官方 zai-org/zcode-plugins 也在用的字段
    'keywords', 'license', 'repository',
  ]);
  const unknownZ = Object.keys(zMarket.plugins[0]).filter((k) => !zcodeEntryAllowed.has(k));
  ok(unknownZ.length === 0, 'ZCode 市场条目字段均受支持', unknownZ.join(', '));

  // 官方市场的图标：清单里那个 CDN 地址对应的就是仓库里这张图。
  ok(fs.existsSync(path.join(ROOT, 'assets', 'command-code-usage', 'icon.png')), '市场图标文件存在');

  return `版本 ${distinct[0] ?? '?'}`;
});

/* --------------------------------------------------- 2. 命令与技能 */

record('commands', () => {
  newSection('命令与技能（按 ZCode 解析规则）');
  const CMD_NAME_RE = /^[a-z0-9][a-z0-9_:-]{0,63}$/;
  const CMD_KEYS = new Set(['allowed-tools', 'argument-hint', 'description', 'disable-noninteractive', 'model', 'skills']);
  // ZCode 保留名（内置命令 + 别名 + compress/plan）；命中会被静默丢弃
  const RESERVED = new Set(['clear', 'compact', 'compress', 'continue', 'dwf', 'effort', 'expert', 'fork', 'goal',
    'help', 'init', 'language', 'locale', 'login', 'logout', 'mcp', 'mode', 'model', 'new', 'plan', 'plugin',
    'plugins', 'resume', 'rewind', 'skill', 'target', 'variant']);

  const cmdDir = path.join(PLUGIN, 'commands');
  const cmdFiles = fs.existsSync(cmdDir) ? fs.readdirSync(cmdDir).filter((f) => f.endsWith('.md')) : [];
  ok(cmdFiles.length > 0, '至少有一个命令文件');
  for (const f of cmdFiles) {
    const stem = f.replace(/\.md$/, '');
    const text = fs.readFileSync(path.join(cmdDir, f), 'utf8');
    ok(CMD_NAME_RE.test(stem), `${stem}: 命令名合法`);
    ok(!RESERVED.has(stem.toLowerCase()), `${stem}: 不与 ZCode 保留名冲突`);
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
    ok(!!m, `${stem}: frontmatter 结构完整`);
    if (!m) continue;
    const lines = m[1].split(/\r?\n/);
    ok(lines.filter((l) => /^\s/.test(l)).length === 0, `${stem}: frontmatter 无缩进行`);
    const keys = lines.filter((l) => l.includes(':')).map((l) => l.split(':')[0].trim());
    const bad = keys.filter((k) => !CMD_KEYS.has(k));
    ok(bad.length === 0, `${stem}: frontmatter 键均有效`, bad.join(', '));
    ok(m[2].trim().length > 0, `${stem}: 正文非空`);
    ok(keys.includes('description'), `${stem}: 有 description`);

    // 两个工具各自依赖正文里的一处写法，删掉任何一个都会静默退化：
    //   install-user-scope.mjs  把 @@CC_USAGE_SCRIPT@@ 换成绝对路径
    //   verify-discoverable.cjs 从 CC_SCRIPT="…" 里读回那个路径
    ok(text.includes('@@CC_USAGE_SCRIPT@@'), `${stem}: 保留安装器要替换的脚本路径占位符`);
    ok(/CC_SCRIPT="[^"]*"/.test(text), `${stem}: 正文里有 CC_SCRIPT= 赋值可供诊断工具读取`);
    ok(/ZCODE_PLUGIN_ROOT/.test(text), `${stem}: 走 $ZCODE_PLUGIN_ROOT 解析插件目录`);
    ok(text.includes('$HOME/.zcode'), `${stem}: 保留已知目录兜底查找`);
  }

  const skillDir = path.join(PLUGIN, 'skills');
  const skills = fs.existsSync(skillDir)
    ? fs.readdirSync(skillDir).filter((d) => fs.existsSync(path.join(skillDir, d, 'SKILL.md')))
    : [];
  ok(skills.length > 0, '至少有一个技能');
  for (const s of skills) {
    const text = fs.readFileSync(path.join(skillDir, s, 'SKILL.md'), 'utf8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
    ok(!!m, `${s}: SKILL.md frontmatter 完整`);
    if (!m) continue;
    const nm = /^name:\s*(\S+)/m.exec(m[1])?.[1];
    ok(nm === s, `${s}: skill name 与目录名一致`, nm);
    ok(/^description:\s*\S/m.test(m[1]), `${s}: 有 description`);
    ok(text.includes('--serve'), `${s}: 提到 --serve 这条零 token 路径`);
  }

  return `${cmdFiles.length} 个命令 + ${skills.length} 个技能`;
});

/* ------------------------------------------------------- 3. 静态检查 */

record('static', () => {
  newSection('静态检查');
  const files = walk(ROOT);
  let json = 0;
  let js = 0;
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      JSON.parse(fs.readFileSync(f, 'utf8'));
      json += 1;
    } catch (err) {
      ok(false, `JSON 非法: ${path.relative(ROOT, f)}`, err.message);
    }
  }
  for (const f of files) {
    if (!/\.(mjs|cjs|js)$/.test(f)) continue;
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8', timeout: 20_000 });
    ok(r.status === 0, `语法可解析: ${path.relative(ROOT, f)}`, String(r.stderr || '').split('\n')[0]);
    js += 1;
  }
  return `${json} 个 JSON + ${js} 个 JS`;
});

/* -------------------------------------------------------- 4. 密钥与隐私 */

record('secrets', () => {
  // 别让 API key、本机绝对路径或邮箱被提交进去——这是要公开发布的仓库。
  newSection('密钥与隐私');
  const patterns = [
    [/user_[A-Za-z0-9_-]{16,}/, 'Command Code key'],
    [/sk-[A-Za-z0-9]{20,}/, 'OpenAI 风格 key'],
    [/ghp_[A-Za-z0-9]{20,}/, 'GitHub token'],
    [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub PAT'],
    [/C:[\\/]Users[\\/](?!admin[\\/]\.claude)[A-Za-z0-9._-]+/, '个人绝对路径'],
    [/\/Users\/[A-Za-z0-9._-]+/, '个人绝对路径'],
    [/[A-Za-z0-9._%+-]+@(?!example\.com|users\.noreply)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, '邮箱'],
  ];
  let scanned = 0;
  let hits = 0;
  for (const f of walk(ROOT)) {
    if (/\.(png|jpg|ico|woff2?|lock)$/.test(f)) continue;
    // 本文件自己的规则里就写着这些形态，跳过它
    if (f === fileURLToPath(import.meta.url)) continue;
    const text = fs.readFileSync(f, 'utf8');
    for (const [re, label] of patterns) {
      const hit = text.match(re);
      if (hit) {
        hits += 1;
        ok(false, `${label} 出现在 ${path.relative(ROOT, f)}`, `${hit[0].slice(0, 32)}…`);
      }
    }
    scanned += 1;
  }
  ok(hits === 0, `${scanned} 个文件已扫描，无密钥、无本机路径、无邮箱`);
  return `${scanned} 个文件`;
});

/* ------------------------------------------------------- 5. 状态栏渲染 */

record('statusline', () => {
  newSection('状态栏渲染');
  let checked = 0;

  // 按量计费套餐的输出是确定的（金额固定、没有时间），可以逐字断言。
  const provider = runCore(['--statusline', '--rows', '1', '--demo', 'provider'], { COLUMNS: '140' }).trim();
  ok(provider === 'CC Provider │ 余额 $47.66',
    `按量计费套餐应只显示余额，实际：${JSON.stringify(provider)}`);
  checked += 1;

  for (const scenario of ['normal', 'hot', 'max']) {
    const line = runCore(['--statusline', '--rows', '1', '--demo', scenario], { COLUMNS: '140' }).trim();
    const name = `--demo ${scenario}`;
    ok(line.startsWith('CC '), `${name}: 应以 "CC " 开头，实际 ${JSON.stringify(line.slice(0, 20))}`);
    ok(line.split('│').length === 4, `${name}: 单行模式应有 4 段（套餐名 + 三条窗口），实际 ${line.split('│').length}`);
    ok(/\d+%/.test(line), `${name}: 应含百分比`);
    ok(line.includes('重置'), `${name}: 三条窗口都该带重置时间`);
    // 绝不带 ANSI：钩子的 systemMessage 是纯文本，带上会原样显示成乱码。
    ok(!/\x1b\[/.test(runCore(['--statusline', '--rows', '1', '--demo', scenario])), `${name}: 不应输出 ANSI`);
    checked += 1;

    const three = runCore(['--statusline', '--demo', scenario], { COLUMNS: '140' }).trim();
    ok(three.split('\n').length === 3, `${name}: 三行模式应输出 3 行`);
    checked += 1;
  }

  // 宽度自适应：任何终端宽度下都不能折行（折行会让整个底部错位）。
  for (const cols of ['200', '140', '120', '110', '100', '95', '90', '80']) {
    const line = runCore(['--statusline', '--rows', '1', '--demo'], { COLUMNS: cols }).trim();
    const w = displayWidth(line);
    ok(w <= Number(cols), `COLUMNS=${cols}: 行宽 ${w} 超了`);
    ok(!line.includes('\n'), `COLUMNS=${cols}: 不该折行`);
    checked += 1;
  }

  return `${checked} 项渲染断言`;
});

/* ---------------------------------------------------- 6. 去向判定表 */

record('gating', async () => {
  // 直接测判定函数，不跑整条流水线：整条要凭证、要联网，CI 上两样都没有。
  newSection('去向判定（这一轮走没走 Command Code）');
  const { decideRoute, normalizeModel, routeDecision } = await import(pathToFileURL(CORE).href);
  const catalog = ['deepseek-v4.1-flash', 'claude-opus-5', 'kimi-k2.7-code'];

  ok(normalizeModel('deepseek/deepseek-v4.1-flash') === 'deepseek-v4.1-flash', '归一化应去掉 vendor 前缀');
  ok(normalizeModel('claude-opus-5[1M]') === 'claude-opus-5', '归一化应去掉 [1M] 这类后缀');
  ok(normalizeModel('K2.7 Code') === 'k2.7-code', '归一化应把空白折成连字符');

  ok(decideRoute('deepseek/deepseek-v4.1-flash', catalog) === 'yes', '目录里有的模型 -> 在用');
  ok(decideRoute('totally-made-up-xyz', catalog) === 'no', '目录里没有 -> 不在用');
  ok(decideRoute(null, catalog) === 'unknown', '拿不到模型名 -> 未知，交给下一级判据');
  ok(decideRoute('deepseek-v4.1-flash', null) === 'unknown', '没有目录 -> 未知，不猜');

  // 裸 claude-* 名字原生也有，必须回避而不是当成命中
  ok(decideRoute('claude-opus-5', catalog) === 'unknown', 'claude-* 有歧义 -> 不猜');
  ok(decideRoute('claude-opus-5', catalog, { trustedSource: true }) === 'yes',
    '来自本地路由映射的 claude-* 是确定的，应当显示');

  // 用户自己补的别名优先于目录
  ok(decideRoute('kimi-k2.7-code', catalog, { modelPatterns: ['k2.7-code'] }) === 'yes', '用户别名应命中');
  ok(decideRoute('deepseek-v4.1-flash', catalog, { modelPatterns: ['k2.7-code'] }) === 'no',
    '给了别名就按别名来，不再看目录');

  // 各种宿主的 stdin 形状不同，routeDecision 必须都认。
  // 显式传空的 env：不然结果取决于跑测试那台机器有没有设本地路由的模型映射，
  // 那正是上一个版本「本地过 CI 挂」的原因。
  const stringModel = routeDecision(
    { model: 'gpt-5.6-terra', transcript_path: '' },
    { catalog: [...catalog, 'gpt-5.6-terra'], env: {} });
  ok(stringModel.decision === 'yes', '字符串形式的 model 应当被认出来');

  const outside = routeDecision({ model: 'gpt-5.6-terra', transcript_path: '' }, { catalog, env: {} });
  ok(outside.decision === 'no', '给的模型不在目录里就该隐藏');

  const noModel = routeDecision({ transcript_path: '' }, { catalog, env: {} });
  ok(noModel.decision === 'unknown', '没给 model 时是未知，不是「不在用」');

  const objModel = routeDecision({ model: { id: 'claude-opus-5[1M]' }, transcript_path: '' }, { catalog, env: {} });
  ok(objModel.decision === 'unknown', '对象形状的 model 不该被当成模型名——真实模型在 transcript 里');

  return '15 项判定断言';
});

/* ------------------------------------------------------- 7. 阈值与钩子 */

record('threshold+hook', () => {
  newSection('阈值与钩子');
  const under = runCore(['--statusline', '--threshold', '70', '--demo']).trim();
  ok(under === '', `未过阈值不该有输出，实际：${JSON.stringify(under.slice(0, 40))}`);

  const over = runCore(['--statusline', '--threshold', '30', '--demo']).trim();
  ok(over.startsWith('CC '), '过了阈值应输出面板');

  // 钩子必须吐合法 JSON，且 systemMessage 是纯文本
  const hook = runCore(['--hook', '--always', '--demo']).trim();
  let parsed = null;
  try { parsed = JSON.parse(hook); } catch { /* 下面断言会报 */ }
  ok(parsed && typeof parsed.systemMessage === 'string',
    `钩子应输出 {"systemMessage": …}，实际：${hook.slice(0, 60)}`);
  ok(parsed && !/\x1b\[/.test(parsed.systemMessage), 'systemMessage 不能含 ANSI（会原样显示成乱码）');
  ok(parsed && !parsed.hookSpecificOutput,
    '钩子不该用 additionalContext——那会进模型上下文、每轮烧 token');

  return '阈值静默 + 钩子 JSON 形状';
});

/* --------------------------------------------------------- 8. 输出模式 */

record('formats', () => {
  newSection('输出模式');
  let n = 0;
  for (const [args, marker, name] of [
    [['--demo'], 'Command Code', '终端面板'],
    [['--md', '--demo'], '|', 'Markdown'],
    [['--compact', '--demo'], 'CC GOAT', '单行摘要'],
  ]) {
    const out = runCore(args);
    ok(out.includes(marker), `${name} 应包含 ${JSON.stringify(marker)}`);
    n += 1;
  }
  const json = runCore(['--json', '--demo']);
  let doc = null;
  try { doc = JSON.parse(json); } catch { /* 断言会报 */ }
  ok(doc && doc.plan && doc.windows && doc.monthly, '--json 应是自洽快照');
  n += 1;

  // 本仓库最容易被「合并上游」时丢掉的两条路径：--serve 与 --watch。
  const help = runCore(['--help']);
  ok(help.includes('--serve'), '--help 应列出 --serve');
  ok(help.includes('--watch'), '--help 应列出 --watch');
  ok(help.includes('--port'), '--help 应列出 --port');
  n += 1;

  return `${n} 种输出`;
});

/* ----------------------------------------------------------- 9. --serve */

record('serve', async () => {
  // --serve 是本仓库独有的那条路径，而它偏偏只有真起服务才验得到。
  // 这里在回环上放一个桩接口冒充 Command Code 的接口，凭证指向它，
  // 于是整个过程不联网也能把 起服务 → 请求 → 断言 HTML → 关掉 跑完。
  newSection('--serve 端到端');
  const now = Date.now();
  const payloads = {
    '/alpha/whoami': {
      user: { id: 'u1', userName: 'check', name: 'Check', email: 'check@example.com' },
      org: { id: 'org-1', name: 'Check Org' },
      orgLimits: [],
    },
    '/alpha/billing/credits': {
      credits: { monthlyCredits: 46.25, purchasedCredits: 0, freeCredits: 0 },
      windowLimits: {
        limited: true,
        fiveHour: { used: 3.5, cap: 14, resetAt: now + 2 * 3600_000 },
        weekly: { used: 4.5, cap: 35, resetAt: now + 3 * 86400_000 },
      },
    },
    '/alpha/billing/subscriptions': {
      data: {
        planId: 'individual-goat',
        status: 'active',
        currentPeriodStart: new Date(now - 10 * 86400_000).toISOString(),
        currentPeriodEnd: new Date(now + 20 * 86400_000).toISOString(),
      },
    },
    '/alpha/usage/summary': {
      requests: 320, completed: 320, failed: 0, successRate: 100,
      totalCost: 8, averageCost: 0.025, tokensIn: 1_000_000, tokensOut: 10_000,
    },
  };

  const API_KEY = 'user_check0000000000';
  const seenAuth = [];
  const stub = http.createServer((req, res) => {
    const route = new URL(req.url, 'http://stub').pathname;
    seenAuth.push(req.headers.authorization ?? '');
    const body = payloads[route];
    if (!body) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const stubPort = stub.address().port;

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-serve-'));
  fs.mkdirSync(path.join(home, '.zcode', 'v2'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.zcode', 'v2', 'provider_config.json'),
    JSON.stringify({
      providers: [{
        id: 'commandcode',
        api: { baseUrl: `http://127.0.0.1:${stubPort}/commandcode.ai` },
        access: { apiKey: API_KEY },
      }],
    }),
  );

  const freePort = () => new Promise((r) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); });
  });

  let child = null;
  try {
    let base = null;
    let stderr = '';
    // 挑端口和真正 listen 之间有窗口，被别的进程抢了就换一个再来。
    for (let attempt = 0; attempt < 3 && !base; attempt++) {
      const port = await freePort();
      stderr = '';
      const proc = spawn(process.execPath, [CORE, '--serve', '--port', String(port)], {
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          COMMAND_CODE_API_KEY: '',
          COMMANDCODE_API_KEY: '',
          CMD_API_KEY: '',
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      proc.stdout.setEncoding('utf8');
      proc.stderr.setEncoding('utf8');
      proc.stdout.on('data', () => {});
      proc.stderr.on('data', (d) => { stderr += d; });

      const url = `http://127.0.0.1:${port}/`;
      for (let i = 0; i < 40 && !base; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (proc.exitCode !== null) break;
        try {
          const probe = await fetch(url);
          await probe.arrayBuffer();
          if (probe.ok) base = url;
        } catch { /* 还没起来 */ }
      }
      if (base) child = proc;
      else proc.kill();
    }

    ok(Boolean(base), '--serve 应在本机回环上起来（默认端口被占时用 --port 指定）', stderr.trim().slice(0, 200));

    if (base) {
      // 1) 面板本体：必须是真 HTML，而不是一段纯文本或报错页。
      const page = await fetch(base);
      const html = await page.text();
      ok(page.status === 200, `GET / 应返回 200，实际 ${page.status}`);
      ok(String(page.headers.get('content-type') || '').includes('text/html'),
        `GET / 应是 text/html，实际 ${page.headers.get('content-type')}`);
      ok(html.includes('<!DOCTYPE html>') && html.includes('Command Code'), 'GET / 应返回面板 HTML');
      ok(html.includes('GOAT'), 'GET / 的 HTML 应已渲染桩接口的数据');

      // 2) 同一份数据的 JSON 出口，数值要和桩接口对得上。
      const api = await fetch(`${base}api/usage`);
      let view = null;
      try { view = await api.json(); } catch { /* 断言会报 */ }
      ok(api.status === 200 && view, `GET /api/usage 应返回 JSON，实际 ${api.status}`);
      ok(view?.plan?.name === 'GOAT', `JSON 里的套餐应是 GOAT，实际 ${view?.plan?.name}`);
      ok(Math.round(view?.windows?.fiveHour?.percent ?? 0) === 25, 'JSON 里 5 小时窗口应是 25%（3.5 / 14）');

      // 3) 未知路径不该被当成面板。
      const missing = await fetch(`${base}nope`);
      await missing.arrayBuffer();
      ok(missing.status === 404, `未知路径应 404，实际 ${missing.status}`);

      // 4) 取数只走桩接口，且每次都带用户的 key。
      ok(seenAuth.length > 0 && seenAuth.every((a) => a === `Bearer ${API_KEY}`),
        '桩接口收到的每个请求都应带 Authorization: Bearer <key>');
    }
  } finally {
    if (child) child.kill();
    stub.close();
    fs.rmSync(home, { recursive: true, force: true });
  }

  return '起服务 → 请求 → 断言 HTML → 关掉';
});

/* ---------------------------------------------------------- 10. 安装器 */

record('installer', () => {
  newSection('用户级安装器');
  const SETUP = path.join(PLUGIN, 'scripts', 'install-user-scope.mjs');
  const VERIFY = path.join(PLUGIN, 'scripts', 'verify-discoverable.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-install-'));
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-install-foreign-'));
  const cmdRel = path.join('.zcode', 'commands', 'quota.md');
  const usageRel = path.join('.zcode', 'commands', 'usage.md');
  const skillRel = path.join('.zcode', 'skills', 'command-code-usage', 'SKILL.md');

  const run = (script, args, home) => spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });

  try {
    // 1) 冲突保护：用户自己写的同名文件必须原样留着，且安装器要非零退出。
    fs.mkdirSync(path.join(foreign, '.zcode', 'commands'), { recursive: true });
    fs.writeFileSync(path.join(foreign, cmdRel), '我自己的命令\n', 'utf8');
    const blocked = run(SETUP, [], foreign);
    ok(blocked.status !== 0, '存在用户自己写的同名命令时应中止', String(blocked.stdout || '').slice(0, 120));
    ok(fs.readFileSync(path.join(foreign, cmdRel), 'utf8') === '我自己的命令\n', '用户自己的文件未被覆盖');
    ok(!fs.existsSync(path.join(foreign, skillRel)), '中止时不应写入技能');

    // 2) --dry-run 只报计划，不落盘。
    const dry = run(SETUP, ['--dry-run'], root);
    ok(dry.status === 0, '--dry-run 应以 0 退出', String(dry.stderr || '').slice(0, 120));
    ok(!fs.existsSync(path.join(root, cmdRel)), '--dry-run 不应写文件');

    // 3) 干净安装：命令与技能都到位，且正文里的占位符被换成了真实存在的绝对路径。
    const installed = run(SETUP, [], root);
    ok(installed.status === 0, '全新安装应以 0 退出', String(installed.stderr || '').slice(0, 120));
    ok(fs.existsSync(path.join(root, cmdRel)) && fs.existsSync(path.join(root, usageRel)), '两个命令都已安装');
    ok(fs.existsSync(path.join(root, skillRel)), '技能已安装');
    const body = fs.readFileSync(path.join(root, cmdRel), 'utf8');
    ok(!body.includes('@@CC_USAGE_SCRIPT@@'), '安装后占位符应已替换');
    const scriptPath = /CC_SCRIPT="([^"]+)"/.exec(body)?.[1];
    ok(scriptPath && fs.existsSync(scriptPath), `替换后的脚本路径应真实存在（${scriptPath}）`);
    ok(fs.existsSync(path.join(root, '.zcode', 'skills', 'command-code-usage', '.installed.json')),
      '安装清单已写入（下次更新靠它判断哪些文件是本插件写的）');

    // 4) 装完就能被 ZCode 发现：用复刻的解析器验一遍，error 级诊断一个都不该有。
    const discovery = run(VERIFY, ['.'], root);
    const out = String(discovery.stdout || '');
    ok(discovery.status === 0, 'verify-discoverable 应以 0 退出');
    ok(out.includes('/quota') && out.includes('/usage'), 'ZCode 解析器应发现 /quota 与 /usage');
    ok(!/\[error\]/.test(out), '不应有 error 级诊断', out.split('\n').filter((l) => l.includes('[error]')).join(' | '));
    ok(out.includes('脚本路径') && out.includes('✓ 存在'), '诊断应报出安装注入的脚本路径存在');

    // 5) 卸载：副本清掉，插件目录不动。
    const removed = run(SETUP, ['--uninstall'], root);
    ok(removed.status === 0, '--uninstall 应以 0 退出');
    ok(!fs.existsSync(path.join(root, cmdRel)) && !fs.existsSync(path.join(root, skillRel)), '卸载后副本都不在');
    ok(fs.existsSync(CORE), '卸载不动插件目录本身');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(foreign, { recursive: true, force: true });
  }

  return '冲突保护 + 安装/发现/卸载';
});

/* ------------------------------------------------------------ 执行 */

console.log('Command Code Usage（ZCode 插件）— 发布前检查\n');
let failed = 0;

for (const { name, fn } of suites) {
  failures = [];
  const started = Date.now();
  let summary = '';
  let thrown = null;
  try {
    summary = (await fn()) ?? '';
  } catch (err) {
    thrown = err instanceof Error ? err.message : String(err);
  }
  const ms = Date.now() - started;

  if (!thrown && failures.length === 0) {
    console.log(`${QUIET ? '' : '  ok    '}${name.padEnd(14)} ${summary}  (${ms}ms)`);
  } else {
    failed += 1;
    console.log(`${QUIET ? '' : '  FAIL  '}${name.padEnd(14)} —  (${ms}ms)`);
    if (thrown) console.log(`          套件抛错：${thrown}`);
    for (const f of failures) console.log(`          ${f}`);
  }
}

console.log('');
if (failed > 0) {
  console.log(`${failed} 个套件失败。`);
  process.exit(1);
}
console.log(`检查项 ${checks}，${suites.length} 个套件全部通过。`);
