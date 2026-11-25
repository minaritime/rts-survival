import Phaser from 'phaser';
import { isMonster } from '../sim/entities.ts';
import { waveWarning } from '../sim/systems/waves.ts';
import { elapsedSeconds, type Direction, type World } from '../sim/world.ts';
import { DEPTH } from './palette.ts';
import { TOP_BAR_HEIGHT } from './ui/layout.ts';
import { COLOR, FONT, textStyle } from './ui/tokens.ts';
import { makeFixer } from './ui/widgets.ts';

/**
 * 괴물 공격 알림 (시제품.md 3장 "경고"): 화면 위 가운데 띠.
 * - 공격 30초 전: "괴물 무리가 북쪽에서 옵니다  25초" (노랑, 깜박임)
 * - 괴물이 맵에 있는 동안: "괴물 공격 중  남은 7" (빨강)
 */
export interface WaveBanner {
  update(world: World, timeMs: number): void;
  layout(width: number): void;
}

export const DIRECTION_NAME: Readonly<Record<Direction, string>> = { north: '북쪽', east: '동쪽' };

export function createWaveBanner(scene: Phaser.Scene, minimapCamera: Phaser.Cameras.Scene2D.Camera): WaveBanner {
  const fix = makeFixer(minimapCamera, DEPTH.hud + 1);
  const text = fix(
    scene.add
      .text(0, TOP_BAR_HEIGHT + 10, '', {
        ...textStyle(FONT.title, COLOR.warning),
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setVisible(false),
  );

  return {
    update(world, timeMs) {
      const warning = waveWarning(world, elapsedSeconds(world));
      const alive = world.creatures.filter((c) => c.hp > 0 && isMonster(c) && !c.retreating).length;
      if (warning) {
        text
          .setText(`괴물 무리가 ${DIRECTION_NAME[warning.direction]}에서 옵니다  ${Math.ceil(warning.secondsLeft)}초`)
          .setColor(COLOR.warning)
          .setAlpha(0.65 + 0.35 * Math.abs(Math.sin(timeMs / 300)))
          .setVisible(true);
        return;
      }
      if (alive > 0) {
        text.setText(`괴물 공격 중  남은 ${alive}`).setColor(COLOR.danger).setAlpha(1).setVisible(true);
        return;
      }
      text.setVisible(false);
    },
    layout(width) {
      text.setX(width / 2);
    },
  };
}
