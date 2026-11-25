import Phaser from 'phaser';
import { DEPTH } from '../palette.ts';
import type { Rect } from './layout.ts';
import { ALPHA, COLOR, RADIUS } from './tokens.ts';

/** HUD 에 붙는 물체 공통: 화면에 고정, HUD 높이, 미니맵에는 안 보이게 */
export type Fixable = Phaser.GameObjects.GameObject & {
  setScrollFactor(x: number): unknown;
  setDepth(d: number): unknown;
};

export function makeFixer(minimapCamera: Phaser.Cameras.Scene2D.Camera, depth: number = DEPTH.hud) {
  return <T extends Fixable>(obj: T): T => {
    obj.setScrollFactor(0);
    obj.setDepth(depth);
    minimapCamera.ignore(obj);
    return obj;
  };
}

/** 판 배경 (둥근 사각형 + 테두리) */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  r: Rect,
  options: { fill?: number; alpha?: number; border?: number; radius?: number } = {},
): void {
  const radius = options.radius ?? RADIUS.panel;
  g.fillStyle(options.fill ?? COLOR.panelRaised, options.alpha ?? ALPHA.fixedPanel);
  g.fillRoundedRect(r.x, r.y, r.width, r.height, radius);
  g.lineStyle(1, options.border ?? COLOR.border, 1);
  g.strokeRoundedRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1, radius);
}

/** 막대 (테두리 + 바탕 + 채운 부분). 테두리가 있어야 배경이 바뀌어도 잘 보인다 */
export function drawBar(g: Phaser.GameObjects.Graphics, r: Rect, ratio: number, color: number): void {
  const clamped = Phaser.Math.Clamp(ratio, 0, 1);
  g.fillStyle(COLOR.barBack, 0.7);
  g.fillRect(r.x, r.y, r.width, r.height);
  g.fillStyle(color, 1);
  g.fillRect(r.x, r.y, r.width * clamped, r.height);
  g.lineStyle(1, COLOR.border, 1);
  g.strokeRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1);
}

/** 단축키 표시 (작은 네모 안 글자) */
export function hotkeyBadge(scene: Phaser.Scene, label: string): Phaser.GameObjects.Text {
  return scene.add.text(0, 0, label, {
    fontFamily: 'sans-serif',
    fontSize: '14px',
    fontStyle: 'bold',
    color: '#ffd54f',
    backgroundColor: '#000000aa',
    padding: { x: 3, y: 0 },
  });
}
