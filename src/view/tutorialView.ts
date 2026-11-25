import Phaser from 'phaser';
import type { QuestTarget, QuestView } from '../tutorial/quests.ts';
import { commanderOf, type World } from '../sim/world.ts';
import { tileToPx, unitScreenPos } from './coords.ts';
import { DEPTH } from './palette.ts';
import type { HudLayout } from './ui/layout.ts';
import { ALPHA, COLOR, FONT, RADIUS, SPACE, textStyle } from './ui/tokens.ts';

const PAD = SPACE.md;
const ARROW_COLOR = COLOR.quest;
const DONE_COLOR = COLOR.success;
/** 화면 밖 대상을 가리키는 화살표가 화면 끝에서 떨어진 거리 */
const EDGE_INSET = 56;

export interface TutorialView {
  /** showArrow: 일시정지 중에는 false (화살표가 일시정지 화면 글자 위에 겹치지 않게) */
  update(view: QuestView | null, world: World, alpha: number, timeMs: number, showArrow: boolean): void;
}

/** 아래를 가리키는 화살표. (x, y) = 화살촉 끝 */
function arrowDown(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  const pts = [
    { x, y },
    { x: x - 14, y: y - 16 },
    { x: x - 6, y: y - 16 },
    { x: x - 6, y: y - 34 },
    { x: x + 6, y: y - 34 },
    { x: x + 6, y: y - 16 },
    { x: x + 14, y: y - 16 },
  ];
  g.fillStyle(ARROW_COLOR, 1);
  g.fillPoints(pts, true);
  g.lineStyle(2, 0x000000, 0.9);
  g.strokePoints(pts, true);
}

/** angle 방향을 가리키는 화살표 (화면 가장자리용). (x, y) = 화살촉 끝 */
function arrowToward(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number): void {
  const back = (len: number, side: number): { x: number; y: number } => ({
    x: x - Math.cos(angle) * len - Math.sin(angle) * side,
    y: y - Math.sin(angle) * len + Math.cos(angle) * side,
  });
  const pts = [{ x, y }, back(22, 14), back(22, 5), back(42, 5), back(42, -5), back(22, -5), back(22, -14)];
  g.fillStyle(ARROW_COLOR, 1);
  g.fillPoints(pts, true);
  g.lineStyle(2, 0x000000, 0.9);
  g.strokePoints(pts, true);
}

/**
 * 왼쪽 위 "목표" 칸과 대상 화살표.
 * 대상이 화면 안이면 대상 위에서 위아래로 튀는 화살표, 화면 밖이면 화면 끝에서 그쪽을 가리킨다.
 */
export function createTutorialView(
  scene: Phaser.Scene,
  minimapCamera: Phaser.Cameras.Scene2D.Camera,
  getLayout: () => HudLayout,
): TutorialView {
  const fixed = <T extends Phaser.GameObjects.GameObject & { setScrollFactor(x: number): T; setDepth(d: number): T }>(
    obj: T,
  ): T => {
    obj.setScrollFactor(0).setDepth(DEPTH.hud);
    minimapCamera.ignore(obj);
    return obj;
  };

  const panel = fixed(scene.add.graphics());
  const header = fixed(scene.add.text(0, 0, '', textStyle(FONT.body, COLOR.questText)));
  const title = fixed(scene.add.text(0, 0, '', { ...textStyle(FONT.title), fontStyle: 'bold' }));
  const detail = fixed(
    scene.add.text(0, 0, '', {
      ...textStyle(FONT.body, COLOR.textSecondary),
      wordWrap: { width: getLayout().objectives.width - PAD * 2 },
      lineSpacing: 4,
    }),
  );
  const worldArrow = scene.add.graphics().setDepth(DEPTH.topOverlay);
  minimapCamera.ignore(worldArrow);
  const screenArrow = fixed(scene.add.graphics());

  /** 대상의 화면(월드) 좌표: 화살촉이 놓일 자리 */
  const targetPoint = (target: QuestTarget, world: World, alpha: number): { x: number; y: number } | null => {
    if (target === null || target.kind === 'minimap') return null;
    if (target.kind === 'tile') return { x: tileToPx(target.x), y: tileToPx(target.y) - 30 };
    const c = commanderOf(world);
    if (!c || c.hp <= 0) return null;
    const p = unitScreenPos(c, alpha);
    return { x: p.x, y: p.y - 44 };
  };

  const drawArrow = (target: QuestTarget, world: World, alpha: number, bounce: number): void => {
    if (target?.kind === 'minimap') {
      const m = minimapCamera;
      arrowToward(screenArrow, m.x + m.width + 4, m.y + 24, Math.PI + 0.35);
      return;
    }
    const point = targetPoint(target, world, alpha);
    if (!point) return;
    const cam = scene.cameras.main;
    const view = cam.worldView;
    if (Phaser.Geom.Rectangle.Contains(view, point.x, point.y)) {
      arrowDown(worldArrow, point.x, point.y - bounce);
      return;
    }
    // 화면 밖: 화면 가운데에서 대상 쪽으로, 화면 끝 안쪽에 화살표
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    const sx = point.x - view.x;
    const sy = point.y - view.y;
    const angle = Math.atan2(sy - cy, sx - cx);
    const scale = Math.min(
      Math.abs((cx - EDGE_INSET) / (Math.cos(angle) || 1e-6)),
      Math.abs((cy - EDGE_INSET) / (Math.sin(angle) || 1e-6)),
    );
    arrowToward(screenArrow, cx + Math.cos(angle) * (scale + bounce * 0.5), cy + Math.sin(angle) * (scale + bounce * 0.5), angle);
  };

  return {
    update(view, world, alpha, timeMs, showArrow) {
      worldArrow.clear();
      screenArrow.clear();
      const visible = view !== null;
      for (const o of [panel, header, title, detail]) o.setVisible(visible);
      if (!view) return;

      const box = getLayout().objectives;
      header
        .setText(view.done ? '완료!' : `목표 ${view.index + 1} / ${view.total}`)
        .setColor(view.done ? DONE_COLOR : COLOR.questText)
        .setPosition(box.x + PAD, box.y + PAD);
      title.setText(view.title).setColor(view.done ? DONE_COLOR : COLOR.text);
      title.setPosition(box.x + PAD, header.y + header.height + SPACE.xs);
      detail.setText(view.detail).setPosition(box.x + PAD, title.y + title.height + SPACE.sm);
      const height = detail.y + detail.height + PAD - box.y;

      panel.clear();
      panel.fillStyle(COLOR.panelRaised, ALPHA.floatingPanel);
      panel.fillRoundedRect(box.x, box.y, box.width, height, RADIUS.panel);
      panel.lineStyle(1.5, view.done ? COLOR.successNum : ARROW_COLOR, 0.9);
      panel.strokeRoundedRect(box.x, box.y, box.width, height, RADIUS.panel);

      if (!showArrow) return;
      const bounce = Math.abs(Math.sin(timeMs / 220)) * 10;
      drawArrow(view.target, world, alpha, bounce);
    },
  };
}
