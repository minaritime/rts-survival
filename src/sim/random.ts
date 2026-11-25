/**
 * 시드 고정 난수 (mulberry32). 같은 시드면 같은 판이 재현된다 (시제품.md 1장).
 * 상태는 World.rngState 하나에 두고, 뽑을 때마다 바꾼다.
 */
export interface RandomSource {
  rngState: number;
}

/** 0 이상 1 미만 */
export function nextRandom(src: RandomSource): number {
  src.rngState = (src.rngState + 0x6d2b79f5) | 0;
  let t = src.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 목록에서 하나 */
export function pickOne<T>(src: RandomSource, items: readonly T[]): T {
  if (items.length === 0) throw new Error('빈 목록에서 고를 수 없음');
  return items[Math.floor(nextRandom(src) * items.length)]!;
}
