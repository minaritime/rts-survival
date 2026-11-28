import { describe, expect, it } from 'vitest';
import { ARMOR_BONUS, damageMultiplier } from '../src/data/combat.ts';
import { createBuilding, createCreature, createTrainedUnit } from '../src/sim/entities.ts';
import { armorOf, strike } from '../src/sim/systems/combat.ts';
import { parseMap } from '../src/sim/mapLoader.ts';
import { MAP3_ROWS } from '../src/maps/map3.ts';
import { createWorld } from '../src/sim/world.ts';

describe('장갑 (기획.md 5-1)', () => {
  it('대경장은 경장에, 대중장은 중장에 +50%, 보통은 늘 그대로', () => {
    expect(damageMultiplier('antiLight', 'light')).toBe(ARMOR_BONUS);
    expect(damageMultiplier('antiLight', 'heavy')).toBe(1);
    expect(damageMultiplier('antiHeavy', 'heavy')).toBe(ARMOR_BONUS);
    expect(damageMultiplier('antiHeavy', 'light')).toBe(1);
    expect(damageMultiplier('normal', 'heavy')).toBe(1);
  });

  it('유닛·괴물·건물마다 장갑이 있고, 공격 유형에 따라 피해가 달라진다', () => {
    const w = createWorld(parseMap(MAP3_ROWS));
    const rifle = createTrainedUnit(1, 'rifleman', { x: 5, y: 5 });
    const assault = createTrainedUnit(2, 'assault', { x: 6, y: 5 });
    const swarm = createCreature(3, 'swarm', { x: 7, y: 5 });
    const depot = createBuilding(4, 'supplyDepot', { x: 10, y: 10 });
    expect([armorOf(rifle), armorOf(assault), armorOf(swarm), armorOf(depot)]).toEqual(['light', 'heavy', 'light', 'heavy']);
    const hit = { damage: 10, range: 2, cooldown: 1, type: 'antiLight' as const };
    strike(w, { x: 0, y: 0 }, rifle, hit, false);
    strike(w, { x: 0, y: 0 }, assault, hit, false);
    expect(rifle.maxHp - rifle.hp).toBe(15);
    expect(assault.maxHp - assault.hp).toBe(10);
  });
});
