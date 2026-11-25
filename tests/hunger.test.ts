import { describe, expect, test } from 'vitest';
import { commandMove } from '../src/sim/commands.ts';
import { stepWorld } from '../src/sim/world.ts';
import { commander, newWorld, run } from './helpers.ts';

describe('배고픔 (기획.md 3장)', () => {
  test('배부름은 4초마다 1 준다', () => {
    const world = newWorld();
    run(world, 4);
    expect(world.satiety).toBeCloseTo(99, 6);
  });

  test('아무것도 안 먹으면 400초에 굶주림, 600초 무렵 사망 → 패배', () => {
    const world = newWorld();
    world.stock.food = 0;
    run(world, 399);
    expect(world.satiety).toBeGreaterThan(0);
    run(world, 2);
    expect(world.satiety).toBe(0);
    run(world, 197);
    expect(world.outcome).toBe('playing');
    run(world, 3);
    expect(world.outcome).toBe('defeat');
    expect(commander(world).hp).toBe(0);
  });

  test('패배하면 시간이 멈춘다', () => {
    const world = newWorld();
    world.outcome = 'defeat';
    stepWorld(world);
    expect(world.tick).toBe(0);
  });

  test('60 아래로 내려가면 저장 식량에서 1씩 먹어 60을 채운다', () => {
    const world = newWorld();
    world.satiety = 58.5;
    world.stock.food = 10;
    stepWorld(world);
    expect(world.satiety).toBeGreaterThanOrEqual(60);
    expect(world.stock.food).toBe(8);
  });

  test('식량이 1 미만이면 못 먹는다', () => {
    const world = newWorld();
    world.satiety = 50;
    world.stock.food = 0.5;
    stepWorld(world);
    expect(world.satiety).toBeLessThan(50);
  });

  test('굶주리면 이동 속도가 30% 줄어든다', () => {
    const normal = newWorld();
    const starving = newWorld();
    starving.satiety = 0;
    for (const w of [normal, starving]) commandMove(w, [w.commanderId], { x: 30, y: 24 });
    run(normal, 1);
    run(starving, 1);
    const moved = (w: typeof normal): number => commander(w).x - 14;
    expect(moved(normal)).toBeCloseTo(3, 5);
    expect(moved(starving)).toBeCloseTo(2.1, 5);
  });
});
