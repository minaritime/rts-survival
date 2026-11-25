/** 지휘관 수치 (기획.md 3장). 시간은 전부 초. */
export const COMMANDER = {
  maxHp: 200,
  /** 칸/초 */
  speed: 3,
  /** 굶주릴 때 이동 속도 배율 */
  starvingSpeedFactor: 0.7,

  maxSatiety: 100,
  /** 배부름이 1 줄어드는 데 걸리는 시간 */
  secondsPerSatiety: 4,
  /** 배부름이 이 값 아래로 내려가면 저장 식량에서 1씩 먹어 채운다 */
  autoEatBelow: 60,
  /** 굶주림(배부름 0) 때 초당 체력 감소 */
  starvingHpPerSecond: 1,

  /**
   * 손 채집: mineralPerTrip 을 mineralSeconds 마다 (2026-11-24 사용자 확정).
   * 미네랄은 누가 캐든 한 번에 8. 지휘관은 일꾼보다 조금 빠르다:
   * 일꾼은 캐고 사령부까지 오가는 데 약 7초(분당 약 68), 지휘관은 반납 없이 6초(분당 80).
   */
  mineralPerTrip: 8,
  mineralSeconds: 6,
  /** 열매 따기: berryPerPick 을 berrySeconds 마다 */
  berryPerPick: 5,
  berrySeconds: 2,
  /** 잔해 뒤지기 */
  debrisSeconds: 3,
} as const;

/**
 * 한 판 시작 상태.
 * 미네랄 200 (2026-11-23 사용자 요청: 미네랄을 오래 캘 필요 없이, 잔해 하나 + 미네랄 한 번이면
 * 첫 중요 건물(사령부 250)을 지을 수 있게. 200 + 잔해 50 + 손 채집 8 = 258). 기획.md 11-1 의 50 에서 바뀜
 */
export const START = {
  mineral: 200,
  food: 0,
  /** 사령부가 없을 때 식량 저장 한도 = 지휘관 주머니 */
  pocketFoodCap: 30,
} as const;
