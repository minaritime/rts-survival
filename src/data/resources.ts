/** 지도 위 자원 수치 (기획.md 4장). 시간은 전부 초. */
export const DEBRIS = {
  /** 잔해 1개에서 나오는 미네랄. 1맵 가까운 3개 = 150 (기획.md 11-1) */
  mineral: 50,
} as const;

export const BERRY = {
  /** 덤불 1개의 열매 처음 양 */
  startFruit: 15,
  /** 비었을 때 다시 차는 데 걸리는 기본 시간 */
  regrowSeconds: 90,
  /** 비울 때마다 다시 차는 시간이 이만큼 늘어남 (남획) */
  regrowPenaltySeconds: 30,
  /** 이 시간마다 모든 덤불의 최대치가 줄어듦 */
  shrinkEverySeconds: 600,
  shrinkAmount: 3,
} as const;
