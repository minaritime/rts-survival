import { BUILDINGS, type BuildingKind } from '../data/buildings.ts';
import { COMMANDER } from '../data/commander.ts';
import { CREATURES, GRAZER, type CreatureKind } from '../data/monsters.ts';
import { BERRY, DEBRIS } from '../data/resources.ts';
import { UNITS, type TrainableKind, type UnitKind } from '../data/units.ts';
import type { Point } from './grid.ts';

/** 유닛이 지금 하라고 받은 일 */
export type Order =
  | { readonly type: 'idle' }
  | { readonly type: 'move'; readonly target: Point }
  | { readonly type: 'gather'; readonly nodeId: number }
  | { readonly type: 'build'; readonly buildingId: number }
  /** 괴물·사냥감 하나를 쫓아가 공격 */
  | { readonly type: 'attack'; readonly targetId: number }
  /** 공격하며 이동: 가는 길에 괴물을 만나면 싸우고, 다 잡으면 다시 간다 */
  | { readonly type: 'attackMove'; readonly target: Point }
  /** 다 지은 내 건물을 미네랄을 써서 고친다 */
  | { readonly type: 'repair'; readonly buildingId: number };

/**
 * 건물. (x, y) 는 왼쪽 위 칸, width x height 칸을 차지한다.
 * 놓는 순간 생기고(progress 0) 일꾼이 곁에서 지으면 progress 가 1 까지 오른다.
 */
export interface Building {
  readonly id: number;
  readonly kind: BuildingKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  hp: number;
  readonly maxHp: number;
  /** 0 ~ 1 */
  progress: number;
  complete: boolean;
  /** 생산 줄 (맨 앞이 지금 만드는 것) */
  trainQueue: TrainableKind[];
  /** 맨 앞 유닛을 얼마나 만들었는지 (0 ~ 1) */
  trainProgress: number;
  /** 맨 앞 유닛이 보급을 차지하고 만들기 시작했는지 (보급이 모자라면 시작 못 함) */
  trainStarted: boolean;
  /** 집결 지점: 나온 유닛이 갈 곳 (땅) 또는 캘 자원 */
  rally: Rally | null;
  /** 혼자 지어지는 건물 (첫 사령부). 곁에 짓는 유닛이 없어도 진행된다 */
  readonly selfBuild: boolean;
  /** 공격하는 건물(포탑)이 다시 쏘기까지 남은 초 */
  cooldown: number;
}

export type Rally = { readonly kind: 'point'; readonly x: number; readonly y: number } | { readonly kind: 'node'; readonly nodeId: number };

/** 지을 때 체력은 10% 에서 시작해 진행률만큼 찬다 (스타식) */
export const BUILD_START_HP_RATIO = 0.1;

export function createBuilding(id: number, kind: BuildingKind, at: Point, selfBuild = false): Building {
  const spec = BUILDINGS[kind];
  return {
    id,
    kind,
    x: at.x,
    y: at.y,
    width: spec.width,
    height: spec.height,
    hp: Math.round(spec.maxHp * BUILD_START_HP_RATIO),
    maxHp: spec.maxHp,
    progress: 0,
    complete: false,
    trainQueue: [],
    trainProgress: 0,
    trainStarted: false,
    rally: null,
    selfBuild,
    cooldown: 0,
  };
}

export type { UnitKind } from '../data/units.ts';

/**
 * 움직이는 것. 위치는 칸 좌표(정수 = 칸 한가운데)를 소수로 가진다.
 * prevX/prevY 는 직전 틱 위치 (화면이 틱 사이를 부드럽게 그리는 데 씀).
 */
export interface Unit {
  readonly id: number;
  readonly kind: UnitKind;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  hp: number;
  readonly maxHp: number;
  order: Order;
  /** 남은 경로 (다음에 밟을 칸부터) */
  path: Point[];
  /** 채집 같은 작업이 얼마나 진행됐는지 (초) */
  workSeconds: number;
  /** Shift 로 줄 세운 짓기 (건물 id). 지금 짓는 것이 끝나면 차례로 */
  buildQueue: number[];
  /** 일꾼이 들고 있는 미네랄 (사령부에 내려놓으면 0) */
  carry: number;
  /** 다시 쏘기까지 남은 초 */
  cooldown: number;
  /**
   * 스스로 붙은 싸움 상대 (가만히 있다가 알아챈 괴물, 공격하며 이동 중 만난 괴물).
   * 명령으로 정한 상대는 order.attack 에 있다
   */
  engageId: number | null;
  /** 쫓아갈 길이 없던 상대와 그 상대를 다시 노려 볼 틱 (그전까지는 알아채지 않음) */
  unreachableId: number | null;
  unreachableUntil: number;
}

/** meat = 사냥감을 잡으면 남는 고기 (지휘관이 주워 먹는다) */
export type NodeKind = 'mineral' | 'berry' | 'debris' | 'meat';

/** 채집할 수 있는 것. 칸 하나를 차지하고 그 칸은 지나갈 수 없다. */
export interface ResourceNode {
  readonly id: number;
  readonly kind: NodeKind;
  readonly x: number;
  readonly y: number;
  /** 남은 양. 미네랄은 고갈이 없어서 Infinity */
  amount: number;
  /** 열매 덤불: 비운 횟수 (다시 차는 시간이 길어짐) */
  timesEmptied: number;
  /** 열매 덤불: 다시 차는 시각 (초). 차 있으면 null */
  regrowAt: number | null;
}

function createUnitWith(id: number, kind: UnitKind, at: Point, maxHp: number): Unit {
  return {
    id,
    kind,
    x: at.x,
    y: at.y,
    prevX: at.x,
    prevY: at.y,
    hp: maxHp,
    maxHp,
    order: { type: 'idle' },
    path: [],
    workSeconds: 0,
    buildQueue: [],
    carry: 0,
    cooldown: 0,
    engageId: null,
    unreachableId: null,
    unreachableUntil: 0,
  };
}

export function createCommander(id: number, at: Point): Unit {
  return createUnitWith(id, 'commander', at, COMMANDER.maxHp);
}

/** 건물에서 뽑은 유닛 */
export function createTrainedUnit(id: number, kind: TrainableKind, at: Point): Unit {
  return createUnitWith(id, kind, at, UNITS[kind].maxHp);
}

/** 건물을 지을 수 있는 유닛 */
export function canBuild(unit: Unit): boolean {
  return unit.kind === 'commander' || unit.kind === 'worker';
}

/** 이 자원을 캘 수 있는지: 지휘관은 손으로 전부, 일꾼은 미네랄만(사령부로 나름), 전투 유닛은 못 캠 */
export function canGather(unit: Unit, kind: NodeKind): boolean {
  return unit.kind === 'commander' || (unit.kind === 'worker' && kind === 'mineral');
}

/**
 * 괴물과 사냥감. 내 유닛과 달리 칸을 막지 않고 서로 겹쳐 지나간다.
 * 위치는 칸 좌표(소수). targetId 는 지금 노리는 내 유닛·건물.
 */
export interface Creature {
  readonly id: number;
  readonly kind: CreatureKind;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  hp: number;
  readonly maxHp: number;
  path: Point[];
  targetId: number | null;
  cooldown: number;
  /** 다음에 길을 다시 찾는 시각 (초) */
  repathAt: number;
  /** 사냥감이 어슬렁거리는 중심 */
  readonly home: Point;
  /** 퇴각 중 (6단계). 맵 밖으로 나가면 사라진다 */
  retreating: boolean;
}

export function createCreature(id: number, kind: CreatureKind, at: Point): Creature {
  const spec = CREATURES[kind];
  return {
    id,
    kind,
    x: at.x,
    y: at.y,
    prevX: at.x,
    prevY: at.y,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    path: [],
    targetId: null,
    cooldown: 0,
    repathAt: 0,
    home: { x: at.x, y: at.y },
    retreating: false,
  };
}

export function isMonster(c: Creature): boolean {
  return c.kind !== 'grazer';
}

const START_AMOUNT: Readonly<Record<NodeKind, number>> = {
  mineral: Infinity,
  berry: BERRY.startFruit,
  debris: DEBRIS.mineral,
  meat: GRAZER.meat,
};

export function createNode(id: number, kind: NodeKind, at: Point): ResourceNode {
  return { id, kind, x: at.x, y: at.y, amount: START_AMOUNT[kind], timesEmptied: 0, regrowAt: null };
}

/** 하던 일을 그만두고 선다 */
export function goIdle(unit: Unit): void {
  unit.order = { type: 'idle' };
  unit.engageId = null;
  unit.path = [];
  unit.workSeconds = 0;
}

/** 유닛이 서 있는 칸 */
export function unitTile(unit: Unit): Point {
  return { x: Math.round(unit.x), y: Math.round(unit.y) };
}

/** 두 칸이 8방향으로 맞닿아 있는지 (같은 칸은 아님) */
export function isTouching(a: Point, b: Point): boolean {
  const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  return d === 1;
}
