import { BUILDINGS, FEEDER, HEAL_PER_SECOND } from '../../data/buildings.ts';
import { rectDistance } from '../path.ts';
import type { Building, Owner } from '../entities.ts';
import { commanderOf, type World } from '../world.ts';
import { monsterNear } from './creatures.ts';

/** 이 편의 다 지은 건물 중 배급처에 가장 가까운 것까지 거리. 없으면 Infinity */
function closestDistance(buildings: readonly Building[], owner: Owner, x: number, y: number): number {
  let best = Infinity;
  for (const b of buildings) {
    if (b.owner === owner && b.complete) best = Math.min(best, rectDistance(b, x, y));
  }
  return best;
}

/**
 * 식량 배급처 (기획.md 4-2): 6칸 안에 다 지은 건물이 하나라도 있으면 켜지고,
 * 켜진 배급처마다 분당 10 의 식량이 켠 쪽에 들어온다 (내 것은 한도까지).
 * 나와 적이 같이 켜면 **더 가까운 건물을 가진 쪽이 다 가진다** (2026-11-25 사용자 확정). 같으면 먼저 켠 쪽이 그대로.
 * 4칸 안에 괴물이 있으면 그동안 막혀서 안 나온다.
 */
export function stepFeeders(world: World, dt: number): void {
  let gain = 0;
  let enemyGain = 0;
  for (const feeder of world.feeders) {
    const mine = closestDistance(world.buildings, 'player', feeder.x, feeder.y);
    const theirs = closestDistance(world.buildings, 'enemy', feeder.x, feeder.y);
    feeder.owner = pickOwner(feeder.owner, mine, theirs);
    feeder.active = feeder.owner !== null;
    feeder.blocked = monsterNear(world, feeder, FEEDER.blockRadius);
    if (!feeder.active || feeder.blocked) continue;
    const amount = (FEEDER.foodPerMinute / 60) * dt;
    if (feeder.owner === 'player') gain += amount;
    else enemyGain += amount;
  }
  if (gain > 0) world.stock.food = Math.min(world.foodCap, world.stock.food + gain);
  if (enemyGain > 0 && world.enemy) world.enemy.stock.food += enemyGain;
}

/** 배급처 차지: 6칸 안에 있는 쪽 중 더 가까운 쪽. 거리가 같으면 지금 가진 쪽 (없으면 나) */
export function pickOwner(current: Owner | null, mine: number, theirs: number): Owner | null {
  const r = FEEDER.activateRadius;
  const mineIn = mine <= r;
  const theirsIn = theirs <= r;
  if (!mineIn && !theirsIn) return null;
  if (mineIn && !theirsIn) return 'player';
  if (theirsIn && !mineIn) return 'enemy';
  if (mine < theirs) return 'player';
  if (theirs < mine) return 'enemy';
  return current ?? 'player';
}

/** 모닥불·사령부 곁(healRadius 칸)에 있는 지휘관은 초당 2 회복 (굶주리는 동안은 안 됨) */
export function stepHealing(world: World, dt: number): void {
  const c = commanderOf(world);
  if (!c || c.hp <= 0 || c.hp >= c.maxHp || world.satiety <= 0) return;
  const x = Math.round(c.x);
  const y = Math.round(c.y);
  const near = world.buildings.some((b) => {
    const r = BUILDINGS[b.kind].healRadius;
    return b.complete && b.owner === 'player' && r !== undefined && rectDistance(b, x, y) <= r;
  });
  if (near) c.hp = Math.min(c.maxHp, c.hp + HEAL_PER_SECOND * dt);
}
