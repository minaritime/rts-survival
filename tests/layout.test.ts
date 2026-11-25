import { describe, expect, test } from 'vitest';
import {
  BOTTOM_PANEL_HEIGHT,
  COMMAND_GRID,
  commandCellRect,
  computeLayout,
  contains,
  isOnHud,
  overlaps,
  TOP_BAR_HEIGHT,
  type Rect,
} from '../src/view/ui/layout.ts';

const inside = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

describe.each([
  [1280, 800],
  [1920, 1080],
  [1024, 700],
  [800, 600],
])('화면 %d x %d', (w, h) => {
  const layout = computeLayout(w, h);
  const screen = { x: 0, y: 0, width: w, height: h };
  const bottomParts = [layout.minimap, layout.heroCard, layout.selection, layout.commandCard];

  test('아래 판 네 칸은 서로 겹치지 않고 아래 판 안에 있다 (숨긴 칸은 너비 0)', () => {
    for (let i = 0; i < bottomParts.length; i++) {
      if (bottomParts[i]!.width === 0) continue;
      expect(inside(layout.bottomPanel, bottomParts[i]!)).toBe(true);
      for (let j = i + 1; j < bottomParts.length; j++) {
        if (bottomParts[j]!.width === 0) continue;
        expect(overlaps(bottomParts[i]!, bottomParts[j]!)).toBe(false);
      }
    }
  });

  test('왼쪽부터 미니맵 → 지휘관 카드 → 선택 정보 → 명령 버튼', () => {
    const xs = bottomParts.map((r) => r.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  test('선택 정보 칸은 글자가 들어갈 만큼 넓거나, 아예 숨긴다', () => {
    const selWidth = layout.selection.width;
    expect(selWidth === 0 || selWidth >= 200).toBe(true);
    if (w >= 1024) expect(selWidth).toBeGreaterThan(0);
  });

  test('위 막대·아래 판·메뉴 버튼은 화면 안', () => {
    for (const r of [layout.topBar, layout.bottomPanel, layout.menuButton]) expect(inside(screen, r)).toBe(true);
    expect(inside(layout.topBar, layout.menuButton)).toBe(true);
    expect(layout.topBar.height).toBe(TOP_BAR_HEIGHT);
    expect(layout.bottomPanel.height).toBe(BOTTOM_PANEL_HEIGHT);
  });

  test('시계는 스타2처럼 미니맵 바로 위 왼쪽, 아래 판 안', () => {
    expect(layout.clock.x).toBe(layout.minimap.x);
    expect(layout.clock.y).toBeLessThan(layout.minimap.y);
    expect(layout.clock.y - 16).toBeGreaterThanOrEqual(layout.bottomPanel.y); // 글자(16px)가 아래 판 안에
  });

  test('목표 칸은 위 막대 바로 아래 왼쪽', () => {
    expect(layout.objectives.y).toBeGreaterThan(TOP_BAR_HEIGHT);
    expect(layout.objectives.x).toBeLessThan(40);
  });
});

describe('명령 버튼 칸', () => {
  const card = computeLayout(1280, 800).commandCard;

  test('5 x 3 칸이 카드 안에 겹치지 않게 들어간다', () => {
    const cells: Rect[] = [];
    for (let r = 0; r < COMMAND_GRID.rows; r++)
      for (let c = 0; c < COMMAND_GRID.cols; c++) cells.push(commandCellRect(card, r, c));
    for (const cell of cells) expect(inside(card, cell)).toBe(true);
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) expect(overlaps(cells[i]!, cells[j]!)).toBe(false);
  });
});

describe('HUD 위 클릭 판정', () => {
  const layout = computeLayout(1280, 800);
  test('아래 판·메뉴 버튼은 HUD, 위 줄(바탕 없음)과 가운데는 지도', () => {
    expect(isOnHud(layout, { x: 640, y: 10 })).toBe(false);
    expect(isOnHud(layout, { x: layout.menuButton.x + 2, y: layout.menuButton.y + 2 })).toBe(true);
    expect(isOnHud(layout, { x: 640, y: 700 })).toBe(true);
    expect(isOnHud(layout, { x: 640, y: 400 })).toBe(false);
    expect(contains(layout.menuButton, { x: layout.menuButton.x, y: layout.menuButton.y })).toBe(true);
    expect(contains(layout.menuButton, { x: layout.menuButton.x + layout.menuButton.width, y: layout.menuButton.y })).toBe(false);
  });
});
