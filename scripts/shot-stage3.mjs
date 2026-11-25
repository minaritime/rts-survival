/**
 * 3스테이지(협곡 섬멸형) 화면 점검. 개발 서버를 띄운 뒤:
 *   node scripts/shot-stage3.mjs [주소] [저장할 폴더]
 * 0 시작 화면(판 고르기 줄) / 1 내 시작 지점 / 2 적 기지 / 3 7분 40초 뒤 적 공격대 / 4 적 소총병 클릭(정보 칸)
 * 시간은 화면 안에서 stepWorld 를 직접 돌려 앞당긴다 (헤드리스는 게임 시간이 느림).
 * 브라우저 오류가 하나라도 있으면 실패로 끝난다.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5180/?nolock&stage=3';
const outDir = process.argv[3] ?? 'screenshots/stage3';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`예외: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`콘솔: ${m.text()}`);
});
const shot = (name) => page.screenshot({ path: join(outDir, name) });
const scene = 'window.__rtsGame.scene.getScene("game")';

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await shot('0-title.png');
const button = await page.evaluate(() => {
  const b = window.__rtsGame.scene.getScene('game').children.getByName('pause-button').getBounds();
  return { x: b.centerX, y: b.centerY };
});
await page.mouse.click(button.x, button.y);
await page.mouse.move(640, 400);
await page.waitForTimeout(500);
await shot('1-start.png');

const mode = await page.evaluate(`${scene}.mode`);
if (mode !== 'stage3') errors.push(`주소로 3스테이지가 안 열림 (${mode})`);

await page.evaluate(`${scene}.cameras.main.centerOn(52 * 48, 10 * 48)`);
await page.waitForTimeout(300);
await shot('2-enemy-base.png');

// 내 사령부를 하나 세우고 7분 40초까지 돌린다 → 적 공격대가 오는 중
await page.evaluate(async () => {
  const s = window.__rtsGame.scene.getScene('game');
  const { commandBuild } = await import('/src/sim/commands.ts');
  const { stepWorld } = await import('/src/sim/world.ts');
  s.world.stock.mineral = 250;
  commandBuild(s.world, [s.world.commanderId], 'commandCenter', { x: 8, y: 36 });
  s.world.commandCenterPlaced = true;
  s.world.units[0].hp = 1e9;
  s.world.stock.food = 30;
  while (s.world.tick < 460 * 20 && s.world.outcome === 'playing') stepWorld(s.world);
});
const army = await page.evaluate(() => {
  const w = window.__rtsGame.scene.getScene('game').world;
  const foes = w.units.filter((u) => u.owner === 'enemy' && u.kind === 'rifleman');
  const out = foes.filter((u) => w.enemy.attackers.includes(u.id));
  const p = out[0] ?? foes[0];
  return { attacks: w.enemy.attacksLaunched, x: p?.x ?? 30, y: p?.y ?? 24, id: p?.id };
});
if (army.attacks < 1) errors.push('7분 40초까지 적 공격이 없음');
await page.evaluate(({ x, y }) => window.__rtsGame.scene.getScene('game').cameras.main.centerOn(x * 48, y * 48), army);
await page.waitForTimeout(300);
await shot('3-enemy-attack.png');

// 적 소총병 클릭 → 정보 칸
// 게임이 계속 흐르므로 누르기 바로 전에 지금 위치를 다시 읽는다
const p = await page.evaluate((id) => {
  const s = window.__rtsGame.scene.getScene('game');
  const u = s.world.units.find((x) => x.id === id);
  const cam = s.cameras.main;
  return { x: u.x * 48 + 24 - cam.scrollX, y: u.y * 48 + 24 - cam.scrollY };
}, army.id);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(300);
await shot('4-enemy-inspect.png');
const picked = await page.evaluate((id) => window.__rtsGame.scene.getScene('game').unitInput.selected.has(id), army.id);
if (!picked) errors.push('적 소총병을 눌러도 골라지지 않음');

await browser.close();
if (errors.length > 0) {
  process.stdout.write(`실패 ${errors.length}건\n${errors.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`통과: 5장 → ${outDir}\n`);
