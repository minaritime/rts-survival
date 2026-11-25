import { describe, expect, test } from 'vitest';
import { BUILDINGS } from '../src/data/buildings.ts';
import { COMMANDER, START } from '../src/data/commander.ts';
import { commandBuild, commandGather } from '../src/sim/commands.ts';
import { elapsedSeconds } from '../src/sim/world.ts';
import { commander, newWorld, node, runUntil } from './helpers.ts';

/**
 * 1맵 시작 흐름을 봇으로 따라 해 본다 (튜토리얼 순서와 같음).
 * 사용자 요청(11/23): 잔해 하나 + 미네랄 한 번만 캐도 사령부를 지을 수 있어야 한다.
 */
describe('1맵 시작 흐름', () => {
  test('잔해 하나 + 미네랄 한 번이면 사령부(250)를 지을 수 있다', () => {
    expect(START.mineral + 50 + COMMANDER.mineralPerTrip).toBeGreaterThanOrEqual(BUILDINGS.commandCenter.mineral);
    expect(START.mineral).toBeLessThan(BUILDINGS.commandCenter.mineral); // 아무것도 안 하고 바로 짓지는 못함
  });

  test('잔해 → 미네랄 한 번 → 사령부 놓기 → 완공까지 약 1분 30초', () => {
    const world = newWorld();
    const idle = (): boolean => commander(world).order.type === 'idle';

    commandGather(world, [world.commanderId], node(world, 18, 31).id);
    runUntil(world, idle, 60);
    commandGather(world, [world.commanderId], node(world, 7, 21).id);
    runUntil(world, () => world.stats.mineralMined >= COMMANDER.mineralPerTrip, 60);
    expect(world.stock.mineral).toBeGreaterThanOrEqual(BUILDINGS.commandCenter.mineral);

    const cc = commandBuild(world, [world.commanderId], 'commandCenter', { x: 10, y: 20 });
    expect(cc).not.toBeNull();
    runUntil(world, () => cc!.complete, 120);

    const done = elapsedSeconds(world);
    expect(done).toBeLessThan(100);
    expect(world.foodCap).toBe(50);
    expect(world.outcome).toBe('playing');
  });
});
