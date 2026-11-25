/** 한 칸의 화면 크기 (픽셀). 규칙(sim)은 칸 단위로만 생각하고 이 값은 화면만 쓴다. */
export const TILE_SIZE = 48;

/** 규칙이 1초에 몇 번 진행되는지. 화면 속도와 상관없이 고정. */
export const TICKS_PER_SECOND = 20;
export const TICK_SECONDS = 1 / TICKS_PER_SECOND;

/** 화면이 한참 멈췄다 돌아와도 한 번에 따라잡는 틱 수 상한 (멈춤 뒤 폭주 방지). */
export const MAX_TICKS_PER_FRAME = 10;
