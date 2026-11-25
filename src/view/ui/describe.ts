import { BUILDINGS, FEEDER, type BuildingKind } from '../../data/buildings.ts';
import { COMMANDER } from '../../data/commander.ts';
import { UNITS, type UnitKind } from '../../data/units.ts';
import { CREATURES } from '../../data/monsters.ts';
import { BUILDING_ATTACK } from '../../data/combat.ts';
import type { Building, Creature, ResourceNode, Unit } from '../../sim/entities.ts';
import { isSupplyBlocked } from '../../sim/systems/production.ts';
import { isPassable, type Point } from '../../sim/grid.ts';
import { berryMaxAt } from '../../sim/systems/berries.ts';
import { elapsedSeconds, type World } from '../../sim/world.ts';
import type { ControlGroups } from '../controlGroups.ts';

/**
 * 선택 정보 칸에 쓸 글. Phaser 를 모르는 순수 함수 (tests/describe.test.ts).
 */

/** 유닛이 지금 하는 일 */
export function describeOrder(world: World, unit: Unit): string {
  const order = unit.order;
  if (order.type === 'idle') return unit.engageId !== null ? '싸우는 중' : '대기 중';
  if (order.type === 'move') return '이동 중';
  if (order.type === 'attack') return '공격 중';
  if (order.type === 'attackMove') return unit.engageId !== null ? '싸우는 중' : '공격하며 이동 중';
  const going = unit.path.length > 0;
  if (order.type === 'repair') {
    const b = world.buildings.find((x) => x.id === order.buildingId);
    if (!b) return '대기 중';
    return going ? `${BUILDINGS[b.kind].name} 고치러 가는 중` : `${BUILDINGS[b.kind].name} 고치는 중`;
  }
  if (order.type === 'build') {
    const b = world.buildings.find((x) => x.id === order.buildingId);
    if (!b) return '대기 중';
    const name = BUILDINGS[b.kind].name;
    return going ? `${name} 지으러 가는 중` : `${name} 짓는 중 ${Math.floor(b.progress * 100)}%`;
  }
  const node = world.nodes.find((n) => n.id === order.nodeId);
  if (unit.carry > 0) return '미네랄 나르는 중';
  switch (node?.kind) {
    case 'mineral':
      return going ? '미네랄 캐러 가는 중' : '미네랄 캐는 중';
    case 'berry':
      return going ? '열매 따러 가는 중' : '열매 따는 중';
    case 'debris':
      return going ? '잔해 뒤지러 가는 중' : '잔해 뒤지는 중';
    case 'meat':
      return going ? '고기 주우러 가는 중' : '고기 줍는 중';
    default:
      return '대기 중';
  }
}

export interface SelectionText {
  readonly title: string;
  readonly status: string;
}

/** 건물이 하는 일 (선택 정보·버튼 설명). 4·5단계 기능은 그때 고칠 것 */
export function buildingRole(kind: BuildingKind): string {
  switch (kind) {
    case 'campfire':
      return `곁(${BUILDINGS.campfire.healRadius}칸)에서 지휘관 체력 회복`;
    case 'barricade':
      return '길을 막습니다';
    case 'scrapTurret':
      return `괴물을 쏘는 작은 포탑. 공격 ${BUILDING_ATTACK.scrapTurret!.damage}, 사거리 ${BUILDING_ATTACK.scrapTurret!.range}`;
    case 'commandCenter':
      return `일꾼을 뽑습니다. 보급 +${BUILDINGS.commandCenter.supply}, 식량 한도 ${BUILDINGS.commandCenter.foodCap}`;
    case 'supplyDepot':
      return `보급 +${BUILDINGS.supplyDepot.supply}`;
    case 'barracks':
      return '소총병을 뽑습니다';
    case 'turret':
      return `괴물을 쏘는 포탑. 공격 ${BUILDING_ATTACK.turret!.damage}, 사거리 ${BUILDING_ATTACK.turret!.range}`;
  }
}

/** 자원(미네랄·열매 덤불·잔해) 설명 */
export function describeNode(world: World, node: ResourceNode): SelectionText {
  switch (node.kind) {
    case 'mineral':
      return { title: '미네랄', status: `고갈되지 않습니다\n한 번에 ${COMMANDER.mineralPerTrip}씩 캡니다` };
    case 'debris':
      return { title: '잔해', status: `뒤지면 미네랄 ${node.amount}이 나옵니다` };
    case 'meat':
      return { title: '고기', status: `식량 ${node.amount}\n지휘관이 한 번에 ${COMMANDER.berryPerPick}씩 줍습니다` };
    case 'berry': {
      if (node.amount > 0) {
        return {
          title: '열매 덤불',
          status: `열매 ${node.amount} / ${berryMaxAt(elapsedSeconds(world))}\n한 번에 ${COMMANDER.berryPerPick}씩 따서 식량이 됩니다`,
        };
      }
      const left = node.regrowAt === null ? 0 : Math.max(0, Math.ceil(node.regrowAt - elapsedSeconds(world)));
      return { title: '열매 덤불', status: `비었습니다. ${left}초 뒤 다시 찹니다` };
    }
  }
}

/**
 * 고를 수 없는 것(배급처·사냥감·절벽·괴물 입구)을 눌렀을 때 그 칸 설명. 빈 땅이면 null.
 */
export function describeTile(world: World, tile: Point): SelectionText | null {
  const f = world.map.features;
  const at = (list: readonly Point[]): boolean => list.some((p) => p.x === tile.x && p.y === tile.y);
  const feeder = world.feeders.find((x) => x.x === tile.x && x.y === tile.y);
  if (feeder) {
    const status = !feeder.active
      ? `꺼짐: ${FEEDER.activateRadius}칸 안에 건물을 지으면 켜집니다`
      : feeder.blocked
        ? `막힘: ${FEEDER.blockRadius}칸 안에 괴물이 있어 식량이 안 나옵니다`
        : `켜짐: 분당 식량 ${FEEDER.foodPerMinute}이 들어옵니다`;
    return { title: '식량 배급처', status };
  }
  if (at(f.entrances.north) || at(f.entrances.east)) return { title: '괴물 입구', status: '괴물이 이쪽으로 들어옵니다' };
  if (!isPassable(world.map.grid, tile.x, tile.y)) return { title: '절벽', status: '지나갈 수도, 지을 수도 없습니다' };
  return null;
}

export function unitName(kind: UnitKind): string {
  return kind === 'commander' ? '지휘관' : UNITS[kind].name;
}

/** 건물 생산 상태: "일꾼 만드는 중 40%", 보급이 모자라면 "보급 부족". 줄이 비었으면 null. 대기열은 아이콘 줄(queueRow.ts) */
export function describeProduction(world: World, b: Building): string | null {
  const front = b.trainQueue[0];
  if (!front) return null;
  if (isSupplyBlocked(world, b)) return '보급 부족: 보급고를 지으세요';
  return `${UNITS[front].name} 만드는 중 ${Math.floor(b.trainProgress * 100)}%`;
}

/** 고른 것 설명. 아무것도 안 골랐으면 null */
export function describeSelection(world: World, selected: ReadonlySet<number>): SelectionText | null {
  const units = world.units.filter((u) => selected.has(u.id) && u.hp > 0);
  const buildings = world.buildings.filter((b) => selected.has(b.id));
  const nodes = world.nodes.filter((n) => selected.has(n.id));
  const creatures = world.creatures.filter((c) => selected.has(c.id) && c.hp > 0);
  const count = units.length + buildings.length + nodes.length + creatures.length;
  if (count === 0) return null;
  if (count > 1) {
    // 여럿: 종류별 개수 ("일꾼 3, 소총병 2")
    const counts = new Map<string, number>();
    for (const u of units) counts.set(unitName(u.kind), (counts.get(unitName(u.kind)) ?? 0) + 1);
    for (const b of buildings) counts.set(BUILDINGS[b.kind].name, (counts.get(BUILDINGS[b.kind].name) ?? 0) + 1);
    for (const n of nodes) counts.set(describeNode(world, n).title, (counts.get(describeNode(world, n).title) ?? 0) + 1);
    for (const c of creatures) counts.set(CREATURES[c.kind].name, (counts.get(CREATURES[c.kind].name) ?? 0) + 1);
    const title = [...counts].map(([name, n]) => (n > 1 ? `${name} ${n}` : name)).join(', ');
    return { title, status: `${count}개 선택` };
  }
  if (nodes[0]) return describeNode(world, nodes[0]);
  if (creatures[0]) return describeCreature(creatures[0]);

  const unit = units[0];
  if (unit) {
    return { title: unitName(unit.kind), status: `${describeOrder(world, unit)}\n체력 ${Math.ceil(unit.hp)} / ${unit.maxHp}` };
  }
  const b = buildings[0]!;
  const name = BUILDINGS[b.kind].name;
  const state = b.complete
    ? (describeProduction(world, b) ?? buildingRole(b.kind))
    : `짓는 중 ${Math.floor(b.progress * 100)}%`;
  return { title: name, status: `${state}\n체력 ${Math.ceil(b.hp)} / ${b.maxHp}` };
}

/** 지정한 부대 번호 줄. 예: "부대  1(1)  3(2)". 없으면 빈 글 */
export function describeGroups(groups: ControlGroups): string {
  const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
  const parts = order.filter((n) => (groups.get(n)?.length ?? 0) > 0).map((n) => `${n}(${groups.get(n)!.length})`);
  return parts.length === 0 ? '' : `부대  ${parts.join('  ')}`;
}

/** 괴물·사냥감 설명 */
export function describeCreature(c: Creature): SelectionText {
  const spec = CREATURES[c.kind];
  const attack = spec.attack ? `\n공격 ${spec.attack.damage}` + (spec.attack.buildingFactor ? `, 건물에 ${spec.attack.buildingFactor}배` : '') : '';
  return { title: spec.name, status: `${spec.role}\n체력 ${Math.ceil(c.hp)} / ${c.maxHp}${attack}` };
}
