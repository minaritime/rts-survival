import Phaser from 'phaser';
import { RAID_SHOW_TICKS, type World } from '../sim/world.ts';
import { iconKey } from './assets.ts';
import { tileToPx } from './coords.ts';
import { DEPTH, PALETTE } from './palette.ts';
import { TOP_BAR_HEIGHT } from './ui/layout.ts';
import { COLOR, FONT, textStyle } from './ui/tokens.ts';
import { makeFixer } from './ui/widgets.ts';

/**
 * 섬멸형 표시 (글 없이 그림 + 숫자, waveAlert.ts 와 같은 방식).
 * - 위 가운데: 붉은 적 사령부 그림 + 남은 적 건물 수, 붉은 소총병 그림 + 적 병력 수
 * - 약탈: 부서진 내 사령부 자리에 열매 그림 + "-N" 이 떠오르며 사라짐
 * 섬멸형이 아니면 아무것도 안 보인다.
 */
export interface EnemyHud {
  update(world: World): void;
  layout(width: number, height: number): void;
}

const ROW_Y = TOP_BAR_HEIGHT + 8;
/** 약탈 글이 떠오르는 높이 (px) */
const RAID_RISE = 40;

export function createEnemyHud(scene: Phaser.Scene, minimapCamera: Phaser.Cameras.Scene2D.Camera): EnemyHud {
  const fix = makeFixer(minimapCamera, DEPTH.hud + 1);
  const style = { ...textStyle(FONT.number, COLOR.text), fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 };
  const baseIcon = fix(scene.add.image(0, ROW_Y + 11, iconKey('commandCenter')).setDisplaySize(26, 26).setTint(PALETTE.enemyTint));
  const baseText = fix(scene.add.text(0, ROW_Y, '', style).setOrigin(0, 0));
  const armyIcon = fix(scene.add.image(0, ROW_Y + 11, iconKey('rifleman')).setDisplaySize(26, 26).setTint(PALETTE.enemyTint));
  const armyText = fix(scene.add.text(0, ROW_Y, '', style).setOrigin(0, 0));
  const parts = [baseIcon, baseText, armyIcon, armyText];
  for (const p of parts) p.setVisible(false);

  // 약탈 글은 지도 위 (지도와 같이 움직임)
  const raidTexts = new Map<string, Phaser.GameObjects.Container>();
  const raidKey = (r: World['raids'][number]): string => `${r.tick}:${r.x}:${r.y}`;
  const raidStyle = { ...textStyle(FONT.large, '#ff4d4f'), fontStyle: 'bold', stroke: '#000000', strokeThickness: 5 };

  let centerX = scene.scale.width / 2;
  const place = (): void => {
    baseIcon.setX(centerX - 70);
    baseText.setX(centerX - 52);
    armyIcon.setX(centerX + 20);
    armyText.setX(centerX + 38);
  };
  place();

  const syncRaids = (world: World): void => {
    const live = new Set(world.raids.map(raidKey));
    for (const r of world.raids) {
      let c = raidTexts.get(raidKey(r));
      if (!c) {
        const icon = scene.add.image(-18, 0, iconKey('berry')).setDisplaySize(30, 30);
        const text = scene.add.text(0, 0, `-${r.amount}`, raidStyle).setOrigin(0, 0.5);
        c = scene.add.container(tileToPx(r.x), tileToPx(r.y), [icon, text]).setDepth(DEPTH.topOverlay + 2);
        minimapCamera.ignore(c);
        raidTexts.set(raidKey(r), c);
      }
      const t = (world.tick - r.tick) / RAID_SHOW_TICKS;
      c.setY(tileToPx(r.y) - RAID_RISE * t).setAlpha(1 - t * t);
    }
    for (const [key, c] of raidTexts) {
      if (live.has(key)) continue;
      c.destroy();
      raidTexts.delete(key);
    }
  };

  return {
    update(world) {
      const on = world.objective === 'annihilate' && world.outcome === 'playing';
      for (const p of parts) p.setVisible(on);
      syncRaids(world);
      if (!on) return;
      baseText.setText(String(world.buildings.filter((b) => b.owner === 'enemy').length));
      armyText.setText(String(world.units.filter((u) => u.owner === 'enemy' && u.hp > 0 && u.kind === 'rifleman').length));
    },
    layout(width) {
      centerX = width / 2;
      place();
    },
  };
}
