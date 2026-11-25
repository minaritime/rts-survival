import { describe, expect, test } from 'vitest';
import { COMMANDER, START } from '../src/data/commander.ts';
import { commandGather } from '../src/sim/commands.ts';
import { berryMaxAt, markBerryEmptied, stepBerries } from '../src/sim/systems/berries.ts';
import { isWalkable, nodeAt, removeNode } from '../src/sim/world.ts';
import { commander, newWorld, node, run, runUntil } from './helpers.ts';

const idle = (world: ReturnType<typeof newWorld>) => () => commander(world).order.type === 'idle';

describe('잔해 뒤지기', () => {
  test('다가가서 3초 뒤지면 미네랄 50, 잔해는 사라지고 그 칸은 지나갈 수 있다', () => {
    const world = newWorld();
    const debris = node(world, 18, 31);
    commandGather(world, [world.commanderId], debris.id);
    runUntil(world, idle(world), 30);
    expect(world.stock.mineral).toBe(START.mineral + 50);
    expect(nodeAt(world, 18, 31)).toBeUndefined();
    expect(isWalkable(world, 18, 31)).toBe(true);
  });
});

describe('미네랄 손 채집', () => {
  test('옆에 붙으면 6초마다 8, 멈추지 않고 계속 (사용자 확정: 8씩, 일꾼보다 조금 빠름)', () => {
    const world = newWorld();
    const mineral = node(world, 7, 21);
    commandGather(world, [world.commanderId], mineral.id);
    runUntil(world, () => world.stock.mineral > START.mineral, 30);
    expect(world.stock.mineral).toBe(START.mineral + 8);
    run(world, 50);
    // 처음 1번 + 50초 동안 6초마다 1번 = 8번 더
    expect(world.stock.mineral).toBe(START.mineral + 8 * (1 + Math.floor(50 / COMMANDER.mineralSeconds)));
    expect(commander(world).order.type).toBe('gather');
    expect(mineral.amount).toBe(Infinity);
  });
});

describe('열매 따기', () => {
  test('2초마다 5, 다 따면 덤불이 비고 멈춘다', () => {
    const world = newWorld();
    world.satiety = 100;
    const bush = node(world, 22, 20);
    commandGather(world, [world.commanderId], bush.id);
    runUntil(world, idle(world), 40);
    expect(world.stock.food).toBe(15);
    expect(bush.amount).toBe(0);
    expect(bush.regrowAt).not.toBeNull();
  });

  test('한도까지 1 도 안 남았으면(배급처가 소수로 채운 경우) 가득 찬 것으로 보고 따지 않는다', () => {
    const world = newWorld();
    world.satiety = 100;
    world.stock.food = 29.6;
    const bush = node(world, 22, 20);
    commandGather(world, [world.commanderId], bush.id);
    run(world, 0.05);
    expect(commander(world).order.type).toBe('idle');
    expect(world.stats.berriesPicked).toBe(0);
  });

  test('주머니(30)가 차 있으면 따지 않는다', () => {
    const world = newWorld();
    world.stock.food = 30;
    const bush = node(world, 22, 20);
    commandGather(world, [world.commanderId], bush.id);
    run(world, 0.05);
    expect(commander(world).order.type).toBe('idle');
    expect(bush.amount).toBe(15);
  });

  test('따다가 주머니가 차면 남은 열매는 두고 멈춘다 (넘치는 열매는 따지 않음)', () => {
    const world = newWorld();
    world.satiety = 100;
    world.stock.food = 22;
    const bush = node(world, 22, 20);
    commandGather(world, [world.commanderId], bush.id);
    runUntil(world, idle(world), 40);
    expect(world.stock.food).toBe(30);
    expect(bush.amount).toBe(7); // 15 - 5 - 3
  });
});

describe('열매가 다시 차는 규칙 (기획.md 4-2)', () => {
  test('비면 90초 뒤, 두 번째는 120초 뒤 다시 찬다', () => {
    const world = newWorld();
    const bush = node(world, 22, 20);
    markBerryEmptied(bush, 0);
    stepBerries(world, 89.9);
    expect(bush.amount).toBe(0);
    stepBerries(world, 90);
    expect(bush.amount).toBe(15);
    markBerryEmptied(bush, 100);
    stepBerries(world, 219.9);
    expect(bush.amount).toBe(0);
    stepBerries(world, 220);
    expect(bush.amount).toBe(15);
  });

  test('최대치가 줄면 한 번도 안 비운 덤불도 그만큼 줄어든다', () => {
    const world = newWorld();
    const bush = node(world, 22, 20);
    stepBerries(world, 599);
    expect(bush.amount).toBe(15);
    stepBerries(world, 600);
    expect(bush.amount).toBe(12);
    bush.amount = 4;
    stepBerries(world, 1200);
    expect(bush.amount).toBe(4); // 최대치보다 적으면 그대로
  });

  test('10분마다 최대치가 3씩 줄고 0 아래로는 안 간다', () => {
    expect(berryMaxAt(0)).toBe(15);
    expect(berryMaxAt(599)).toBe(15);
    expect(berryMaxAt(600)).toBe(12);
    expect(berryMaxAt(1800)).toBe(6);
    expect(berryMaxAt(99999)).toBe(0);
    expect(berryMaxAt(-5)).toBe(15);
  });
});

describe('채집 중 예외 상황', () => {
  test('대상이 사라지면 멈춘다', () => {
    const world = newWorld();
    const debris = node(world, 18, 31);
    commandGather(world, [world.commanderId], debris.id);
    run(world, 0.5);
    removeNode(world, debris);
    run(world, 0.1);
    expect(commander(world).order.type).toBe('idle');
  });

  test('없는 자원으로는 명령이 안 들어간다', () => {
    const world = newWorld();
    expect(commandGather(world, [world.commanderId], 99999)).toBe(false);
  });

  test('둘레가 막힌 자원에는 다가가지 못하고 멈춘다', () => {
    const world = newWorld();
    const debris = node(world, 18, 31);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (dx !== 0 || dy !== 0) world.occupied.add((31 + dy) * 64 + 18 + dx);
    commandGather(world, [world.commanderId], debris.id);
    run(world, 0.1);
    expect(commander(world).order.type).toBe('idle');
  });
});
