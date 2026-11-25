import Phaser from 'phaser';
import type { ScreenPoint } from './coords.ts';
import type { Cursor } from './cursor.ts';

/** 화면 이동 속도 (픽셀/초) */
const SCROLL_SPEED = 1100;
/** 커서가 화면 가장자리에서 이만큼 안에 있으면 그쪽으로 이동 (픽셀) */
const EDGE_SIZE = 14;

export interface CameraControl {
  update(deltaMs: number): void;
}

/**
 * 방향키와 화면 가장자리 커서로 주 카메라를 움직인다.
 * 마우스를 가둔 동안은 커서가 화면 끝에서 멈추므로 가장자리 이동이 확실히 걸린다.
 * ignoreEdgeAt: 이 위치에서는 가장자리 이동을 하지 않음 (미니맵 위)
 */
export function createCameraControl(
  scene: Phaser.Scene,
  cursor: Cursor,
  ignoreEdgeAt: (p: ScreenPoint) => boolean,
): CameraControl {
  const keyboard = scene.input.keyboard;
  if (!keyboard) throw new Error('키보드 입력을 쓸 수 없음');
  const keys = keyboard.createCursorKeys();

  // 잠그지 않은 때: 마우스가 화면 안에서 한 번도 안 움직였으면 위치가 (0, 0)으로 잡혀 있어서
  // 가장자리 이동이 저절로 걸린다. 실제로 움직인 뒤부터만 가장자리 이동을 쓴다.
  let pointerSeen = false;
  scene.input.on('pointermove', () => {
    pointerSeen = true;
  });
  scene.input.on('gameout', () => {
    pointerSeen = false;
  });

  return {
    update(deltaMs) {
      const cam = scene.cameras.main;
      const at = { x: cursor.x, y: cursor.y };
      const inside = cursor.locked || (pointerSeen && scene.input.isOver);
      let dx = 0;
      let dy = 0;

      if (keys.left.isDown) dx -= 1;
      if (keys.right.isDown) dx += 1;
      if (keys.up.isDown) dy -= 1;
      if (keys.down.isDown) dy += 1;

      if (inside && !ignoreEdgeAt(at)) {
        if (at.x <= EDGE_SIZE) dx -= 1;
        if (at.x >= cam.width - EDGE_SIZE) dx += 1;
        if (at.y <= EDGE_SIZE) dy -= 1;
        if (at.y >= cam.height - EDGE_SIZE) dy += 1;
      }

      const sx = Math.sign(dx);
      const sy = Math.sign(dy);
      if (sx === 0 && sy === 0) return;
      // 대각선도 같은 속도로 (방향 길이를 1로 맞춤)
      const distance = (SCROLL_SPEED * deltaMs) / 1000 / Math.hypot(sx, sy);
      cam.scrollX += sx * distance;
      cam.scrollY += sy * distance;
    },
  };
}
