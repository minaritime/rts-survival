import type { BuildingKind } from './buildings.ts';

/**
 * 생산 유닛 수치 (기획.md 5장). 지휘관은 commander.ts.
 * 미네랄은 누가 캐든 한 번에 8 (2026-11-24 사용자 확정).
 * 일꾼은 지휘관(6초에 8, 반납 없음)보다 조금 느리다: 캐는 데 5.5초 + 사령부까지 오가는 시간.
 */
export type TrainableKind = 'worker' | 'rifleman' | 'assault';
export type UnitKind = 'commander' | TrainableKind;

export interface UnitSpec {
  readonly name: string;
  readonly mineral: number;
  /** 뽑는 데 걸리는 시간 (초) */
  readonly trainSeconds: number;
  readonly supply: number;
  readonly maxHp: number;
  /** 칸/초 */
  readonly speed: number;
  /** 이 건물들을 (그 편이) 다 지어 두어야 뽑을 수 있다 (테크 유닛) */
  readonly requires?: readonly BuildingKind[];
}

export const UNITS: Readonly<Record<TrainableKind, UnitSpec>> = {
  worker: { name: '일꾼', mineral: 50, trainSeconds: 12, supply: 1, maxHp: 40, speed: 3 },
  rifleman: { name: '소총병', mineral: 50, trainSeconds: 18, supply: 1, maxHp: 45, speed: 2.8 },
  /** 근접 탱커 (기획.md 5-1: 체력 100 중장). 장갑 종류는 시제품에서 빠져 체력만 높다 */
  assault: { name: '돌격병', mineral: 75, trainSeconds: 20, supply: 1, maxHp: 100, speed: 2.8, requires: ['infantryLab'] },
};

/** 싸우는 유닛 (적 머리가 병력으로 세는 것) */
export const SOLDIER_KINDS: readonly TrainableKind[] = ['rifleman', 'assault'];

export function isSoldier(kind: UnitKind): boolean {
  return kind === 'rifleman' || kind === 'assault';
}

/** 일꾼 채집 */
export const WORKER = {
  mineralPerTrip: 8,
  mineSeconds: 5.5,
} as const;

/** 건물 한 곳의 생산 줄 최대 길이 (스타처럼 5) */
export const PRODUCTION_QUEUE_MAX = 5;
