import Phaser from 'phaser';
import { COMMANDER } from '../../data/commander.ts';
import { isStarving } from '../../sim/systems/hunger.ts';
import type { Point } from '../../sim/grid.ts';
import { commanderOf, type World } from '../../sim/world.ts';
import type { ControlGroups } from '../controlGroups.ts';
import { describeGroups, describeSelection, describeTile, type SelectionText } from './describe.ts';
import type { HudLayout } from './layout.ts';
import { ALPHA, COLOR, FONT, SPACE, textStyle } from './tokens.ts';
import { drawBar, drawPanel, hotkeyBadge, makeFixer } from './widgets.ts';

const PORTRAIT = 64;
/** 지휘관 시트에서 얼굴 그림으로 쓸 장 (방향 2 = 남쪽(화면 쪽), 0번 장 = 서 있기) */
const PORTRAIT_FRAME = 2 * 5;
/** 96px 칸에서 사람이 있는 부분 */
const PORTRAIT_CROP = { x: 22, y: 8, size: 52 } as const;

export interface BottomPanel {
  update(
    world: World,
    selected: ReadonlySet<number>,
    groups: ControlGroups,
    inspected: Point | null,
    tip: SelectionText | null,
  ): void;
  layout(layout: HudLayout): void;
}

/**
 * 아래 판: 바탕 + 지휘관 카드(늘 보임, 얼굴 + 체력·배부름 막대) + 선택 정보.
 * 미니맵은 minimap.ts, 명령 버튼은 commandCard.ts 가 그린다.
 */
export function createBottomPanel(scene: Phaser.Scene, minimapCamera: Phaser.Cameras.Scene2D.Camera): BottomPanel {
  const fix = makeFixer(minimapCamera);
  const bg = fix(scene.add.graphics());
  const bars = fix(scene.add.graphics());

  const portrait = fix(scene.add.image(0, 0, 'commander', PORTRAIT_FRAME).setOrigin(0, 0));
  portrait.setCrop(PORTRAIT_CROP.x, PORTRAIT_CROP.y, PORTRAIT_CROP.size, PORTRAIT_CROP.size);
  portrait.setScale(PORTRAIT / PORTRAIT_CROP.size);
  const heroName = fix(scene.add.text(0, 0, '지휘관', { ...textStyle(FONT.number), fontStyle: 'bold' }));
  const heroKey = fix(hotkeyBadge(scene, 'F1'));
  const hpLabel = fix(scene.add.text(0, 0, '체력', textStyle(FONT.body, COLOR.textSecondary)));
  const hpValue = fix(scene.add.text(0, 0, '', textStyle(FONT.body)).setOrigin(1, 0));
  const satLabel = fix(scene.add.text(0, 0, '배부름', textStyle(FONT.body, COLOR.textSecondary)));
  const satValue = fix(scene.add.text(0, 0, '', textStyle(FONT.body)).setOrigin(1, 0));

  const selTitle = fix(scene.add.text(0, 0, '', { ...textStyle(FONT.title), fontStyle: 'bold' }));
  const selStatus = fix(scene.add.text(0, 0, '', textStyle(FONT.body, COLOR.textSecondary)));
  const selEmpty = fix(scene.add.text(0, 0, '선택한 것 없음', textStyle(FONT.body, COLOR.textSecondary)).setOrigin(0.5));
  const groupLine = fix(scene.add.text(0, 0, '', textStyle(FONT.body, COLOR.questText)).setOrigin(0, 1));

  const barRects = { hp: { x: 0, y: 0, width: 0, height: 12 }, sat: { x: 0, y: 0, width: 0, height: 12 } };
  /** 좁은 화면에서는 layout 이 선택 정보 칸을 너비 0 으로 숨긴다 */
  let selectionShown = true;
  /** 마지막으로 그린 막대 상태. 같으면 다시 그리지 않는다 */
  let drawnBars = '';

  return {
    update(world, selected, groups, inspected, tip) {
      const commander = commanderOf(world);
      const hp = commander ? Math.ceil(commander.hp) : 0;
      const starving = isStarving(world);
      hpValue.setText(`${hp} / ${COMMANDER.maxHp}`);
      satValue.setText(`${Math.ceil(world.satiety)} / ${COMMANDER.maxSatiety}`).setColor(starving ? COLOR.danger : COLOR.text);
      satLabel.setText(starving ? '굶주림' : '배부름').setColor(starving ? COLOR.danger : COLOR.textSecondary);
      const barsKey = `${hp}|${world.satiety.toFixed(1)}|${starving}`;
      if (barsKey !== drawnBars) {
        drawnBars = barsKey;
        bars.clear();
        drawBar(bars, barRects.hp, hp / COMMANDER.maxHp, hp / COMMANDER.maxHp < 0.3 ? COLOR.dangerNum : COLOR.hp);
        drawBar(bars, barRects.sat, world.satiety / COMMANDER.maxSatiety, starving ? COLOR.dangerNum : COLOR.satiety);
      }

      // 고른 것이 없으면 살펴보는 칸(배급처·사냥감·절벽 등) 설명
      // 버튼에 커서를 올렸으면 그 설명, 아니면 고른 것, 그것도 없으면 살펴보는 칸
      const text = tip ?? describeSelection(world, selected) ?? (inspected ? describeTile(world, inspected) : null);
      selEmpty.setVisible(selectionShown && text === null);
      selTitle.setVisible(selectionShown && text !== null).setText(text?.title ?? '');
      selStatus.setVisible(selectionShown && text !== null).setText(text?.status ?? '');
      groupLine.setVisible(selectionShown).setText(describeGroups(groups));
    },
    layout(layout) {
      drawnBars = ''; // 막대 자리가 바뀌니 다시 그리기
      const panel = layout.bottomPanel;
      bg.clear();
      bg.fillStyle(COLOR.panel, ALPHA.fixedPanel);
      bg.fillRect(panel.x, panel.y, panel.width, panel.height);
      bg.lineStyle(1, COLOR.border, 1);
      bg.lineBetween(panel.x, panel.y + 0.5, panel.x + panel.width, panel.y + 0.5);
      // 미니맵 테두리
      const m = layout.minimap;
      bg.lineStyle(2, COLOR.border, 1);
      bg.strokeRect(m.x - 1, m.y - 1, m.width + 2, m.height + 2);

      const hero = layout.heroCard;
      drawPanel(bg, hero);
      const px = hero.x + SPACE.md;
      const py = hero.y + SPACE.md;
      bg.fillStyle(0x000000, 0.6);
      bg.fillRect(px, py, PORTRAIT, PORTRAIT);
      bg.lineStyle(1, COLOR.accentNum, 0.9);
      bg.strokeRect(px + 0.5, py + 0.5, PORTRAIT - 1, PORTRAIT - 1);
      portrait.setPosition(px - PORTRAIT_CROP.x * portrait.scaleX, py - PORTRAIT_CROP.y * portrait.scaleY);
      heroName.setPosition(px + PORTRAIT + SPACE.md, py + 4);
      heroKey.setPosition(px + PORTRAIT + SPACE.md, py + 30);

      const barX = px;
      const barW = hero.width - SPACE.md * 2;
      const right = barX + barW;
      hpLabel.setPosition(barX, py + PORTRAIT + SPACE.sm);
      hpValue.setPosition(right, py + PORTRAIT + SPACE.sm);
      barRects.hp = { x: barX, y: hpLabel.y + 20, width: barW, height: 12 };
      satLabel.setPosition(barX, barRects.hp.y + 18);
      satValue.setPosition(right, barRects.hp.y + 18);
      barRects.sat = { x: barX, y: satLabel.y + 20, width: barW, height: 12 };

      const sel = layout.selection;
      selectionShown = sel.width > 0;
      if (selectionShown) drawPanel(bg, sel);
      selTitle.setPosition(sel.x + SPACE.lg, sel.y + SPACE.lg);
      selStatus.setPosition(sel.x + SPACE.lg, sel.y + SPACE.lg + 34).setLineSpacing(6);
      selEmpty.setPosition(sel.x + sel.width / 2, sel.y + sel.height / 2);
      groupLine.setPosition(sel.x + SPACE.lg, sel.y + sel.height - SPACE.md);
    },
  };
}
