/**
 * 명령 버튼 아이콘 (사용자 요청 11/24: 건물은 글자 대신 생김새로).
 * 게임용 그림(public/assets/sprites)에서 빈 여백을 잘라 내고 ICON x ICON 정사각형 가운데에 맞춰 넣는다.
 *   node art/tools/make-icons.mjs [그림 폴더] [출력 폴더]
 * 방향 시트(유닛)는 방향 2(남쪽, 화면 쪽) 0번 장(서 있기)을 쓴다.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { blank, readPng, writePng } from './png.mjs';

const spritesDir = process.argv[2] ?? 'public/assets/sprites';
const outDir = process.argv[3] ?? 'public/assets/icons';
const ICON = 64;
const PAD = 3;
/** 그림자(반투명)는 잘라 낼 때 무시: 이보다 불투명해야 "그림" 으로 본다 */
const ALPHA_MIN = 110;

const BUILDINGS = ['campfire', 'barricade', 'scrap_turret', 'turret', 'command_center', 'supply_depot', 'barracks'];
/** 유닛 시트: [이름, 한 장 크기, 한 줄의 장 수] */
const SHEETS = [
  ['worker', 96, 5],
  ['rifleman', 96, 5],
  ['commander', 96, 5],
];

function crop(src, x0, y0, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((y0 + y) * src.width + x0 + x) * 4;
      const d = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out.data[d + c] = src.data[s + c];
    }
  }
  return out;
}

/** 불투명한 부분의 상자 */
function opaqueBounds(img) {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] < ALPHA_MIN) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) throw new Error('빈 그림');
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** 면적 평균으로 줄여서(또는 늘려서) ICON 정사각형 가운데에 */
function fitIcon(img) {
  const b = opaqueBounds(img);
  const scale = (ICON - PAD * 2) / Math.max(b.w, b.h);
  const w = Math.max(1, Math.round(b.w * scale));
  const h = Math.max(1, Math.round(b.h * scale));
  const out = blank(ICON, ICON);
  const ox = Math.floor((ICON - w) / 2);
  const oy = Math.floor((ICON - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 원본에서 이 칸에 해당하는 구역의 평균 (알파 가중)
      const sx0 = b.x + Math.floor(x / scale);
      const sy0 = b.y + Math.floor(y / scale);
      const sx1 = Math.max(sx0 + 1, b.x + Math.floor((x + 1) / scale));
      const sy1 = Math.max(sy0 + 1, b.y + Math.floor((y + 1) / scale));
      let r = 0;
      let g = 0;
      let bl = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * img.width + sx) * 4;
          const al = img.data[i + 3];
          r += img.data[i] * al;
          g += img.data[i + 1] * al;
          bl += img.data[i + 2] * al;
          a += al;
          n++;
        }
      }
      const d = ((oy + y) * ICON + ox + x) * 4;
      if (a > 0) {
        out.data[d] = Math.round(r / a);
        out.data[d + 1] = Math.round(g / a);
        out.data[d + 2] = Math.round(bl / a);
      }
      out.data[d + 3] = Math.round(a / n);
    }
  }
  return out;
}

mkdirSync(outDir, { recursive: true });
for (const name of BUILDINGS) {
  writePng(join(outDir, `${name}.png`), fitIcon(readPng(join(spritesDir, `${name}.png`))));
  process.stdout.write(`아이콘: ${name}\n`);
}
for (const [name, size, cols] of SHEETS) {
  const sheet = readPng(join(spritesDir, `${name}.png`));
  const frame = crop(sheet, 0, 2 * size, size, size); // 방향 2, 0번 장
  void cols;
  writePng(join(outDir, `${name}.png`), fitIcon(frame));
  process.stdout.write(`아이콘: ${name}\n`);
}
