/**
 * 낱장 여러 개를 어두운 바탕 한 장에 모은다 (사람이 품질을 볼 때)
 *   node art/tools/contact-sheet.mjs <출력.png> <열 수> <그림...>
 */
import { blank, blit, readPng, writePng } from './png.mjs';

const [out, colsArg, ...files] = process.argv.slice(2);
const cols = Number(colsArg);
const imgs = files.map(readPng);
const cw = Math.max(...imgs.map((i) => i.width));
const ch = Math.max(...imgs.map((i) => i.height));
const rows = Math.ceil(imgs.length / cols);
const sheet = blank(cols * cw, rows * ch, [38, 44, 40, 255]);
imgs.forEach((img, i) => blit(sheet, img, (i % cols) * cw, Math.floor(i / cols) * ch));
writePng(out, sheet);
process.stdout.write(`저장: ${out} (${imgs.length}장)\n`);
