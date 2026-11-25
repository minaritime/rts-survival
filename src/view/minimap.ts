import Phaser from 'phaser';
import { TILE_SIZE } from '../data/constants.ts';
import { isMonster } from '../sim/entities.ts';
import { waveWarning } from '../sim/systems/waves.ts';
import { elapsedSeconds, type World } from '../sim/world.ts';
import type { ScreenPoint } from './coords.ts';
import { PALETTE } from './palette.ts';

/** 미니맵 한 칸의 크기 (픽셀) */
const MINIMAP_TILE = 3;
const MARGIN = 12;

export interface Minimap {
  readonly camera: Phaser.Cameras.Scene2D.Camera;
  /** 화면 좌표가 미니맵 위인지. 지도 클릭 처리는 미니맵 위 클릭을 무시해야 한다 */
  contains(point: ScreenPoint): boolean;
  /**
   * 주 카메라가 보는 범위 사각형 + 점 표시(내 유닛 초록, 내 건물 파랑, 괴물 빨강).
   * 공격이 30초 안에 오면 그 방향 입구가 깜박인다
   */
  update(world: World, timeMs: number): void;
  /** HUD 배치(ui/layout.ts)가 정한 자리로 옮긴다 */
  layout(at: { readonly x: number; readonly y: number }): void;
}

/**
 * cursorAt: 지금 커서의 화면 좌표 (마우스를 가둔 동안은 게임이 그리는 커서, cursor.ts)
 * isActive: 일시정지 중이면 false (그동안 클릭은 무시)
 */
export function createMinimap(
  scene: Phaser.Scene,
  worldWidth: number,
  worldHeight: number,
  tilesWide: number,
  tilesHigh: number,
  cursorAt: () => ScreenPoint,
  isActive: () => boolean,
): Minimap {
  const width = tilesWide * MINIMAP_TILE;
  const height = tilesHigh * MINIMAP_TILE;
  const zoom = width / worldWidth;

  const camera = scene.cameras
    .add(MARGIN, scene.scale.height - height - MARGIN, width, height)
    .setZoom(zoom)
    .setName('minimap')
    .setBackgroundColor(PALETTE.minimapBg);
  camera.centerOn(worldWidth / 2, worldHeight / 2);

  // 미니맵에만 보이는 "지금 보는 범위" 사각형
  const frame = scene.add.graphics();
  scene.cameras.main.ignore(frame);
  // 점 표시: 미니맵에서는 그림이 너무 작아 안 보이므로 색 점을 따로 찍는다
  const dots = scene.add.graphics().setDepth(1e6);
  scene.cameras.main.ignore(dots);
  const T = TILE_SIZE;
  const drawDots = (world: World, timeMs: number): void => {
    dots.clear();
    const warning = waveWarning(world, elapsedSeconds(world));
    if (warning) {
      dots.fillStyle(0xff4d4f, 0.4 + 0.6 * Math.abs(Math.sin(timeMs / 250)));
      for (const g of world.map.features.entrances[warning.direction]) dots.fillRect((g.x - 1) * T, (g.y - 1) * T, 3 * T, 3 * T);
    }
    for (const b of world.buildings) {
      dots.fillStyle(b.owner === 'enemy' ? 0xcf1322 : 0x4096ff, 1);
      dots.fillRect(b.x * T, b.y * T, b.width * T, b.height * T);
    }
    for (const u of world.units) {
      if (u.hp <= 0) continue;
      dots.fillStyle(u.owner === 'enemy' ? 0xff7875 : 0x52c41a, 1);
      dots.fillRect((u.x - 0.6) * T, (u.y - 0.6) * T, 1.7 * T, 1.7 * T);
    }
    // 적이 차지한 배급처
    dots.fillStyle(0xff7875, 1);
    for (const f of world.feeders) if (f.owner === 'enemy') dots.fillRect((f.x - 0.5) * T, (f.y - 0.5) * T, 2 * T, 2 * T);
    dots.fillStyle(0xff4d4f, 1);
    for (const c of world.creatures) {
      if (c.hp > 0 && isMonster(c)) dots.fillRect((c.x - 0.6) * T, (c.y - 0.6) * T, 1.7 * T, 1.7 * T);
    }
  };

  const isOnMinimap = (p: ScreenPoint): boolean =>
    p.x >= camera.x && p.x <= camera.x + width && p.y >= camera.y && p.y <= camera.y + height;

  const moveMainCameraTo = (p: ScreenPoint): void => {
    const target = camera.getWorldPoint(p.x, p.y);
    scene.cameras.main.centerOn(target.x, target.y);
  };

  // 왼쪽 버튼으로 미니맵 위에서 누르기 시작한 경우에만 끌어서 이동.
  // 지도에서 시작한 끌기(선택 상자)가 미니맵으로 들어와도 화면이 움직이지 않게.
  let dragging = false;
  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    const at = cursorAt();
    if (!isActive() || !pointer.leftButtonDown() || !isOnMinimap(at)) return;
    dragging = true;
    moveMainCameraTo(at);
  });
  scene.input.on('pointerup', () => {
    dragging = false;
  });

  return {
    camera,
    contains: isOnMinimap,
    update(world, timeMs) {
      drawDots(world, timeMs);
      // 끄는 중이면 커서를 따라간다 (마우스를 가둔 동안은 pointermove 위치가 안 바뀌어서 매 프레임 확인)
      const at = cursorAt();
      if (dragging && isActive() && isOnMinimap(at)) moveMainCameraTo(at);
      const view = scene.cameras.main.worldView;
      frame.clear();
      frame.lineStyle(2 / zoom, PALETTE.minimapFrame, 1);
      frame.strokeRect(view.x, view.y, view.width, view.height);
    },
    layout(at) {
      camera.setPosition(at.x, at.y);
    },
  };
}
