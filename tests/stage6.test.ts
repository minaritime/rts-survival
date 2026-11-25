import { describe, expect, test } from 'vitest';
import { STAGE1_SURVIVE_SECONDS, WAVES } from '../src/data/monsters.ts';
import { createCreature, isMonster } from '../src/sim/entities.ts';
import { elapsedSeconds, type World } from '../src/sim/world.ts';
import { hasMoreWaves, waveProgress, waveWarning } from '../src/sim/systems/waves.ts';
import { commander, newWorld, run, runUntil } from './helpers.ts';

/** 지휘관을 남쪽 풀밭 구석에 두고, 공격을 켠 1스테이지 */
function stage1(): World {
  const world = newWorld();
  world.waves.enabled = true;
  world.waves.surviveSeconds = STAGE1_SURVIVE_SECONDS;
  const c = commander(world);
  c.x = 3;
  c.y = 45;
  c.prevX = 3;
  c.prevY = 45;
  c.hp = 1e9; // 공격 일정만 본다
  return world;
}

describe('6단계: 15분 생존', () => {
  test('공격 시각: 6:00 부터 90초마다, 끝나기 2분 전(13:00)부터는 45초마다, 15:00 이후로는 없음', () => {
    const world = stage1();
    const times: number[] = [];
    let last = world.waves.number;
    while (world.outcome === 'playing' && elapsedSeconds(world) < STAGE1_SURVIVE_SECONDS) {
      world.satiety = 100;
      run(world, 1);
      if (world.waves.number !== last) {
        times.push(Math.round(elapsedSeconds(world)));
        last = world.waves.number;
      }
    }
    expect(times).toEqual([360, 450, 540, 630, 720, 810, 855]);
  });

  test('15분이 되면 괴물이 물러가고(입구로 빠져나감) 승리. 물러간 괴물은 잡은 수에 안 셈', () => {
    const world = stage1();
    world.tick = (STAGE1_SURVIVE_SECONDS - 2) * 20;
    world.waves.nextAt = STAGE1_SURVIVE_SECONDS + 100; // 더 안 옴
    for (let i = 0; i < 5; i++) world.creatures.push(createCreature(world.nextId++, 'swarm', { x: 30 + i, y: 8 }));
    run(world, 3);
    expect(world.waves.retreatAt).not.toBeNull();
    expect(world.creatures.filter(isMonster).every((c) => c.retreating)).toBe(true);
    expect(waveWarning(world, elapsedSeconds(world))).toBeNull();
    expect(hasMoreWaves(world)).toBe(false);
    runUntil(world, () => world.outcome !== 'playing', WAVES.retreatSeconds + 1);
    expect(world.outcome).toBe('victory');
    expect(world.stats.monstersKilled).toBe(0);
  });

  test('물러가는 괴물은 공격하지 않는다', () => {
    const world = stage1();
    const c = commander(world);
    c.hp = 100;
    world.tick = STAGE1_SURVIVE_SECONDS * 20;
    world.waves.nextAt = STAGE1_SURVIVE_SECONDS + 100;
    world.creatures.push(createCreature(world.nextId++, 'swarm', { x: c.x + 1, y: c.y }));
    run(world, 3);
    expect(c.hp).toBe(100);
  });

  test('튜토리얼처럼 생존 시간이 없으면 끝나지 않는다', () => {
    const world = newWorld();
    world.waves.enabled = true;
    commander(world).hp = 1e9;
    world.tick = 20 * 60 * 20;
    run(world, 2);
    expect(world.outcome).toBe('playing');
    expect(world.waves.retreatAt).toBeNull();
  });
});

describe('6단계 리뷰 반영', () => {
  test('물러가기 시작하면 하던 길을 버리고 입구로 간다 (기지 쪽으로 더 다가오지 않음)', () => {
    const world = stage1();
    const c = commander(world);
    c.x = 14;
    c.y = 24;
    const m = createCreature(world.nextId++, 'swarm', { x: 30, y: 24 });
    world.creatures.push(m);
    run(world, 1); // 지휘관 쪽으로 길을 잡게
    world.tick = STAGE1_SURVIVE_SECONDS * 20;
    world.waves.nextAt = STAGE1_SURVIVE_SECONDS + 100;
    const before = Math.hypot(m.x - c.x, m.y - c.y);
    run(world, 1);
    expect(Math.hypot(m.x - c.x, m.y - c.y)).toBeGreaterThan(before);
  });

  test('다음 공격까지 막대: 최후의 파도(45초 간격)에서도 0부터 찬다', () => {
    expect(waveProgress(810, 855, 810)).toBe(0);
    expect(waveProgress(810, 855, 832.5)).toBeCloseTo(0.5, 5);
    expect(waveProgress(0, 360, 360)).toBe(1);
  });
});
