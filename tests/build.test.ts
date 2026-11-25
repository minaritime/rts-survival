import { describe, expect, test } from 'vitest';
import { BUILDINGS, FIRST_COMMAND_CENTER } from '../src/data/buildings.ts';
import { TUTORIAL_RULES } from '../src/data/tutorial.ts';
import {
  canPlace,
  commandBuild,
  commandGather,
  commandMove,
  commandSmart,
  tooCloseToResource,
} from '../src/sim/commands.ts';
import { rectDistance } from '../src/sim/path.ts';
import { isWalkable } from '../src/sim/world.ts';
import { commander, newWorld, node, run, runUntil } from './helpers.ts';

const CC = BUILDINGS.commandCenter;
/** 1맵 추천 자리 (미네랄 x=7 과 두 칸 띄움) */
const SPOT = { x: 10, y: 20 };

describe('건물 자리', () => {
  test('빈 땅이면 놓을 수 있다', () => {
    expect(canPlace(newWorld(), 'commandCenter', SPOT)).toBe(true);
  });

  test('사령부는 미네랄과 두 칸 넘게 떨어져야 한다 (일꾼이 오갈 길)', () => {
    const world = newWorld(); // 미네랄은 x=7, y=18~25
    expect(canPlace(world, 'commandCenter', { x: 8, y: 20 })).toBe(false); // 딱 붙음
    expect(canPlace(world, 'commandCenter', { x: 9, y: 20 })).toBe(false); // 한 칸 띄움
    expect(canPlace(world, 'commandCenter', { x: 10, y: 20 })).toBe(true); // 두 칸 띄움 (추천 자리)
    expect(tooCloseToResource(world, 'commandCenter', 9, 21)).toBe(true);
    expect(tooCloseToResource(world, 'commandCenter', 10, 21)).toBe(false);
  });

  test('절벽·자원·지도 밖·다른 건물과 겹치면 안 된다', () => {
    const world = newWorld();
    expect(canPlace(world, 'commandCenter', { x: 3, y: 20 })).toBe(false); // 절벽
    expect(canPlace(world, 'commandCenter', { x: 6, y: 20 })).toBe(false); // 미네랄(7, y)
    expect(canPlace(world, 'commandCenter', { x: 62, y: 46 })).toBe(false); // 지도 밖
    world.stock.mineral = 1000;
    commandBuild(world, [world.commanderId], 'commandCenter', SPOT);
    expect(canPlace(world, 'commandCenter', { x: 11, y: 21 })).toBe(false);
  });
});

describe('사령부 짓기', () => {
  test('지휘관이 건물 둘레로 갈 길이 없으면 놓지 않고 미네랄도 그대로', () => {
    const world = newWorld();
    world.stock.mineral = 300;
    // 추천 자리(10~12, 20~22) 둘레(9~13, 19~23)를 통째로 막는다
    for (let y = 19; y <= 23; y++)
      for (let x = 9; x <= 13; x++) if (x === 9 || x === 13 || y === 19 || y === 23) world.occupied.add(y * 64 + x);
    expect(commandBuild(world, [world.commanderId], 'commandCenter', SPOT)).toBeNull();
    expect(world.stock.mineral).toBe(300);
  });

  test('미네랄이 모자라면 명령이 안 들어간다', () => {
    const world = newWorld();
    world.stock.mineral = CC.mineral - 1;
    expect(commandBuild(world, [world.commanderId], 'commandCenter', SPOT)).toBeNull();
    expect(world.buildings).toHaveLength(0);
  });

  test('놓는 순간 미네랄을 내고 그 칸은 막힌다', () => {
    const world = newWorld();
    world.stock.mineral = 300;
    const b = commandBuild(world, [world.commanderId], 'commandCenter', SPOT)!;
    expect(b).not.toBeNull();
    expect(world.stock.mineral).toBe(50);
    expect(isWalkable(world, 11, 21)).toBe(false);
    expect(b.progress).toBe(0);
  });

  test('첫 사령부는 놓으면 혼자 10초 만에 지어지고, 지휘관은 바로 다른 곳으로 갈 수 있다', () => {
    const world = newWorld();
    world.stock.mineral = 300;
    world.stock.food = 30;
    const b = commandBuild(world, [world.commanderId], 'commandCenter', SPOT)!;
    expect(b.selfBuild).toBe(true);
    // 놓자마자 지휘관을 멀리 보낸다
    commandMove(world, [world.commanderId], { x: 30, y: 30 });
    const seconds = runUntil(world, () => b.complete, 30);
    expect(seconds).toBeGreaterThanOrEqual(FIRST_COMMAND_CENTER.buildSeconds - 0.1);
    expect(seconds).toBeLessThan(FIRST_COMMAND_CENTER.buildSeconds + 0.5);
    expect(rectDistance(b, Math.round(commander(world).x), Math.round(commander(world).y))).toBeGreaterThan(3);
    expect(b.hp).toBe(CC.maxHp);
    expect(world.foodCap).toBe(50);
    expect(world.stats.buildingsCompleted).toBe(1);
  });

  test('둘째 사령부부터는 보통대로: 곁에서 60초 지어야 한다', () => {
    const world = newWorld();
    world.stock.mineral = 1000;
    const first = commandBuild(world, [world.commanderId], 'commandCenter', SPOT)!;
    runUntil(world, () => first.complete, 30);
    const second = commandBuild(world, [world.commanderId], 'commandCenter', { x: 20, y: 26 })!;
    expect(second).not.toBeNull();
    expect(second.selfBuild).toBe(false);
    const seconds = runUntil(world, () => second.complete, 120);
    expect(seconds).toBeGreaterThanOrEqual(CC.buildSeconds);
    expect(seconds).toBeLessThan(CC.buildSeconds + 8); // 걸어가는 시간 포함
    expect(commander(world).order.type).toBe('idle');
  });

  test('튜토리얼 규칙이면 3초 만에 짓고, 끄면 원래 60초', () => {
    const fast = newWorld();
    fast.tutorialRules = true;
    fast.stock.mineral = 300;
    const b = commandBuild(fast, [fast.commanderId], 'commandCenter', SPOT)!;
    const seconds = runUntil(fast, () => b.complete, 30);
    expect(seconds).toBeLessThan(TUTORIAL_RULES.buildSeconds + 3); // 걸어가는 시간 포함
    expect(TUTORIAL_RULES.buildSeconds).toBe(3);
  });

  test('튜토리얼 규칙이면 채집 대기도 짧다', () => {
    const fast = newWorld();
    fast.tutorialRules = true;
    commandGather(fast, [fast.commanderId], node(fast, 18, 31).id);
    const seconds = runUntil(fast, () => fast.stats.debrisLooted === 1, 30);
    const normal = newWorld();
    commandGather(normal, [normal.commanderId], node(normal, 18, 31).id);
    const normalSeconds = runUntil(normal, () => normal.stats.debrisLooted === 1, 30);
    expect(seconds).toBeLessThan(normalSeconds);
  });

  test('짓다가 다른 데 가면 멈추고, 건물을 오른쪽 클릭하면 이어서 짓는다', () => {
    const world = newWorld();
    world.stock.mineral = 300;
    const b = commandBuild(world, [world.commanderId], 'commandCenter', SPOT)!;
    run(world, 20);
    const halfway = b.progress;
    expect(halfway).toBeGreaterThan(0);
    commandMove(world, [world.commanderId], { x: 25, y: 24 });
    run(world, 10);
    expect(b.progress).toBe(halfway);
    commandSmart(world, [world.commanderId], { x: 11, y: 21 });
    runUntil(world, () => b.complete, 120);
    expect(b.complete).toBe(true);
  });

  test('지휘관이 건물 자리 안에 서 있어도 밖으로 나와서 짓는다', () => {
    const world = newWorld();
    world.stock.mineral = 300;
    const c = commander(world);
    const b = commandBuild(world, [world.commanderId], 'commandCenter', { x: c.x - 1, y: c.y - 1 })!;
    runUntil(world, () => b.complete, 120);
    const t = { x: Math.round(c.x), y: Math.round(c.y) };
    const inside = t.x >= b.x && t.x < b.x + b.width && t.y >= b.y && t.y < b.y + b.height;
    expect(inside).toBe(false);
  });

  test('완성된 건물을 오른쪽 클릭하면 그냥 그 옆으로 간다', () => {
    const world = newWorld();
    world.stock.mineral = 300;
    const b = commandBuild(world, [world.commanderId], 'commandCenter', SPOT)!;
    runUntil(world, () => b.complete, 120);
    commandSmart(world, [world.commanderId], { x: 11, y: 21 });
    expect(commander(world).order.type).toBe('move');
  });
});
