import { unitScreenPos, type Mover } from './coords.ts';

/**
 * 유닛 고르기 계산 (Phaser 를 모름, tests/selection.test.ts).
 * 좌표는 전부 월드 픽셀 (카메라 이동과 상관없는 지도 위 위치).
 */

/** 이만큼(화면 픽셀) 넘게 끌어야 상자 선택. 그보다 짧으면 클릭으로 본다 */
export const DRAG_THRESHOLD = 6;
/** 유닛 한가운데에서 이 거리 안을 누르면 그 유닛을 고른 것으로 본다 */
export const PICK_RADIUS = 24;
/** 바닥점에서 몸 한가운데까지 (픽셀). 지휘관 그림 기준 */
export const BODY_LIFT = 20;

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

/** 클릭한 자리의 유닛 (가장 가까운 것). 없으면 undefined */
export function unitAt<T extends Mover>(units: readonly T[], at: WorldPoint, alpha: number): T | undefined {
  let best: T | undefined;
  let bestDist = PICK_RADIUS;
  for (const u of units) {
    if (u.hp <= 0) continue;
    const p = unitScreenPos(u, alpha);
    // 그림은 바닥점 위로 솟아 있으므로 몸 한가운데를 기준으로 판정
    const d = Math.hypot(p.x - at.x, p.y - BODY_LIFT - at.y);
    if (d <= bestDist) {
      best = u;
      bestDist = d;
    }
  }
  return best;
}

/** 두 점으로 만든 상자 안에 몸(바닥점 ~ 몸 한가운데)이 걸친 유닛들 */
export function unitsInBox<T extends Mover>(units: readonly T[], a: WorldPoint, b: WorldPoint, alpha: number): T[] {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return units.filter((u) => {
    if (u.hp <= 0) return false;
    const p = unitScreenPos(u, alpha);
    const footIn = p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
    const bodyIn = p.x >= left && p.x <= right && p.y - BODY_LIFT >= top && p.y - BODY_LIFT <= bottom;
    return footIn || bodyIn;
  });
}

/** 새 선택. additive(Shift)면 지금 선택에 더한다 */
export function nextSelection(current: ReadonlySet<number>, picked: readonly number[], additive: boolean): Set<number> {
  return new Set(additive ? [...current, ...picked] : picked);
}
