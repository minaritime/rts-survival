import Phaser from 'phaser';
import { elapsedSeconds, formatClock, type World } from '../sim/world.ts';
import { iconKey } from './assets.ts';
import type { ScreenPoint } from './coords.ts';
import { DEPTH } from './palette.ts';
import { contains, type Rect } from './ui/layout.ts';
import { COLOR, FONT, RADIUS, textStyle } from './ui/tokens.ts';
import { makeFixer } from './ui/widgets.ts';

/**
 * 판이 끝났을 때 (6단계): 승리(금색) / 패배(빨강) + 기록(그림 + 숫자) + [다시 하기].
 * 기록: 버틴 시간, 잡은 괴물, 잃은 유닛, 잃은 건물.
 * 마우스를 가둔 채로도 눌리도록 게임 커서 위치로 판정 (stageDialog 와 같은 방식).
 */
export interface ResultDialog {
  /** 판이 끝났으면 띄우고 그린다 */
  update(world: World, cursor: ScreenPoint): void;
  contains(p: ScreenPoint): boolean;
  layout(width: number, height: number): void;
}

const SIZE = { width: 460, height: 280 } as const;
const BUTTON = { width: 180, height: 44 } as const;
const GOLD = 0xffd666;

interface StatSlot {
  readonly icon: Phaser.GameObjects.Image | null;
  readonly text: Phaser.GameObjects.Text;
}

export function createResultDialog(
  scene: Phaser.Scene,
  minimapCamera: Phaser.Cameras.Scene2D.Camera,
  cursorAt: () => ScreenPoint,
  isActive: () => boolean,
  onRetry: () => void,
): ResultDialog {
  const fix = makeFixer(minimapCamera, DEPTH.pause - 1);
  const shade = fix(scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.45).setOrigin(0, 0));
  const g = fix(scene.add.graphics());
  const title = fix(scene.add.text(0, 0, '', { ...textStyle(FONT.large * 2, '#ffffff'), fontStyle: 'bold' }).setOrigin(0.5));
  const retry = fix(scene.add.text(0, 0, '다시 하기', { ...textStyle(FONT.number, '#ffffff'), fontStyle: 'bold' }).setOrigin(0.5));
  const statStyle = { ...textStyle(FONT.number, COLOR.text), fontStyle: 'bold' };
  // 시계는 그림으로 그리고, 나머지는 아이콘
  const stats: StatSlot[] = [
    { icon: null, text: fix(scene.add.text(0, 0, '', statStyle).setOrigin(0, 0.5)) },
    { icon: fix(scene.add.image(0, 0, iconKey('swarm')).setDisplaySize(30, 30)), text: fix(scene.add.text(0, 0, '', statStyle).setOrigin(0, 0.5)) },
    { icon: fix(scene.add.image(0, 0, iconKey('rifleman')).setDisplaySize(30, 30)), text: fix(scene.add.text(0, 0, '', statStyle).setOrigin(0, 0.5)) },
    { icon: fix(scene.add.image(0, 0, iconKey('barracks')).setDisplaySize(30, 30)), text: fix(scene.add.text(0, 0, '', statStyle).setOrigin(0, 0.5)) },
  ];
  const parts: Phaser.GameObjects.Components.Visible[] = [shade, g, title, retry];
  for (const s of stats) {
    parts.push(s.text);
    if (s.icon) parts.push(s.icon);
  }

  let visible = false;
  let box: Rect = { x: 0, y: 0, ...SIZE };
  let button: Rect = { x: 0, y: 0, ...BUTTON };
  let size = { width: scene.scale.width, height: scene.scale.height };
  const setVisible = (v: boolean): void => {
    visible = v;
    for (const p of parts) p.setVisible(v);
  };
  setVisible(false);

  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (visible && isActive() && pointer.leftButtonDown() && contains(button, cursorAt())) onRetry();
  });

  const place = (): void => {
    const { width, height } = size;
    shade.setSize(width, height);
    box = { x: (width - SIZE.width) / 2, y: (height - SIZE.height) / 2 - 40, ...SIZE };
    title.setPosition(width / 2, box.y + 52);
    const rowY = box.y + 130;
    const colW = SIZE.width / 4;
    stats.forEach((s, i) => {
      const cx = box.x + colW * i + colW / 2;
      s.icon?.setPosition(cx - 20, rowY);
      s.text.setPosition(cx - 2, rowY);
    });
    button = { x: width / 2 - BUTTON.width / 2, y: box.y + 196, ...BUTTON };
    retry.setPosition(width / 2, button.y + BUTTON.height / 2);
  };
  place();

  return {
    update(world, cursor) {
      if (world.outcome === 'playing') {
        if (visible) setVisible(false);
        return;
      }
      if (!visible) setVisible(true);
      const won = world.outcome === 'victory';
      const color = won ? GOLD : COLOR.dangerNum;
      title.setText(won ? '승리' : '패배').setColor(won ? '#ffd666' : COLOR.danger);
      stats[0]!.text.setText(formatClock(elapsedSeconds(world)));
      stats[1]!.text.setText(String(world.stats.monstersKilled));
      stats[2]!.text.setText(String(world.stats.unitsLost));
      stats[3]!.text.setText(String(world.stats.buildingsLost));
      g.clear();
      g.fillStyle(COLOR.panelRaised, 0.97);
      g.fillRoundedRect(box.x, box.y, box.width, box.height, RADIUS.dialog);
      g.lineStyle(2, color, 1);
      g.strokeRoundedRect(box.x + 1, box.y + 1, box.width - 2, box.height - 2, RADIUS.dialog);
      // 시계 그림 (첫 칸)
      const cx = box.x + SIZE.width / 8 - 20;
      const cy = box.y + 130;
      g.lineStyle(3, 0xd9d9d9, 1);
      g.strokeCircle(cx, cy, 13);
      g.lineBetween(cx, cy, cx, cy - 8);
      g.lineBetween(cx, cy, cx + 6, cy + 3);
      // 잃은 것(유닛·건물)에는 빨간 빗금
      for (const i of [2, 3]) {
        const ix = box.x + (SIZE.width / 4) * i + SIZE.width / 8 - 20;
        g.lineStyle(3, COLOR.dangerNum, 0.9);
        g.lineBetween(ix - 14, cy + 14, ix + 14, cy - 14);
      }
      const hover = contains(button, cursor);
      g.fillStyle(hover ? 0x4096ff : 0x1677ff, 1);
      g.fillRoundedRect(button.x, button.y, button.width, button.height, RADIUS.button);
    },
    contains(p) {
      return visible && contains(box, p);
    },
    layout(width, height) {
      size = { width, height };
      place();
    },
  };
}
