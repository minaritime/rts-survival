import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings.ts';
import { commandBuild, commandCancelBuild, isFirstCommandCenter } from '../src/sim/commands.ts';
import { isWalkable } from '../src/sim/world.ts';
import { commander, newWorld, run } from './helpers.ts';

describe('짓는 중 취소', () => {
  it('자리를 비우고 미네랄 75% 를 돌려받고, 짓던 지휘관은 선다', () => {
    const w = newWorld();
    w.stock.mineral = 1000;
    const me = commander(w);
    commandBuild(w, [me.id], 'commandCenter', { x: 10, y: 20 })!;
    run(w, 1);
    const fire = commandBuild(w, [me.id], 'campfire', { x: 16, y: 20 })!;
    run(w, 3);
    const before = w.stock.mineral;
    expect(commandCancelBuild(w, fire.id)).toBe(true);
    expect(w.stock.mineral).toBe(before + Math.floor(BUILDINGS.campfire.mineral * 0.75));
    expect(w.buildings.includes(fire)).toBe(false);
    expect(isWalkable(w, 16, 20)).toBe(true);
    run(w, 1);
    expect(me.order.type).toBe('idle');
  });

  it('다 지은 건물·적 건물은 취소 못 함, 첫 사령부를 취소하면 다음 사령부가 다시 첫 사령부', () => {
    const w = newWorld();
    w.stock.mineral = 1000;
    const me = commander(w);
    const cc = commandBuild(w, [me.id], 'commandCenter', { x: 10, y: 20 })!;
    expect(isFirstCommandCenter(w, 'commandCenter')).toBe(false);
    expect(commandCancelBuild(w, cc.id)).toBe(true);
    expect(isFirstCommandCenter(w, 'commandCenter')).toBe(true);
    const again = commandBuild(w, [me.id], 'commandCenter', { x: 10, y: 20 })!;
    run(w, 15);
    expect(again.complete).toBe(true);
    expect(commandCancelBuild(w, again.id)).toBe(false);
  });
});
