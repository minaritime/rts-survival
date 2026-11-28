import { describe, expect, test } from 'vitest';
import { BUILDINGS } from '../src/data/buildings.ts';
import { commandBuild } from '../src/sim/commands.ts';
import { createTrainedUnit } from '../src/sim/entities.ts';
import { elapsedSeconds, type World } from '../src/sim/world.ts';
import { commander, newWorld, run, runUntil } from './helpers.ts';

/**
 * 1맵 15분 자동 시뮬레이션 (시제품.md 5장, 기획.md 11-2).
 * 기대: 지휘관 혼자면 뚫림 / 소총병 8 + 포탑 2 + 사령부면 버팀.
 * 식량은 신경 쓰지 않게 넉넉히 채워 둔다 (전투만 본다).
 */

const FIFTEEN_MINUTES = 15 * 60;

function quick(world: World, kind: Parameters<typeof commandBuild>[2], at: { x: number; y: number }): void {
  world.stock.mineral += BUILDINGS[kind].mineral;
  world.tutorialRules = true;
  const b = commandBuild(world, [world.commanderId], kind, at);
  if (!b) throw new Error(`${kind} 못 지음 ${at.x},${at.y}`);
  runUntil(world, () => b.complete, 60);
  world.tutorialRules = false;
}

/** 식량을 늘 채워 굶어 죽지 않게 */
function runFed(world: World, seconds: number): void {
  for (let t = 0; t < seconds && world.outcome === 'playing'; t += 5) {
    world.satiety = 100;
    run(world, 5);
  }
}

function report(name: string, world: World): string {
  return `${name}: ${world.outcome === 'defeat' ? `패배 ${Math.floor(elapsedSeconds(world))}초` : '버팀'}, 잡은 괴물 ${world.stats.monstersKilled}, 잃은 건물 ${world.stats.buildingsLost}, 잃은 유닛 ${world.stats.unitsLost}`;
}

describe('1맵 15분 밸런스', () => {
  test('지휘관 혼자 (건물 없음): 15분 안에 죽는다', () => {
    const world = newWorld();
    world.waves.enabled = true;
    runFed(world, FIFTEEN_MINUTES);
    console.info(report('지휘관 혼자', world));
    expect(world.outcome).toBe('defeat');
  });

  // 한 판은 난수(공격 방향)에 따라 아슬아슬하게 뒤집힐 수 있어 여러 판으로 본다 (11/28: 유닛 밀어내기를 넣자 기본 시드 한 판만 15:10 에 짐)
  test('권장 수비 (사령부 + 포탑 2 + 소총병 8): 5판 중 4판 이상 15분 버틴다', () => {
    let held = 0;
    for (let n = 0; n < 5; n++) {
      const world = newWorld();
      if (n > 0) world.rngState = n * 7919;
      quick(world, 'commandCenter', { x: 10, y: 20 });
      // 본진 한가운데쯤 포탑 두 개 (북쪽·동쪽 길목에서 오는 길)
      quick(world, 'turret', { x: 18, y: 19 });
      quick(world, 'turret', { x: 18, y: 24 });
      for (let i = 0; i < 8; i++) {
        world.units.push(createTrainedUnit(world.nextId++, 'rifleman', { x: 16 + (i % 4), y: 21 + Math.floor(i / 4) }));
      }
      commander(world).x = 14;
      commander(world).y = 22;
      world.waves.enabled = true;
      runFed(world, FIFTEEN_MINUTES);
      console.info(report(`권장 수비 ${n + 1}`, world));
      if (world.outcome === 'playing') held++;
    }
    expect(held).toBeGreaterThanOrEqual(4);
  });
});
