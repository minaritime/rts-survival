import { describe, expect, it } from 'vitest';
import { ENEMY_ATTACK, ENEMY_EXPAND, ENEMY_GROW } from '../src/data/enemy.ts';
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

describe('적은 내 병력을 모르고 스스로 정한 규모로 공격', () => {
  it('시드가 다르면 첫 공격 시각·규모가 다르고, 같으면 같다', () => {
    const a = enemyWorld(1).enemy!;
    const b = enemyWorld(2).enemy!;
    const a2 = enemyWorld(1).enemy!;
    expect(a.nextAttackAt).not.toBe(b.nextAttackAt);
    expect(a.nextAttackAt).toBe(a2.nextAttackAt);
    expect(a.waveSize).toBe(a2.waveSize);
    for (const e of [a, b]) {
      expect(e.nextAttackAt).toBeGreaterThanOrEqual(ENEMY_ATTACK.firstEarliest[0]);
      expect(e.nextAttackAt).toBeLessThanOrEqual(ENEMY_ATTACK.firstEarliest[1]);
      expect(e.waveSize).toBeGreaterThanOrEqual(ENEMY_ATTACK.firstWave[0]);
    }
  });

  it('내 병력이 많든 적든 같은 판단: 규모가 차면 가고, 모자라면 인내심이 다할 때까지 기다린다', () => {
    const w = enemyWorld();
    const e = w.enemy!;
    addUnits(w, 'rifleman', 'enemy', 6, 44, 16);
    e.nextAttackAt = 0;
    e.patienceUntil = 100;
    e.waveSize = 6;
    expect(readyToAttack(e, 50, homeArmy(w, e))).toBe(true);
    addUnits(w, 'rifleman', 'player', 30, 10, 40); // 내 병력을 늘려도
    expect(readyToAttack(e, 50, homeArmy(w, e))).toBe(true);
    e.waveSize = 10;
    expect(readyToAttack(e, 50, homeArmy(w, e))).toBe(false);
    expect(readyToAttack(e, 100, homeArmy(w, e))).toBe(true);
  });

  it('공격대는 내 시작 자리로 찾아가 본 것을 친다', () => {
    const w = enemyWorld();
    const e = w.enemy!;
    addUnits(w, 'rifleman', 'enemy', 8, 44, 16);
    e.nextAttackAt = 0;
    e.waveSize = 6;
    e.nextThinkAt = 0;
    run(w, 1);
    expect(e.attacksLaunched).toBe(1);
    const start = w.map.features.start;
    const squad = w.units.filter((u) => e.attackers.includes(u.id));
    expect(squad.every((u) => u.order.type === 'attackMove' && Math.hypot(u.order.target.x - start.x, u.order.target.y - start.y) < 4)).toBe(true);
  });
});

describe('적 확장·발전', () => {
  function readyToExpand(w: World): void {
    const e = w.enemy!;
    e.nextExpandAt = 0;
    e.buildIndex = MAP3_ENEMY.buildOrder.length; // 대본은 끝난 것으로
    e.stock.mineral = 2000;
    addUnits(w, 'worker', 'enemy', ENEMY_EXPAND.workersPerBase, 56, 14);
  }

  it('일꾼이 찼으면 남동 확장 자리에 사령부를 짓는다', () => {
    const w = enemyWorld();
    readyToExpand(w);
    run(w, 8);
    const cc = w.buildings.find((b) => b.owner === 'enemy' && b.kind === 'commandCenter' && b.x === 57 && b.y === 36);
    expect(cc).toBeDefined();
  });

  it('내가 그 자리를 먼저 차지했으면 다음 자리로', () => {
    const w = enemyWorld();
    readyToExpand(w);
    const mine = createBuilding(w.nextId++, 'commandCenter', { x: 57, y: 36 });
    addBuilding(w, mine);
    run(w, 8);
    const spots = w.buildings.filter((b) => b.owner === 'enemy' && b.kind === 'commandCenter').map((b) => `${b.x},${b.y}`);
    expect(spots).toContain('4,4');
  });

  it('미네랄이 쌓이면 병영을 더 짓는다 (최대 3)', () => {
    const w = enemyWorld();
    const e = w.enemy!;
    e.buildIndex = MAP3_ENEMY.buildOrder.length;
    e.nextExpandAt = Infinity;
    e.stock.mineral = 5000;
    addUnits(w, 'worker', 'enemy', 8, 56, 14);
    run(w, 200);
    expect(w.buildings.filter((b) => b.owner === 'enemy' && b.kind === 'barracks')).toHaveLength(ENEMY_GROW.maxBarracks);
  });
});
