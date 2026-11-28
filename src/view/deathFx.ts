import Phaser from 'phaser';

/** 쓰러지는 시간·사라지는 시간 (ms) */
const FALL_MS = 260;
const FADE_MS = 700;
const FADE_DELAY_MS = 700;
/** 쓰러진 몸 색 (곱하기). 적은 이미 붉은 색을 곱해 두었으니 그 위에 어둡게 */
const CORPSE_TINT = 0x5a5a5a;
/** 괴물이 남기는 바닥 얼룩 */
const SPLAT_COLOR = 0x3a0505;
const SPLAT_ALPHA = 0.55;

/**
 * 죽음 연출: 옆으로 쓰러지며 납작해지고 어두워진 뒤 흐려져 사라진다. 다 끝나면 그림을 지운다.
 * 세계(sim)에서는 이미 빠진 뒤라 그림만 남아 혼자 움직인다.
 */
export function playDeath(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, id: number, monster: boolean): void {
  // 쓰러지는 쪽은 id 로 정함 (매번 같은 쪽이면 어색함)
  const side = id % 2 === 0 ? 1 : -1;
  const baseTint = sprite.tintTopLeft;
  sprite.setTint(multiply(baseTint, CORPSE_TINT));
  sprite.setDepth(sprite.depth - 1);
  if (monster) addSplat(scene, sprite);
  scene.tweens.add({
    targets: sprite,
    angle: side * 80,
    scaleY: 0.7,
    y: sprite.y + 6,
    duration: FALL_MS,
    ease: 'Quad.easeIn',
  });
  scene.tweens.add({
    targets: sprite,
    alpha: 0,
    delay: FALL_MS + FADE_DELAY_MS,
    duration: FADE_MS,
    onComplete: () => sprite.destroy(),
  });
}

function addSplat(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite): void {
  const splat = scene.add.ellipse(sprite.x, sprite.y + 10, 34, 14, SPLAT_COLOR, SPLAT_ALPHA).setDepth(sprite.depth - 1).setScale(0.3);
  scene.tweens.add({ targets: splat, scale: 1, duration: FALL_MS, ease: 'Quad.easeOut' });
  scene.tweens.add({
    targets: splat,
    alpha: 0,
    delay: FALL_MS + FADE_DELAY_MS + FADE_MS,
    duration: FADE_MS,
    onComplete: () => splat.destroy(),
  });
}

/** 두 색 곱하기 (0xRRGGBB) */
function multiply(a: number, b: number): number {
  const ch = (shift: number): number => Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
