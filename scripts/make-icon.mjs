#!/usr/bin/env node
/**
 * 生成插件图标 —— assets/command-code-usage/icon.png
 *
 *   node scripts/make-icon.mjs
 *
 * 为什么不用图像生成模型：这就是一块纯几何图形（深色圆角底 + 三条渐变进度条），
 * 代码画出来的结果确定、可复现、随仓库走，也不必依赖外部服务或 API key。
 *
 * 画面内容对应该插件本身的形态：深色底 + 三条不同长度的进度条，
 * 即面板里的 5 小时窗口 / 每周窗口 / 月度额度。
 *
 * 实现：4 倍超采样 + 有符号距离场求覆盖率，再盒式降采样，得到抗锯齿边缘。
 * 只用 Node 内置模块（zlib 做 PNG 的 deflate）。
 */

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'command-code-usage', 'icon.png');

const SIZE = 256;
const SS = 4; // 超采样倍数
const W = SIZE * SS;

/* ------------------------------------------------------------------ 绘图参数 */

const BG = [0x0b, 0x0d, 0x12];       // #0b0d12
const BORDER = [0x2a, 0x30, 0x40];    // 细边，避免深色图标在深色界面上糊成一片
const TRACK = [0x23, 0x28, 0x37];     // #232837
const GRAD_FROM = [0x34, 0xd3, 0x99]; // #34d399 低用量
const GRAD_TO = [0xa7, 0x8b, 0xfa];   // #a78bfa 高用量
const LEVELS = [0.72, 0.44, 0.24];    // 与面板的三个进度条对应

const TILE = { x: 6, y: 6, w: 244, h: 244, r: 56 };
const BAR = { x: 40, w: 176, h: 28, r: 14, gap: 18 };

/* ------------------------------------------------------------ 距离场与采样 */

// 圆角矩形有符号距离：<0 在内部，>0 在外部
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

// 把距离换算成覆盖率（1px 过渡带），用于超采样下的平滑边缘
function coverage(d) {
  return Math.min(Math.max(0.5 - d, 0), 1);
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

/* -------------------------------------------------------------- 渲染（超采样） */

const buf = new Float32Array(W * W * 4); // RGBA，线性 0..1

function setPx(x, y, color, alpha) {
  if (alpha <= 0) return;
  const i = (y * W + x) * 4;
  const a = Math.min(alpha, 1);
  buf[i] = buf[i] * (1 - a) + (color[0] / 255) * a;
  buf[i + 1] = buf[i + 1] * (1 - a) + (color[1] / 255) * a;
  buf[i + 2] = buf[i + 2] * (1 - a) + (color[2] / 255) * a;
  buf[i + 3] = buf[i + 3] * (1 - a) + a;
}

// 三条进度条的几何位置（居中）
const bars = LEVELS.map((level, i) => {
  const totalH = BAR.h * LEVELS.length + BAR.gap * (LEVELS.length - 1);
  const top = (SIZE - totalH) / 2;
  const y = top + i * (BAR.h + BAR.gap);
  return { level, cy: y + BAR.h / 2 };
});

for (let py = 0; py < W; py++) {
  for (let px = 0; px < W; px++) {
    const x = (px + 0.5) / SS;
    const y = (py + 0.5) / SS;

    // 底：圆角方块
    const dTile = sdRoundRect(x, y, TILE.x + TILE.w / 2, TILE.y + TILE.h / 2, TILE.w / 2, TILE.h / 2, TILE.r);
    setPx(px, py, BG, coverage(dTile));

    // 描边：外缘附近一圈
    const borderBand = coverage(dTile) * (1 - coverage(dTile - 1.2));
    setPx(px, py, BORDER, borderBand * 0.85);

    // 三条进度条
    for (const bar of bars) {
      const cx = BAR.x + BAR.w / 2;
      const dTrack = sdRoundRect(x, y, cx, bar.cy, BAR.w / 2, BAR.h / 2, BAR.r);
      const covTrack = coverage(dTrack);
      if (covTrack <= 0) continue;
      setPx(px, py, TRACK, covTrack);

      const fillW = Math.max(BAR.h, BAR.w * bar.level);
      const dFill = sdRoundRect(x, y, BAR.x + fillW / 2, bar.cy, fillW / 2, BAR.h / 2, BAR.r);
      const covFill = coverage(dFill);
      if (covFill <= 0) continue;

      // 渐变按轨道整体位置取样：短条停在绿色端，长条延伸到紫色端
      const t = Math.min(Math.max((x - BAR.x) / BAR.w, 0), 1);
      setPx(px, py, mix(GRAD_FROM, GRAD_TO, t), covFill);
    }
  }
}

/* ------------------------------------------------------------- 降采样 + 编码 */

const out = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const i = ((y * SS + dy) * W + (x * SS + dx)) * 4;
        const sa = buf[i + 3];
        // 按 alpha 加权，避免边缘出现暗边
        r += buf[i] * sa;
        g += buf[i + 1] * sa;
        b += buf[i + 2] * sa;
        a += sa;
      }
    }
    const n = SS * SS;
    const o = (y * SIZE + x) * 4;
    if (a > 0) {
      out[o] = Math.round(Math.min(r / a, 1) * 255);
      out[o + 1] = Math.round(Math.min(g / a, 1) * 255);
      out[o + 2] = Math.round(Math.min(b / a, 1) * 255);
    }
    out[o + 3] = Math.round((a / n) * 255);
  }
}

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // colour type: RGBA
ihdr[10] = 0;  // deflate
ihdr[11] = 0;  // adaptive filtering
ihdr[12] = 0;  // no interlace

// 每行前加一个 filter 字节 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, png);
console.log(`已写入 ${path.relative(ROOT, OUT)}  ${SIZE}x${SIZE}  ${(png.length / 1024).toFixed(1)} KB`);
