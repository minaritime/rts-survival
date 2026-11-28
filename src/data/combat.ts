import type { BuildingKind } from './buildings.ts';
import type { CreatureKind } from './monsters.ts';
import type { UnitKind } from './units.ts';

/** 공격 유형 (기획.md 5-1): 보통 / 대경장(경장에 +50%) / 대중장(중장에 +50%) */
export type DamageType = 'normal' | 'antiLight' | 'antiHeavy';
/** 장갑 (기획.md 5-1): 경장·중장 */
export type ArmorType = 'light' | 'heavy';

export const ARMOR_NAME: Readonly<Record<ArmorType, string>> = { light: '경장', heavy: '중장' };
export const DAMAGE_TYPE_NAME: Readonly<Record<DamageType, string>> = { normal: '보통', antiLight: '대경장', antiHeavy: '대중장' };

/** 맞는 장갑과 짝이 맞으면 피해 배율 */
export const ARMOR_BONUS = 1.5;

export function damageMultiplier(type: DamageType, armor: ArmorType): number {
  if (type === 'antiLight' && armor === 'light') return ARMOR_BONUS;
  if (type === 'antiHeavy' && armor === 'heavy') return ARMOR_BONUS;
  return 1;
}

/** 한 번 공격: 피해, 사거리(칸), 다시 쏘기까지(초). buildingFactor 는 건물에 줄 때 배율, type 이 없으면 보통 */
export interface AttackSpec {
  readonly damage: number;
  readonly range: number;
  readonly cooldown: number;
  readonly buildingFactor?: number;
  readonly type?: DamageType;
}

/** 유닛 장갑 (기획.md 5-1 표. 지휘관은 표에 없어 경장) */
export const UNIT_ARMOR: Readonly<Record<UnitKind, ArmorType>> = {
  commander: 'light',
  worker: 'light',
  rifleman: 'light',
  assault: 'heavy',
};

/** 괴물·사냥감 장갑 (기획서에 없어 2026-11-28 임시로 정함: 떼거리 경장, 돌진형 중장) */
export const CREATURE_ARMOR: Readonly<Record<CreatureKind, ArmorType>> = {
  swarm: 'light',
  charger: 'heavy',
  grazer: 'light',
};

/** 건물은 모두 중장 (스타처럼) */
export const BUILDING_ARMOR: ArmorType = 'heavy';

/** 내 유닛 공격 (기획.md 3장 지휘관, 5-1 유닛표). 지금 유닛은 모두 보통 공격 */
export const UNIT_ATTACK: Readonly<Record<UnitKind, AttackSpec>> = {
  commander: { damage: 10, range: 4, cooldown: 1 },
  worker: { damage: 5, range: 1, cooldown: 1 },
  rifleman: { damage: 6, range: 5, cooldown: 1 },
  assault: { damage: 10, range: 1, cooldown: 1 },
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
