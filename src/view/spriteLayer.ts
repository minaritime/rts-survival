import Phaser from 'phaser';
import { BERRY } from '../data/resources.ts';
import { TILE_SIZE } from '../data/constants.ts';
import type { Building, Creature, ResourceNode, Unit } from '../sim/entities.ts';
import { BUILDING_IMAGE } from './placement.ts';
import type { World } from '../sim/world.ts';
import { SHEETS, directionIndex, type ImageKey } from './assets.ts';
import { tileToPx, unitScreenPos } from './coords.ts';
import { PALETTE } from './palette.ts';

/** 걷기 그림이 넘어가는 속도 (장/초) */
const WALK_FPS = 8;

export interface SpriteLayer {
  update(world: World, alpha: number, timeMs: number): void;
}

function buildingTexture(b: Building): string {
  const images = BUILDING_IMAGE[b.kind];
  return b.complete ? images.done : images.frame;
}

function nodeTexture(node: ResourceNode): ImageKey {
  switch (node.kind) {
    case 'mineral':
      return (['mineral_0', 'mineral_1', 'mineral_2'] as const)[node.id % 3]!;
    case 'debris':
      return node.id % 2 === 0 ? 'debris_0' : 'debris_1';
    case 'berry':
      if (node.amount <= 0) return 'berry_empty';
      return node.amount >= (BERRY.startFruit * 2) / 3 ? 'berry_full' : 'berry_half';
    case 'meat':
      return 'meat';
  }
}

/**
 * 자원·배급처·사냥감·유닛을 Blender 그림으로 그린다.
 * 바닥점이 아래(남)에 있을수록 앞에 오도록 depth = 화면 y.
 */
export function createSpriteLayer(scene: Phaser.Scene, world: World): SpriteLayer {
  const nodeImages = new Map<number, Phaser.GameObjects.Image>();
  const buildingImages = new Map<number, Phaser.GameObjects.Image>();
  const unitSprites = new Map<number, Phaser.GameObjects.Sprite>();
  const facing = new Map<number, number>();

  // 배급처: 켜지면(6칸 안에 다 지은 건물) 켜진 그림
  const feederImages = world.feeders.map((f) =>
    scene.add.image(tileToPx(f.x), tileToPx(f.y), 'feeder_off').setDepth(tileToPx(f.y)),
  );
  const syncFeeders = (): void => {
    world.feeders.forEach((f, i) => {
      const key = f.active ? 'feeder_on' : 'feeder_off';
      const img = feederImages[i]!;
      if (img.texture.key !== key) img.setTexture(key);
      // 적이 차지한 배급처는 붉게
      if (f.owner === 'enemy') img.setTint(PALETTE.enemyTint);
      else img.clearTint();
    });
  };
  const creatureSprites = new Map<number, Phaser.GameObjects.Sprite>();

  /** 이번 프레임의 자원 id → 자원 (유닛마다 world.nodes 를 처음부터 훑지 않게) */
  let nodeById = new Map<number, ResourceNode>();

  const syncNodes = (): void => {
    nodeById = new Map(world.nodes.map((n) => [n.id, n]));
    for (const node of world.nodes) {
      const key = nodeTexture(node);
      const img = nodeImages.get(node.id);
      if (!img) {
        nodeImages.set(node.id, scene.add.image(tileToPx(node.x), tileToPx(node.y), key).setDepth(tileToPx(node.y)));
      } else if (img.texture.key !== key) {
        img.setTexture(key);
      }
    }
    for (const [id, img] of nodeImages) {
      if (nodeById.has(id)) continue;
      img.destroy();
      nodeImages.delete(id);
    }
  };

  /** 건물: 그림 한가운데 = 건물 자리 한가운데. 아래쪽 끝을 depth 로 써서 건물 앞(남쪽) 유닛이 앞에 그려진다 */
  const syncBuildings = (): void => {
    const alive = new Set<number>();
    for (const b of world.buildings) {
      alive.add(b.id);
      const key = buildingTexture(b);
      const img = buildingImages.get(b.id);
      if (!img) {
        const x = (b.x + b.width / 2) * TILE_SIZE;
        const y = (b.y + b.height / 2) * TILE_SIZE;
        const img = scene.add.image(x, y, key).setDepth((b.y + b.height) * TILE_SIZE - 1);
        if (b.owner === 'enemy') img.setTint(PALETTE.enemyTint);
        buildingImages.set(b.id, img);
      } else if (img.texture.key !== key) {
        img.setTexture(key);
      }
    }
    for (const [id, img] of buildingImages) {
      if (alive.has(id)) continue;
      img.destroy();
      buildingImages.delete(id);
    }
  };

  /** 걷는 중이면 걷는 방향, 채집 중이면 자원 쪽, 싸우는 중이면 상대 쪽, 아니면 마지막 방향 */
  const faceOf = (unit: Unit): number => {
    const dx = unit.x - unit.prevX;
    const dy = unit.y - unit.prevY;
    let dir = facing.get(unit.id) ?? 2;
    const foeId = unit.order.type === 'attack' ? unit.order.targetId : unit.engageId;
    const foe =
      foeId === null ? undefined : (world.creatures.find((c) => c.id === foeId) ?? world.units.find((u) => u.id === foeId));
    if (Math.hypot(dx, dy) > 1e-6) dir = directionIndex(dx, dy);
    else if (foe) dir = directionIndex(foe.x - unit.x, foe.y - unit.y);
    else if (unit.order.type === 'gather' && unit.path.length === 0) {
      const node = nodeById.get(unit.order.nodeId);
      if (node) dir = directionIndex(node.x - unit.x, node.y - unit.y);
    }
    facing.set(unit.id, dir);
    return dir;
  };

  /** 괴물·사냥감: 걷는 방향으로. 멈춰 있으면 마지막 방향 */
  const faceOfCreature = (c: Creature): number => {
    const dx = c.x - c.prevX;
    const dy = c.y - c.prevY;
    const dir = Math.hypot(dx, dy) > 1e-6 ? directionIndex(dx, dy) : (facing.get(c.id) ?? (c.id * 3) % 8);
    facing.set(c.id, dir);
    return dir;
  };

  const syncCreatures = (alpha: number, timeMs: number): void => {
    const alive = new Set<number>();
    for (const c of world.creatures) {
      alive.add(c.id);
      let sprite = creatureSprites.get(c.id);
      if (!sprite) {
        sprite = scene.add.sprite(0, 0, c.kind);
        creatureSprites.set(c.id, sprite);
      }
      const { x, y } = unitScreenPos(c, alpha);
      const cols = SHEETS[c.kind].frames;
      const moving = Math.hypot(c.x - c.prevX, c.y - c.prevY) > 1e-6;
      // 괴물은 걸음이 빠르므로 그림도 빠르게 넘긴다
      const fps = c.kind === 'swarm' ? WALK_FPS * 1.6 : WALK_FPS;
      const step = moving && cols > 1 ? 1 + (Math.floor((timeMs / 1000) * fps) % (cols - 1)) : 0;
      sprite.setPosition(x, y).setDepth(y).setFrame(faceOfCreature(c) * cols + step);
    }
    for (const [id, sprite] of creatureSprites) {
      if (alive.has(id)) continue;
      sprite.destroy();
      creatureSprites.delete(id);
      facing.delete(id);
    }
  };

  const syncUnits = (alpha: number, timeMs: number): void => {
    const alive = new Set<number>();
    for (const unit of world.units) {
      alive.add(unit.id);
      let sprite = unitSprites.get(unit.id);
      if (!sprite) {
        sprite = scene.add.sprite(0, 0, unit.kind);
        if (unit.owner === 'enemy') sprite.setTint(PALETTE.enemyTint);
        unitSprites.set(unit.id, sprite);
      }
      if (unit.hp <= 0) {
        sprite.setVisible(false);
        continue;
      }
      const { x, y } = unitScreenPos(unit, alpha);
      const cols = SHEETS[unit.kind].frames;
      const moving = Math.hypot(unit.x - unit.prevX, unit.y - unit.prevY) > 1e-6;
      const step = moving && cols > 1 ? 1 + (Math.floor((timeMs / 1000) * WALK_FPS) % (cols - 1)) : 0;
      sprite.setPosition(x, y).setDepth(y).setFrame(faceOf(unit) * cols + step);
    }
    // 세계에서 빠진 유닛의 그림·방향 기억을 지운다
    for (const [id, sprite] of unitSprites) {
      if (alive.has(id)) continue;
      sprite.destroy();
      unitSprites.delete(id);
      facing.delete(id);
    }
  };

  return {
    update(_world, alpha, timeMs) {
      syncNodes();
      syncFeeders();
      syncBuildings();
      syncUnits(alpha, timeMs);
      syncCreatures(alpha, timeMs);
    },
  };
}
