import { describe, expect, test } from 'vitest';
import { MAP1_ROWS } from '../src/maps/map1.ts';
import { parseMap } from '../src/sim/mapLoader.ts';
import { createWorld, elapsedSeconds, formatClock, stepWorld } from '../src/sim/world.ts';
import { TICKS_PER_SECOND } from '../src/data/constants.ts';

describe('world', () => {
  test('틱 진행과 경과 시간', () => {
    const world = createWorld(parseMap(MAP1_ROWS));
    expect(world.tick).toBe(0);
    for (let i = 0; i < TICKS_PER_SECOND * 3; i++) stepWorld(world);
    expect(elapsedSeconds(world)).toBe(3);
  });

  test('시계 글자', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(900)).toBe('15:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});
