import { ENEMY, ENEMY_ATTACK, POWER } from '../../data/enemy.ts';
import { isSoldier, UNITS, type TrainableKind } from '../../data/units.ts';
import { commandAttackMove, commandMove, commandTrain } from '../commands.ts';
import type { Unit } from '../entities.ts';
import type { Point } from '../grid.ts';
import { between, nextRandom } from '../random.ts';
import { distanceToBuilding } from '../systems/combat.ts';
import type { EnemyState, World } from '../world.ts';
import { enemyBuildings } from './enemyQuery.ts';

/**
 * 거울 적의 병력 (기획.md 8-2). **적은 내 병력·건물 수를 모른다** (2026-11-26 사용자 확정: 완전히 따로 생각한다):
 * - 공격 규모(힘)를 스스로 정해(시드 난수) 그만큼 모이면 간다. 보낼 때마다 다음 규모가 는다
 * - 인내심 시각이 지나면 최소 병력만 돼도 간다
 * - 어디로: 공격대가 본(sightRadius 안) 내 것을 친다. 못 봤으면 지도에서 아는 곳(내 시작 자리, 확장 자리, 배급처)을 차례로 찾아간다
 * - 생산: 다음 공격 규모까지. 병사 일부는 돌격병
 * - 수비: 적 건물 곁에 온 내 유닛은 적이 볼 수 있으니 막으러 나온다
 */

/** 내 유닛이 적 건물에 이만큼 가까우면 수비하러 나온다 */
const DEFEND_RADIUS = 12;
/** 집결지에서 이보다 멀리 쉬고 있는 병력은 집결지로 부른다 */
const RALLY_SLACK = 4;

function powerOf(kind: string): number {
  return POWER[kind] ?? 0;
}

function armyPower(units: readonly Unit[]): number {
  return units.reduce((sum, u) => sum + powerOf(u.kind), 0);
}

/** 공격에 나가지 않은(집에 있는) 병사 */
export function homeArmy(world: World, enemy: EnemyState): Unit[] {
  return world.units.filter((u) => u.owner === 'enemy' && u.hp > 0 && isSoldier(u.kind) && !enemy.attackers.includes(u.id));
}

/** 판 시작: 첫 공격 시각·규모·인내심을 시드 난수로 */
export function planFirstAttack(world: World, enemy: EnemyState): void {
  enemy.waveSize = between(world, ENEMY_ATTACK.firstWave);
  setAttackTime(world, enemy, between(world, ENEMY_ATTACK.firstEarliest));
}

function setAttackTime(world: World, enemy: EnemyState, earliest: number): void {
  enemy.nextAttackAt = earliest;
  enemy.patienceUntil = earliest + between(world, ENEMY_ATTACK.patience);
}

/** 집 병력이 지금 공격하러 갈 만한가 (내 병력과 상관없이 스스로 정한 규모로만) */
export function readyToAttack(enemy: EnemyState, now: number, home: readonly Unit[]): boolean {
  if (now < enemy.nextAttackAt) return false;
  const power = armyPower(home);
  if (power < ENEMY_ATTACK.minArmy) return false;
  return power >= enemy.waveSize || now >= enemy.patienceUntil;
}

/** 병영마다 병사를 뽑는다 (집 병력 + 줄에 선 것이 다음 공격 규모에 닿을 때까지). spare = 쓸 수 있는 미네랄 */
export function trainSoldiers(world: World, enemy: EnemyState, spare: number): void {
  const want = Math.min(ENEMY_ATTACK.maxArmy, enemy.waveSize);
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
  if (readyToAttack(enemy, now, army)) {
    launch(world, enemy, army);
    return;
  }
  const stray = army.filter(
    (u) => u.order.type === 'idle' && u.engageId === null && Math.hypot(u.x - enemy.plan.rally.x, u.y - enemy.plan.rally.y) > RALLY_SLACK,
  );
  if (stray.length > 0) commandMove(world, stray.map((u) => u.id), enemy.plan.rally);
}

/** 집 병력을 공격대로 보낸다. 다음 공격 규모는 이번보다 크게 */
function launch(world: World, enemy: EnemyState, army: readonly Unit[]): void {
  enemy.attackers = army.map((u) => u.id);
  enemy.attackSize = army.length;
  enemy.attacksLaunched += 1;
  enemy.scoutIndex = 0;
  enemy.waveSize = Math.min(ENEMY_ATTACK.maxArmy, Math.max(enemy.waveSize, armyPower(army)) + between(world, ENEMY_ATTACK.waveGrowth));
  commandAttackMove(world, enemy.attackers, scoutPoints(world)[0]!);
}

/**
 * 공격 중: 절반 이하로 줄면 물러나고 쉬는 시간을 둔다.
 * 쉬게 된 공격대는 본 내 것 중 가장 가까운 곳으로, 본 것이 없으면 아는 곳을 차례로 찾아간다
 */
function stepAttack(world: World, enemy: EnemyState, now: number): void {
  const alive = new Set(world.units.filter((u) => u.hp > 0).map((u) => u.id));
  enemy.attackers = enemy.attackers.filter((id) => alive.has(id));
  const squad = world.units.filter((u) => enemy.attackers.includes(u.id));
  if (squad.length === 0 || squad.length <= enemy.attackSize * ENEMY.retreatRatio) {
    commandMove(world, enemy.attackers, enemy.plan.rally);
    enemy.attackers = [];
    enemy.attackSize = 0;
    setAttackTime(world, enemy, now + between(world, ENEMY_ATTACK.regroup));
    return;
  }
  const idle = squad.filter((u) => u.order.type === 'idle' && u.engageId === null);
  if (idle.length === 0) return;
  const lead = squad[0]!;
  const seen = seenTarget(world, squad, lead);
  if (seen) {
    commandAttackMove(world, idle.map((u) => u.id), seen);
    return;
  }
  const points = scoutPoints(world);
  const here = points[enemy.scoutIndex % points.length]!;
  if (Math.hypot(lead.x - here.x, lead.y - here.y) <= ENEMY_ATTACK.arriveRadius) enemy.scoutIndex += 1;
  commandAttackMove(world, idle.map((u) => u.id), points[enemy.scoutIndex % points.length]!);
}

/** 공격대 누군가의 시야 안에 있는 내 건물(먼저)·유닛 중 선두에 가장 가까운 것 */
function seenTarget(world: World, squad: readonly Unit[], lead: Unit): Point | undefined {
  const r = ENEMY_ATTACK.sightRadius;
  const building = world.buildings
    .filter((b) => b.owner === 'player' && squad.some((u) => distanceToBuilding(b, u.x, u.y) <= r))
    .sort((a, b) => distanceToBuilding(a, lead.x, lead.y) - distanceToBuilding(b, lead.x, lead.y))[0];
  if (building) return { x: building.x, y: building.y };
  const unit = world.units
    .filter((m) => m.owner === 'player' && m.hp > 0 && squad.some((u) => Math.hypot(u.x - m.x, u.y - m.y) <= r))
    .sort((a, b) => Math.hypot(a.x - lead.x, a.y - lead.y) - Math.hypot(b.x - lead.x, b.y - lead.y))[0];
  return unit ? { x: Math.round(unit.x), y: Math.round(unit.y) } : undefined;
}

/** 지도에서 아는 곳: 내 시작 자리, 그다음 확장 자리·배급처를 내 시작 자리에서 가까운 차례로 */
function scoutPoints(world: World): Point[] {
  const start = world.map.features.start;
  const others = [...(world.enemy?.plan.expansions ?? []), ...world.map.features.feeders].sort(
    (a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y),
  );
  return [start, ...others];
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
