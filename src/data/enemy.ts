import type { BuildingKind } from './buildings.ts';

/**
 * 거울 적 기지 (기획.md 8-2, 8-3). 시간은 초.
 * 적은 지휘관이 없어서 굶지 않는다. 적이 식량을 모으는 까닭은 **내 식량 수급을 방해하려는 것** (2026-11-25 사용자 확정):
 * 덤불을 먼저 비우고, 배급처 곁에 건물을 지어 빼앗고, 내 사령부를 부수면 식량을 한 번에 빼앗아 간다.
 */
export const ENEMY = {
  /** 시작 미네랄 */
  startMineral: 200,
  /** 덤불에서 열매를 따 나르는 일꾼 수 (일꾼이 이보다 많을 때부터) */
  foragers: 2,
  foragersFromWorkers: 8,
  /** 열매를 한 번에 이만큼까지 들고 사령부로 간다 */
  foodPerTrip: 10,
  /** 생각하는 간격 (매 틱 하지 않음) */
  thinkSeconds: 1,
  /** 공격 중 병력이 처음의 이 비율 이하로 줄면 물러난다 */
  retreatRatio: 0.5,
  /** 보급이 이만큼 남으면 보급고를 더 짓는다 */
  supplyMargin: 2,
} as const;

type Range = readonly [number, number];

/**
 * 공격: 적은 내 병력을 모른다 (2026-11-26 사용자 확정: 완전히 따로 생각해서 알아서 모으고 발전).
 * 공격 규모(힘)를 스스로 정해 그만큼 모이면 간다. 오래 기다렸으면(인내심) 최소 병력만 돼도 간다.
 * 범위로 적힌 값은 시드 난수로 뽑아서 매판 다르다 (같은 시드면 같은 판).
 */
export const ENEMY_ATTACK = {
  /** 첫 공격은 이 시각 사이 어딘가부터 할 수 있다 */
  firstEarliest: [5.5 * 60, 8 * 60] as Range,
  /** 첫 공격 규모 (힘) */
  firstWave: [6, 9] as Range,
  /** 공격을 보낼 때마다 다음 규모가 이만큼 는다 */
  waveGrowth: [2, 4] as Range,
  /** 공격대는 적어도 이만큼 힘 */
  minArmy: 4,
  maxArmy: 40,
  /** 갈 수 있게 된 뒤 이만큼 지나면 최소 병력만 돼도 간다 */
  patience: [150, 270] as Range,
  /** 물러난 뒤 다음 공격까지 쉬는 시간 */
  regroup: [40, 100] as Range,
  /** 공격대가 이 칸 안에서 본 내 유닛·건물만 노린다. 못 봤으면 지도에서 아는 곳(내 시작 자리 등)을 차례로 찾아간다 */
  sightRadius: 10,
  /** 찾아간 곳에 이만큼 다가가면 다음 곳으로 */
  arriveRadius: 4,
  /** 새로 뽑는 병사가 돌격병일 확률 */
  assaultChance: 0.35,
} as const;

/** 적 자기 병력의 힘 점수 (보급 1 = 소총병 1) */
export const POWER: Readonly<Record<string, number>> = {
  rifleman: 1,
  assault: 1.5,
};

/** 발전: 쓸 미네랄이 쌓이면 병영을 더 짓는다 (최대 maxBarracks) */
export const ENEMY_GROW = {
  surplusMineral: 400,
  maxBarracks: 3,
} as const;

/**
 * 확장: 새 미네랄 무리 곁(맵의 expansions 자리)에 사령부를 짓는다 (기획.md 8-2).
 * 고정 "8분마다" 대신 수입이 찼을 때(일꾼이 목표에 가까움). 내가 자리를 먼저 차지했으면 다음 자리로.
 */
export const ENEMY_EXPAND = {
  /** 첫 확장은 이 시각 사이 어딘가부터 */
  earliest: [4 * 60, 6 * 60] as Range,
  /** 다음 확장까지 간격 */
  gap: [150, 240] as Range,
  /** 일꾼이 목표의 이 비율 이상이면 넓힌다 */
  workerRatio: 0.75,
  /** 다 지은 사령부 하나당 일꾼 목표 */
  workersPerBase: 16,
  maxWorkers: 32,
} as const;

/**
 * 약탈 (2026-11-25 사용자 확정: 건물을 부수면 한 번에).
 * 식량 한도를 주는 내 건물(사령부)이 부서질 때 적 유닛이 곁(radius 칸)에 있으면 내 저장 식량의 이 비율을 빼앗아 간다.
 */
export const RAID = { stealRatio: 0.5, radius: 8 } as const;

/** 적 건설 순서 한 줄: 시각이 되고 미네랄이 있으면 정해진 자리에 짓는다 */
export interface BuildStep {
  readonly kind: BuildingKind;
  readonly at: { readonly x: number; readonly y: number };
  readonly afterSeconds: number;
}
