#!/usr/bin/env node
/**
 * 发布前检查 —— 仓库自带的门禁，本地和 CI 跑的是同一个脚本。
 *
 *   node scripts/check.mjs
 *
 * 覆盖两类风险：
 *   1. 双生态清单漂移 —— 插件同时提供 .zcode-plugin/ 与 .claude-plugin/ 清单，
 *      市场同时提供根目录与 .claude-plugin/ 清单；重复字段必须完全一致。
 *   2. 发布事故 —— 版本号不一致、遗留个人路径/密钥、命令名或 frontmatter
 *      不符合 ZCode 的解析规则。
 *
 * 只用 Node 内置模块。退出码 0 = 通过。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = path.join(ROOT, 'command-code-usage');

let failures = 0;
let checks = 0;

function ok(cond, label, detail) {
  checks++;
  if (cond) {
    console.log(`  \u2714 ${label}`);
  } else {
    failures++;
    console.log(`  \u2718 ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch (err) {
    failures++;
    checks++;
    console.log(`  \u2718 ${rel}: 不是合法 JSON\n      ${err.message}`);
    return null;
  }
}

/* ------------------------------------------------------------ 1. JSON 有效性 */

section('JSON 有效性');
const zPlugin = readJson('command-code-usage/.zcode-plugin/plugin.json');
const cPlugin = readJson('command-code-usage/.claude-plugin/plugin.json');
const zMarket = readJson('marketplace.json');
const cMarket = readJson('.claude-plugin/marketplace.json');
if (!zPlugin || !cPlugin || !zMarket || !cMarket) {
  console.log('\n关键清单缺失或损坏，后续检查已跳过。');
  process.exit(1);
}
ok(true, '四个清单文件均可解析');

/* ------------------------------------------------------------ 2. 版本一致性 */

section('版本一致性');
const srcVersion = /const VERSION = '([0-9.]+)'/.exec(
  fs.readFileSync(path.join(PLUGIN, 'scripts', 'cc-usage.mjs'), 'utf8'),
)?.[1];
const versions = {
  '.zcode-plugin/plugin.json': zPlugin.version,
  '.claude-plugin/plugin.json': cPlugin.version,
  'marketplace.json': zMarket.plugins[0].version,
  '.claude-plugin/marketplace.json': cMarket.plugins[0].version,
  'cc-usage.mjs VERSION': srcVersion,
};
for (const [k, v] of Object.entries(versions)) console.log(`      ${v}  ${k}`);
ok(new Set(Object.values(versions)).size === 1, '五处版本号完全一致');

/* --------------------------------------------------- 3. 双生态清单重复字段 */

section('双生态清单一致性（重复字段必须相同）');
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

/* ------------------------------------------------------------ 4. ZCode 规则 */

section('ZCode 清单规则');
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
ok(NAME_RE.test(zPlugin.name), `插件名符合 ZCode 规则 (${zPlugin.name})`);
ok(NAME_RE.test(zMarket.name), `市场名符合 ZCode 规则 (${zMarket.name})`);
ok(path.basename(PLUGIN) === zPlugin.name, '插件目录名 == 清单里的 name');
ok(zMarket.plugins[0].name === zPlugin.name, '市场条目名 == 插件名');

const source = zMarket.plugins[0].source;
const resolved = path.resolve(ROOT, source);
ok(resolved.startsWith(ROOT + path.sep), `marketplace source 未逃出仓库根 (${source})`);
ok(fs.existsSync(path.join(resolved, '.zcode-plugin', 'plugin.json')), 'source 指向真实插件');

// 这几个字段 ZCode「只认不执行」，写进去会让使用者以为生效了
const inert = ['channels', 'lspServers', 'outputStyles', 'settings'].filter((k) => k in zPlugin);
ok(inert.length === 0, '插件清单不含 ZCode 只认不执行的字段', inert.join(', '));

// ZCode 实际支持的抽屉字段，写错会静默失效
const zcodeEntryAllowed = new Set([
  'name', 'source', 'version', 'description', 'displayName', 'displayName_i18n', 'description_i18n',
  'icon', 'category', 'homepage', 'privacyPolicy', 'termsOfService', 'heroImage', 'author',
  'examplePrompts', 'examplePrompts_i18n', 'requiresPaidPlan',
]);
const unknownZ = Object.keys(zMarket.plugins[0]).filter((k) => !zcodeEntryAllowed.has(k));
ok(unknownZ.length === 0, 'ZCode 市场条目字段均受支持', unknownZ.join(', '));

/* --------------------------------------------------- 5. 命令与技能的可发现性 */

section('命令与技能（按 ZCode 解析规则）');
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
  const indented = lines.filter((l) => /^\s/.test(l));
  ok(indented.length === 0, `${stem}: frontmatter 无缩进行`);
  const keys = lines.filter((l) => l.includes(':')).map((l) => l.split(':')[0].trim());
  const bad = keys.filter((k) => !CMD_KEYS.has(k));
  ok(bad.length === 0, `${stem}: frontmatter 键均有效`, bad.join(', '));
  ok(m[2].trim().length > 0, `${stem}: 正文非空`);
  ok(keys.includes('description'), `${stem}: 有 description`);
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
}

/* --------------------------------------------------------------- 6. 卫生检查 */

section('发布卫生');
const filesToScan = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(md|json|mjs|cjs|txt|yml|yaml)$/.test(e.name)) filesToScan.push(p);
  }
})(ROOT);

const SECRET_PATTERNS = [
  [/user_[A-Za-z0-9]{40,}/, 'Command Code API key'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub PAT'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'OpenAI 风格 key'],
  [/Bearer\s+[A-Za-z0-9_-]{20,}/, '字面 Bearer 令牌'],
];
let secretHits = [];
for (const f of filesToScan) {
  const t = fs.readFileSync(f, 'utf8');
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(t)) secretHits.push(`${path.relative(ROOT, f)} (${label})`);
  }
}
ok(secretHits.length === 0, '无密钥字面量', secretHits.join('\n      '));

// 本机路径与个人邮箱：只允许 example.com
let pathHits = [];
let emailHits = [];
for (const f of filesToScan) {
  const t = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  if (/Users[\\/](admin|Jovan)\b/i.test(t) || /\/c\/Users\//.test(t)) pathHits.push(rel);
  for (const m of t.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    if (!/example\.(com|org|net)$/.test(m[0])) emailHits.push(`${rel}: ${m[0]}`);
  }
}
ok(pathHits.length === 0, '无本机绝对路径残留', pathHits.join('\n      '));
ok(emailHits.length === 0, '无 example.com 之外的邮箱', emailHits.join('\n      '));

/* ----------------------------------------------------------------- 汇总 */

section('结果');
console.log(`  检查项 ${checks}，失败 ${failures}`);
if (failures > 0) {
  console.log('\n发布检查未通过。');
  process.exit(1);
}
console.log('\n全部通过。');
