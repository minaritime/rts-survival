/**
 * 튜토리얼 동안만 쓰는 규칙. 게임 밸런스가 아니라 빨리 해 보고 이해하는 것이 목적이다
 * (2026-11-24 사용자 요청: "튜토리얼에서는 게임 밸런스를 반영하지 말고 빠르게 진행").
 * 튜토리얼이 끝나면 world.tutorialRules 가 꺼지고 원래 수치(commander.ts, buildings.ts)로 돌아간다.
 */
export const TUTORIAL_RULES = {
  /** 모든 건물을 이 시간(초)에 짓는다 */
  buildSeconds: 3,
  /** 채집·잔해 뒤지기 대기 시간 배율 (미네랄 6초 → 1.2초 등) */
  workTimeFactor: 0.2,
  /** 모든 유닛을 이 시간(초)에 뽑는다 */
  trainSeconds: 3,
  /** 튜토리얼 2장(일꾼·병영·소총병)에 들어갈 때 주는 미네랄. 모으느라 기다리지 않게 */
  chapterTwoMineral: 300,
} as const;
