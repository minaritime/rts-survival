/**
 * Blender 가 찍은 낱장(art/out/frames)을 게임용으로 정리한다 (public/assets/sprites).
 *   node art/tools/pack-sprites.mjs [낱장 폴더] [출력 폴더]
 *
 * - 방향 있는 것(폴더 안 d<방향>_f<장>.png): 한 장의 시트로. 줄 = 방향 0~7, 칸 = 장 번호
 * - 나머지 낱장(<이름>.png): 그대로 복사
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { blank, blit, readPng, writePng } from './png.mjs';

const framesDir = process.argv[2] ?? 'art/out/frames';
const outDir = process.argv[3] ?? 'public/assets/sprites';
if (!existsSync(framesDir)) {
  process.stderr.write(`낱장 폴더가 없음: ${framesDir}\n`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const FRAME_NAME = /^d(\d+)_f(\d+)\.png$/;

function packDirectional(name) {
  const dir = join(framesDir, name);
  const frames = readdirSync(dir)
    .map((file) => ({ file, m: FRAME_NAME.exec(file) }))
    .filter((f) => f.m)
    .map((f) => ({ path: join(dir, f.file), d: Number(f.m[1]), f: Number(f.m[2]) }));
  if (frames.length === 0) throw new Error(`${name}: 낱장이 없음`);
  const rows = Math.max(...frames.map((x) => x.d)) + 1;
  const cols = Math.max(...frames.map((x) => x.f)) + 1;
  if (frames.length !== rows * cols) throw new Error(`${name}: ${rows}x${cols} 중 ${frames.length}장뿐`);
  const first = readPng(frames[0].path);
  const sheet = blank(cols * first.width, rows * first.height);
  for (const fr of frames) blit(sheet, readPng(fr.path), fr.f * first.width, fr.d * first.height);
  writePng(join(outDir, `${name}.png`), sheet);
  process.stdout.write(`시트: ${name}.png  ${rows}방향 x ${cols}장, 한 장 ${first.width}x${first.height}\n`);
}

for (const entry of readdirSync(framesDir)) {
  const path = join(framesDir, entry);
  if (statSync(path).isDirectory()) packDirectional(entry);
  else if (entry.endsWith('.png')) {
    copyFileSync(path, join(outDir, entry));
    process.stdout.write(`복사: ${entry}\n`);
  }
}
