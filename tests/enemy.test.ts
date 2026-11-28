import { describe, expect, it } from 'vitest';
import { MAP3_ENEMY, MAP3_ROWS } from '../src/maps/map3.ts';
import { parseMap } from '../src/sim/mapLoader.ts';
import { addBuilding, createWorld, stepWorld, type World } from '../src/sim/world.ts';
import { createBuilding, createTrainedUnit } from '../src/sim/entities.ts';
import { pickOwner } from '../src/sim/systems/support.ts';
import { commander, run } from './helpers.ts';

function newEnemyWorld(): World {
  return createWorld(parseMap(MAP3_ROWS), 1, MAP3_ENEMY);
}

/** 다 지은 내 건물을 바로 세운다 */
function placeMine(world: World, kind: 'commandCenter' | 'barracks', x: number, y: number) {
  const b = createBuilding(world.nextId++, kind, { x, y });
  b.complete = true;
  b.progress = 1;
  b.hp = b.maxHp;
  addBuilding(world, b);
  return b;
}

describe('거울 적 기지 (섬멸형)', () => {
  it('처음 상태: 3맵은 사령부 + 곁 포탑, 일꾼·병력 없음', () => {
    const w = newEnemyWorld();
    expect(w.objective).toBe('annihilate');
    expect(w.buildings.filter((b) => b.owner === 'enemy').map((b) => b.kind)).toEqual(['commandCenter', 'turret']);
    expect(w.units.filter((u) => u.owner === 'enemy')).toHaveLength(0);
  });

  it('처음 포탑이 적 사령부로 다가온 지휘관을 쏜다', () => {
    const w = newEnemyWorld();
    const me = commander(w);
    me.x = 54;
    me.y = 13;
    const hp = me.hp;
    run(w, 3);
    expect(me.hp).toBeLessThan(hp);
  });

  it('배급처는 더 가까운 쪽이 차지', () => {
    expect(pickOwner(null, 2, 4)).toBe('player');
    expect(pickOwner(null, 5, 1)).toBe('enemy');
    expect(pickOwner(null, 9, 9)).toBeNull();
    expect(pickOwner('enemy', 3, 3)).toBe('enemy');
  });

  it('적이 곁에서 내 사령부를 부수면 식량 절반을 빼앗아 간다', () => {
    const w = newEnemyWorld();
    const cc = placeMine(w, 'commandCenter', 8, 36);
    w.foodCap = 50;
    w.stock.food = 40;
    w.units.push(createTrainedUnit(w.nextId++, 'rifleman', { x: 12, y: 37 }, 'enemy'));
    cc.hp = 0;
    stepWorld(w);
    expect(w.stock.food).toBe(20);
    expect(w.enemy!.stock.food).toBe(20);
    expect(w.stats.foodStolen).toBe(20);
  });

  it('적 건물을 다 부수면 승리', () => {
    const w = newEnemyWorld();
    for (const b of w.buildings) if (b.owner === 'enemy') b.hp = 0;
    stepWorld(w);
    expect(w.outcome).toBe('victory');
    expect(w.stats.enemyBuildingsDestroyed).toBe(MAP3_ENEMY.start.length);
  });

  it('내 소총병은 가까이 온 적 유닛을 알아서 쏜다', () => {
    const w = newEnemyWorld();
    w.enemy!.nextThinkAt = Infinity; // 적 머리는 끈다
    const mine = createTrainedUnit(w.nextId++, 'rifleman', { x: 30, y: 30 });
    const foe = createTrainedUnit(w.nextId++, 'worker', { x: 34, y: 30 }, 'enemy');
    w.units.push(mine, foe);
    run(w, 10);
    expect(w.units.includes(foe)).toBe(false);
    expect(w.stats.enemyUnitsKilled).toBe(1);
  });

  it('적 병력이 지을 자리에 서 있으면 비키고 짓는다 (건설 대본이 멈추지 않음)', () => {
    const w = newEnemyWorld();
    const e = w.enemy!;
    e.buildIndex = MAP3_ENEMY.buildOrder.findIndex((s) => s.kind === 'turret' && s.at.x === 43 && s.at.y === 15);
    e.stock.mineral = 1000;
    w.tick = 300 * 20;
    w.units.push(createTrainedUnit(w.nextId++, 'worker', { x: 50, y: 12 }, 'enemy'));
    for (const [x, y] of [[43, 15], [44, 15], [43, 16], [44, 16]] as const) {
      w.units.push(createTrainedUnit(w.nextId++, 'rifleman', { x, y }, 'enemy'));
    }
    run(w, 40);
    expect(w.buildings.some((b) => b.owner === 'enemy' && b.kind === 'turret' && b.x === 43 && b.y === 15)).toBe(true);
  });

  it('8분 동안: 일꾼을 늘리고, 대본대로 짓고, 열매를 나르고, 내 건물로 공격하러 온다', () => {
    const w = newEnemyWorld();
    placeMine(w, 'commandCenter', 8, 36);
    commander(w).hp = Infinity; // 지휘관이 죽어 판이 끝나지 않게
    run(w, 8 * 60);
    const e = w.enemy!;
    expect(w.units.filter((u) => u.owner === 'enemy' && u.kind === 'worker').length).toBeGreaterThanOrEqual(12);
    expect(e.buildIndex).toBe(MAP3_ENEMY.buildOrder.length);
    expect(e.stock.food).toBeGreaterThan(0);
    expect(e.attacksLaunched).toBeGreaterThanOrEqual(1);
    // 북서 배급처(33,12)는 적 보급고가 차지
    expect(w.feeders.find((f) => f.x === 33 && f.y === 12)?.owner).toBe('enemy');
  });
});
