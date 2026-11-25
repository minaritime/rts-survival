import Phaser from 'phaser';
import { BUILDINGS, type BuildingKind } from '../data/buildings.ts';
import { TILE_SIZE } from '../data/constants.ts';
import { canPlace, commandBuild, tooCloseToResource } from '../sim/commands.ts';
import type { Point } from '../sim/grid.ts';
import { isWalkable, type World } from '../sim/world.ts';
import type { ScreenPoint } from './coords.ts';
import { DEPTH } from './palette.ts';

const T = TILE_SIZE;
/** 건물 그림 키 (assets.ts IMAGES) */
export const BUILDING_IMAGE: Readonly<Record<BuildingKind, { done: string; frame: string }>> = {
  campfire: { done: 'campfire', frame: 'frame_1' },
  barricade: { done: 'barricade', frame: 'frame_1' },
  scrapTurret: { done: 'scrap_turret', frame: 'frame_1' },
  commandCenter: { done: 'command_center', frame: 'command_center_frame' },
  supplyDepot: { done: 'supply_depot', frame: 'frame_2' },
  barracks: { done: 'barracks', frame: 'frame_3' },
  turret: { done: 'turret', frame: 'frame_2' },
};

export interface Placement {
  /** 건물 자리를 고르는 중인지 (그동안 지도 클릭은 고르기가 아니라 놓기) */
  readonly active: boolean;
  start(kind: BuildingKind): void;
  cancel(): void;
  update(): void;
}

export interface PlacementDeps {
  readonly getWorld: () => World;
  readonly getBuilders: () => readonly number[];
  readonly cursorAt: () => ScreenPoint;
  readonly isBlockedAt: (p: ScreenPoint) => boolean;
  readonly isActive: () => boolean;
  readonly minimapCamera: Phaser.Cameras.Scene2D.Camera;
}

/** 커서 아래 칸을 건물 한가운데로 하는 왼쪽 위 칸 */
export function footprintAt(worldX: number, worldY: number, kind: BuildingKind): Point {
  const spec = BUILDINGS[kind];
  return {
    x: Math.floor(worldX / T) - Math.floor(spec.width / 2),
    y: Math.floor(worldY / T) - Math.floor(spec.height / 2),
  };
}

/**
 * 건물 자리 고르기 (스타식): 반투명 건물 + 칸마다 초록(놓을 수 있음)/빨강(안 됨)이 커서를 따라온다.
 * 왼쪽 클릭으로 놓고(짓기 명령), 오른쪽 클릭으로 취소한다.
 * 이 모듈의 pointerdown 은 unitInput 보다 늦게 등록해야 한다 (unitInput 이 "놓는 중" 을 보고 클릭을 양보함).
 */
export function createPlacement(scene: Phaser.Scene, deps: PlacementDeps): Placement {
  let kind: BuildingKind | null = null;
  const main = scene.cameras.main;
  const tiles = scene.add.graphics().setDepth(DEPTH.topOverlay - 2);
  const ghost = scene.add.image(0, 0, BUILDING_IMAGE.commandCenter.done).setAlpha(0.55).setVisible(false);
  ghost.setDepth(DEPTH.topOverlay - 1);
  deps.minimapCamera.ignore([tiles, ghost]);

  const spotUnderCursor = (): Point | null => {
    if (!kind) return null;
    const c = deps.cursorAt();
    const w = main.getWorldPoint(c.x, c.y);
    return footprintAt(w.x, w.y, kind);
  };

  const cancel = (): void => {
    kind = null;
    tiles.clear();
    ghost.setVisible(false);
  };

  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (!kind || !deps.isActive()) return;
    if (pointer.rightButtonDown()) {
      cancel();
      return;
    }
    if (!pointer.leftButtonDown() || deps.isBlockedAt(deps.cursorAt())) return;
    const at = spotUnderCursor();
    if (!at) return;
    // Shift: 지휘관이 지금 짓는 것을 마친 뒤 차례로 짓게 줄 세우고, 계속 놓을 수 있게 고르기를 유지 (벽 쌓기)
    const shift = (pointer.event as MouseEvent | undefined)?.shiftKey ?? false;
    const placed = commandBuild(deps.getWorld(), deps.getBuilders(), kind, at, shift);
    if (placed && !shift) cancel(); // 못 놓으면(빨강·미네랄 부족) 계속 고르는 중
  });

  return {
    get active() {
      return kind !== null;
    },
    start(next) {
      kind = next;
      ghost.setTexture(BUILDING_IMAGE[next].done).setVisible(true);
    },
    cancel,
    update() {
      tiles.clear();
      // 숫자키 등으로 지휘관이 선택에서 빠지면 놓을 일꾼이 없으니 취소 (그냥 두면 클릭이 조용히 무시됨)
      if (kind && deps.getBuilders().length === 0) cancel();
      ghost.setVisible(kind !== null && deps.isActive());
      const at = spotUnderCursor();
      if (!kind || !at || !deps.isActive()) return;
      const spec = BUILDINGS[kind];
      const world = deps.getWorld();
      const builders = deps.getBuilders();
      const affordable = world.stock.mineral >= spec.mineral;
      const ok = affordable && canPlace(world, kind, at, builders);
      for (let y = at.y; y < at.y + spec.height; y++) {
        for (let x = at.x; x < at.x + spec.width; x++) {
          const tileOk = affordable && isWalkable(world, x, y) && !tooCloseToResource(world, kind, x, y);
          tiles.fillStyle(tileOk ? 0x52c41a : 0xff4d4f, 0.28);
          tiles.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
        }
      }
      tiles.lineStyle(2, ok ? 0x52c41a : 0xff4d4f, 0.9);
      tiles.strokeRect(at.x * T, at.y * T, spec.width * T, spec.height * T);
      ghost.setPosition((at.x + spec.width / 2) * T, (at.y + spec.height / 2) * T);
    },
  };
}
