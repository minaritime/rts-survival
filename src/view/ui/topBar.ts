import Phaser from 'phaser';
import { elapsedSeconds, formatClock, supplyCap, supplyUsed, type World } from '../../sim/world.ts';
import { DEPTH } from '../palette.ts';
import { contains, type HudLayout } from './layout.ts';
import { COLOR, FONT, RADIUS, SPACE, textStyle } from './tokens.ts';
import { makeFixer } from './widgets.ts';

const ICON = 24;

export interface TopBar {
  update(world: World, cursor: { x: number; y: number }): void;
  layout(layout: HudLayout): void;
}

/**
 * 위 줄: 왼쪽 자원(아이콘 + 숫자), 오른쪽 메뉴 버튼. 경과 시간은 미니맵 위(스타2 자리)에 둔다.
 * 바탕을 깔지 않는다 (사용자 요청: 검은 바탕이 화면을 좁아 보이게 함). 글자 테두리·그림자로 읽히게 한다.
 * 가스·보급은 나오는 단계에서 같은 줄 오른쪽에 붙인다.
 */

const OUTLINED = { stroke: '#000000', strokeThickness: 4, shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 4, fill: true } };
export function createTopBar(scene: Phaser.Scene, minimapCamera: Phaser.Cameras.Scene2D.Camera): TopBar {
  const fix = makeFixer(minimapCamera);
  const mineralIcon = fix(scene.add.image(0, 0, 'mineral_0').setDisplaySize(ICON * 1.4, ICON * 1.4));
  const mineral = fix(scene.add.text(0, 0, '', { ...textStyle(FONT.number), ...OUTLINED }).setOrigin(0, 0.5));
  const foodIcon = fix(scene.add.image(0, 0, 'berry_full').setDisplaySize(ICON * 1.4, ICON * 1.4));
  const supply = fix(scene.add.text(0, 0, '', { ...textStyle(FONT.number), ...OUTLINED }).setOrigin(0, 0.5));
  const food = fix(scene.add.text(0, 0, '', { ...textStyle(FONT.number), ...OUTLINED }).setOrigin(0, 0.5));
  // 경과 시간은 스타2처럼 미니맵 바로 위 왼쪽 (layout.clock)
  // 아래 판 바탕보다 먼저 만들어지므로 한 단 위에 그려야 가려지지 않는다
  const clock = fix(scene.add.text(0, 0, '', { ...textStyle(FONT.number), ...OUTLINED }).setOrigin(0, 1)).setDepth(DEPTH.hud + 1);
  const menuBg = fix(scene.add.graphics());
  const menuText = fix(scene.add.text(0, 0, '메뉴 F10', textStyle(FONT.body)).setOrigin(0.5));
  let current: HudLayout | undefined;

  const drawMenu = (hover: boolean): void => {
    if (!current) return;
    const r = current.menuButton;
    menuBg.clear();
    menuBg.fillStyle(hover ? 0x2b2b2b : COLOR.panelRaised, 1);
    menuBg.fillRoundedRect(r.x, r.y, r.width, r.height, RADIUS.button);
    menuBg.lineStyle(1, COLOR.border, 1);
    menuBg.strokeRoundedRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1, RADIUS.button);
  };

  return {
    update(world, cursor) {
      mineral.setText(String(Math.floor(world.stock.mineral)));
      const foodFull = world.stock.food >= world.foodCap;
      food.setText(`${Math.floor(world.stock.food)} / ${world.foodCap}`).setColor(foodFull ? COLOR.warning : COLOR.text);
      // 보급: 쓰는 양(생산 유닛, 지휘관은 안 씀) / 상한. 꽉 차면 경고색
      const used = supplyUsed(world);
      const cap = supplyCap(world);
      supply.setText(`보급 ${used} / ${cap}`).setColor(cap > 0 && used >= cap ? COLOR.warning : COLOR.text);
      clock.setText(formatClock(elapsedSeconds(world)));
      if (current) drawMenu(contains(current.menuButton, cursor));
    },
    layout(layout) {
      current = layout;
      const r = layout.topBar;
      const mid = r.y + r.height / 2;

      let x = SPACE.lg + ICON / 2;
      mineralIcon.setPosition(x, mid);
      mineral.setPosition(x + ICON / 2 + SPACE.xs, mid);
      x += 120;
      foodIcon.setPosition(x, mid);
      food.setPosition(x + ICON / 2 + SPACE.xs, mid);
      x += 130;
      supply.setPosition(x - ICON / 2, mid);

      const menu = layout.menuButton;
      menuText.setPosition(menu.x + menu.width / 2, menu.y + menu.height / 2);
      clock.setPosition(layout.clock.x, layout.clock.y);
      drawMenu(false);
    },
  };
}
