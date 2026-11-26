import { describe, expect, it } from 'vitest';
import { ENEMY_ATTACK, ENEMY_EXPAND } from '../src/data/enemy.ts';
import { UNITS } from '../src/data/units.ts';
import { MAP3_ENEMY, MAP3_ROWS } from '../src/maps/map3.ts';
import { homeArmy, readyToAttack } from '../src/sim/ai/enemyArmy.ts';
import { commandTrain } from '../src/sim/commands.ts';
import { createBuilding, createTrainedUnit } from '../src/sim/entities.ts';
import { parseMap } from '../src/sim/mapLoader.ts';
import { addBuilding, createWorld, type World } from '../src/sim/world.ts';
import { run } from './helpers.ts';

function enemyWorld(seed = 1): World {
  return createWorld(parseMap(MAP3_ROWS), seed, MAP3_ENEMY);
}

function addUnits(world: World, kind: 'rifleman' | 'worker', owner: 'player' | 'enemy', count: number, x: number, y: number): void {
  for (let i = 0; i < count; i++) world.units.push(createTrainedUnit(world.nextId++, kind, { x: x + (i % 4), y: y + Math.floor(i / 4) }, owner));
}

describe('돌격병', () => {
  it('병영에서 75 미네랄로 뽑고, 체력 100', () => {
    const w = createWorld(parseMap(MAP3_ROWS));
    const b = createBuilding(w.nextId++, 'barracks', { x: 10, y: 30 });
    b.complete = true;
    b.progress = 1;
    b.hp = b.maxHp;
    addBuilding(w, b);
    const cc = createBuilding(w.nextId++, 'commandCenter', { x: 14, y: 26 });
    cc.complete = true;
    cc.progress = 1;
    cc.hp = cc.maxHp;
    addBuilding(w, cc);
    w.stock.mineral = 100;
    expect(commandTrain(w, b.id, 'assault')).toBe(true);
    expect(w.stock.mineral).toBe(25);
    run(w, UNITS.assault.trainSeconds + 1);
    const unit = w.units.find((u) => u.kind === 'assault');
    expect(unit?.maxHp).toBe(100);
  });
});

describe('적이 스스로 판단하는 공격', () => {
  it('시드가 다르면 첫 공격 시각·대담함이 다르고, 같으면 같다', () => {
    const a = enemyWorld(1).enemy!;
    const b = enemyWorld(2).enemy!;
    const a2 = enemyWorld(1).enemy!;
    expect(a.nextAttackAt).not.toBe(b.nextAttackAt);
    expect(a.nextAttackAt).toBe(a2.nextAttackAt);
    expect(a.boldness).toBe(a2.boldness);
    for (const e of [a, b]) {
      expect(e.nextAttackAt).toBeGreaterThanOrEqual(ENEMY_ATTACK.firstEarliest[0]);
      expect(e.nextAttackAt).toBeLessThanOrEqual(ENEMY_ATTACK.firstEarliest[1]);
    }
  });

  it('내 병력이 더 세면 기다리고, 인내심이 다하면 최소 병력으로도 간다', () => {
    const w = enemyWorld();
    const e = w.enemy!;
    addUnits(w, 'rifleman', 'enemy', 4, 44, 16); // 처음 2 + 4 = 6
    addUnits(w, 'rifleman', 'player', 12, 10, 40);
    e.nextAttackAt = 0;
    e.boldness = 1;
    e.patienceUntil = 100;
    const home = homeArmy(w, e);
    expect(readyToAttack(w, e, 50, home)).toBe(false);
    expect(readyToAttack(w, e, 100, home)).toBe(true);
  });

  it('내 병력보다 세면 바로 간다', () => {
    const w = enemyWorld();
    const e = w.enemy!;
    addUnits(w, 'rifleman', 'enemy', 6, 44, 16);
    e.nextAttackAt = 0;
    e.boldness = 1.5;
    e.patienceUntil = Infinity;
    // 내 힘 = 지휘관 3 → 필요 4.5, 적 8
    expect(readyToAttack(w, e, 1, homeArmy(w, e))).toBe(true);
  });
});

describe('적 확장', () => {
  function readyToExpand(w: World): void {
    const e = w.enemy!;
    e.nextExpandAt = 0;
    e.buildIndex = MAP3_ENEMY.buildOrder.length; // 대본은 끝난 것으로
    e.stock.mineral = 2000;
    addUnits(w, 'worker', 'enemy', ENEMY_EXPAND.workersPerBase - 6, 56, 14);
  }

  it('일꾼이 찼으면 남동 확장 자리에 사령부를 짓는다', () => {
    const w = enemyWorld();
    readyToExpand(w);
    run(w, 8);
    const cc = w.buildings.find((b) => b.owner === 'enemy' && b.kind === 'commandCenter' && b.x === 57 && b.y === 36);
    expect(cc).toBeDefined();
  });

  it('확장 자리 곁에 내 유닛이 있으면 다음 자리로', () => {
    const w = enemyWorld();
    readyToExpand(w);
    addUnits(w, 'rifleman', 'player', 1, 58, 40);
    run(w, 8);
    const spots = w.buildings.filter((b) => b.owner === 'enemy' && b.kind === 'commandCenter').map((b) => `${b.x},${b.y}`);
    expect(spots).toContain('4,4');
    expect(spots).not.toContain('57,36');
  });
});
