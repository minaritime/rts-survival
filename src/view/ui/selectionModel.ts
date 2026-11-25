import type { World } from '../../sim/world.ts';
import { iconKey } from '../assets.ts';

/**
 * 선택 정보 칸에 그림으로 보여 줄 것 (Phaser 를 모르는 순수 계산, tests/selectionModel.test.ts).
 * 사용자 요청 11/25: 체력을 글자 대신 막대로, 여럿 고르면 그림 칸들로.
 */

export interface Gauge {
  readonly value: number;
  readonly max: number;
}

export interface PickedItem {
  readonly id: number;
  /** 그림 (art/tools/make-icons.mjs 가 만든 아이콘) */
  readonly icon: string;
  /** 체력. 자원처럼 체력이 없으면 null */
  readonly hp: Gauge | null;
  /** 괴물·사냥감·거울 적이면 true (빨간 테두리) */
  readonly foe: boolean;
}

/** 고른 것들: 지휘관 → 다른 내 유닛 → 내 건물 → 괴물·사냥감 → 자원 순 */
export function pickedItems(world: World, selected: ReadonlySet<number>): PickedItem[] {
  const units = world.units
    .filter((u) => selected.has(u.id) && u.hp > 0)
    .sort((a, b) => Number(b.id === world.commanderId) - Number(a.id === world.commanderId));
  return [
    ...units.map((u) => ({ id: u.id, icon: iconKey(u.kind), hp: { value: u.hp, max: u.maxHp }, foe: u.owner === 'enemy' })),
    ...world.buildings
      .filter((b) => selected.has(b.id))
      .map((b) => ({ id: b.id, icon: iconKey(b.kind), hp: { value: b.hp, max: b.maxHp }, foe: b.owner === 'enemy' })),
    ...world.creatures
      .filter((c) => selected.has(c.id) && c.hp > 0)
      .map((c) => ({ id: c.id, icon: iconKey(c.kind), hp: { value: c.hp, max: c.maxHp }, foe: true })),
    ...world.nodes.filter((n) => selected.has(n.id)).map((n) => ({ id: n.id, icon: iconKey(n.kind), hp: null, foe: false })),
  ];
}

/** 체력 비율 0~1 (음수·넘침은 자름) */
export function gaugeRatio(g: Gauge): number {
  return g.max <= 0 ? 0 : Math.max(0, Math.min(1, g.value / g.max));
}

/** 체력 막대 색: 넉넉하면 초록, 절반 아래 노랑, 30% 아래 빨강 (지도 위 막대와 같은 기준) */
export function gaugeColor(g: Gauge): number {
  const r = gaugeRatio(g);
  if (r > 0.6) return 0x52c41a;
  if (r > 0.3) return 0xfaad14;
  return 0xff4d4f;
}
