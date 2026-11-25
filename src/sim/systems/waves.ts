import { CREATURES, WAVES, type MonsterKind } from '../../data/monsters.ts';
import { createCreature } from '../entities.ts';
import { nextRandom, pickOne } from '../random.ts';
import { entranceDirections, type Direction, type World } from '../world.ts';

/**
 * 생존형 괴물 공격 일정 (기획.md 8-1).
 * n 번째 공격 가치 = 4 x 1.3^(n-1). 6:00 첫 공격, 90초마다. 3번째부터 돌진형이 섞인다.
 * 다음 공격 방향은 미리 정해 두고 30초 전부터 화면이 알린다 (waveWarning).
 */

export function waveValue(n: number): number {
  return WAVES.firstValue * WAVES.growth ** (n - 1);
}

/** n 번째 공격에 올 괴물 수 */
export function waveComposition(n: number): Readonly<Record<MonsterKind, number>> {
  const value = waveValue(n);
  const charger =
    n >= WAVES.chargerFromWave ? Math.max(1, Math.round((value * WAVES.chargerShare) / CREATURES.charger.value)) : 0;
  const swarm = Math.max(1, Math.round(value - charger * CREATURES.charger.value));
  return { swarm, charger };
}

/** 괴물을 그 방향 입구 칸들에 나눠 세운다 (겹치지 않게 조금씩 흩뜨림) */
export function spawnWave(world: World, n: number, direction: Direction): void {
  const gates = world.map.features.entrances[direction];
  if (gates.length === 0) return;
  const comp = waveComposition(n);
  const kinds: MonsterKind[] = [...Array<MonsterKind>(comp.charger).fill('charger'), ...Array<MonsterKind>(comp.swarm).fill('swarm')];
  kinds.forEach((kind, i) => {
    const gate = gates[i % gates.length]!;
    const c = createCreature(world.nextId++, kind, gate);
    c.x += (nextRandom(world) - 0.5) * 0.6;
    c.y += (nextRandom(world) - 0.5) * 0.6;
    c.prevX = c.x;
    c.prevY = c.y;
    world.creatures.push(c);
  });
}

export function stepWaves(world: World, now: number): void {
  const w = world.waves;
  if (!w.enabled || now < w.nextAt) return;
  spawnWave(world, w.number, w.direction);
  w.number += 1;
  w.nextAt += WAVES.intervalSeconds;
  w.direction = pickOne(world, entranceDirections(world));
}

/** 공격이 30초 안에 오면 방향과 남은 초. 아니면 null */
export function waveWarning(world: World, now: number): { direction: Direction; secondsLeft: number } | null {
  const w = world.waves;
  if (!w.enabled) return null;
  const left = w.nextAt - now;
  return left > 0 && left <= WAVES.warnSeconds ? { direction: w.direction, secondsLeft: left } : null;
}
