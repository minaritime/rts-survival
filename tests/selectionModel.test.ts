import { describe, expect, test } from 'vitest';
import { createTrainedUnit } from '../src/sim/entities.ts';
import { gaugeColor, gaugeRatio, pickedItems } from '../src/view/ui/selectionModel.ts';
import { newWorld } from './helpers.ts';

describe('선택 정보 그림 (11/25 사용자 요청: 체력을 막대로)', () => {
  test('지휘관이 맨 앞, 그다음 내 유닛, 괴물은 foe, 자원은 체력 없음', () => {
    const world = newWorld();
    const w = createTrainedUnit(world.nextId++, 'worker', { x: 14, y: 25 });
    world.units.push(w);
    const grazer = world.creatures.find((c) => c.kind === 'grazer')!;
    const mineral = world.nodes.find((n) => n.kind === 'mineral')!;
    const items = pickedItems(world, new Set([w.id, mineral.id, grazer.id, world.commanderId]));
    expect(items.map((i) => i.id)).toEqual([world.commanderId, w.id, grazer.id, mineral.id]);
    expect(items[0]!.icon).toBe('icon_commander');
    expect(items[2]!.foe).toBe(true);
    expect(items[3]!.hp).toBeNull();
    expect(items[3]!.icon).toBe('icon_mineral_0');
  });

  test('막대 비율·색: 60% 넘으면 초록, 30% 넘으면 노랑, 그 아래 빨강. 음수·넘침은 자름', () => {
    expect(gaugeRatio({ value: -5, max: 100 })).toBe(0);
    expect(gaugeRatio({ value: 150, max: 100 })).toBe(1);
    expect(gaugeColor({ value: 80, max: 100 })).toBe(0x52c41a);
    expect(gaugeColor({ value: 50, max: 100 })).toBe(0xfaad14);
    expect(gaugeColor({ value: 10, max: 100 })).toBe(0xff4d4f);
  });
});
