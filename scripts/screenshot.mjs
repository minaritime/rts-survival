/**
 * 개발 서버를 띄운 상태에서 실제로 눌러 보며 화면을 찍는다.
 *   npm run dev  (다른 창)
 *   node scripts/screenshot.mjs [주소] [저장할 폴더]
 *
 * 0 시작 화면 / 1 시작 뒤(튜토리얼 1번) / 2 방향키 / 3 미니맵 클릭 / 4 지휘관 선택 후 잔해 우클릭 / 5 미네랄 우클릭 후 채집 중
 * 주소에 ?nolock 을 붙여 연다 (헤드리스 브라우저는 마우스 가두기를 못 씀)
 * 브라우저 오류(콘솔 error, 예외)가 하나라도 있으면 실패로 끝난다.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const TILE = 48;
const url = process.argv[2] ?? 'http://localhost:5180/?nolock';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`예외: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`콘솔: ${m.text()}`);
});

const shot = async (name) => {
  const path = join(outDir, name);
  await page.screenshot({ path });
  // 장마다 줄을 찍지 않는다 (토큰 절약). 끝에 한 줄로 알림
  shotCount += 1;
};

/** 칸 한가운데의 화면 좌표 (지금 카메라 기준) */
const tileToScreen = (tx, ty) =>
  page.evaluate(
    ({ tx, ty, tile }) => {
      const cam = window.__rtsGame.scene.getScene('game').cameras.main;
      return { x: tx * tile + tile / 2 - cam.scrollX, y: ty * tile + tile / 2 - cam.scrollY };
    },
    { tx, ty, tile: TILE },
  );

const click = async (tx, ty, button = 'left') => {
  const p = await tileToScreen(tx, ty);
  await page.mouse.click(p.x, p.y, { button });
};

const recenter = () =>
  page.evaluate(() => {
    const cam = window.__rtsGame.scene.getScene('game').cameras.main;
    cam.centerOn(17 * 48, 21.5 * 48); // 지휘관·잔해(20,16)·미네랄(7,21)이 모두 위 막대·아래 판에 안 가리게
  });

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await shot('0-title.png');

// 시작 버튼
const button = await page.evaluate(() => {
  const b = window.__rtsGame.scene.getScene('game').children.getByName('pause-button').getBounds();
  return { x: b.centerX, y: b.centerY };
});
await page.mouse.click(button.x, button.y);
await page.mouse.move(640, 400);
await page.waitForTimeout(500);
await shot('1-start.png');

// 마우스를 화면 가운데에 두어 가장자리 이동이 끼어들지 않게 한 뒤 방향키
await page.mouse.move(640, 400);
await page.keyboard.down('ArrowRight');
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(1000);
await page.keyboard.up('ArrowRight');
await page.keyboard.up('ArrowDown');
await shot('2-arrows.png');

// 미니맵은 왼쪽 아래 12px 여백, 192 x 144. 그 오른쪽 위 부근(지도 북동쪽) 클릭
await page.mouse.click(12 + 180, 800 - 12 - 144 + 20);
await page.mouse.move(640, 400);
await page.waitForTimeout(300);
await shot('3-minimap.png');

/** 게임 상태가 조건을 만족할 때까지 기다린다 (헤드리스 브라우저는 게임 시간이 실제보다 느리게 흐름) */
const waitForWorld = (predicateSource, timeout = 30000) =>
  page.waitForFunction(
    (src) => {
      const world = window.__rtsGame.scene.getScene('game').world;
      return new Function('world', `return (${src})`)(world);
    },
    predicateSource,
    { timeout },
  );

// 지휘관(시작 칸 14,24) 선택 → 잔해(20,16) 우클릭 → 잔해가 사라지고 미네랄 100
await recenter();
await page.waitForTimeout(100);
await click(14, 24);
await click(20, 16, 'right');
await page.mouse.move(640, 400);
await waitForWorld("!world.nodes.some((n) => n.x === 20 && n.y === 16) && world.stats.debrisLooted === 1");
await shot('4-debris-done.png');

// 미네랄(7,21) 우클릭 → 첫 채집(+3)이 들어오면 찍음
await click(7, 21, 'right');
await page.mouse.move(640, 400);
await waitForWorld('world.stats.mineralMined >= 3');
await shot('5-mining.png');

// 빈 땅 클릭 → 선택 해제, 지휘관 둘레를 끌어 상자 선택 → 다시 선택됨
const selectedCount = () => page.evaluate(() => window.__rtsGame.scene.getScene('game').unitInput.selected.size);
const c = await page.evaluate(() => {
  const s = window.__rtsGame.scene.getScene('game');
  const u = s.world.units[0];
  const cam = s.cameras.main;
  return { x: u.x * 48 + 24 - cam.scrollX, y: u.y * 48 + 24 - cam.scrollY };
});
await page.mouse.click(c.x + 150, c.y + 60);
if ((await selectedCount()) !== 0) errors.push('빈 땅을 클릭해도 선택이 안 풀림');
await page.mouse.move(c.x - 70, c.y - 80);
await page.mouse.down();
await page.mouse.move(c.x + 70, c.y + 40, { steps: 8 });
await page.waitForTimeout(150);
await shot('6-drag.png');
await page.mouse.up();
if ((await selectedCount()) !== 1) errors.push('끌어서 고르기로 지휘관이 선택되지 않음');

// 자원·배급처 클릭: 열매 덤불(22,20)은 선택되고, 배급처(10,28)는 살펴보기로 아래 판에 설명
const gameState = () =>
  page.evaluate(() => {
    const s = window.__rtsGame.scene.getScene('game');
    return { selected: [...s.unitInput.selected], inspected: s.unitInput.inspected };
  });
await click(22, 20);
const afterBush = await gameState();
const bushId = await page.evaluate(() => window.__rtsGame.scene.getScene('game').world.nodes.find((n) => n.x === 22 && n.y === 20).id);
if (afterBush.selected[0] !== bushId) errors.push('열매 덤불을 클릭해도 선택되지 않음');
await page.mouse.move(640, 300);
await shot('6b-bush-info.png');
// 배급처가 아래 판에 가리지 않게 화면을 옮긴 뒤 클릭
await page.evaluate(() => window.__rtsGame.scene.getScene('game').cameras.main.centerOn(10.5 * 48, 27 * 48));
await page.waitForTimeout(100);
await click(10, 28);
const afterFeeder = await gameState();
if (!afterFeeder.inspected || afterFeeder.inspected.x !== 10) errors.push('배급처를 클릭해도 살펴보기가 안 됨');
await page.mouse.move(640, 300);
await shot('6c-feeder-info.png');
await page.keyboard.press('F1'); // 다시 지휘관

// 사령부: C 키 → 추천 자리(왼쪽 위 10,20 → 한가운데 11,21)에 커서 → 미리보기 → 클릭 → 짓기 → 완공
await page.keyboard.press('KeyC');
// 미네랄(x=7) 바로 옆(한가운데 9,21 → 왼쪽 위 8,20)은 빨강이고 클릭해도 안 놓여야 함
const tooClose = await tileToScreen(9, 21);
await page.mouse.move(tooClose.x, tooClose.y);
await page.waitForTimeout(200);
await shot('7a-too-close.png');
await page.mouse.click(tooClose.x, tooClose.y);
await page.waitForTimeout(200);
const placedTooClose = await page.evaluate(() => window.__rtsGame.scene.getScene('game').world.buildings.length);
if (placedTooClose !== 0) errors.push('미네랄 바로 옆에 사령부가 놓임');
const spot = await tileToScreen(11, 21);
await page.mouse.move(spot.x, spot.y);
await page.waitForTimeout(200);
await shot('7-placing.png');
await page.mouse.click(spot.x, spot.y);
await waitForWorld('world.buildings.length === 1 && world.buildings[0].progress > 0.2', 60000);
await page.mouse.move(640, 300);
await shot('8-building.png');
await waitForWorld('world.buildings[0].complete', 120000);
await shot('9-built.png');

// 부대 지정: 지휘관을 고른 채 Ctrl+1 → 빈 땅 클릭으로 해제 → 1 로 다시 불러오기
await page.keyboard.press('F1');
await page.keyboard.press('Control+Digit1');
await page.mouse.click(c.x + 150, c.y + 60);
await page.keyboard.press('Digit1');
if ((await selectedCount()) !== 1) errors.push('Ctrl+1 로 지정한 부대를 1 로 불러오지 못함');

// 3단계 건물 (튜토리얼 규칙이라 3초씩): 화면을 본진 남쪽으로 옮겨 놓고 짓는다
const world = (expr) => page.evaluate((e) => new Function('w', `return (${e})`)(window.__rtsGame.scene.getScene('game').world), expr);
await page.evaluate(() => window.__rtsGame.scene.getScene('game').cameras.main.centerOn(16 * 48, 27 * 48)); // 30번째 줄 벽 자리가 아래 판에 가리지 않게
await page.waitForTimeout(100);
const placeAt = async (key, tx, ty, shift = false) => {
  await page.keyboard.press(key);
  const p = await tileToScreen(tx, ty);
  await page.mouse.move(p.x, p.y);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up('Shift');
};
// 모닥불(Q) 을 배급처(10,28) 옆 (12,27) 에 → 다 지으면 배급처가 켜져야 함
await placeAt('KeyQ', 12, 27);
await waitForWorld('world.feeders.some((f) => f.x === 10 && f.y === 28 && f.active)', 60000);
// 간이벽(W) 3개를 Shift 로 연달아 (16~18, 30)
await page.keyboard.press('KeyW');
for (const x of [16, 17, 18]) {
  const p = await tileToScreen(x, 30);
  await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Shift');
}
await page.mouse.click(640, 300, { button: 'right' }); // 고르기 취소
await waitForWorld("world.buildings.filter((b) => b.kind === 'barricade' && b.complete).length === 3", 60000);
// 보급고(V) 2x2, 병영(B) 3x3, 포탑(R) 2x2
await page.evaluate(() => { window.__rtsGame.scene.getScene('game').world.stock.mineral += 1000; }); // 점검용: 건물 값
await placeAt('KeyV', 21, 27);
await waitForWorld("world.buildings.some((b) => b.kind === 'supplyDepot' && b.complete)", 60000);
await placeAt('KeyB', 25, 28);
await waitForWorld("world.buildings.some((b) => b.kind === 'barracks' && b.complete)", 60000);
await placeAt('KeyR', 20, 23);
await waitForWorld("world.buildings.some((b) => b.kind === 'turret' && b.complete)", 60000);
if ((await world("w.buildings.length")) !== 8) errors.push('건물 수가 8이 아님 (사령부1 모닥불1 벽3 보급고1 병영1 포탑1)');
await page.mouse.move(640, 300);
await shot('10-buildings.png');
// 버튼 설명: 보급고 버튼(V, 아랫줄 4번째)에 커서
const vButton = await page.evaluate(() => {
  const s = window.__rtsGame.scene.getScene('game');
  const card = s.hud.layout.commandCard;
  return { x: card.x + 3 * 58 + 26, y: card.y + 2 * 58 + 26 };
});
await page.mouse.move(vButton.x, vButton.y);
await page.waitForTimeout(200);
await shot('11-tooltip.png');

// 4단계: 사령부(11,21) 고르기 → 일꾼 버튼(1줄 1칸)에 커서(말풍선) → S 로 일꾼 → 병영 고르기 → A 로 소총병
const cardCell = (row, col) =>
  page.evaluate(
    ({ row, col }) => {
      const card = window.__rtsGame.scene.getScene('game').hud.layout.commandCard;
      return { x: card.x + col * 58 + 26, y: card.y + row * 58 + 26 };
    },
    { row, col },
  );
await click(11, 21);
const workerBtn = await cardCell(1, 1);
await page.mouse.move(workerBtn.x, workerBtn.y);
await page.waitForTimeout(200);
await shot('12-train-tooltip.png');
// 일꾼 3개 예약 → 선택 정보 칸에 대기열 아이콘 줄
await page.keyboard.press('KeyS');
await page.keyboard.press('KeyS');
await page.keyboard.press('KeyS');
await page.mouse.move(640, 300);
await page.waitForTimeout(300);
await shot('12b-queue.png');
if ((await world("w.buildings.find((b) => b.kind === 'commandCenter').trainQueue.length")) < 2) errors.push('대기열에 일꾼이 쌓이지 않음');
await waitForWorld("world.units.some((u) => u.kind === 'worker')", 60000);
await click(25, 28);
await page.keyboard.press('KeyA');
await waitForWorld("world.units.some((u) => u.kind === 'rifleman')", 60000);
await page.mouse.move(640, 300);
await page.waitForTimeout(200);
await shot('13-units.png');

// 11/25: 집결 지점 깃발 + 명령 자리 표시 / 여럿 고르기 그림 칸 / 내 건물 강제 공격
await page.evaluate(() => window.__rtsGame.scene.getScene('game').cameras.main.centerOn(16 * 48, 25 * 48));
await page.waitForTimeout(100);
await click(11, 21); // 사령부
await click(16, 25, 'right');
await page.waitForTimeout(120);
await shot('13b-rally-ping.png');
if ((await world('w.buildings.find((b) => b.kind === "commandCenter").rally?.kind')) !== 'point') errors.push('사령부 집결 지점이 안 정해짐');
// 내 유닛 전부를 상자로
const box = await page.evaluate(() => {
  const s = window.__rtsGame.scene.getScene('game');
  const cam = s.cameras.main;
  const xs = s.world.units.map((u) => u.x * 48 + 24 - cam.scrollX);
  const ys = s.world.units.map((u) => u.y * 48 + 24 - cam.scrollY);
  return { x0: Math.min(...xs) - 30, y0: Math.min(...ys) - 50, x1: Math.max(...xs) + 30, y1: Math.max(...ys) + 20 };
});
await page.mouse.move(box.x0, box.y0);
await page.mouse.down();
await page.mouse.move(box.x1, box.y1, { steps: 8 });
await page.mouse.up();
await page.mouse.move(640, 300);
await page.waitForTimeout(150);
await shot('13c-multi.png');
// 소총병만 남기고(그림 칸 누르기 대신 고르기) A → 간이벽(17,30) 강제 공격
const rifle = await page.evaluate(() => window.__rtsGame.scene.getScene('game').world.units.find((u) => u.kind === 'rifleman').id);
await page.evaluate((id) => window.__rtsGame.scene.getScene('game').unitInput.selectOnly(id), rifle);
await page.evaluate(() => window.__rtsGame.scene.getScene('game').cameras.main.centerOn(16 * 48, 27 * 48)); // 벽(30번째 줄)이 아래 판에 안 가리게
await page.waitForTimeout(100);
await page.keyboard.press('KeyA');
const wallAt = await tileToScreen(17, 30);
await page.mouse.click(wallAt.x, wallAt.y);
await waitForWorld("world.buildings.some((b) => b.kind === 'barricade' && b.hp < b.maxHp)", 60000);
await page.mouse.move(640, 300);
await shot('13d-force-attack.png');

// 튜토리얼 완료 창 → [1스테이지 시작] → 같은 지도를 정상 규칙으로 새로 시작
await page.evaluate(() => window.__rtsGame.scene.getScene('game').stageDialog.show());
await page.mouse.move(547, 387);
await page.waitForTimeout(200);
await shot('14-complete-dialog.png');
// [계속 둘러보기] → 창이 닫히고 다시 안 뜸, 위 줄에 작은 [1스테이지 시작] 이 남음
await page.mouse.click(733, 387);
await page.waitForTimeout(400);
if (await page.evaluate(() => window.__rtsGame.scene.getScene('game').stageDialog.visible)) errors.push('계속 둘러보기를 눌러도 창이 다시 뜸');
await page.mouse.move(1280 - 96 - 70, 18);
await page.waitForTimeout(200);
await shot('14b-mini-button.png');
await page.mouse.click(1280 - 96 - 70, 18);
await page.waitForFunction(
  () => {
    const s = window.__rtsGame.scene.getScene('game');
    return s.mode === 'stage1' && s.world && s.world.buildings.length === 0;
  },
  null,
  { timeout: 15000 },
);
await page.waitForTimeout(800);
const stage = await page.evaluate(() => {
  const s = window.__rtsGame.scene.getScene('game');
  return { rules: s.world.tutorialRules, mineral: s.world.stock.mineral };
});
if (stage.rules) errors.push('1스테이지인데 튜토리얼 규칙이 켜져 있음');
if (stage.mineral !== 200) errors.push(`1스테이지 시작 미네랄이 200 이 아님 (${stage.mineral})`);
await shot('15-stage1-title.png');
const button2 = await page.evaluate(() => {
  const b = window.__rtsGame.scene.getScene('game').children.getByName('pause-button').getBounds();
  return { x: b.centerX, y: b.centerY };
});
await page.mouse.click(button2.x, button2.y);
await page.mouse.move(640, 400);
await page.waitForTimeout(500);
await shot('16-stage1.png');

// 5단계: 공격을 앞당겨 경고 띠 → 괴물이 와서 지휘관과 싸움
const scene = () => window.__rtsGame.scene.getScene('game');
if (!(await page.evaluate(() => window.__rtsGame.scene.getScene('game').world.waves.enabled))) errors.push('1스테이지인데 괴물 공격이 꺼져 있음');
await page.evaluate(() => {
  const w = window.__rtsGame.scene.getScene('game').world;
  w.waves.nextAt = w.tick / 20 + 8;
});
await page.waitForTimeout(400);
await shot('17-wave-warning.png');
await waitForWorld("world.creatures.some((c) => c.kind === 'swarm')", 60000);
// 괴물이 지휘관 곁에 올 때까지 기다렸다가 싸우는 장면
await waitForWorld(
  "world.creatures.some((c) => c.kind === 'swarm' && Math.hypot(c.x - world.units[0].x, c.y - world.units[0].y) < 5)",
  120000,
);
await page.evaluate(() => {
  const s = window.__rtsGame.scene.getScene('game');
  const c = s.world.units[0];
  s.cameras.main.centerOn(c.x * 48 + 24, c.y * 48 + 24);
});
await page.waitForTimeout(300);
await shot('18-fight.png');
await waitForWorld("world.stats.monstersKilled >= 1 || world.outcome === 'defeat'", 120000);
if ((await page.evaluate(() => window.__rtsGame.scene.getScene('game').world.stats.monstersKilled)) < 1) errors.push('지휘관이 괴물을 하나도 못 잡음');

// 공격 버튼(A) → 조준 표시
await page.keyboard.press('F1');
await page.keyboard.press('KeyA');
await page.mouse.move(700, 300);
await page.waitForTimeout(200);
if (!(await page.evaluate(() => window.__rtsGame.scene.getScene('game').unitInput.targeting))) errors.push('A 를 눌러도 공격 대상 고르기가 안 됨');
await shot('19-attack-target.png');
await page.mouse.click(700, 300, { button: 'right' }); // 취소
void scene;

// 지도 경고: 다음 공격을 8초 뒤로 당기고 화면을 입구 쪽으로 (화면 밖이면 가장자리 화살표도 본다)
await page.evaluate(() => {
  const s = window.__rtsGame.scene.getScene('game');
  s.world.waves.nextAt = s.world.tick / 20 + 8;
});
await page.waitForTimeout(300);
await shot('20a-alert-edge.png');
await page.evaluate(() => {
  const s = window.__rtsGame.scene.getScene('game');
  const gates = s.world.map.features.entrances[s.world.waves.direction];
  s.cameras.main.centerOn(gates[0].x * 48, gates[0].y * 48 + 200);
});
await page.waitForTimeout(300);
await shot('20b-alert-gate.png');

// 6단계: 15분 끝 → 번쩍 + 퇴각 → 승리 창
await page.evaluate(() => {
  const s = window.__rtsGame.scene.getScene('game');
  s.world.units[0].hp = 1e9;
  s.world.tick = (s.world.waves.surviveSeconds - 1) * 20;
  s.world.waves.nextAt = s.world.waves.surviveSeconds + 100;
});
await waitForWorld("world.outcome === 'victory'", 120000);
await page.waitForTimeout(300);
await shot('21-victory.png');

await browser.close();

if (errors.length > 0) {
  process.stderr.write(errors.join('\n') + '\n');
  process.exit(1);
}
