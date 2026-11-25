import { BUILDINGS, SUPPLY_MAX } from '../data/buildings.ts';
import { TICKS_PER_SECOND, TICK_SECONDS } from '../data/constants.ts';
import { UNITS } from '../data/units.ts';
import { COMMANDER, START } from '../data/commander.ts';
import { WAVES } from '../data/monsters.ts';
import {
  createCommander,
  createCreature,
  createNode,
  type Building,
  type Creature,
  type NodeKind,
  type ResourceNode,
  type Unit,
} from './entities.ts';
import { pickOne } from './random.ts';
import { stepCreatures } from './systems/creatures.ts';
import { removeDead, stepTurrets } from './systems/combat.ts';
import { stepWaves } from './systems/waves.ts';
import { inBounds, isPassable, tileIndex, type Point } from './grid.ts';
import type { MapDef } from './mapLoader.ts';
import { stepBerries } from './systems/berries.ts';
import { stepProduction } from './systems/production.ts';
import { stepSelfBuild } from './systems/construction.ts';
import { stepFeeders, stepHealing } from './systems/support.ts';
import { stepHunger } from './systems/hunger.ts';
import { stepUnits } from './systems/units.ts';

export type Outcome = 'playing' | 'defeat' | 'victory';

/** 식량 배급처 (생존형 맵). 켜지면 식량이 들어온다 */
export interface Feeder {
  readonly x: number;
  readonly y: number;
  active: boolean;
  /** 괴물이 근처에 있어 막힘 (5단계) */
  blocked: boolean;
}

export interface Stock {
  mineral: number;
  food: number;
}

/** 한 판 동안 쌓이는 기록. 튜토리얼 목표·추가 목표 판정에 쓴다 */
export interface Stats {
  /** 미네랄 덩어리에서 캔 양 (잔해에서 얻은 것은 빼고) */
  mineralMined: number;
  /** 열매를 딴 횟수 */
  berriesPicked: number;
  /** 뒤진 잔해 수 */
  debrisLooted: number;
  /** 다 지은 건물 수 */
  buildingsCompleted: number;
  /** 일꾼이 사령부에 날라 온 미네랄 */
  workerMineral: number;
  /** 건물에서 뽑은 유닛 수 */
  unitsTrained: number;
  /** 잡은 괴물 수 */
  monstersKilled: number;
  /** 잡은 사냥감 수 */
  grazersHunted: number;
  /** 잃은 내 유닛 수 (지휘관 빼고) */
  unitsLost: number;
  /** 부서진 내 건물 수 */
  buildingsLost: number;
}

/** 괴물 입구 방향 (map.features.entrances 의 키) */
export type Direction = 'north' | 'east';

/** 생존형 괴물 공격 일정 (data/monsters.ts WAVES) */
export interface WaveState {
  /** 꺼져 있으면 공격이 오지 않는다 (튜토리얼·테스트). 화면 쪽이 1스테이지에서 켠다 */
  enabled: boolean;
  /** 다음 공격이 몇 번째인지 (1부터) */
  number: number;
  /** 다음 공격 시각 (초) */
  nextAt: number;
  /** 지난 공격 시각 (아직 없으면 0 = 판 시작). 다음 공격까지 막대에 씀 */
  lastAt: number;
  /** 다음 공격이 오는 방향 (30초 전에 알린다) */
  direction: Direction;
  /** 생존형: 이 시각(초)까지 버티면 괴물이 물러가고 승리. null 이면 끝없음 */
  surviveSeconds: number | null;
  /** 괴물이 물러가기 시작한 시각. 아직이면 null */
  retreatAt: number | null;
}

/** 화면에 잠깐 그리는 공격 (총알 선·근접 타격). 규칙에는 영향 없음 */
export interface Shot {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly tick: number;
  /** 근접 공격(괴물·일꾼)이면 true */
  readonly melee: boolean;
}

/**
 * 한 판의 전체 상태.
 * 규칙은 틱마다 이 객체를 직접 고친다 (유닛 수백 기를 매 틱 복사하지 않기 위해).
 * 화면(view)은 읽기만 한다.
 */
export interface World {
  tick: number;
  readonly map: MapDef;
  readonly units: Unit[];
  /** 괴물과 사냥감 */
  readonly creatures: Creature[];
  readonly nodes: ResourceNode[];
  readonly buildings: Building[];
  readonly feeders: Feeder[];
  readonly stock: Stock;
  readonly stats: Stats;
  foodCap: number;
  /** 지휘관 배부름 (0 ~ COMMANDER.maxSatiety) */
  satiety: number;
  readonly commanderId: number;
  outcome: Outcome;
  /** 튜토리얼 동안 켜짐: 짓기·채집이 빨라진다 (data/tutorial.ts). 튜토리얼이 끝나면 화면 쪽이 끈다 */
  tutorialRules: boolean;
  readonly waves: WaveState;
  /** 시드 고정 난수 상태 (random.ts) */
  rngState: number;
  /** 최근 몇 틱의 공격 (화면 효과용) */
  shots: Shot[];
  /** 이 판에서 사령부를 한 번이라도 놓았는지 (첫 사령부만 혼자 빨리 지어짐) */
  commandCenterPlaced: boolean;
  /** 자원·건물이 막고 있는 칸 (tileIndex). 지형 절벽은 map.grid 가 따로 막음 */
  readonly occupied: Set<number>;
  nextId: number;
}

function addNodes(world: World, kind: NodeKind, points: readonly Point[]): void {
  for (const p of points) {
    world.nodes.push(createNode(world.nextId++, kind, p));
    world.occupied.add(tileIndex(world.map.grid, p.x, p.y));
  }
}

export function createWorld(map: MapDef, seed = 1): World {
  const commander = createCommander(1, map.features.start);
  const world: World = {
    tick: 0,
    map,
    units: [commander],
    creatures: [],
    nodes: [],
    buildings: [],
    feeders: map.features.feeders.map((p) => ({ x: p.x, y: p.y, active: false, blocked: false })),
    stock: { mineral: START.mineral, food: START.food },
    stats: {
      mineralMined: 0,
      berriesPicked: 0,
      debrisLooted: 0,
      buildingsCompleted: 0,
      workerMineral: 0,
      unitsTrained: 0,
      monstersKilled: 0,
      grazersHunted: 0,
      unitsLost: 0,
      buildingsLost: 0,
    },
    foodCap: START.pocketFoodCap,
    satiety: COMMANDER.maxSatiety,
    commanderId: commander.id,
    outcome: 'playing',
    tutorialRules: false,
    waves: { enabled: false, number: 1, nextAt: WAVES.firstSeconds, lastAt: 0, direction: 'north', surviveSeconds: null, retreatAt: null },
    rngState: seed,
    shots: [],
    commandCenterPlaced: false,
    occupied: new Set(map.features.feeders.map((p) => tileIndex(map.grid, p.x, p.y))),
    nextId: 2,
  };
  addNodes(world, 'mineral', map.features.minerals);
  addNodes(world, 'berry', map.features.berries);
  addNodes(world, 'debris', map.features.debris);
  for (const p of map.features.hunts) world.creatures.push(createCreature(world.nextId++, 'grazer', p));
  world.waves.direction = pickOne(world, entranceDirections(world));
  return world;
}

/** 이 지도에 괴물 입구가 있는 방향 */
export function entranceDirections(world: World): Direction[] {
  const e = world.map.features.entrances;
  return (['north', 'east'] as const).filter((d) => e[d].length > 0);
}

/** 유닛이 이 칸을 밟을 수 있는지 (지형 + 자원·건물) */
export function isWalkable(world: World, x: number, y: number): boolean {
  return isPassable(world.map.grid, x, y) && !world.occupied.has(tileIndex(world.map.grid, x, y));
}

export function findUnit(world: World, id: number): Unit | undefined {
  return world.units.find((u) => u.id === id);
}

export function findCreature(world: World, id: number): Creature | undefined {
  return world.creatures.find((c) => c.id === id);
}

/** 이 칸 위(반 칸 안)에 있는 괴물·사냥감 중 가장 가까운 것 */
export function creatureAt(world: World, x: number, y: number): Creature | undefined {
  let best: Creature | undefined;
  let bestD = 0.75;
  for (const c of world.creatures) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (c.hp > 0 && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

export function commanderOf(world: World): Unit | undefined {
  return findUnit(world, world.commanderId);
}

export function nodeAt(world: World, x: number, y: number): ResourceNode | undefined {
  if (!inBounds(world.map.grid, x, y)) return undefined;
  return world.nodes.find((n) => n.x === x && n.y === y);
}

/** 보급(인구 상한): 다 지은 건물이 주는 보급의 합, 최대 200 */
export function supplyCap(world: World): number {
  const total = world.buildings.reduce((sum, b) => sum + (b.complete ? (BUILDINGS[b.kind].supply ?? 0) : 0), 0);
  return Math.min(SUPPLY_MAX, total);
}

/**
 * 쓰는 보급: 살아 있는 생산 유닛 + 건물에서 만들기 시작한 유닛 (스타처럼 시작할 때 보급을 차지).
 * 지휘관은 보급을 쓰지 않는다
 */
export function supplyUsed(world: World): number {
  const units = world.units.reduce((sum, u) => sum + (u.kind !== 'commander' && u.hp > 0 ? UNITS[u.kind].supply : 0), 0);
  const training = world.buildings.reduce(
    (sum, b) => sum + (b.trainStarted && b.trainQueue[0] ? UNITS[b.trainQueue[0]].supply : 0),
    0,
  );
  return units + training;
}

/** 이 칸을 차지한 건물 */
export function buildingAt(world: World, x: number, y: number): Building | undefined {
  return world.buildings.find((b) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height);
}

/** 건물을 세우고 그 칸들을 막는다 */
export function addBuilding(world: World, building: Building): void {
  world.buildings.push(building);
  for (let y = building.y; y < building.y + building.height; y++) {
    for (let x = building.x; x < building.x + building.width; x++) world.occupied.add(tileIndex(world.map.grid, x, y));
  }
}

/** 건물을 없애고 그 칸들을 다시 연다 */
export function removeBuilding(world: World, building: Building): void {
  const i = world.buildings.indexOf(building);
  if (i >= 0) world.buildings.splice(i, 1);
  for (let y = building.y; y < building.y + building.height; y++) {
    for (let x = building.x; x < building.x + building.width; x++) world.occupied.delete(tileIndex(world.map.grid, x, y));
  }
}

export function removeNode(world: World, node: ResourceNode): void {
  const i = world.nodes.indexOf(node);
  if (i >= 0) world.nodes.splice(i, 1);
  world.occupied.delete(tileIndex(world.map.grid, node.x, node.y));
}

/** 한 틱 진행 */
export function stepWorld(world: World): void {
  if (world.outcome !== 'playing') return;
  world.tick += 1;
  const now = elapsedSeconds(world);
  stepProduction(world, TICK_SECONDS);
  stepSelfBuild(world, TICK_SECONDS);
  stepUnits(world, TICK_SECONDS, now);
  stepTurrets(world, TICK_SECONDS);
  // 공격 일정 먼저: 시간이 다 된 틱에는 괴물이 때리기 전에 물러가기 시작하게
  stepWaves(world, now);
  stepCreatures(world, TICK_SECONDS, now);
  removeDead(world);
  if (world.outcome !== 'playing') return;
  stepBerries(world, now);
  stepFeeders(world, TICK_SECONDS);
  stepHealing(world, TICK_SECONDS);
  stepHunger(world, TICK_SECONDS);
  // 화면 효과는 0.2초만 남긴다
  if (world.shots.length > 0) world.shots = world.shots.filter((s) => world.tick - s.tick < 4);
}

export function elapsedSeconds(world: World): number {
  return world.tick / TICKS_PER_SECOND;
}

/** 0:00 꼴 */
export function formatClock(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
