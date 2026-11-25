import Phaser from 'phaser';
import { WAVES } from '../data/monsters.ts';
import { isMonster } from '../sim/entities.ts';
import { waveWarning } from '../sim/systems/waves.ts';
import { elapsedSeconds, formatClock, type Direction, type World } from '../sim/world.ts';
import { DEPTH } from './palette.ts';
import { TOP_BAR_HEIGHT } from './ui/layout.ts';
import { COLOR, FONT, textStyle } from './ui/tokens.ts';
import { makeFixer } from './ui/widgets.ts';

/**
 * 괴물 공격 알림: 화면 위 가운데 (시제품.md 3장 "경고", 11/25 사용자 요청 "웨이브가 얼마나 남았는지").
 * - 평소: "2번째 공격까지 1:25" + 차오르는 막대 (흰색)
 * - 공격 30초 전: "괴물 무리가 북쪽에서 옵니다  0:25" (노랑, 깜박임)
 * - 괴물이 맵에 있는 동안: "괴물 공격 중  남은 7" (빨강) + 다음 공격까지 막대
 * 공격이 꺼진 판(튜토리얼)에서는 안 보인다.
 */
export interface WaveBanner {
  update(world: World, timeMs: number): void;
  layout(width: number): void;
}

export const DIRECTION_NAME: Readonly<Record<Direction, string>> = { north: '북쪽', east: '동쪽' };

const BAR = { width: 280, height: 6 } as const;
const TEXT_Y = TOP_BAR_HEIGHT + 6;
const BAR_Y = TEXT_Y + 30;

/** 지난 공격(첫 공격이면 판 시작)부터 다음 공격까지 얼마나 왔는지 0~1 */
export function waveProgress(nextAt: number, number: number, now: number): number {
  const span = number === 1 ? WAVES.firstSeconds : WAVES.intervalSeconds;
  return Math.max(0, Math.min(1, 1 - (nextAt - now) / span));
}

export function createWaveBanner(scene: Phaser.Scene, minimapCamera: Phaser.Cameras.Scene2D.Camera): WaveBanner {
  const fix = makeFixer(minimapCamera, DEPTH.hud + 1);
  const text = fix(
    scene.add
      .text(0, TEXT_Y, '', {
        ...textStyle(FONT.title, COLOR.text),
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setVisible(false),
  );
  const bar = fix(scene.add.graphics());
  let centerX = 0;

  const drawBar = (ratio: number, color: number): void => {
    const x = centerX - BAR.width / 2;
    bar.fillStyle(0x000000, 0.6);
    bar.fillRect(x - 1, BAR_Y - 1, BAR.width + 2, BAR.height + 2);
    bar.fillStyle(color, 1);
    bar.fillRect(x, BAR_Y, BAR.width * ratio, BAR.height);
  };

  return {
    update(world, timeMs) {
      bar.clear();
      text.setVisible(false);
      if (!world.waves.enabled) return;
      const now = elapsedSeconds(world);
      const w = world.waves;
      const ratio = waveProgress(w.nextAt, w.number, now);
      const untilNext = formatClock(Math.ceil(w.nextAt - now));
      const warning = waveWarning(world, now);
      const alive = world.creatures.filter((c) => c.hp > 0 && isMonster(c) && !c.retreating).length;
      if (warning) {
        text
          .setText(`괴물 무리가 ${DIRECTION_NAME[warning.direction]}에서 옵니다  ${untilNext}`)
          .setColor(COLOR.warning)
          .setAlpha(0.65 + 0.35 * Math.abs(Math.sin(timeMs / 300)))
          .setVisible(true);
        drawBar(ratio, COLOR.warningNum);
        return;
      }
      if (alive > 0) {
        text.setText(`괴물 공격 중  남은 ${alive}`).setColor(COLOR.danger).setAlpha(1).setVisible(true);
        drawBar(ratio, COLOR.dangerNum);
        return;
      }
      text.setText(`${w.number}번째 공격까지  ${untilNext}`).setColor(COLOR.text).setAlpha(0.95).setVisible(true);
      drawBar(ratio, 0xd9d9d9);
    },
    layout(width) {
      centerX = width / 2;
      text.setX(centerX);
    },
  };
}
