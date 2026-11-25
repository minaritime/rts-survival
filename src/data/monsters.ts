import type { AttackSpec } from './combat.ts';

/** 괴물 무리 (기획.md 5-2). 1맵은 떼거리·돌진형만 */
export type MonsterKind = 'swarm' | 'charger';
/** 맵에 사는 것: 괴물 + 사냥감 */
export type CreatureKind = MonsterKind | 'grazer';

export interface CreatureSpec {
  readonly name: string;
  readonly maxHp: number;
  /** 칸/초 */
  readonly speed: number;
  /** 공격 규모 계산용 점수 (사냥감은 0) */
  readonly value: number;
  readonly attack: AttackSpec | null;
  /** 이 거리 안의 내 유닛·건물을 먼저 친다 */
  readonly aggroRange: number;
  readonly role: string;
}

export const CREATURES: Readonly<Record<CreatureKind, CreatureSpec>> = {
  swarm: {
    name: '떼거리',
    maxHp: 30,
    speed: 3.6,
    value: 1,
    attack: { damage: 5, range: 1, cooldown: 1 },
    aggroRange: 5,
    role: '빠르고 약한 괴물입니다. 떼로 몰려옵니다',
  },
  charger: {
    name: '돌진형',
    maxHp: 120,
    speed: 2.6,
    value: 3,
    attack: { damage: 20, range: 1, cooldown: 1.5, buildingFactor: 2 },
    aggroRange: 4,
    role: '튼튼한 괴물입니다. 건물에 두 배 피해를 주어 벽을 부숩니다',
  },
  grazer: {
    name: '사냥감',
    maxHp: 30,
    speed: 1.2,
    value: 0,
    attack: null,
    aggroRange: 0,
    role: '초식 동물입니다. 잡으면 고기를 남깁니다',
  },
};

/** 사냥감 (기획.md 11-3: 덤불 10개 + 사냥감 6마리 = 처음 식량 약 390 → 한 마리 40) */
export const GRAZER = {
  meat: 40,
  /** 처음 자리에서 이 칸 안을 어슬렁거린다 */
  wanderRadius: 3,
  /** 어슬렁거리기 사이 쉬는 시간 (초) */
  restSeconds: 4,
} as const;

/**
 * 생존형 괴물 공격 (기획.md 8-1, 1맵 줄).
 * n 번째 공격 가치 = firstValue x growth^(n-1). 공격 30초 전에 방향을 알린다.
 */
export const WAVES = {
  firstSeconds: 360,
  intervalSeconds: 90,
  firstValue: 4,
  growth: 1.3,
  warnSeconds: 30,
  /** 이 번째 공격부터 돌진형이 섞인다 */
  chargerFromWave: 3,
  /** 돌진형이 차지하는 가치 비율 */
  chargerShare: 0.3,
} as const;
