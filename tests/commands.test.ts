import { describe, expect, test } from 'vitest';
import { commandGather, commandMove, commandSmart, commandStop } from '../src/sim/commands.ts';
import { commander, newWorld, node, run, runUntil } from './helpers.ts';

describe('명령', () => {
  test('땅으로 이동하면 도착 뒤 대기', () => {
    const world = newWorld();
    expect(commandMove(world, [world.commanderId], { x: 20, y: 24 })).toBe(true);
    const seconds = runUntil(world, () => commander(world).order.type === 'idle', 10);
    expect(commander(world)).toMatchObject({ x: 20, y: 24 });
    expect(seconds).toBeCloseTo(2, 1); // 6칸 / 초당 3칸
  });

  test('막힌 칸(자원)을 찍으면 그 옆까지 간다', () => {
    const world = newWorld();
    expect(commandMove(world, [world.commanderId], { x: 7, y: 21 })).toBe(true);
    runUntil(world, () => commander(world).order.type === 'idle', 10);
    const c = commander(world);
    expect(Math.max(Math.abs(c.x - 7), Math.abs(c.y - 21))).toBe(1);
  });

  test('갈 수 없는 곳(사방이 절벽)은 명령이 안 들어간다', () => {
    const world = newWorld();
    expect(commandMove(world, [world.commanderId], { x: 2, y: 20 })).toBe(false);
    expect(commander(world).order.type).toBe('idle');
  });

  test('없는 유닛은 건너뛴다', () => {
    const world = newWorld();
    expect(commandMove(world, [12345], { x: 20, y: 24 })).toBe(false);
  });

  test('오른쪽 클릭: 자원이면 채집, 땅이면 이동', () => {
    const world = newWorld();
    commandSmart(world, [world.commanderId], { x: 7, y: 21 });
    expect(commander(world).order).toEqual({ type: 'gather', nodeId: node(world, 7, 21).id });
    commandSmart(world, [world.commanderId], { x: 20, y: 24 });
    expect(commander(world).order.type).toBe('move');
  });

  test('가는 길에 무언가 생겨 막히면 뚫지 않고 돌아간다', () => {
    const world = newWorld();
    commandMove(world, [world.commanderId], { x: 24, y: 24 });
    run(world, 0.5); // 14 → 15.5 쯤
    for (let y = 18; y <= 30; y++) world.occupied.add(y * 64 + 18); // 18열에 벽(건물 대신)
    runUntil(world, () => commander(world).order.type === 'idle', 20);
    expect(commander(world)).toMatchObject({ x: 24, y: 24 });
    // 벽 칸(18, 18~30)을 지나지 않았는지: 지나갔다면 직선으로 4초 안에 왔을 것
    expect(world.tick).toBeGreaterThan(4 * 20);
  });

  test('완전히 막혀 갈 곳이 없어지면 멈춘다', () => {
    const world = newWorld();
    commandMove(world, [world.commanderId], { x: 24, y: 24 });
    run(world, 0.5);
    world.occupied.add(24 * 64 + 24); // 목적지 자체가 막힘 → 옆까지만
    for (let y = 13; y <= 35; y++) world.occupied.add(y * 64 + 18); // 분지를 가르는 벽
    runUntil(world, () => commander(world).order.type === 'idle', 20);
    expect(commander(world).x).toBeLessThan(18);
  });

  test('이동 중에 다시 명령해도 뒤로 물러나지 않는다', () => {
    const world = newWorld();
    commandMove(world, [world.commanderId], { x: 24, y: 24 });
    run(world, 0.5); // x 는 15.5 쯤, 다음 칸은 16
    const before = commander(world).x;
    commandMove(world, [world.commanderId], { x: 24, y: 20 });
    run(world, 0.05);
    expect(commander(world).x).toBeGreaterThanOrEqual(before);
  });

  test('정지: 하던 일을 멈추고 지금 밟아 가는 칸에서 선다', () => {
    const world = newWorld();
    commandGather(world, [world.commanderId], node(world, 7, 21).id);
    run(world, 0.5);
    expect(commandStop(world, [world.commanderId])).toBe(true);
    run(world, 1);
    const c = commander(world);
    expect(c.order.type).toBe('idle');
    expect(Number.isInteger(c.x) && Number.isInteger(c.y)).toBe(true);
    expect(commandStop(world, [99999])).toBe(false);
  });

  test('패배 뒤에는 명령을 받지 않는다', () => {
    const world = newWorld();
    world.outcome = 'defeat';
    expect(commandSmart(world, [world.commanderId], { x: 20, y: 24 })).toBe(false);
    expect(commandStop(world, [world.commanderId])).toBe(false);
  });
});
