/**
 * 생산 유닛 수치 (기획.md 5장). 지휘관은 commander.ts.
 * 미네랄은 누가 캐든 한 번에 8 (2026-11-24 사용자 확정).
 * 일꾼은 지휘관(6초에 8, 반납 없음)보다 조금 느리다: 캐는 데 5.5초 + 사령부까지 오가는 시간.
 */
export type TrainableKind = 'worker' | 'rifleman';
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
}

export const UNITS: Readonly<Record<TrainableKind, UnitSpec>> = {
  worker: { name: '일꾼', mineral: 50, trainSeconds: 12, supply: 1, maxHp: 40, speed: 3 },
  rifleman: { name: '소총병', mineral: 50, trainSeconds: 18, supply: 1, maxHp: 45, speed: 2.8 },
};

/** 일꾼 채집 */
export const WORKER = {
  mineralPerTrip: 8,
  mineSeconds: 5.5,
} as const;

/** 건물 한 곳의 생산 줄 최대 길이 (스타처럼 5) */
export const PRODUCTION_QUEUE_MAX = 5;
