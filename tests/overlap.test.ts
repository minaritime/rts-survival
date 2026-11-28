import { describe, expect, it } from 'vitest';
import { MAP3_ROWS } from '../src/maps/map3.ts';
import { commandAttack, commandAttackMove } from '../src/sim/commands.ts';
import { createTrainedUnit, type Unit } from '../src/sim/entities.ts';
import { parseMap } from '../src/sim/mapLoader.ts';
import { createWorld, type World } from '../src/sim/world.ts';
import { run } from './helpers.ts';

/** 열린 땅(3맵 서쪽 가운데)에 병사 n 기를 한 줄로 */
function squad(w: World, kind: 'rifleman' | 'assault', n: number): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < n; i++) {
    const u = createTrainedUnit(w.nextId++, kind, { x: 8 + i, y: 24 });
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
});
