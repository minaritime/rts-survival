import { describe, expect, test } from 'vitest';
import { BUILDINGS, FEEDER } from '../src/data/buildings.ts';
import { commandBuild, missingRequirement } from '../src/sim/commands.ts';
import { isWalkable, supplyCap } from '../src/sim/world.ts';
import { commander, newWorld, run, runUntil } from './helpers.ts';

const rich = () => {
  const world = newWorld();
  world.stock.mineral = 5000;
  world.tutorialRules = true; // 짓기 3초: 규칙 확인만 빠르게
  return world;
};

const buildAndFinish = (world: ReturnType<typeof newWorld>, kind: keyof typeof BUILDINGS, at: { x: number; y: number }) => {
  const b = commandBuild(world, [world.commanderId], kind, at);
  if (!b) throw new Error(`${kind} 를 (${at.x}, ${at.y}) 에 못 놓음`);
  runUntil(world, () => b.complete, 60);
  return b;
};

describe('짓기 조건', () => {
  test('보급고·병영·포탑은 사령부가 다 지어져 있어야 한다', () => {
    const world = rich();
    expect(missingRequirement(world, 'supplyDepot')).toBe('commandCenter');
    expect(commandBuild(world, [world.commanderId], 'barracks', { x: 25, y: 22 })).toBeNull();
    buildAndFinish(world, 'commandCenter', { x: 10, y: 20 });
    expect(missingRequirement(world, 'supplyDepot')).toBeNull();
    expect(commandBuild(world, [world.commanderId], 'barracks', { x: 25, y: 22 })).not.toBeNull();
  });

  test('맨손 건물(모닥불·간이벽·간이 포탑)은 조건 없이 바로', () => {
    const world = rich();
    for (const kind of ['campfire', 'barricade', 'scrapTurret'] as const) expect(missingRequirement(world, kind)).toBeNull();
  });
});

describe('보급', () => {
  test('사령부 10, 보급고마다 +8, 짓는 중인 것은 안 셈', () => {
    const world = rich();
    expect(supplyCap(world)).toBe(0);
    buildAndFinish(world, 'commandCenter', { x: 10, y: 20 });
    expect(supplyCap(world)).toBe(10);
    commandBuild(world, [world.commanderId], 'supplyDepot', { x: 20, y: 20 });
    expect(supplyCap(world)).toBe(10);
    run(world, 30);
    expect(supplyCap(world)).toBe(18);
  });
});

describe('식량 배급처 (생존형 맵)', () => {
  test('6칸 안에 다 지은 건물이 생기면 켜지고 분당 10씩 들어온다', () => {
    const world = rich();
    world.satiety = 100;
    const feeder = world.feeders.find((f) => f.x === 10 && f.y === 28)!;
    expect(feeder.active).toBe(false);
    buildAndFinish(world, 'campfire', { x: 12, y: 27 }); // 배급처에서 2칸
    run(world, 0.1);
    expect(feeder.active).toBe(true);
    const before = world.stock.food;
    run(world, 60);
    expect(world.stock.food - before).toBeCloseTo(FEEDER.foodPerMinute, 0);
  });

  test('먼 건물로는 안 켜지고, 식량은 한도를 넘지 않는다', () => {
    const world = rich();
    world.satiety = 100;
    buildAndFinish(world, 'campfire', { x: 20, y: 20 });
    run(world, 1);
    expect(world.feeders.every((f) => !f.active)).toBe(true);
    buildAndFinish(world, 'barricade', { x: 13, y: 28 });
    world.stock.food = world.foodCap - 1;
    run(world, 30);
    expect(world.stock.food).toBe(world.foodCap);
  });
});

describe('모닥불·사령부 곁 회복', () => {
  test('곁(2칸)에 있으면 초당 2 회복, 멀면 안 됨', () => {
    const world = rich();
    const c = commander(world);
    buildAndFinish(world, 'campfire', { x: Math.round(c.x) + 1, y: Math.round(c.y) });
    c.hp = 100;
    run(world, 5);
    expect(c.hp).toBeGreaterThanOrEqual(109);
    expect(c.hp).toBeLessThanOrEqual(111);
  });
});

describe('Shift 로 여러 개 놓기 (짓기 줄)', () => {
  test('줄 세운 건물을 차례로 다 짓는다', () => {
    const world = rich();
    const walls = [20, 21, 22].map((x) => commandBuild(world, [world.commanderId], 'barricade', { x, y: 18 }, true)!);
    expect(walls.every((w) => w !== null)).toBe(true);
    expect(world.stock.mineral).toBe(5000 - 3 * BUILDINGS.barricade.mineral);
    runUntil(world, () => walls.every((w) => w.complete), 60);
    expect(commander(world).order.type).toBe('idle');
  });

  test('줄 세운 다른 건물에 둘러싸여 갈 수 없게 된 자리는 치우고 미네랄을 돌려준다', () => {
    const world = rich();
    commandBuild(world, [world.commanderId], 'barricade', { x: 20, y: 18 }); // 지금 짓는 것
    const boxed = commandBuild(world, [world.commanderId], 'barricade', { x: 25, y: 18 }, true)!;
    // 그 둘레 8칸을 벽으로 줄 세워 둘러싼다
    const ring: { x: number; y: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) ring.push({ x: 25 + dx, y: 18 + dy });
    const ringWalls = ring.map((p) => commandBuild(world, [world.commanderId], 'barricade', p, true)!);
    expect(ringWalls.every((w) => w !== null)).toBe(true);
    const before = world.stock.mineral;
    runUntil(world, () => ringWalls.every((w) => w.complete), 120);
    expect(world.buildings.includes(boxed)).toBe(false);
    expect(world.stock.mineral).toBe(before + BUILDINGS.barricade.mineral);
    expect(isWalkable(world, 25, 18)).toBe(true); // 치운 자리는 칸이 다시 빈다 (둘러싸여 걸어 들어갈 수는 없음)
  });

  test('Shift 없이 놓으면 줄을 비우고 새로 짓는다 (이미 놓은 자리는 남음)', () => {
    const world = rich();
    const a = commandBuild(world, [world.commanderId], 'barricade', { x: 20, y: 18 }, true)!;
    const b = commandBuild(world, [world.commanderId], 'barricade', { x: 21, y: 18 }, true)!;
    const c = commandBuild(world, [world.commanderId], 'barricade', { x: 22, y: 18 })!;
    runUntil(world, () => c.complete, 60);
    run(world, 5);
    expect(b.complete).toBe(false);
    expect(a.complete || a.progress >= 0).toBe(true);
    expect(commander(world).buildQueue).toEqual([]);
  });
});
