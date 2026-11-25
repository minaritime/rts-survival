import { TILE_SIZE } from '../data/constants.ts';
/** 틱마다 움직이는 것 (유닛·괴물·사냥감) */
export interface Mover {
  readonly x: number;
  readonly y: number;
  readonly prevX: number;
  readonly prevY: number;
  readonly hp: number;
}

/** 화면(카메라 기준) 좌표 */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** 칸 좌표(정수 = 칸 한가운데) → 화면 픽셀 */
export const tileToPx = (tile: number): number => tile * TILE_SIZE + TILE_SIZE / 2;

/** 직전 틱과 지금 틱 사이를 alpha 비율로 섞은 화면 위치 */
export function unitScreenPos(unit: Mover, alpha: number): { x: number; y: number } {
  return {
    x: tileToPx(unit.prevX + (unit.x - unit.prevX) * alpha),
    y: tileToPx(unit.prevY + (unit.y - unit.prevY) * alpha),
  };
}
