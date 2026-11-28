import type { TrainableKind } from './units.ts';

/** 건물 수치 (기획.md 6장). 크기(칸)는 시제품에서 정함 */
export type BuildingKind =
  | 'campfire'
  | 'barricade'
  | 'scrapTurret'
  | 'commandCenter'
  | 'supplyDepot'
  | 'barracks'
  | 'turret'
  | 'infantryLab';

export interface BuildingSpec {
  readonly name: string;
  /** 차지하는 칸 (가로 x 세로) */
  readonly width: number;
  readonly height: number;
  readonly mineral: number;
  readonly buildSeconds: number;
  readonly maxHp: number;
  /** 다 지으면 식량 저장 한도가 이 값 이상이 된다 */
  readonly foodCap?: number;
  /** 다 지으면 보급(인구 상한)이 이만큼 는다 */
  readonly supply?: number;
  /**
   * 미네랄과 이 칸 거리(체비셰프) 미만으로 붙여 지을 수 없다 (스타처럼 본진 건물은 자원과 떨어져야 함).
   * 3 이면 사이에 두 칸이 비어 일꾼이 오갈 길이 생긴다.
   */
  readonly minResourceDistance?: number;
  /** 이 건물들이 다 지어져 있어야 지을 수 있다 */
  readonly requires?: readonly BuildingKind[];
  /** 이 칸 거리 안에 있는 지휘관의 체력을 회복한다 */
  readonly healRadius?: number;
  /** 이 건물에서 뽑는 유닛 */
  readonly trains?: readonly TrainableKind[];
}

export const BUILDINGS: Readonly<Record<BuildingKind, BuildingSpec>> = {
  campfire: { name: '모닥불', width: 1, height: 1, mineral: 20, buildSeconds: 10, maxHp: 80, healRadius: 2 },
  barricade: { name: '간이벽', width: 1, height: 1, mineral: 10, buildSeconds: 4, maxHp: 150 },
  scrapTurret: { name: '간이 포탑', width: 1, height: 1, mineral: 75, buildSeconds: 20, maxHp: 150 },
  commandCenter: {
    name: '사령부',
    width: 3,
    height: 3,
    mineral: 250,
    buildSeconds: 60,
    maxHp: 1000,
    foodCap: 50,
    supply: 10,
    minResourceDistance: 3,
    healRadius: 2,
    trains: ['worker'],
  },
  supplyDepot: {
    name: '보급고',
    width: 2,
    height: 2,
    mineral: 100,
    buildSeconds: 25,
    maxHp: 300,
    supply: 8,
    requires: ['commandCenter'],
  },
  barracks: {
    name: '병영',
    width: 3,
    height: 3,
    mineral: 150,
    buildSeconds: 45,
    maxHp: 800,
    requires: ['commandCenter'],
    trains: ['rifleman', 'assault'],
  },
  turret: { name: '포탑', width: 2, height: 2, mineral: 100, buildSeconds: 25, maxHp: 300, requires: ['commandCenter'] },
  /** 테크 건물 (기획.md 6장). 다 지어야 병영에서 돌격병이 나온다 (2026-11-28 사용자 확정) */
  infantryLab: { name: '보병 연구소', width: 2, height: 2, mineral: 125, buildSeconds: 40, maxHp: 600, requires: ['barracks'] },
};

/** 보급 최대 (스타식) */
export const SUPPLY_MAX = 200;

/**
 * 판에서 처음 놓는 사령부 (사용자 요청 2026-11-24): 놓으면 혼자 빨리 지어지고, 지휘관은 바로 탐험하러 갈 수 있다.
 * 부서진 뒤 다시 짓는 사령부는 보통대로 (지휘관·일꾼이 곁에서 60초).
 */
export const FIRST_COMMAND_CENTER = { buildSeconds: 10 } as const;

/** 짓는 중 취소하면 낸 미네랄의 이만큼 돌려받는다 (스타처럼 75%, 2026-11-28) */
export const BUILD_CANCEL_REFUND = 0.75;

/** 지휘관 회복 (기획.md 3장: 모닥불·사령부 곁에서 초당 2) */
export const HEAL_PER_SECOND = 2;

/** 식량 배급처 (기획.md 4-2): 이 칸 거리 안에 다 지은 내 건물이 있으면 켜지고 분당 이만큼 식량을 준다 */
export const FEEDER = { activateRadius: 6, foodPerMinute: 10, blockRadius: 4 } as const;
