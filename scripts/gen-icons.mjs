/**
 * 生成 PWA 图标（192 / 512 PNG）+ apple-touch-icon
 *
 * 为什么不用现成图片：public/ 里没有素材，也不想为两个图标引入 sharp/jimp
 * 这类依赖。直接用 zlib 手写 PNG 编码器（RGBA + deflate + CRC32），
 * 画一个「琥珀底 + 深色定位针」的极简标记，和产品的纸感/墨线风格一致。
 *
 * 用法：node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'public');
mkdirSync(outDir, { recursive: true });

// ── PNG 编码 ────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA 像素 → PNG buffer */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 画图 ────────────────────────────────────────────────────
const AMBER = [255, 201, 77, 255];
const INK = [36, 33, 29, 255];
const PAPER = [250, 246, 239, 255];

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = c[3];
  };

  // 底：琥珀方底 + 圆角（圆角外留透明）
  const r = size * 0.18;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inCorner =
        (x < r && y < r && (r - x) ** 2 + (r - y) ** 2 > r * r) ||
        (x > size - r && y < r && (x - (size - r)) ** 2 + (r - y) ** 2 > r * r) ||
        (x < r && y > size - r && (r - x) ** 2 + (y - (size - r)) ** 2 > r * r) ||
        (x > size - r && y > size - r && (x - (size - r)) ** 2 + (y - (size - r)) ** 2 > r * r);
      if (inCorner) continue; // 透明
      set(x, y, AMBER);
    }
  }

  // 墨色描边（沿圆角轮廓画一圈）
  const bw = Math.max(2, Math.round(size * 0.035));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = px[(y * size + x) * 4 + 3];
      if (a !== 255) continue;
      let edge = false;
      for (let d = 1; d <= bw; d++) {
        const ns = [
          [x + d, y], [x - d, y], [x, y + d], [x, y - d],
        ];
        for (const [nx, ny] of ns) {
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) { edge = true; break; }
          if (px[(ny * size + nx) * 4 + 3] !== 255) { edge = true; break; }
        }
        if (edge) break;
      }
      if (edge) set(x, y, INK);
    }
  }

  // 定位针：圆头 + 三角尾
  const cx = size / 2;
  const cy = size * 0.40;
  const head = size * 0.17;
  const tipY = size * 0.78;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inHead = dx * dx + dy * dy <= head * head;
      // 三角形：从 (cx±head*0.72, cy+head*0.62) 收窄到 (cx, tipY)
      const ty0 = cy + head * 0.62;
      let inTail = false;
      if (y >= ty0 && y <= tipY) {
        const t = (y - ty0) / (tipY - ty0);
        const halfW = head * 0.72 * (1 - t) + size * 0.012 * t;
        inTail = Math.abs(dx) <= halfW;
      }
      if (inHead || inTail) set(x, y, INK);
    }
  }
  // 针头白心
  const hole = head * 0.40;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= hole * hole) set(x, y, PAPER);
    }
  }
  return px;
}

for (const size of [192, 512]) {
  const png = encodePng(size, size, drawIcon(size));
  writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`✓ public/icon-${size}.png (${(png.length / 1024).toFixed(1)} KB)`);
}
// iOS 主屏图标
writeFileSync(path.join(outDir, 'apple-touch-icon.png'), encodePng(180, 180, drawIcon(180)));
console.log('✓ public/apple-touch-icon.png');
