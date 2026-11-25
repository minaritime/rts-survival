import Phaser from 'phaser';
import type { Point } from '../../sim/grid.ts';
import type { World } from '../../sim/world.ts';
import type { ScreenPoint } from '../coords.ts';
import { describeSelection, describeTile } from './describe.ts';
import { contains, type HudLayout, type Rect } from './layout.ts';
import { gaugeColor, gaugeRatio, pickedItems, type Gauge, type PickedItem } from './selectionModel.ts';
import { COLOR, FONT, RADIUS, SPACE, textStyle } from './tokens.ts';
import { makeFixer } from './widgets.ts';

/**
 * 아래 판 가운데 선택 정보 (사용자 요청 11/25: 체력을 그림으로).
 * - 하나: 왼쪽 그림 + 이름 + 색 체력 막대(숫자) + 하는 일
 * - 여럿: 그림 칸들(칸마다 작은 체력 막대). 칸을 누르면 그것 하나만 고른다 (스타처럼)
 * - 고른 것 없이 살펴보는 칸(배급처·절벽 등)이면 글만
 */
export interface SelectionCard {
  update(world: World, selected: ReadonlySet<number>, inspected: Point | null, cursor: ScreenPoint, active: boolean): void;
  /** 여럿 고른 칸 중 하나를 눌렀으면 그 id */
  pick(world: World, selected: ReadonlySet<number>, at: ScreenPoint): number | null;
  layout(layout: HudLayout): void;
}

const PORTRAIT = 56;
const BAR = { width: 200, height: 10 } as const;
const CELL = 44;
const CELL_GAP = 6;
const CELL_ICON = 34;
const GRID_ROWS = 2;
const MAX_CELLS = 30;

export function createSelectionCard(scene: Phaser.Scene, minimapCamera: Phaser.Cameras.Scene2D.Camera): SelectionCard {
  const fix = makeFixer(minimapCamera);
  const g = fix(scene.add.graphics());
  const portrait = fix(scene.add.image(0, 0, 'icon_commander').setOrigin(0.5).setVisible(false));
  const title = fix(scene.add.text(0, 0, '', { ...textStyle(FONT.title), fontStyle: 'bold' }));
  const hpText = fix(scene.add.text(0, 0, '', textStyle(FONT.body)).setOrigin(0, 0.5));
  const status = fix(scene.add.text(0, 0, '', textStyle(FONT.body, COLOR.textSecondary)).setLineSpacing(6));
  const empty = fix(scene.add.text(0, 0, '선택한 것 없음', textStyle(FONT.body, COLOR.textSecondary)).setOrigin(0.5));
  const more = fix(scene.add.text(0, 0, '', { ...textStyle(FONT.body), fontStyle: 'bold' }).setOrigin(0.5));
  const cellIcons = Array.from({ length: MAX_CELLS }, () =>
    fix(scene.add.image(0, 0, 'icon_commander').setOrigin(0.5).setVisible(false)),
  );

  let sel: Rect = { x: 0, y: 0, width: 0, height: 0 };

  /** 여럿일 때 칸 자리들 (보이는 만큼) */
  const cellRects = (count: number): Rect[] => {
    const cols = Math.max(1, Math.floor((sel.width - SPACE.md * 2 + CELL_GAP) / (CELL + CELL_GAP)));
    const shown = Math.min(count, cols * GRID_ROWS, MAX_CELLS);
    return Array.from({ length: shown }, (_, i) => ({
      x: sel.x + SPACE.md + (i % cols) * (CELL + CELL_GAP),
      y: sel.y + SPACE.md + Math.floor(i / cols) * (CELL + CELL_GAP),
      width: CELL,
      height: CELL,
    }));
  };

  const drawGauge = (x: number, y: number, w: number, h: number, gauge: Gauge): void => {
    g.fillStyle(COLOR.barBack, 0.85);
    g.fillRect(x, y, w, h);
    g.fillStyle(gaugeColor(gauge), 1);
    g.fillRect(x, y, w * gaugeRatio(gauge), h);
    g.lineStyle(1, 0x000000, 0.9);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };

  const hideAll = (): void => {
    for (const o of [portrait, title, hpText, status, empty, more, ...cellIcons]) o.setVisible(false);
  };

  const drawSingle = (world: World, selected: ReadonlySet<number>, item: PickedItem): void => {
    const text = describeSelection(world, selected);
    const px = sel.x + SPACE.lg;
    const py = sel.y + SPACE.md + 2;
    g.fillStyle(0x000000, 0.55);
    g.fillRect(px, py, PORTRAIT, PORTRAIT);
    g.lineStyle(1.5, item.foe ? COLOR.dangerNum : COLOR.accentNum, 0.9);
    g.strokeRect(px + 0.5, py + 0.5, PORTRAIT - 1, PORTRAIT - 1);
    portrait.setTexture(item.icon).setDisplaySize(PORTRAIT - 6, PORTRAIT - 6).setPosition(px + PORTRAIT / 2, py + PORTRAIT / 2).setVisible(true);
    const tx = px + PORTRAIT + SPACE.md;
    title.setText(text?.title ?? '').setPosition(tx, py).setVisible(true);
    if (item.hp) {
      const barW = Math.max(60, Math.min(BAR.width, sel.x + sel.width - tx - 110));
      drawGauge(tx, py + 34, barW, BAR.height, item.hp);
      hpText
        .setText(`${Math.ceil(Math.max(0, item.hp.value))} / ${item.hp.max}`)
        .setPosition(tx + barW + SPACE.sm, py + 34 + BAR.height / 2)
        .setVisible(true);
    }
    status.setText(text?.status ?? '').setPosition(px, py + PORTRAIT + SPACE.sm).setVisible(true);
  };

  const drawGrid = (items: readonly PickedItem[], cursor: ScreenPoint, active: boolean): void => {
    const rects = cellRects(items.length);
    const overflow = items.length - rects.length;
    rects.forEach((r, i) => {
      const item = items[i]!;
      const isMore = overflow > 0 && i === rects.length - 1;
      const hover = active && !isMore && contains(r, cursor);
      g.fillStyle(hover ? 0x2b3a55 : COLOR.panelRaised, 1);
      g.fillRoundedRect(r.x, r.y, r.width, r.height, RADIUS.button);
      g.lineStyle(hover ? 2 : 1, item.foe ? COLOR.dangerNum : hover ? COLOR.quest : COLOR.border, 1);
      g.strokeRoundedRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1, RADIUS.button);
      if (isMore) {
        // 칸이 모자라면 마지막 칸에 "+남은 수"
        more.setText(`+${overflow + 1}`).setPosition(r.x + r.width / 2, r.y + r.height / 2).setVisible(true);
        return;
      }
      cellIcons[i]!.setTexture(item.icon).setDisplaySize(CELL_ICON, CELL_ICON).setPosition(r.x + r.width / 2, r.y + 19).setVisible(true);
      if (item.hp) drawGauge(r.x + 4, r.y + r.height - 8, r.width - 8, 5, item.hp);
    });
  };

  return {
    update(world, selected, inspected, cursor, active) {
      g.clear();
      hideAll();
      if (sel.width <= 0) return;
      const items = pickedItems(world, selected);
      if (items.length > 1) {
        drawGrid(items, cursor, active);
        return;
      }
      if (items.length === 1) {
        drawSingle(world, selected, items[0]!);
        return;
      }
      // 고른 것 없이 살펴보는 칸: 글만 (예전 자리)
      const text = inspected ? describeTile(world, inspected) : null;
      if (!text) {
        empty.setPosition(sel.x + sel.width / 2, sel.y + sel.height / 2).setVisible(true);
        return;
      }
      title.setText(text.title).setPosition(sel.x + SPACE.lg, sel.y + SPACE.lg).setVisible(true);
      status.setText(text.status).setPosition(sel.x + SPACE.lg, sel.y + SPACE.lg + 34).setVisible(true);
    },
    pick(world, selected, at) {
      if (sel.width <= 0) return null; // 좁은 화면에서 숨긴 칸은 눌리지 않게
      const items = pickedItems(world, selected);
      if (items.length <= 1) return null;
      const rects = cellRects(items.length);
      const overflow = items.length - rects.length;
      const i = rects.findIndex((r) => contains(r, at));
      if (i < 0 || (overflow > 0 && i === rects.length - 1)) return null;
      return items[i]!.id;
    },
    layout(layout) {
      sel = layout.selection;
    },
  };
}
