import { CREATURES, GRAZER } from '../../data/monsters.ts';
import { isMonster, type Building, type Creature, type Unit } from '../entities.ts';
import { isPassable, tileIndex, type Point } from '../grid.ts';
import { findPath, findPathNextTo, findPathNextToRect, type Walkable } from '../path.ts';
import { nextRandom } from '../random.ts';
import { buildingAt, findUnit, isWalkable, type World } from '../world.ts';
import { distanceToBuilding, strike, withinRange } from './combat.ts';

/**
 * 괴물과 사냥감의 움직임 (기획.md 8-1). 괴물은 내 것만 노린다 (거울 적과는 아직 싸우지 않음, 혼합형에서 정할 것).
 * 단 거울 적 유닛·포탑은 가까이 온 괴물을 친다 (combat.ts).
 * 괴물: 가까이(aggroRange) 있는 내 유닛·건물을 먼저 치고, 없으면 가장 가까운 내 건물(없으면 지휘관)로 간다.
 *       길이 벽에 막혀 있으면 벽을 부수며 간다. 괴물끼리·유닛과는 겹쳐 지나간다.
 * 사냥감: 처음 자리 둘레를 어슬렁거린다.
 */

/** 길을 다시 찾는 간격 (초). 괴물마다 조금씩 어긋나게 해서 한 틱에 몰리지 않게 */
const REPATH_SECONDS = 0.5;

type Target = { readonly unit: Unit } | { readonly building: Building };

function tileOf(p: { readonly x: number; readonly y: number }): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

function resolve(world: World, id: number | null): Target | null {
  if (id === null) return null;
  const unit = findUnit(world, id);
  if (unit && unit.hp > 0) return { unit };
  const building = world.buildings.find((b) => b.id === id);
  if (building && building.hp > 0) return { building };
  return null;
}

function targetId(t: Target): number {
  return 'unit' in t ? t.unit.id : t.building.id;
}

function distanceTo(c: Creature, t: Target): number {
  return 'unit' in t ? Math.hypot(t.unit.x - c.x, t.unit.y - c.y) : distanceToBuilding(t.building, c.x, c.y);
}

/** within 안의 가장 가까운 내 유닛·건물 */
function nearestPlayerThing(world: World, c: Creature, within: number): Target | null {
  let best: Target | null = null;
  let bestD = within;
  for (const unit of world.units) {
    const d = Math.hypot(unit.x - c.x, unit.y - c.y);
    if (unit.hp > 0 && unit.owner === 'player' && d <= bestD) {
      best = { unit };
      bestD = d;
    }
  }
  for (const building of world.buildings) {
    const d = distanceToBuilding(building, c.x, c.y);
    if (building.owner === 'player' && d <= bestD) {
      best = { building };
      bestD = d;
    }
  }
  return best;
}

/** 공격 목표: 가장 가까운 내 건물, 건물이 없으면 가장 가까운 내 유닛 */
function mainTarget(world: World, c: Creature): Target | null {
  let best: Target | null = null;
  let bestD = Infinity;
  for (const building of world.buildings) {
    const d = distanceToBuilding(building, c.x, c.y);
    if (building.owner === 'player' && d < bestD) {
      best = { building };
      bestD = d;
    }
  }
  if (best) return best;
  for (const unit of world.units) {
    const d = Math.hypot(unit.x - c.x, unit.y - c.y);
    if (unit.hp > 0 && unit.owner === 'player' && d < bestD) {
      best = { unit };
      bestD = d;
    }
  }
  return best;
}

/** 건물 칸도 지나갈 수 있다고 보는 땅 (막히면 벽을 부수며 가는 길) */
function walkableThroughBuildings(world: World): Walkable {
  return (x, y) => isWalkable(world, x, y) || (isPassable(world.map.grid, x, y) && buildingAt(world, x, y) !== undefined);
}

function pathTo(world: World, from: Point, t: Target): Point[] | null {
  const normal: Walkable = (x, y) => isWalkable(world, x, y);
  if ('building' in t) {
    return findPathNextToRect(normal, from, t.building) ?? findPathNextToRect(walkableThroughBuildings(world), from, t.building);
  }
  const goal = tileOf(t.unit);
  return findPathNextTo(normal, from, goal) ?? findPathNextTo(walkableThroughBuildings(world), from, goal);
}

/**
 * 경로를 따라 걷는다. 다음 칸에 건물이 있으면 멈추고 그 건물을 목표로 삼는다 (벽 부수기).
 * 자원 등으로 막혔으면 길을 버리고 다음에 다시 찾는다.
 */
function walkCreature(world: World, c: Creature, distance: number): void {
  let left = distance;
  while (left > 0 && c.path.length > 0) {
    const next = c.path[0]!;
    if (!isWalkable(world, next.x, next.y)) {
      const wall = buildingAt(world, next.x, next.y);
      if (wall && isMonster(c) && !c.retreating) c.targetId = wall.id;
      if (c.retreating && wall) {
        // 물러가는 길에 건물이 있으면 그냥 지나간다 (막아 둔 벽에 갇혀 승리가 늦어지지 않게)
        c.x = next.x;
        c.y = next.y;
        c.path.shift();
        continue;
      }
      c.path = [];
      return;
    }
    const dx = next.x - c.x;
    const dy = next.y - c.y;
    const gap = Math.hypot(dx, dy);
    if (gap <= left) {
      c.x = next.x;
      c.y = next.y;
      c.path.shift();
      left -= gap;
    } else {
      c.x += (dx / gap) * left;
      c.y += (dy / gap) * left;
      left = 0;
    }
  }
}

/** 가장 가까운 괴물 입구 칸 */
function nearestExit(world: World, c: Creature): Point | undefined {
  const e = world.map.features.entrances;
  return [...e.north, ...e.east].sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
}

/** 물러가기: 입구로 걸어가 맵 밖으로. 도착하면 true (치운다) */
function stepRetreating(world: World, c: Creature, dt: number): boolean {
  const exit = nearestExit(world, c);
  if (!exit) return true;
  if (Math.hypot(exit.x - c.x, exit.y - c.y) < 0.6) return true;
  if (c.path.length === 0) {
    const through = walkableThroughBuildings(world);
    c.path = findPath((x, y) => isWalkable(world, x, y), tileOf(c), exit) ?? findPath(through, tileOf(c), exit) ?? [];
    if (c.path.length === 0) return true; // 갈 길이 없으면 그냥 사라진다
  }
  walkCreature(world, c, CREATURES[c.kind].speed * 1.2 * dt);
  return false;
}

function stepMonster(world: World, c: Creature, dt: number, now: number): void {
  const spec = CREATURES[c.kind];
  const attack = spec.attack!;
  let target = resolve(world, c.targetId);
  if (now >= c.repathAt || !target) {
    c.repathAt = now + REPATH_SECONDS + (c.id % 5) * 0.05;
    // 벽을 부수는 중이면 계속, 아니면 가까운 것 → 본진 순
    const bashing = target && 'building' in target && withinRange(attack, distanceTo(c, target));
    if (!bashing) target = nearestPlayerThing(world, c, spec.aggroRange) ?? target ?? mainTarget(world, c);
    if (target && !withinRange(attack, distanceTo(c, target))) {
      let path = pathTo(world, tileOf(c), target);
      // 가까운 목표가 절벽 너머라 닿을 수 없으면 본진 목표로
      if (path === null) {
        const fallback = mainTarget(world, c);
        if (fallback && targetId(fallback) !== targetId(target)) {
          target = fallback;
          path = pathTo(world, tileOf(c), target);
        }
      }
      c.path = path ?? [];
    }
    c.targetId = target ? targetId(target) : null;
  }
  if (!target) return;
  if (withinRange(attack, distanceTo(c, target))) {
    c.path = [];
    if (c.cooldown <= 0) {
      strike(world, c, 'unit' in target ? target.unit : target.building, attack, 'building' in target);
      c.cooldown = attack.cooldown;
    }
    return;
  }
  walkCreature(world, c, spec.speed * dt);
}

/** 사냥감: 쉬었다가 처음 자리 둘레의 빈 칸으로 천천히 걸어간다 */
function stepGrazer(world: World, c: Creature, dt: number, now: number): void {
  if (c.path.length > 0) {
    walkCreature(world, c, CREATURES.grazer.speed * dt);
    return;
  }
  if (now < c.repathAt) return;
  c.repathAt = now + GRAZER.restSeconds * (0.5 + nextRandom(world));
  const r = GRAZER.wanderRadius;
  const x = c.home.x + Math.floor(nextRandom(world) * (2 * r + 1)) - r;
  const y = c.home.y + Math.floor(nextRandom(world) * (2 * r + 1)) - r;
  if (!isWalkable(world, x, y)) return;
  c.path = findPath((px, py) => isWalkable(world, px, py), tileOf(c), { x, y }) ?? [];
}

export function stepCreatures(world: World, dt: number, now: number): void {
  const gone: Creature[] = [];
  for (const c of world.creatures) {
    c.prevX = c.x;
    c.prevY = c.y;
    c.cooldown = Math.max(0, c.cooldown - dt);
    if (c.hp <= 0) continue;
    if (c.retreating) {
      if (stepRetreating(world, c, dt)) gone.push(c);
    } else if (isMonster(c)) stepMonster(world, c, dt, now);
    else stepGrazer(world, c, dt, now);
  }
  for (const c of gone) world.creatures.splice(world.creatures.indexOf(c), 1);
  spreadMonsters(world, dt);
}

/** 이보다 가까운 괴물끼리는 서로 밀어낸다 (한 점에 겹쳐 한 마리처럼 보이지 않게) */
const PERSONAL_SPACE = 0.7;
const PUSH_PER_SECOND = 1.5;

/** 괴물끼리 살짝 밀어내기. 밀린 자리가 절벽·건물이면 밀지 않는다 */
function spreadMonsters(world: World, dt: number): void {
  const live = world.creatures.filter((c) => c.hp > 0 && isMonster(c));
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d >= PERSONAL_SPACE) continue;
      if (d < 1e-6) {
        // 딱 겹쳤으면 id 로 정한 방향으로 (같은 판은 늘 같게)
        const angle = ((a.id * 7 + b.id * 13) % 360) * (Math.PI / 180);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        d = 1;
      }
      const push = Math.min((PERSONAL_SPACE - Math.min(d, PERSONAL_SPACE)) / 2, PUSH_PER_SECOND * dt);
      nudge(world, a, (-dx / d) * push, (-dy / d) * push);
      nudge(world, b, (dx / d) * push, (dy / d) * push);
    }
  }
}

function nudge(world: World, c: Creature, dx: number, dy: number): void {
  const x = c.x + dx;
  const y = c.y + dy;
  if (isWalkable(world, Math.round(x), Math.round(y))) {
    c.x = x;
    c.y = y;
  }
}

/** 배급처 칸에서 within 칸 안에 괴물이 있는지 (막힘 판정) */
export function monsterNear(world: World, at: Point, within: number): boolean {
  return world.creatures.some(
    (c) => c.hp > 0 && isMonster(c) && !c.retreating && Math.max(Math.abs(c.x - at.x), Math.abs(c.y - at.y)) <= within,
  );
}

/** 칸 번호 (테스트·화면용) */
export function creatureTileIndex(world: World, c: Creature): number {
  const t = tileOf(c);
  return tileIndex(world.map.grid, t.x, t.y);
}
