/**
 * 부대 지정 (스타식). Phaser 를 모르는 순수 계산 (tests/controlGroups.test.ts).
 * - Ctrl + 숫자: 지금 선택을 그 번호에 지정 (덮어씀)
 * - Shift + 숫자: 지금 선택을 그 번호에 더함
 * - 숫자: 그 번호 부대를 고름 / 같은 숫자를 빨리 두 번: 화면을 그 부대로
 * 숫자 1~9 와 0 (키보드 순서대로 1 … 9, 0) 을 쓴다.
 */
export type ControlGroups = ReadonlyMap<number, readonly number[]>;

/** 같은 숫자를 이 시간(밀리초) 안에 두 번 누르면 화면 이동 */
export const DOUBLE_TAP_MS = 350;

/** KeyboardEvent.code → 부대 번호. 숫자 키가 아니면 null (숫자패드도 받음) */
export function slotFromCode(code: string): number | null {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(code);
  return m ? Number(m[1]) : null;
}

export function assignGroup(groups: ControlGroups, slot: number, ids: readonly number[]): ControlGroups {
  const next = new Map(groups);
  if (ids.length === 0) next.delete(slot);
  else next.set(slot, [...new Set(ids)]);
  return next;
}

export function addToGroup(groups: ControlGroups, slot: number, ids: readonly number[]): ControlGroups {
  return assignGroup(groups, slot, [...(groups.get(slot) ?? []), ...ids]);
}

/** 그 번호 부대 중 아직 살아 있는 것 */
export function recallGroup(groups: ControlGroups, slot: number, isAlive: (id: number) => boolean): number[] {
  return (groups.get(slot) ?? []).filter(isAlive);
}

export interface LastRecall {
  readonly slot: number;
  readonly timeMs: number;
}

export function isDoubleTap(last: LastRecall | null, slot: number, nowMs: number): boolean {
  return last !== null && last.slot === slot && nowMs - last.timeMs <= DOUBLE_TAP_MS;
}
