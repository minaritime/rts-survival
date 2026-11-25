/**
 * 화면 배치. 실제 RTS 대부분의 배치를 따른다:
 * 위 = 자원 막대, 왼쪽 위 = 목표, 아래 판 = 미니맵(왼쪽) · 지휘관 카드 · 선택 정보(가운데) · 명령 버튼(오른쪽).
 * Phaser 를 모르는 순수 계산이라 테스트로 겹침을 확인한다 (tests/layout.test.ts).
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const TOP_BAR_HEIGHT = 36;
export const BOTTOM_PANEL_HEIGHT = 204;
export const MINIMAP_SIZE = { width: 192, height: 144 } as const;
export const COMMAND_GRID = { cols: 5, rows: 3, cell: 52, gap: 6 } as const;
/** 명령 버튼 단축키 (줄마다 QWERT / ASDFG / ZXCVB) */
export const COMMAND_HOTKEYS: readonly (readonly string[])[] = [
  ['Q', 'W', 'E', 'R', 'T'],
  ['A', 'S', 'D', 'F', 'G'],
  ['Z', 'X', 'C', 'V', 'B'],
];

const EDGE = 12;
const GAP = 12;
const HERO_WIDTH = 200;
/** 화면이 이보다 좁으면 지휘관 카드를 줄인다 */
const NARROW_SCREEN = 1000;
const HERO_WIDTH_NARROW = 168;
/** 선택 정보 칸이 이보다 좁아지면 글자가 넘치므로 아예 숨긴다 (너비 0) */
const SELECTION_MIN_WIDTH = 200;
const OBJECTIVE_WIDTH = 300;
const MENU_BUTTON = { width: 76, height: 26 } as const;

export interface HudLayout {
  readonly topBar: Rect;
  readonly menuButton: Rect;
  /** 경과 시간: 스타2처럼 미니맵 바로 위 왼쪽 (글자 왼쪽 아래 기준점) */
  readonly clock: { readonly x: number; readonly y: number };
  readonly objectives: { readonly x: number; readonly y: number; readonly width: number };
  readonly bottomPanel: Rect;
  readonly minimap: Rect;
  readonly heroCard: Rect;
  readonly selection: Rect;
  readonly commandCard: Rect;
}

export function computeLayout(width: number, height: number): HudLayout {
  const panelTop = height - BOTTOM_PANEL_HEIGHT;
  const innerTop = panelTop + GAP;
  const innerHeight = BOTTOM_PANEL_HEIGHT - GAP * 2;

  const gridWidth = COMMAND_GRID.cols * COMMAND_GRID.cell + (COMMAND_GRID.cols - 1) * COMMAND_GRID.gap;
  const gridHeight = COMMAND_GRID.rows * COMMAND_GRID.cell + (COMMAND_GRID.rows - 1) * COMMAND_GRID.gap;

  const minimap = {
    x: EDGE,
    y: panelTop + Math.round((BOTTOM_PANEL_HEIGHT - MINIMAP_SIZE.height) / 2),
    ...MINIMAP_SIZE,
  };
  const heroWidth = width < NARROW_SCREEN ? HERO_WIDTH_NARROW : HERO_WIDTH;
  const heroCard = { x: minimap.x + minimap.width + GAP, y: innerTop, width: heroWidth, height: innerHeight };
  const commandCard = {
    x: width - EDGE - gridWidth,
    y: panelTop + Math.round((BOTTOM_PANEL_HEIGHT - gridHeight) / 2),
    width: gridWidth,
    height: gridHeight,
  };
  const selectionX = heroCard.x + heroCard.width + GAP;
  const room = commandCard.x - GAP - selectionX;
  const selection = {
    x: selectionX,
    y: innerTop,
    width: room >= SELECTION_MIN_WIDTH ? room : 0,
    height: innerHeight,
  };

  return {
    topBar: { x: 0, y: 0, width, height: TOP_BAR_HEIGHT },
    menuButton: {
      x: width - EDGE - MENU_BUTTON.width,
      y: Math.round((TOP_BAR_HEIGHT - MENU_BUTTON.height) / 2),
      ...MENU_BUTTON,
    },
    clock: { x: minimap.x, y: minimap.y - 4 },
    objectives: { x: EDGE + 4, y: TOP_BAR_HEIGHT + GAP, width: OBJECTIVE_WIDTH },
    bottomPanel: { x: 0, y: panelTop, width, height: BOTTOM_PANEL_HEIGHT },
    minimap,
    heroCard,
    selection,
    commandCard,
  };
}

/** 명령 버튼 칸 (줄, 칸) 의 위치 */
export function commandCellRect(card: Rect, row: number, col: number): Rect {
  return {
    x: card.x + col * (COMMAND_GRID.cell + COMMAND_GRID.gap),
    y: card.y + row * (COMMAND_GRID.cell + COMMAND_GRID.gap),
    width: COMMAND_GRID.cell,
    height: COMMAND_GRID.cell,
  };
}

export function contains(rect: Rect, p: { readonly x: number; readonly y: number }): boolean {
  return p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * 이 화면 좌표를 누르면 게임 화면(지도)이 아니라 HUD 를 누른 것인지.
 * 위 줄은 바탕이 없어 지도가 보이므로 메뉴 버튼만 막는다.
 */
export function isOnHud(layout: HudLayout, p: { readonly x: number; readonly y: number }): boolean {
  return contains(layout.menuButton, p) || contains(layout.bottomPanel, p);
}
