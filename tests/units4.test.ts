import { describe, expect, test } from 'vitest';
import { UNITS, WORKER } from '../src/data/units.ts';
import {
  commandBuild,
  commandCancelTrain,
  commandGather,
  commandMove,
  commandSmart,
  commandTrain,
} from '../src/sim/commands.ts';
import { createTrainedUnit, type Building } from '../src/sim/entities.ts';
import { supplyCap, supplyUsed, type World } from '../src/sim/world.ts';
import { newWorld, node, run, runUntil } from './helpers.ts';

/** 사령부를 다 지어 둔 세계 (정상 규칙) */
function withCommandCenter(): { world: World; cc: Building } {
  const world = newWorld();
  world.stock.mineral = 5000;
  world.tutorialRules = true;
  const cc = commandBuild(world, [world.commanderId], 'commandCenter', { x: 10, y: 20 })!;
  runUntil(world, () => cc.complete, 60);
  world.tutorialRules = false;
  return { world, cc };
}

const workers = (world: World) => world.units.filter((u) => u.kind === 'worker');

describe('생산', () => {
  test('사령부에서 일꾼: 미네랄 50, 12초 뒤 사령부 옆에 나오고 보급 1', () => {
    const { world, cc } = withCommandCenter();
    const before = world.stock.mineral;
    expect(commandTrain(world, cc.id, 'worker')).toBe(true);
    expect(world.stock.mineral).toBe(before - UNITS.worker.mineral);
    run(world, UNITS.worker.trainSeconds - 0.5);
    expect(workers(world)).toHaveLength(0);
    run(world, 1);
    expect(workers(world)).toHaveLength(1);
    const w = workers(world)[0]!;
    const d = Math.max(cc.x - w.x, 0, w.x - (cc.x + 2), cc.y - w.y, w.y - (cc.y + 2));
    expect(d).toBeLessThanOrEqual(1.01);
    expect(supplyUsed(world)).toBe(1);
  });

  test('줄은 5개까지, 하나씩 차례로', () => {
    const { world, cc } = withCommandCenter();
    for (let i = 0; i < 5; i++) expect(commandTrain(world, cc.id, 'worker')).toBe(true);
    expect(commandTrain(world, cc.id, 'worker')).toBe(false);
    run(world, UNITS.worker.trainSeconds * 2 + 0.5);
    expect(workers(world)).toHaveLength(2);
  });

  test('마지막 예약을 취소하면 미네랄을 돌려주고, 만들던 것이면 진행도 버린다', () => {
    const { world, cc } = withCommandCenter();
    const start = world.stock.mineral;
    commandTrain(world, cc.id, 'worker');
    commandTrain(world, cc.id, 'worker');
    expect(commandCancelTrain(world, cc.id)).toBe(true);
    expect(cc.trainQueue).toHaveLength(1);
    run(world, 3);
    expect(commandCancelTrain(world, cc.id)).toBe(true);
    expect(cc.trainQueue).toHaveLength(0);
    expect(cc.trainProgress).toBe(0);
    expect(cc.trainStarted).toBe(false);
    expect(world.stock.mineral).toBe(start);
    expect(commandCancelTrain(world, cc.id)).toBe(false);
  });

  test('건물이 못 뽑는 유닛, 짓는 중인 건물, 미네랄 부족은 거절', () => {
    const { world, cc } = withCommandCenter();
    expect(commandTrain(world, cc.id, 'rifleman')).toBe(false);
    world.stock.mineral = 10;
    expect(commandTrain(world, cc.id, 'worker')).toBe(false);
    world.stock.mineral = 1000;
    const barracks = commandBuild(world, [world.commanderId], 'barracks', { x: 16, y: 26 })!;
    expect(commandTrain(world, barracks.id, 'rifleman')).toBe(false); // 아직 짓는 중
    world.tutorialRules = true;
    runUntil(world, () => barracks.complete, 60);
    expect(commandTrain(world, barracks.id, 'rifleman')).toBe(true);
  });

  test('보급이 꽉 차면 멈췄다가 보급고가 생기면 이어서', () => {
    const { world, cc } = withCommandCenter();
    world.tutorialRules = true; // 빨리
    for (let i = 0; i < 5; i++) commandTrain(world, cc.id, 'worker');
    runUntil(world, () => workers(world).length === 5, 60);
    for (let i = 0; i < 5; i++) commandTrain(world, cc.id, 'worker');
    runUntil(world, () => workers(world).length === 10, 60);
    expect(supplyUsed(world)).toBe(supplyCap(world)); // 10 / 10
    commandTrain(world, cc.id, 'worker');
    run(world, 10);
    expect(workers(world)).toHaveLength(10); // 보급 부족으로 멈춤
    const depot = commandBuild(world, [world.commanderId], 'supplyDepot', { x: 16, y: 26 })!;
    runUntil(world, () => depot.complete, 60);
    runUntil(world, () => workers(world).length === 11, 30);
  });
});

describe('일꾼 채집 (8씩 캐서 사령부로 나름, 지휘관보다 조금 느림)', () => {
  test('미네랄을 캐서 사령부에 내려놓는다. 분당 60~80 사이', () => {
    const { world, cc } = withCommandCenter();
    commandTrain(world, cc.id, 'worker');
    runUntil(world, () => workers(world).length === 1, 30);
    const w = workers(world)[0]!;
    commandGather(world, [w.id], node(world, 7, 21).id);
    runUntil(world, () => world.stats.workerMineral >= WORKER.mineralPerTrip, 30); // 첫 왕복은 걸어가는 시간이 섞임
    const start = world.stats.workerMineral;
    run(world, 60);
    const perMinute = world.stats.workerMineral - start;
    expect(perMinute).toBeGreaterThanOrEqual(56);
    expect(perMinute).toBeLessThan(80); // 지휘관(분당 80)보다 느림
  });

  /** 같은 덩어리를 동시에 캐는(일하는 중인) 유닛이 둘 이상인 덩어리가 있는지 */
  const anyShared = (world: World): boolean =>
    world.nodes.some(
      (n) =>
        world.units.filter((u) => u.order.type === 'gather' && u.order.nodeId === n.id && u.workSeconds > 0 && u.carry === 0)
          .length > 1,
    );

  test('미네랄은 한 명씩: 둘째 일꾼은 옆 덩어리로 가고, 한 덩어리를 둘이 동시에 캐는 순간이 없다', () => {
    const { world, cc } = withCommandCenter();
    world.tutorialRules = true;
    commandTrain(world, cc.id, 'worker');
    commandTrain(world, cc.id, 'worker');
    runUntil(world, () => workers(world).length === 2, 30);
    world.tutorialRules = false;
    const [a, b] = workers(world);
    const patch = node(world, 7, 21);
    commandGather(world, [a!.id, b!.id], patch.id);
    for (let t = 0; t < 30 * 20; t++) {
      run(world, 1 / 20);
      expect(anyShared(world)).toBe(false);
    }
    const targets = workers(world).map((u) => (u.order.type === 'gather' ? u.order.nodeId : -1));
    expect(new Set(targets).size).toBe(2);
    expect(world.stats.workerMineral).toBeGreaterThan(0);
  });

  test('지휘관도 한 명씩 규칙을 따른다: 일꾼이 캐는 덩어리를 같이 캐지 않는다', () => {
    const { world, cc } = withCommandCenter();
    world.tutorialRules = true;
    commandTrain(world, cc.id, 'worker');
    runUntil(world, () => workers(world).length === 1, 30);
    world.tutorialRules = false;
    const w = workers(world)[0]!;
    const patch = node(world, 7, 21);
    commandGather(world, [w.id], patch.id);
    runUntil(world, () => w.workSeconds > 0, 30);
    commandGather(world, [world.commanderId], patch.id);
    for (let t = 0; t < 30 * 20; t++) {
      run(world, 1 / 20);
      expect(anyShared(world)).toBe(false);
    }
  });

  test('대기열 아무 칸이나 취소: 가운데를 빼면 나머지는 그대로, 맨 앞을 빼면 진행을 버림', () => {
    const { world, cc } = withCommandCenter();
    const start = world.stock.mineral;
    commandTrain(world, cc.id, 'worker');
    commandTrain(world, cc.id, 'worker');
    commandTrain(world, cc.id, 'worker');
    run(world, 3);
    const progress = cc.trainProgress;
    expect(commandCancelTrain(world, cc.id, 1)).toBe(true);
    expect(cc.trainQueue).toHaveLength(2);
    expect(cc.trainProgress).toBe(progress);
    expect(commandCancelTrain(world, cc.id, 0)).toBe(true);
    expect(cc.trainProgress).toBe(0);
    expect(cc.trainStarted).toBe(false);
    expect(commandCancelTrain(world, cc.id, 5)).toBe(false);
    expect(world.stock.mineral).toBe(start - UNITS.worker.mineral);
  });

  test('일꾼도 건물을 짓는다', () => {
    const { world, cc } = withCommandCenter();
    world.tutorialRules = true;
    commandTrain(world, cc.id, 'worker');
    runUntil(world, () => workers(world).length === 1, 30);
    const w = workers(world)[0]!;
    const depot = commandBuild(world, [w.id], 'supplyDepot', { x: 16, y: 26 })!;
    runUntil(world, () => depot.complete, 60);
  });
});

describe('집결 지점', () => {
  test('사령부를 고르고 미네랄을 우클릭하면, 나온 일꾼이 바로 캐러 간다', () => {
    const { world, cc } = withCommandCenter();
    world.tutorialRules = true;
    commandSmart(world, [cc.id], { x: 7, y: 21 });
    commandTrain(world, cc.id, 'worker');
    runUntil(world, () => workers(world).length === 1, 30);
    run(world, 0.1);
    expect(workers(world)[0]!.order.type).toBe('gather');
  });

  test('땅을 우클릭하면 그곳으로 간다', () => {
    const { world, cc } = withCommandCenter();
    world.tutorialRules = true;
    commandSmart(world, [cc.id], { x: 20, y: 24 });
    commandTrain(world, cc.id, 'worker');
    runUntil(world, () => workers(world).length === 1, 30);
    runUntil(world, () => workers(world)[0]!.order.type === 'idle', 30);
    const w = workers(world)[0]!;
    expect(Math.hypot(w.x - 20, w.y - 24)).toBeLessThanOrEqual(1.5);
  });
});

describe('여러 유닛 이동', () => {
  test('같은 곳으로 보내도 한 칸에 겹치지 않고 주변 칸으로 나눠 선다', () => {
    const { world, cc } = withCommandCenter();
    world.tutorialRules = true;
    for (let i = 0; i < 4; i++) commandTrain(world, cc.id, 'worker');
    runUntil(world, () => workers(world).length === 4, 60);
    const ids = workers(world).map((u) => u.id);
    commandMove(world, ids, { x: 22, y: 26 });
    runUntil(world, () => workers(world).every((u) => u.order.type === 'idle'), 30);
    const tiles = new Set(workers(world).map((u) => `${Math.round(u.x)},${Math.round(u.y)}`));
    expect(tiles.size).toBe(4);
  });
});

describe('누가 무엇을 할 수 있나 (리뷰 반영)', () => {
  const addRifleman = (world: World, at: { x: number; y: number }) => {
    const u = createTrainedUnit(world.nextId++, 'rifleman', at);
    world.units.push(u);
    return u;
  };

  test('소총병은 미네랄을 못 캔다: 채집 명령은 무시, 우클릭은 그쪽으로 걸어가기', () => {
    const world = newWorld();
    const mineral = world.nodes.find((n) => n.kind === 'mineral')!;
    const r = addRifleman(world, { x: 14, y: 25 });
    expect(commandGather(world, [r.id], mineral.id)).toBe(false);
    expect(commandSmart(world, [r.id], { x: mineral.x, y: mineral.y })).toBe(true);
    expect(r.order.type).toBe('move');
    const before = world.stock.mineral;
    run(world, 20);
    expect(world.stock.mineral).toBe(before);
  });

  test('지휘관과 소총병을 같이 골라 미네랄 우클릭: 지휘관만 캔다', () => {
    const world = newWorld();
    const mineral = world.nodes.find((n) => n.kind === 'mineral')!;
    const r = addRifleman(world, { x: 14, y: 25 });
    commandSmart(world, [world.commanderId, r.id], { x: mineral.x, y: mineral.y });
    expect(world.units.find((u) => u.id === world.commanderId)!.order.type).toBe('gather');
    expect(r.order.type).toBe('move');
  });

  test('소총병은 짓다 만 건물을 우클릭해도 짓지 않는다', () => {
    const world = newWorld();
    world.stock.mineral = 5000;
    const site = commandBuild(world, [world.commanderId], 'campfire', { x: 16, y: 26 })!;
    commandMove(world, [world.commanderId], { x: 14, y: 30 });
    const r = addRifleman(world, { x: 14, y: 25 });
    commandSmart(world, [r.id], { x: site.x, y: site.y });
    expect(r.order.type).toBe('move');
  });
});
