/** PNG 읽고 쓰기 + 한 장에 붙이기 (pngjs) */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

export function readPng(path) {
  return PNG.sync.read(readFileSync(path));
}

export function writePng(path, png) {
  writeFileSync(path, PNG.sync.write(png));
}

export function blank(width, height, rgba = [0, 0, 0, 0]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) png.data.set(rgba, i * 4);
  return png;
}

/** src 를 dst 의 (x, y) 에 알파 섞어 붙인다 */
export function blit(dst, src, x, y) {
  for (let sy = 0; sy < src.height; sy++) {
    const dy = y + sy;
    if (dy < 0 || dy >= dst.height) continue;
    for (let sx = 0; sx < src.width; sx++) {
      const dx = x + sx;
      if (dx < 0 || dx >= dst.width) continue;
      const s = (sy * src.width + sx) * 4;
      const d = (dy * dst.width + dx) * 4;
      const a = src.data[s + 3] / 255;
      const da = dst.data[d + 3] / 255;
      const outA = a + da * (1 - a);
      for (let c = 0; c < 3; c++) {
        const v = outA === 0 ? 0 : (src.data[s + c] * a + dst.data[d + c] * da * (1 - a)) / outA;
        dst.data[d + c] = Math.round(v);
      }
      dst.data[d + 3] = Math.round(outA * 255);
    }
  }
}
