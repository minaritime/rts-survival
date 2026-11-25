import type { BuildingKind } from './buildings.ts';
import type { UnitKind } from './units.ts';

/** 한 번 공격: 피해, 사거리(칸), 다시 쏘기까지(초). buildingFactor 는 건물에 줄 때 배율 */
export interface AttackSpec {
  readonly damage: number;
  readonly range: number;
  readonly cooldown: number;
  readonly buildingFactor?: number;
}

/** 내 유닛 공격 (기획.md 3장 지휘관, 5-1 유닛표). 장갑 종류는 시제품에서 빼고 전부 보통 공격 */
export const UNIT_ATTACK: Readonly<Record<UnitKind, AttackSpec>> = {
  commander: { damage: 10, range: 4, cooldown: 1 },
  worker: { damage: 5, range: 1, cooldown: 1 },
  rifleman: { damage: 6, range: 5, cooldown: 1 },
};

/** 공격하는 건물 (기획.md 6장) */
export const BUILDING_ATTACK: Readonly<Partial<Record<BuildingKind, AttackSpec>>> = {
  scrapTurret: { damage: 6, range: 5, cooldown: 1 },
  turret: { damage: 10, range: 7, cooldown: 1 },
};

/** 가만히 있는 유닛이 괴물을 알아채는 거리 = 사거리 + 이 값. 쫓아가다 사거리 + LEASH 를 넘으면 놓아 줌 */
export const AUTO_ACQUIRE_EXTRA = 2;
export const LEASH_EXTRA = 4;

/** 사거리 판정 여유: 칸 한가운데끼리 재므로 옆 칸(대각선 1.41)도 사거리 1 안에 들게 */
export const RANGE_SLACK = 0.5;

/** 수리 (기획.md 6장): 체력 1 당 미네랄 0.25, 짓는 속도와 같은 빠르기 */
export const REPAIR = { mineralPerHp: 0.25 } as const;
