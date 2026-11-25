import type Phaser from 'phaser';
import { TILE_SIZE } from '../data/constants.ts';
import type { Building, Unit } from '../sim/entities.ts';
import { workSecondsFor } from '../sim/systems/units.ts';
import type { World } from '../sim/world.ts';
import type { Point } from '../sim/grid.ts';
import { tileToPx, unitScreenPos } from './coords.ts';
import { PALETTE } from './palette.ts';

/** 유닛 그림 위·아래에 얹는 표시: 발밑 선택 고리(그림보다 아래), 머리 위 작업 진행 막대(맨 위) */
function drawSelection(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number = PALETTE.selection): void {
  g.lineStyle(2, color, 0.9);
  g.strokeEllipse(x, y + 4, 40, 18);
}

/** 적·사냥감을 고르면 빨간 고리 (스타처럼 내 것과 색으로 나눔) */
const FOE_RING = 0xff4d4f;

/** 체력 비율에 따른 색: 넉넉 초록, 절반 아래 노랑, 30% 아래 빨강 */
function hpColor(ratio: number): number {
  if (ratio > 0.6) return 0x52c41a;
  if (ratio > 0.3) return 0xfaad14;
  return 0xff4d4f;
}

/** 체력 막대. 다쳤거나 골랐을 때만 그린다 */
function drawHpBar(g: Phaser.GameObjects.Graphics, cx: number, y: number, width: number, hp: number, maxHp: number): void {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const x = cx - width / 2;
  g.fillStyle(PALETTE.barBack, 0.75);
  g.fillRect(x - 1, y - 1, width + 2, 6);
  g.fillStyle(hpColor(ratio), 1);
  g.fillRect(x, y, width * ratio, 4);
}

/** 총알 선(노랑) / 근접 타격(빨간 불꽃). 0.2초 동안 흐려지며 사라짐 */
function drawShots(g: Phaser.GameObjects.Graphics, world: World): void {
  for (const s of world.shots) {
    const fade = 1 - (world.tick - s.tick) / 4;
    const tx = tileToPx(s.toX);
    const ty = tileToPx(s.toY) - 16;
    if (s.melee) {
      g.fillStyle(0xff5a36, 0.8 * fade);
      g.fillCircle(tx, ty, 7 * fade + 3);
      continue;
    }
    g.lineStyle(2, 0xffe58f, 0.9 * fade);
    g.lineBetween(tileToPx(s.fromX), tileToPx(s.fromY) - 22, tx, ty);
    g.fillStyle(0xfff1b8, fade);
    g.fillCircle(tx, ty, 3);
  }
}

function drawProgress(g: Phaser.GameObjects.Graphics, world: World, unit: Unit, x: number, y: number): void {
  const order = unit.order;
  if (order.type !== 'gather' || unit.workSeconds <= 0) return;
  const node = world.nodes.find((n) => n.id === order.nodeId);
  if (!node) return;
  const ratio = Math.min(1, unit.workSeconds / workSecondsFor(world, node.kind));
  g.fillStyle(PALETTE.barBack, 0.6);
  g.fillRect(x - 16, y - 44, 32, 5);
  g.fillStyle(PALETTE.progress, 1);
  g.fillRect(x - 16, y - 44, 32 * ratio, 5);
}

/** 건물: 고르면 자리 둘레에 초록 테두리, 짓는 중이면 위에 진행 막대 */
function drawBuilding(top: Phaser.GameObjects.Graphics, b: Building, selected: boolean): void {
  const T = TILE_SIZE;
  // 건물 그림이 자리를 꽉 덮으므로 테두리는 그림 위(top)에 그린다
  if (selected) {
    top.lineStyle(2, PALETTE.selection, 0.9);
    top.strokeRect(b.x * T - 2, b.y * T - 2, b.width * T + 4, b.height * T + 4);
  }
  if (b.complete) {
    if (selected || b.hp < b.maxHp) drawHpBar(top, (b.x + b.width / 2) * T, b.y * T - 10, b.width * T * 0.7, b.hp, b.maxHp);
    return;
  }
  const w = b.width * T * 0.8;
  const x = (b.x + b.width / 2) * T - w / 2;
  const y = b.y * T - 14;
  top.fillStyle(PALETTE.barBack, 0.7);
  top.fillRect(x, y, w, 8);
  top.fillStyle(PALETTE.progress, 1);
  top.fillRect(x, y, w * b.progress, 8);
  top.lineStyle(1, 0x000000, 1);
  top.strokeRect(x, y, w, 8);
}

export function drawOverlays(
  ground: Phaser.GameObjects.Graphics,
  top: Phaser.GameObjects.Graphics,
  world: World,
  alpha: number,
  selectedIds: ReadonlySet<number>,
  inspected: Point | null,
): void {
  ground.clear();
  top.clear();
  // 고른 자원: 발밑 고리 / 살펴보는 칸: 칸 테두리
  for (const n of world.nodes) if (selectedIds.has(n.id)) drawSelection(ground, tileToPx(n.x), tileToPx(n.y));
  if (inspected) {
    top.lineStyle(2, PALETTE.selection, 0.8);
    top.strokeRect(inspected.x * TILE_SIZE, inspected.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }
  for (const b of world.buildings) drawBuilding(top, b, selectedIds.has(b.id));
  for (const unit of world.units) {
    if (unit.hp <= 0) continue;
    const { x, y } = unitScreenPos(unit, alpha);
    const picked = selectedIds.has(unit.id);
    if (picked) drawSelection(ground, x, y);
    drawProgress(top, world, unit, x, y);
    if (picked || unit.hp < unit.maxHp) drawHpBar(top, x, y - 52, 32, unit.hp, unit.maxHp);
    if (unit.carry > 0) {
      top.fillStyle(0x4fc3f7, 1);
      top.fillTriangle(x - 5, y - 30, x + 5, y - 30, x, y - 42);
      top.lineStyle(1, 0x000000, 0.8);
      top.strokeTriangle(x - 5, y - 30, x + 5, y - 30, x, y - 42);
    }
  }
  for (const c of world.creatures) {
    if (c.hp <= 0) continue;
    const { x, y } = unitScreenPos(c, alpha);
    const picked = selectedIds.has(c.id);
    if (picked) drawSelection(ground, x, y, FOE_RING);
    if (picked || c.hp < c.maxHp) drawHpBar(top, x, y - (c.kind === 'charger' ? 54 : 40), c.kind === 'charger' ? 40 : 26, c.hp, c.maxHp);
  }
  drawShots(top, world);
}
