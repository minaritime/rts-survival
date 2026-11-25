import Phaser from 'phaser';
import { commandCancelTrain } from '../../sim/commands.ts';
import type { Building } from '../../sim/entities.ts';
import { isSupplyBlocked } from '../../sim/systems/production.ts';
import type { World } from '../../sim/world.ts';
import { PRODUCTION_QUEUE_MAX } from '../../data/units.ts';
import { iconKey } from '../assets.ts';
import type { ScreenPoint } from '../coords.ts';
import { contains, type HudLayout, type Rect } from './layout.ts';
import { COLOR, RADIUS, SPACE } from './tokens.ts';
import { makeFixer } from './widgets.ts';

/**
 * 생산 대기열 아이콘 줄 (스타식): 건물 하나를 고르면 선택 정보 칸에 칸 5개.
 * 맨 앞 칸은 진행 막대, 보급이 모자라면 막대가 경고색. 칸을 누르면 그 유닛을 취소(미네랄 환불).
 */
export interface QueueRow {
  update(world: World, selected: ReadonlySet<number>, cursor: ScreenPoint, active: boolean): void;
  /** 칸을 눌렀으면 취소하고 true */
  click(world: World, selected: ReadonlySet<number>, at: ScreenPoint): boolean;
  layout(layout: HudLayout): void;
}

const SLOT = 44;
const SLOT_GAP = 6;
const ICON = 36;
const BAR = 5;
/** 선택 정보 칸 위쪽에서 줄까지 (제목 + 상태 두 줄 아래) */
const ROW_TOP = 100;

/** 대기열을 보여 줄 건물: 내 건물 하나만 골랐고 다 지었고 줄이 있을 때 (적 건물 줄은 보이지도, 취소되지도 않게) */
function queuedBuilding(world: World, selected: ReadonlySet<number>): Building | undefined {
  if (selected.size !== 1) return undefined;
  const b = world.buildings.find((x) => selected.has(x.id) && x.owner === 'player');
  return b && b.complete && b.trainQueue.length > 0 ? b : undefined;
}

export function createQueueRow(scene: Phaser.Scene, minimapCamera: Phaser.Cameras.Scene2D.Camera): QueueRow {
  const fix = makeFixer(minimapCamera);
  const g = fix(scene.add.graphics());
  const icons = Array.from({ length: PRODUCTION_QUEUE_MAX }, () =>
    fix(scene.add.image(0, 0, iconKey('worker')).setOrigin(0.5).setDisplaySize(ICON, ICON).setVisible(false)),
  );
  const marks = fix(scene.add.graphics());
  let slots: Rect[] = [];
  let shown = true;
  let drawn = '';

  const slotAt = (at: ScreenPoint): number => slots.findIndex((r) => contains(r, at));

  return {
    update(world, selected, cursor, active) {
      const b = shown ? queuedBuilding(world, selected) : undefined;
      const hover = b && active ? slotAt(cursor) : -1;
      const blocked = b ? isSupplyBlocked(world, b) : false;
      const key = b ? `${b.id}|${b.trainQueue.join(',')}|${b.trainProgress.toFixed(2)}|${hover}|${blocked}` : '';
      if (key === drawn) return;
      drawn = key;
      g.clear();
      marks.clear();
      for (const icon of icons) icon.setVisible(false);
      if (!b) return;

      slots.forEach((r, i) => {
        const kind = b.trainQueue[i];
        const hovered = i === hover && kind !== undefined;
        g.fillStyle(kind === undefined ? COLOR.panel : COLOR.panelRaised, 1);
        g.fillRoundedRect(r.x, r.y, r.width, r.height, RADIUS.button);
        const border = hovered ? COLOR.dangerNum : i === 0 ? COLOR.accentNum : COLOR.border;
        g.lineStyle(hovered || i === 0 ? 2 : 1, border, kind === undefined ? 0.5 : 1);
        g.strokeRoundedRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1, RADIUS.button);
        if (kind === undefined) return;
        icons[i]!
          .setTexture(iconKey(kind))
          .setDisplaySize(ICON, ICON)
          .setPosition(r.x + r.width / 2, r.y + r.height / 2 - (i === 0 ? 2 : 0))
          .setAlpha(i === 0 ? 1 : 0.75)
          .setVisible(true);
        if (i === 0) {
          // 진행 막대 (칸 아래쪽 안)
          const bw = r.width - 6;
          g.fillStyle(COLOR.barBack, 0.8);
          g.fillRect(r.x + 3, r.y + r.height - BAR - 3, bw, BAR);
          g.fillStyle(blocked ? COLOR.warningNum : COLOR.successNum, 1);
          g.fillRect(r.x + 3, r.y + r.height - BAR - 3, bw * (blocked ? 1 : b.trainProgress), BAR);
        }
        if (hovered) {
          // 누르면 취소: 빨간 X
          marks.lineStyle(3, COLOR.dangerNum, 1);
          marks.lineBetween(r.x + 10, r.y + 10, r.x + r.width - 10, r.y + r.height - 10);
          marks.lineBetween(r.x + r.width - 10, r.y + 10, r.x + 10, r.y + r.height - 10);
        }
      });
    },
    click(world, selected, at) {
      const b = queuedBuilding(world, selected);
      if (!b || !shown) return false;
      const i = slotAt(at);
      if (i < 0 || b.trainQueue[i] === undefined) return false;
      return commandCancelTrain(world, b.id, i);
    },
    layout(layout) {
      const sel = layout.selection;
      shown = sel.width > 0;
      slots = Array.from({ length: PRODUCTION_QUEUE_MAX }, (_, i) => ({
        x: sel.x + SPACE.lg + i * (SLOT + SLOT_GAP),
        y: sel.y + ROW_TOP,
        width: SLOT,
        height: SLOT,
      }));
      drawn = '-'; // 자리가 바뀌니 다시 그리기
    },
  };
}
