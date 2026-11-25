import { CREATURES, WAVES, type MonsterKind } from '../../data/monsters.ts';
import { createCreature, isMonster } from '../entities.ts';
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

/** 다음 공격까지 간격: 끝나기 2분 전부터는 절반 (최후의 파도) */
export function intervalAfter(at: number, surviveSeconds: number | null): number {
  const final = surviveSeconds !== null && at >= surviveSeconds - WAVES.finalSeconds;
  return final ? WAVES.intervalSeconds / 2 : WAVES.intervalSeconds;
}

/** 끝나기 전에 아직 올 공격이 있는지 */
export function hasMoreWaves(world: World): boolean {
  const w = world.waves;
  return w.enabled && w.retreatAt === null && (w.surviveSeconds === null || w.nextAt < w.surviveSeconds);
}

export function stepWaves(world: World, now: number): void {
  const w = world.waves;
  if (!w.enabled) return;
  if (w.retreatAt !== null) {
    stepRetreat(world, now);
    return;
  }
  if (w.surviveSeconds !== null && now >= w.surviveSeconds) {
    // 버텼다: 맵의 괴물이 모두 물러간다. 새 괴물은 더 안 나옴
    w.retreatAt = now;
    for (const c of world.creatures) {
      if (!isMonster(c)) continue;
      c.retreating = true;
      c.path = [];
      c.targetId = null;
    }
    return;
  }
  if (now < w.nextAt || !hasMoreWaves(world)) return;
  spawnWave(world, w.number, w.direction);
  w.lastAt = w.nextAt;
  w.number += 1;
  w.nextAt += intervalAfter(w.nextAt, w.surviveSeconds);
  w.direction = pickOne(world, entranceDirections(world));
}

/** 물러가는 동안: 다 빠지거나 정한 시간이 지나면 승리 */
function stepRetreat(world: World, now: number): void {
  const left = world.creatures.some((c) => isMonster(c) && c.hp > 0);
  if (!left || now >= world.waves.retreatAt! + WAVES.retreatSeconds) world.outcome = 'victory';
}

/** 공격이 30초 안에 오면 방향과 남은 초. 아니면 null */
export function waveWarning(world: World, now: number): { direction: Direction; secondsLeft: number } | null {
  const w = world.waves;
  if (!hasMoreWaves(world)) return null;
  const left = w.nextAt - now;
  return left > 0 && left <= WAVES.warnSeconds ? { direction: w.direction, secondsLeft: left } : null;
}

/** 지난 공격(첫 공격이면 판 시작)부터 다음 공격까지 얼마나 왔는지 0~1 (최후의 파도에서 간격이 줄어도 맞게) */
export function waveProgress(lastAt: number, nextAt: number, now: number): number {
  const span = nextAt - lastAt;
  return span <= 0 ? 1 : Math.max(0, Math.min(1, (now - lastAt) / span));
}
