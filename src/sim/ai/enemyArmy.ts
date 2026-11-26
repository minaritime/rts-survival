import { ENEMY, ENEMY_ATTACK, POWER } from '../../data/enemy.ts';
import { isSoldier, UNITS, type TrainableKind } from '../../data/units.ts';
import { commandAttackMove, commandMove, commandTrain } from '../commands.ts';
import type { Owner, Unit } from '../entities.ts';
import type { Point } from '../grid.ts';
import { between, nextRandom } from '../random.ts';
import { distanceToBuilding } from '../systems/combat.ts';
import { commanderOf, type EnemyState, type World } from '../world.ts';
import { enemyBuildings } from './enemyQuery.ts';

/**
 * 거울 적의 병력 (기획.md 8-2). 공격 시기는 고정 시각이 아니라 적이 스스로 판단한다 (2026-11-25 사용자 요청):
 * - 힘 = 병사·지휘관·포탑 점수 합 (data/enemy.ts POWER)
 * - 집 병력의 힘이 내 힘 x 대담함 이상이면 공격. 인내심 시각이 지나면 최소 병력만 돼도 공격
 * - 대담함·인내심·첫 공격 시각·물러난 뒤 쉬는 시간은 시드 난수로 뽑아 매판 다르다
 * - 노리는 곳: 대개 가장 가까운 내 건물, 가끔(flankChance) 수비가 가장 얇은 내 건물
 * - 생산: 공격에 필요한 힘 + 여유만큼 (미네랄이 쌓였으면 여유를 더). 병사 일부는 돌격병
 */

/** 내 유닛이 적 건물에 이만큼 가까우면 수비하러 나온다 */
const DEFEND_RADIUS = 12;
/** 집결지에서 이보다 멀리 쉬고 있는 병력은 집결지로 부른다 */
const RALLY_SLACK = 4;

function powerOf(kind: string): number {
  return POWER[kind] ?? 0;
}

function soldiersOf(world: World, owner: Owner): Unit[] {
  return world.units.filter((u) => u.owner === owner && u.hp > 0 && isSoldier(u.kind));
}

/** 내 힘: 병사 + 지휘관 + 다 지은 포탑 */
export function playerPower(world: World): number {
  let power = 0;
  for (const u of world.units) if (u.owner === 'player' && u.hp > 0) power += powerOf(u.kind);
  for (const b of world.buildings) if (b.owner === 'player' && b.complete) power += powerOf(b.kind);
  return power;
}

function armyPower(units: readonly Unit[]): number {
  return units.reduce((sum, u) => sum + powerOf(u.kind), 0);
}

/** 공격에 나가지 않은(집에 있는) 병사 */
export function homeArmy(world: World, enemy: EnemyState): Unit[] {
  return soldiersOf(world, 'enemy').filter((u) => !enemy.attackers.includes(u.id));
}

/** 다음 공격 계획을 새로 뽑는다: earliest 부터 갈 수 있고, 대담함·인내심은 난수 */
export function rollNextAttack(world: World, enemy: EnemyState, earliest: number): void {
  enemy.nextAttackAt = earliest;
  enemy.boldness = between(world, ENEMY_ATTACK.boldness);
  enemy.patienceUntil = earliest + between(world, ENEMY_ATTACK.patience);
}

/** 집 병력이 지금 공격하러 갈 만한가 */
export function readyToAttack(world: World, enemy: EnemyState, now: number, home: readonly Unit[]): boolean {
  if (now < enemy.nextAttackAt) return false;
  const power = armyPower(home);
  if (power < ENEMY_ATTACK.minArmy) return false;
  return power >= playerPower(world) * enemy.boldness || now >= enemy.patienceUntil;
}

/** 모을 병력의 힘. 쓸 미네랄이 쌓였으면 여유를 더 */
function wantedArmy(world: World, enemy: EnemyState, spare: number): number {
  const need = Math.max(ENEMY_ATTACK.minArmy, Math.ceil(playerPower(world) * enemy.boldness));
  const extra = ENEMY_ATTACK.extraArmy + (spare >= ENEMY_ATTACK.surplusMineral ? ENEMY_ATTACK.richExtraArmy : 0);
  return Math.min(ENEMY_ATTACK.maxArmy, need + extra);
}

/** 병영마다 병사를 뽑는다 (집 병력 + 줄에 선 것이 목표에 닿을 때까지). spare = 쓸 수 있는 미네랄 */
export function trainSoldiers(world: World, enemy: EnemyState, spare: number): void {
  const want = wantedArmy(world, enemy, spare);
  let power = armyPower(homeArmy(world, enemy));
  for (const b of enemyBuildings(world)) for (const k of b.trainQueue) power += powerOf(k);
  for (const b of enemyBuildings(world)) {
    if (power >= want) return;
    if (b.kind !== 'barracks' || !b.complete || b.trainQueue.length > 0) continue;
    const kind = pickSoldier(world, spare);
    if (kind && commandTrain(world, b.id, kind)) {
      spare -= UNITS[kind].mineral;
      power += powerOf(kind);
    }
  }
}

/** 돌격병을 섞어 뽑는다. 돌격병 값이 모자라면 소총병 */
function pickSoldier(world: World, spare: number): TrainableKind | null {
  const kind: TrainableKind = nextRandom(world) < ENEMY_ATTACK.assaultChance ? 'assault' : 'rifleman';
  if (spare >= UNITS[kind].mineral) return kind;
  return spare >= UNITS.rifleman.mineral ? 'rifleman' : null;
}

export function controlArmy(world: World, enemy: EnemyState, now: number): void {
  if (enemy.attackers.length > 0) {
    stepAttack(world, enemy, now);
    return;
  }
  const army = homeArmy(world, enemy);
  if (defend(world, army)) return;
  const target = readyToAttack(world, enemy, now, army) ? chooseTarget(world, enemy.plan.rally) : undefined;
  if (target) {
    enemy.attackers = army.map((u) => u.id);
    enemy.attackSize = army.length;
    enemy.attacksLaunched += 1;
    commandAttackMove(world, enemy.attackers, target);
    return;
  }
  const stray = army.filter(
    (u) => u.order.type === 'idle' && u.engageId === null && Math.hypot(u.x - enemy.plan.rally.x, u.y - enemy.plan.rally.y) > RALLY_SLACK,
  );
  if (stray.length > 0) commandMove(world, stray.map((u) => u.id), enemy.plan.rally);
}

/**
 * 공격 중: 쉬게 된 공격대는 가장 가까운 내 건물로. 절반 이하로 줄거나 칠 것이 없으면 물러나고,
 * 다음 공격 계획을 새로 뽑는다 (물러나자마자 다시 나오지 않게 쉬는 시간도)
 */
function stepAttack(world: World, enemy: EnemyState, now: number): void {
  const alive = new Set(world.units.filter((u) => u.hp > 0).map((u) => u.id));
  enemy.attackers = enemy.attackers.filter((id) => alive.has(id));
  const lead = world.units.find((u) => u.id === enemy.attackers[0]);
  const target = nearestTarget(world, lead ? { x: lead.x, y: lead.y } : enemy.plan.rally);
  if (enemy.attackers.length <= enemy.attackSize * ENEMY.retreatRatio || !target) {
    commandMove(world, enemy.attackers, enemy.plan.rally);
    enemy.attackers = [];
    enemy.attackSize = 0;
    rollNextAttack(world, enemy, now + between(world, ENEMY_ATTACK.regroup));
    return;
  }
  const idle = enemy.attackers.filter((id) => {
    const u = world.units.find((x) => x.id === id);
    return u !== undefined && u.order.type === 'idle' && u.engageId === null;
  });
  if (idle.length > 0) commandAttackMove(world, idle, target);
}

/** 내 유닛이 적 건물 곁에 오면 쉬는 병력이 그쪽으로. 보냈으면 true */
function defend(world: World, army: readonly Unit[]): boolean {
  const mine = world.units.filter((u) => u.owner === 'player' && u.hp > 0);
  const intruder = mine.find((u) => enemyBuildings(world).some((b) => distanceToBuilding(b, u.x, u.y) <= DEFEND_RADIUS));
  if (!intruder) return false;
  const idle = army.filter((u) => u.order.type !== 'attackMove' && u.engageId === null);
  if (idle.length > 0) commandAttackMove(world, idle.map((u) => u.id), { x: Math.round(intruder.x), y: Math.round(intruder.y) });
  return true;
}

/** 출발할 때 노릴 곳: 대개 가장 가까운 내 건물, 가끔 수비가 가장 얇은 내 건물 */
function chooseTarget(world: World, from: Point): Point | undefined {
  if (nextRandom(world) >= ENEMY_ATTACK.flankChance) return nearestTarget(world, from);
  const guards = world.units.filter((u) => u.owner === 'player' && u.hp > 0 && powerOf(u.kind) > 0);
  const weakest = world.buildings
    .filter((b) => b.owner === 'player')
    .map((b) => ({ b, guard: guards.filter((u) => distanceToBuilding(b, u.x, u.y) <= ENEMY_ATTACK.guardRadius).length }))
    .sort((p, q) => p.guard - q.guard || distanceToBuilding(p.b, from.x, from.y) - distanceToBuilding(q.b, from.x, from.y))[0];
  return weakest ? { x: weakest.b.x, y: weakest.b.y } : nearestTarget(world, from);
}

/** 가장 가까운 내 건물, 건물이 없으면 지휘관 */
function nearestTarget(world: World, from: Point): Point | undefined {
  const mine = world.buildings
    .filter((b) => b.owner === 'player')
    .sort((a, b) => distanceToBuilding(a, from.x, from.y) - distanceToBuilding(b, from.x, from.y))[0];
  if (mine) return { x: mine.x, y: mine.y };
  const c = commanderOf(world);
  return c && c.hp > 0 ? { x: Math.round(c.x), y: Math.round(c.y) } : undefined;
}
