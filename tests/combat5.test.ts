import { describe, expect, test } from 'vitest';
import { BUILDINGS } from '../src/data/buildings.ts';
import { START } from '../src/data/commander.ts';
import { CREATURES, GRAZER, WAVES } from '../src/data/monsters.ts';
import { REPAIR } from '../src/data/combat.ts';
import {
  commandAttack,
  commandAttackMove,
  commandBuild,
  commandMove,
  commandRepair,
  commandSmart,
} from '../src/sim/commands.ts';
import { createCreature, createTrainedUnit, isMonster, type Building, type Creature } from '../src/sim/entities.ts';
import type { CreatureKind } from '../src/data/monsters.ts';
import { createWorld, type World } from '../src/sim/world.ts';
import { UNITS } from '../src/data/units.ts';
import { canPlace, commandStop, commandTrain } from '../src/sim/commands.ts';
import { parseMap } from '../src/sim/mapLoader.ts';
import { MAP1_ROWS } from '../src/maps/map1.ts';
import { waveComposition, waveValue, waveWarning } from '../src/sim/systems/waves.ts';
import { commander, newWorld, run, runUntil } from './helpers.ts';

function spawn(world: World, kind: CreatureKind, x: number, y: number): Creature {
  const c = createCreature(world.nextId++, kind, { x, y });
  world.creatures.push(c);
  return c;
}

const monsters = (world: World) => world.creatures.filter(isMonster);

/** 지휘관을 멀리(남쪽 풀밭) 보내 둔다. 싸움에 끼지 않게 */
function sendCommanderAway(world: World): void {
  commander(world).x = 5;
  commander(world).y = 44;
  commander(world).prevX = 5;
  commander(world).prevY = 44;
}

/** 튜토리얼 규칙으로 빨리 지어 둔 건물 */
function quickBuild(world: World, kind: Parameters<typeof commandBuild>[2], at: { x: number; y: number }): Building {
  world.stock.mineral += BUILDINGS[kind].mineral;
  world.tutorialRules = true;
  const b = commandBuild(world, [world.commanderId], kind, at);
  if (!b) throw new Error(`${kind} 을 ${at.x},${at.y} 에 못 지음`);
  runUntil(world, () => b.complete, 60);
  world.tutorialRules = false;
  return b;
}

describe('공격 일정 (기획.md 8-1)', () => {
  test('가치 = 4 x 1.3^(n-1): 첫 공격 떼거리 4, 3번째부터 돌진형, 7번째(15:00) 가치 약 19', () => {
    expect(waveComposition(1)).toEqual({ swarm: 4, charger: 0 });
    expect(waveComposition(2).charger).toBe(0);
    expect(waveComposition(3).charger).toBeGreaterThanOrEqual(1);
    expect(waveValue(7)).toBeCloseTo(19.3, 1);
    const c7 = waveComposition(7);
    const value = c7.swarm * CREATURES.swarm.value + c7.charger * CREATURES.charger.value;
    expect(Math.abs(value - waveValue(7))).toBeLessThanOrEqual(1);
  });

  test('꺼져 있으면(기본, 튜토리얼) 공격이 오지 않는다', () => {
    const world = newWorld();
    run(world, WAVES.firstSeconds + 5);
    expect(monsters(world)).toHaveLength(0);
  });

  test('켜면 6:00 에 정해 둔 방향 입구에서 떼거리 4마리, 30초 전부터 경고', () => {
    const world = newWorld();
    world.waves.enabled = true;
    sendCommanderAway(world);
    const dir = world.waves.direction;
    run(world, WAVES.firstSeconds - WAVES.warnSeconds - 1);
    expect(waveWarning(world, WAVES.firstSeconds - WAVES.warnSeconds - 1)).toBeNull();
    run(world, 2);
    expect(waveWarning(world, WAVES.firstSeconds - WAVES.warnSeconds + 1)?.direction).toBe(dir);
    run(world, WAVES.warnSeconds);
    const spawned = monsters(world);
    expect(spawned).toHaveLength(4);
    const gates = world.map.features.entrances[dir];
    for (const m of spawned) {
      expect(gates.some((g) => Math.hypot(g.x - m.x, g.y - m.y) < 6)).toBe(true);
    }
    expect(world.waves.number).toBe(2);
    expect(world.waves.nextAt).toBe(WAVES.firstSeconds + WAVES.intervalSeconds);
  });

  test('같은 시드면 공격 방향 순서가 같다', () => {
    const order = (seed: number) => {
      const w = createWorld(parseMap(MAP1_ROWS), seed);
      w.waves.enabled = true;
      sendCommanderAway(w);
      const dirs: string[] = [];
      for (let i = 0; i < 4; i++) {
        dirs.push(w.waves.direction);
        w.waves.nextAt = w.tick / 20 + 0.05;
        run(w, 0.1);
        w.creatures.splice(0); // 괴물은 치우고 방향만 본다
      }
      return dirs.join(',');
    };
    expect(order(7)).toBe(order(7));
  });
});

describe('괴물', () => {
  test('가장 가까운 내 건물로 가서 부순다. 사령부가 부서지면 식량 한도도 돌아간다', () => {
    const world = newWorld();
    const cc = quickBuild(world, 'commandCenter', { x: 10, y: 20 });
    world.stock.food = 45;
    expect(world.foodCap).toBe(BUILDINGS.commandCenter.foodCap);
    sendCommanderAway(world);
    for (let i = 0; i < 6; i++) spawn(world, 'charger', 20 + i * 0.3, 21);
    runUntil(world, () => !world.buildings.includes(cc), 120);
    expect(world.stats.buildingsLost).toBe(1);
    expect(world.foodCap).toBe(START.pocketFoodCap);
    expect(world.stock.food).toBeLessThanOrEqual(START.pocketFoodCap);
  });

  test('돌진형은 건물에 두 배 피해', () => {
    const world = newWorld();
    const wall = quickBuild(world, 'barricade', { x: 20, y: 20 });
    sendCommanderAway(world);
    spawn(world, 'charger', 21, 20);
    const before = wall.hp;
    runUntil(world, () => wall.hp < before, 5);
    expect(before - wall.hp).toBe(CREATURES.charger.attack!.damage * 2);
  });

  test('길목을 벽으로 막으면 벽을 부수고 들어온다', () => {
    const world = newWorld();
    quickBuild(world, 'commandCenter', { x: 10, y: 20 });
    // 북쪽 길목 x26~29, y12 를 간이벽으로 막는다
    const walls = [26, 27, 28, 29].map((x) => quickBuild(world, 'barricade', { x, y: 12 }));
    // 동쪽 길목 x44, y20~23 도 막는다
    [20, 21, 22, 23].forEach((y) => quickBuild(world, 'barricade', { x: 44, y }));
    sendCommanderAway(world);
    spawn(world, 'charger', 27, 3);
    runUntil(world, () => walls.some((w) => w.hp < w.maxHp), 60);
  });

  test('지휘관이 맞아 죽으면 패배', () => {
    const world = newWorld();
    const c = commander(world);
    c.hp = 10;
    for (let i = 0; i < 5; i++) spawn(world, 'swarm', c.x + 1, c.y);
    runUntil(world, () => world.outcome === 'defeat', 10);
  });

  test('배급처 4칸 안에 괴물이 있으면 막혀서 식량이 안 나온다', () => {
    const world = newWorld();
    quickBuild(world, 'campfire', { x: 12, y: 27 });
    const feeder = world.feeders.find((f) => f.x === 10 && f.y === 28)!;
    sendCommanderAway(world);
    world.stock.food = 0;
    run(world, 6);
    expect(feeder.active).toBe(true);
    expect(world.stock.food).toBeGreaterThan(0);
    const m = spawn(world, 'swarm', 8, 29);
    m.hp = 1e9; // 모닥불을 치는 동안 살아 있게
    world.stock.food = 0;
    run(world, 0.5);
    expect(feeder.blocked).toBe(true);
    const food = world.stock.food;
    run(world, 3);
    expect(world.stock.food).toBe(food);
  });
});

describe('내 유닛의 전투', () => {
  test('가만히 있는 지휘관은 다가온 떼거리를 쏜다 (10씩, 세 발이면 잡음)', () => {
    const world = newWorld();
    const c = commander(world);
    const m = spawn(world, 'swarm', c.x + 5, c.y);
    runUntil(world, () => !world.creatures.includes(m), 10);
    expect(world.stats.monstersKilled).toBe(1);
  });

  test('소총병 공격 명령: 쫓아가서 잡는다', () => {
    const world = newWorld();
    sendCommanderAway(world);
    const r = createTrainedUnit(world.nextId++, 'rifleman', { x: 14, y: 24 });
    world.units.push(r);
    const m = spawn(world, 'grazer', 25, 24);
    expect(commandAttack(world, [r.id], m.id)).toBe(true);
    runUntil(world, () => !world.creatures.includes(m), 30);
    run(world, 0.1); // 상대가 사라진 다음 틱에 선다
    expect(r.order.type).toBe('idle');
  });

  test('공격하며 이동: 가는 길의 괴물을 잡고 목적지까지 간다', () => {
    const world = newWorld();
    sendCommanderAway(world);
    const r = createTrainedUnit(world.nextId++, 'rifleman', { x: 14, y: 24 });
    world.units.push(r);
    const m = spawn(world, 'swarm', 24, 24);
    m.hp = 6; // 한 발
    commandAttackMove(world, [r.id], { x: 34, y: 24 });
    runUntil(world, () => r.order.type === 'idle', 40);
    expect(world.creatures.includes(m)).toBe(false);
    expect(Math.round(r.x)).toBe(34);
  });

  test('그냥 이동 명령 중에는 괴물을 무시한다', () => {
    const world = newWorld();
    sendCommanderAway(world);
    const r = createTrainedUnit(world.nextId++, 'rifleman', { x: 14, y: 24 });
    world.units.push(r);
    const m = spawn(world, 'grazer', 18, 24);
    commandMove(world, [r.id], { x: 34, y: 24 });
    run(world, 3);
    expect(m.hp).toBe(m.maxHp);
  });

  test('포탑은 사거리 7 안의 괴물을 쏜다', () => {
    const world = newWorld();
    quickBuild(world, 'commandCenter', { x: 10, y: 20 });
    const turret = quickBuild(world, 'turret', { x: 20, y: 22 });
    sendCommanderAway(world);
    const m = spawn(world, 'swarm', 27, 22);
    m.hp = 1000;
    run(world, 1.2);
    expect(m.hp).toBeLessThan(1000);
    expect(turret.cooldown).toBeGreaterThanOrEqual(0);
  });

  test('일꾼은 알아서 싸우지 않는다 (명령하면 싸움)', () => {
    const world = newWorld();
    sendCommanderAway(world);
    const w = createTrainedUnit(world.nextId++, 'worker', { x: 14, y: 24 });
    world.units.push(w);
    const g = spawn(world, 'grazer', 15, 24);
    run(world, 2);
    expect(g.hp).toBe(g.maxHp);
    commandAttack(world, [w.id], g.id);
    runUntil(world, () => g.hp < g.maxHp, 10);
  });
});

describe('사냥과 고기', () => {
  test('사냥감을 오른쪽 클릭하면 쏘고, 잡으면 고기 40 이 남고, 지휘관이 주워 먹는다', () => {
    const world = newWorld();
    const c = commander(world);
    const g = spawn(world, 'grazer', c.x + 3, c.y);
    expect(commandSmart(world, [c.id], { x: Math.round(g.x), y: Math.round(g.y) })).toBe(true);
    runUntil(world, () => world.stats.grazersHunted === 1, 20);
    const meat = world.nodes.find((n) => n.kind === 'meat')!;
    expect(meat.amount).toBe(GRAZER.meat);
    world.stock.food = 0;
    commandSmart(world, [c.id], { x: meat.x, y: meat.y });
    runUntil(world, () => world.stock.food >= START.pocketFoodCap - 1, 60);
    expect(world.nodes.find((n) => n.kind === 'meat')?.amount).toBe(GRAZER.meat - START.pocketFoodCap);
  });

  test('1맵에는 사냥감 6마리가 있고 처음 자리 둘레를 어슬렁거린다', () => {
    const world = newWorld();
    const grazers = world.creatures.filter((c) => c.kind === 'grazer');
    expect(grazers).toHaveLength(6);
    run(world, 30);
    for (const g of grazers) {
      expect(Math.max(Math.abs(g.x - g.home.x), Math.abs(g.y - g.home.y))).toBeLessThanOrEqual(GRAZER.wanderRadius + 0.01);
    }
    expect(grazers.some((g) => g.x !== g.home.x || g.y !== g.home.y)).toBe(true);
  });
});

describe('수리와 짓는 중 피해', () => {
  test('수리: 체력 1 당 미네랄 0.25, 다 채우면 선다', () => {
    const world = newWorld();
    const wall = quickBuild(world, 'barricade', { x: 16, y: 24 });
    wall.hp = 50;
    world.stock.mineral = 100;
    expect(commandRepair(world, [world.commanderId], wall.id)).toBe(true);
    runUntil(world, () => wall.hp === wall.maxHp, 30);
    expect(world.stock.mineral).toBeCloseTo(100 - (wall.maxHp - 50) * REPAIR.mineralPerHp, 5);
    expect(commander(world).order.type).toBe('idle');
  });

  test('다친 건물을 오른쪽 클릭하면 수리', () => {
    const world = newWorld();
    const wall = quickBuild(world, 'barricade', { x: 16, y: 24 });
    wall.hp = 100;
    commandSmart(world, [world.commanderId], { x: 16, y: 24 });
    expect(commander(world).order.type).toBe('repair');
  });

  test('짓는 중에 맞은 피해는 진행으로 사라지지 않는다', () => {
    const world = newWorld();
    world.stock.mineral = 1000;
    const first = commandBuild(world, [world.commanderId], 'commandCenter', { x: 10, y: 20 })!;
    runUntil(world, () => first.complete, 30);
    const depot = commandBuild(world, [world.commanderId], 'supplyDepot', { x: 16, y: 26 })!;
    run(world, 5);
    depot.hp -= 20;
    runUntil(world, () => depot.complete, 60);
    expect(depot.hp).toBe(depot.maxHp - 20);
  });
});

describe('리뷰 반영 (11/25)', () => {
  test('벽 너머라 갈 수 없는 괴물은 잠시 잊는다 (틱마다 길찾기 되풀이 안 함)', () => {
    const world = newWorld();
    // 소총병(20,24)을 간이벽 8개로 둘러싼다
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (dx !== 0 || dy !== 0) quickBuild(world, 'barricade', { x: 20 + dx, y: 24 + dy });
    }
    sendCommanderAway(world);
    const r = createTrainedUnit(world.nextId++, 'rifleman', { x: 20, y: 24 });
    world.units.push(r);
    // 사거리(5) 밖, 알아채는 거리(7) 안
    const m = spawn(world, 'swarm', 27, 24);
    m.hp = 1e9;
    run(world, 0.1);
    expect(r.unreachableId).toBe(m.id);
    expect(r.unreachableUntil).toBeGreaterThan(world.tick);
    expect(r.engageId).toBeNull();
  });

  test('건물이 부서지면 생산 줄의 미네랄을 돌려준다', () => {
    const world = newWorld();
    const cc = quickBuild(world, 'commandCenter', { x: 10, y: 20 });
    world.stock.mineral = 500;
    commandTrain(world, cc.id, 'worker');
    commandTrain(world, cc.id, 'worker');
    const after = world.stock.mineral;
    cc.hp = 0;
    run(world, 0.05);
    expect(world.stock.mineral).toBe(after + UNITS.worker.mineral * 2);
  });

  test('괴물이 서 있는 자리에는 못 짓는다', () => {
    const world = newWorld();
    spawn(world, 'grazer', 20, 20);
    expect(canPlace(world, 'barricade', { x: 20, y: 20 })).toBe(false);
    expect(canPlace(world, 'barricade', { x: 24, y: 20 })).toBe(true);
  });

  test('정지는 스스로 붙은 싸움도 끊는다', () => {
    const world = newWorld();
    const c = commander(world);
    c.engageId = 12345;
    commandStop(world, [c.id]);
    expect(c.engageId).toBeNull();
  });
});

describe('강제 공격 (11/25 사용자 요청)', () => {
  test('A 다음 내 건물: 다가가서 부순다. 오른쪽 클릭으로는 부수지 않는다', () => {
    const world = newWorld();
    const wall = quickBuild(world, 'barricade', { x: 20, y: 24 });
    const r = createTrainedUnit(world.nextId++, 'rifleman', { x: 14, y: 24 });
    world.units.push(r);
    commandSmart(world, [r.id], { x: 20, y: 24 });
    run(world, 3);
    expect(wall.hp).toBe(wall.maxHp);
    expect(commandAttack(world, [r.id], wall.id)).toBe(true);
    runUntil(world, () => !world.buildings.includes(wall), 60);
    expect(world.stats.buildingsLost).toBe(1);
    run(world, 0.1);
    expect(r.order.type).toBe('idle');
  });
});
