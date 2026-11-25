import Phaser from 'phaser';
import { TILE_SIZE } from '../data/constants.ts';
import { isMonster } from '../sim/entities.ts';
import type { Point } from '../sim/grid.ts';
import { hasMoreWaves, waveProgress, waveWarning } from '../sim/systems/waves.ts';
import { elapsedSeconds, formatClock, type World } from '../sim/world.ts';
import { iconKey } from './assets.ts';
import { DEPTH } from './palette.ts';
import { BOTTOM_PANEL_HEIGHT, TOP_BAR_HEIGHT } from './ui/layout.ts';
import { COLOR, FONT, textStyle } from './ui/tokens.ts';
import { makeFixer } from './ui/widgets.ts';

/**
 * 괴물 공격 알림 (사용자 요청 11/25: 문장 대신 지도에 표현).
 * - 공격 30초 전부터 나올 때까지: 그 입구 칸을 빨갛게 깜박이고 안쪽을 가리키는 화살표 + 남은 초.
 *   입구가 화면 밖이면 화면 가장자리에 빨간 화살표.
 * - 위 가운데(글 없이): 모래시계 + 버틸 시간, 괴물 그림 + 다음 공격까지 시간(막대). 공격 중이면 괴물 수.
 * 공격이 꺼진 판(튜토리얼)에서는 아무것도 안 보인다.
 */
export interface WaveAlert {
  update(world: World, timeMs: number): void;
  layout(width: number, height: number): void;
}

const RED = 0xff4d4f;
const BAR = { width: 120, height: 5 } as const;
const ROW_Y = TOP_BAR_HEIGHT + 8;


/** 입구 칸들에서 지도 안쪽을 향하는 방향 (한 칸 단위) */
function inwardOf(world: World, gates: readonly Point[]): Point {
  const g = gates[0]!;
  const { width, height } = world.map.grid;
  if (g.y === 0) return { x: 0, y: 1 };
  if (g.y === height - 1) return { x: 0, y: -1 };
  if (g.x === 0) return { x: 1, y: 0 };
  if (g.x === width - 1) return { x: -1, y: 0 };
  return { x: 0, y: 1 };
}

export function createWaveAlert(scene: Phaser.Scene, minimapCamera: Phaser.Cameras.Scene2D.Camera): WaveAlert {
  const main = scene.cameras.main;
  // 지도 위 표시 (미니맵은 minimap.ts 가 따로 깜박임)
  const onMap = scene.add.graphics().setDepth(DEPTH.topOverlay);
  minimapCamera.ignore(onMap);
  const countdown = scene.add
    .text(0, 0, '', { ...textStyle(FONT.large * 1.4, '#ff4d4f'), fontStyle: 'bold', stroke: '#000000', strokeThickness: 5 })
    .setOrigin(0.5)
    .setDepth(DEPTH.topOverlay + 1)
    .setVisible(false);
  minimapCamera.ignore(countdown);

  // 화면에 붙는 것: 가장자리 화살표, 위 가운데 줄
  const fix = makeFixer(minimapCamera, DEPTH.hud + 1);
  const edge = fix(scene.add.graphics());
  const top = fix(scene.add.graphics());
  const style = { ...textStyle(FONT.number, COLOR.text), fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 };
  const surviveText = fix(scene.add.text(0, ROW_Y, '', style).setOrigin(0, 0));
  const monsterIcon = fix(scene.add.image(0, ROW_Y + 11, iconKey('swarm')).setDisplaySize(26, 26));
  const waveText = fix(scene.add.text(0, ROW_Y, '', style).setOrigin(0, 0));
  let width = scene.scale.width;
  let height = scene.scale.height;

  const hideAll = (): void => {
    for (const o of [countdown, surviveText, monsterIcon, waveText]) o.setVisible(false);
  };

  /** 모래시계 (글 대신) */
  const drawHourglass = (x: number, y: number, color: number): void => {
    top.fillStyle(color, 1);
    top.fillTriangle(x, y, x + 14, y, x + 7, y + 10);
    top.fillTriangle(x, y + 20, x + 14, y + 20, x + 7, y + 10);
    top.lineStyle(2, 0x000000, 0.8);
    top.strokeTriangle(x, y, x + 14, y, x + 7, y + 10);
    top.strokeTriangle(x, y + 20, x + 14, y + 20, x + 7, y + 10);
  };

  /** 입구 표시 + 화면 밖이면 가장자리 화살표 */
  const drawGateAlert = (world: World, gates: readonly Point[], secondsLeft: number, timeMs: number): void => {
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(timeMs / 220));
    const T = TILE_SIZE;
    const xs = gates.map((g) => g.x);
    const ys = gates.map((g) => g.y);
    const x0 = Math.min(...xs) * T;
    const y0 = Math.min(...ys) * T;
    const x1 = (Math.max(...xs) + 1) * T;
    const y1 = (Math.max(...ys) + 1) * T;
    onMap.fillStyle(RED, 0.35 * pulse);
    onMap.fillRect(x0 - T, y0 - T, x1 - x0 + 2 * T, y1 - y0 + 2 * T);
    onMap.lineStyle(4, RED, pulse);
    onMap.strokeRect(x0 - T, y0 - T, x1 - x0 + 2 * T, y1 - y0 + 2 * T);
    // 안쪽을 가리키는 꺾쇠 셋 (괴물이 들어올 방향)
    const inward = inwardOf(world, gates);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const side = { x: -inward.y, y: inward.x };
    for (let i = 1; i <= 3; i++) {
      const d = T * (1.2 + i * 0.9) + ((timeMs / 12) % (T * 0.9));
      const px = cx + inward.x * d;
      const py = cy + inward.y * d;
      const w = T * 0.9;
      onMap.lineStyle(5, RED, pulse * (1 - i * 0.2));
      onMap.lineBetween(px - side.x * w - inward.x * 18, py - side.y * w - inward.y * 18, px, py);
      onMap.lineBetween(px + side.x * w - inward.x * 18, py + side.y * w - inward.y * 18, px, py);
    }
    countdown
      .setText(String(Math.ceil(secondsLeft)))
      .setPosition(cx + inward.x * T * 5.5, cy + inward.y * T * 5.5)
      .setAlpha(pulse)
      .setVisible(true);

    // 화면 밖이면 가장자리 화살표 (위 줄·아래 판을 피한 안쪽 사각형에서)
    const view = main.worldView;
    if (Phaser.Geom.Rectangle.Contains(view, cx, cy)) return;
    const sx = cx - view.x;
    const sy = cy - view.y;
    const midX = width / 2;
    const midY = (TOP_BAR_HEIGHT + height - BOTTOM_PANEL_HEIGHT) / 2;
    const dx = sx - midX;
    const dy = sy - midY;
    const halfW = width / 2 - 30;
    const halfH = (height - BOTTOM_PANEL_HEIGHT - TOP_BAR_HEIGHT) / 2 - 30;
    const k = Math.min(halfW / Math.abs(dx || 1e-6), halfH / Math.abs(dy || 1e-6));
    const ax = midX + dx * k;
    const ay = midY + dy * k;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    edge.fillStyle(RED, pulse);
    edge.fillTriangle(ax + ux * 22, ay + uy * 22, ax - uy * 16 - ux * 8, ay + ux * 16 - uy * 8, ax + uy * 16 - ux * 8, ay - ux * 16 - uy * 8);
    edge.lineStyle(2, 0x000000, 0.9);
    edge.strokeTriangle(ax + ux * 22, ay + uy * 22, ax - uy * 16 - ux * 8, ay + ux * 16 - uy * 8, ax + uy * 16 - ux * 8, ay - ux * 16 - uy * 8);
  };

  return {
    update(world, timeMs) {
      onMap.clear();
      edge.clear();
      top.clear();
      hideAll();
      const w = world.waves;
      if (!w.enabled || w.retreatAt !== null || world.outcome !== 'playing') return;
      const now = elapsedSeconds(world);

      const warning = waveWarning(world, now);
      if (warning) drawGateAlert(world, world.map.features.entrances[warning.direction], warning.secondsLeft, timeMs);

      // 위 가운데: [모래시계 남은 생존 시간]  [괴물 다음 공격까지 / 공격 중 괴물 수]
      const alive = world.creatures.filter((c) => c.hp > 0 && isMonster(c) && !c.retreating).length;
      const more = hasMoreWaves(world);
      const survive = w.surviveSeconds !== null ? formatClock(Math.ceil(w.surviveSeconds - now)) : null;
      const waveLabel = alive > 0 ? `${alive}` : more ? formatClock(Math.ceil(w.nextAt - now)) : null;
      const blocks: number[] = [];
      if (survive !== null) blocks.push(22 + 58);
      if (waveLabel !== null) blocks.push(32 + 58);
      const total = blocks.reduce((a, b) => a + b, 0) + (blocks.length - 1) * 24;
      let x = width / 2 - total / 2;
      if (survive !== null) {
        drawHourglass(x, ROW_Y + 1, 0xd9d9d9);
        surviveText.setText(survive).setColor(COLOR.text).setPosition(x + 22, ROW_Y).setVisible(true);
        x += 22 + 58 + 24;
      }
      if (waveLabel !== null) {
        const hot = alive > 0 || warning !== null;
        const pulse = warning ? 0.55 + 0.45 * Math.abs(Math.sin(timeMs / 220)) : 1;
        monsterIcon.setPosition(x + 13, ROW_Y + 11).setAlpha(pulse).setVisible(true);
        waveText
          .setText(waveLabel)
          .setColor(hot ? COLOR.danger : COLOR.text)
          .setAlpha(pulse)
          .setPosition(x + 32, ROW_Y)
          .setVisible(true);
        if (alive === 0) {
          // 다음 공격까지 차오르는 막대
          const ratio = waveProgress(w.lastAt, w.nextAt, now);
          top.fillStyle(0x000000, 0.6);
          top.fillRect(x - 1, ROW_Y + 27, BAR.width + 2, BAR.height + 2);
          top.fillStyle(warning ? RED : 0xd9d9d9, pulse);
          top.fillRect(x, ROW_Y + 28, BAR.width * ratio, BAR.height);
        }
      }
    },
    layout(w, h) {
      width = w;
      height = h;
    },
  };
}
