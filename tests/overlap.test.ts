import { describe, expect, it } from 'vitest';
import { MAP3_ROWS } from '../src/maps/map3.ts';
import { commandAttack, commandAttackMove, commandGather, commandMove } from '../src/sim/commands.ts';
import { createCreature, createTrainedUnit, type Unit } from '../src/sim/entities.ts';
import { parseMap } from '../src/sim/mapLoader.ts';
import { createWorld, stepWorld, type World } from '../src/sim/world.ts';
import { run } from './helpers.ts';

/** 열린 땅(3맵 서쪽 가운데)에 병사 n 기를 한 줄로 */
function squad(w: World, kind: 'rifleman' | 'assault', n: number): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < n; i++) {
    const u = createTrainedUnit(w.nextId++, kind, { x: 8 + i, y: 28 });
    w.units.push(u);
    out.push(u);
  }
  return out;
}

function closestPair(units: readonly Unit[]): number {
  let best = Infinity;
  for (let i = 0; i < units.length; i++)
    for (let j = i + 1; j < units.length; j++) best = Math.min(best, Math.hypot(units[i]!.x - units[j]!.x, units[i]!.y - units[j]!.y));
  return best;
}

describe('유닛 겹침 (11/26 사용자 제보)', () => {
  it('땅에 공격 명령: 도착하면 서로 다른 자리에 선다', () => {
    const w = createWorld(parseMap(MAP3_ROWS));
    const units = squad(w, 'rifleman', 6);
    commandAttackMove(w, units.map((u) => u.id), { x: 20, y: 30 });
    run(w, 15);
    expect(units.every((u) => u.order.type === 'idle')).toBe(true);
    expect(closestPair(units)).toBeGreaterThan(0.6);
  });

  it('여럿이 한 상대를 칠 때 한 점에 몰리지 않는다 (소총병·돌격병)', () => {
    for (const kind of ['rifleman', 'assault'] as const) {
      const w = createWorld(parseMap(MAP3_ROWS));
      const units = squad(w, kind, 5);
      // 반격하지 않는 과녁: 아주 단단한 적 일꾼 (일꾼은 알아서 싸우지 않음)
      const target = createTrainedUnit(w.nextId++, 'worker', { x: 20, y: 30 }, 'enemy');
      target.hp = 100000;
      w.units.push(target);
      commandAttack(w, units.map((u) => u.id), target.id);
      run(w, 15);
      expect(closestPair(units), kind).toBeGreaterThan(0.6);
    }
  });

  it('충돌: 걷는 유닛은 서 있는 유닛을 밀고 지나가며 겹치지 않는다', () => {
    const w = createWorld(parseMap(MAP3_ROWS));
    const stander = createTrainedUnit(w.nextId++, 'rifleman', { x: 10, y: 28 });
    const walker = createTrainedUnit(w.nextId++, 'rifleman', { x: 6, y: 28 });
    w.units.push(stander, walker);
    commandMove(w, [walker.id], { x: 14, y: 28 });
    let closest = Infinity;
    for (let t = 0; t < 20 * 8; t++) {
      stepWorld(w);
      closest = Math.min(closest, Math.hypot(stander.x - walker.x, stander.y - walker.y));
    }
    expect(closest).toBeGreaterThan(0.6);
    expect([Math.round(walker.x), Math.round(walker.y)]).toEqual([14, 28]);
  });

  it('충돌: 마주 걷는 두 유닛도 서로 막히지 않고 지나간다', () => {
    const w = createWorld(parseMap(MAP3_ROWS));
    const a = createTrainedUnit(w.nextId++, 'rifleman', { x: 6, y: 28 });
    const b = createTrainedUnit(w.nextId++, 'rifleman', { x: 14, y: 28 });
    w.units.push(a, b);
    commandMove(w, [a.id], { x: 14, y: 28 });
    commandMove(w, [b.id], { x: 6, y: 28 });
    run(w, 8);
    expect([Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)]).toEqual([14, 28, 6, 28]);
  });

  it('충돌: 괴물 떼가 둘러싸도 유닛과 겹치지 않고, 서 있는 유닛을 밀어내지도 못한다', () => {
    const w = createWorld(parseMap(MAP3_ROWS));
    const guard = createTrainedUnit(w.nextId++, 'rifleman', { x: 10, y: 28 });
    guard.hp = 1e6;
    w.units.push(guard);
    const swarm = Array.from({ length: 8 }, (_, i) => {
      const m = createCreature(w.nextId++, 'swarm', { x: 14 + (i % 4) * 0.3, y: 27 + Math.floor(i / 4) });
      m.hp = 1e6;
      w.creatures.push(m);
      return m;
    });
    let closest = Infinity;
    for (let t = 0; t < 20 * 8; t++) {
      stepWorld(w);
      for (const m of swarm) closest = Math.min(closest, Math.hypot(m.x - guard.x, m.y - guard.y));
    }
    expect(closest).toBeGreaterThan(0.6);
    expect(Math.hypot(guard.x - 10, guard.y - 28)).toBeLessThan(0.05);
  });

  it('충돌: 괴물을 뚫고 가라고 하면 겹치지 않고 옆으로 돌아 도착한다', () => {
    const w = createWorld(parseMap(MAP3_ROWS));
    const walker = createTrainedUnit(w.nextId++, 'rifleman', { x: 6, y: 28 });
    walker.hp = 1e6;
    w.units.push(walker);
    const charger = createCreature(w.nextId++, 'charger', { x: 10, y: 28 });
    charger.hp = 1e6;
    w.creatures.push(charger);
    commandMove(w, [walker.id], { x: 14, y: 28 });
    let closest = Infinity;
    for (let t = 0; t < 20 * 8; t++) {
      stepWorld(w);
      closest = Math.min(closest, Math.hypot(charger.x - walker.x, charger.y - walker.y));
    }
    expect(closest).toBeGreaterThan(0.6);
    expect([Math.round(walker.x), Math.round(walker.y)]).toEqual([14, 28]);
  });

  it('충돌: 자원을 캐는 일꾼은 괴물과 부딪히지 않는다 (11/28 사용자)', () => {
    const w = createWorld(parseMap(MAP3_ROWS));
    const node = w.nodes.find((n) => n.kind === 'mineral')!;
    const worker = createTrainedUnit(w.nextId++, 'worker', { x: 10, y: 28 });
    worker.hp = 1e6;
    w.units.push(worker);
    commandGather(w, [worker.id], node.id);
    const swarm = createCreature(w.nextId++, 'swarm', { x: worker.x, y: worker.y });
    swarm.hp = 1e6;
    w.creatures.push(swarm);
    stepWorld(w);
    expect(worker.order.type).toBe('gather');
    // 밀어냈다면 한 틱에 0.7칸 가까이 벌어진다. 걸음만으로는 0.3칸도 안 된다
    expect(Math.hypot(swarm.x - worker.x, swarm.y - worker.y)).toBeLessThan(0.3);
  });
});
