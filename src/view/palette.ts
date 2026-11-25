/**
 * 화면에 코드로 그리는 표시(선택 고리, 막대, 미니맵 틀)의 색.
 * 지형·유닛·자원 그림은 Blender 로 만든다 (art/blender).
 */
export const PALETTE = {
  minimapFrame: 0xffffff,
  minimapBg: 0x000000,
  selection: 0x76ff03,
  /** 거울 적: 지도 고리·미니맵 */
  enemy: 0xff4d4f,
  /** 거울 적 그림에 곱하는 색 (붉게) */
  enemyTint: 0xff9a8a,
  progress: 0x76ff03,
  barBack: 0x000000,
} as const;

/**
 * 그리는 순서. 그림(자원·유닛)은 바닥점의 화면 y 를 depth 로 써서 아래에 있는 것이 앞에 온다.
 * 지도 크기가 48칸 x 48px = 2304 라서 그 사이 값은 그림들이 쓴다.
 */
export const DEPTH = {
  terrain: -10,
  groundOverlay: -1,
  topOverlay: 1_000_000,
  hud: 2_000_000,
  pause: 3_000_000,
} as const;

