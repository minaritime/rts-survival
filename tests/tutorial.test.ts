import { describe, expect, test } from 'vitest';
import { TUTORIAL_RULES } from '../src/data/tutorial.ts';
import { commandBuild, commandGather, commandTrain } from '../src/sim/commands.ts';
import {
  QUESTS,
  startTutorial,
  stepTutorial,
  viewTutorial,
  COMPLETE_SHOW_MS,
  FINAL_SHOW_MS,
  type TutorialInput,
  type TutorialState,
} from '../src/tutorial/quests.ts';
import { commander, newWorld, node, runUntil } from './helpers.ts';

function makeInput(): TutorialInput {
  return { world: newWorld(), selectedIds: new Set(), cameraTravelTiles: 0, commanderHotkeyCount: 0 };
}

/** 지금 목표를 끝냈다고 보고 다음 목표로 넘어갈 때까지 시간을 흘린다 */
function advance(state: TutorialState, input: TutorialInput, now: number): { state: TutorialState; now: number } {
  const marked = stepTutorial(state, input, now);
  expect(marked.doneAtMs).toBe(now);
  const later = now + COMPLETE_SHOW_MS;
  return { state: stepTutorial(marked, input, later), now: later };
}

describe('튜토리얼 목표 순서', () => {
  test('1장: 지휘관 선택 ~ 사령부 완공, 2장: 일꾼 → 일꾼 채집 → 병영 → 소총병', () => {
    expect(QUESTS.map((q) => q.id)).toEqual([
      'select',
      'berry',
      'debris',
      'mineral',
      'camera',
      'hotkey',
      'place-cc',
      'finish-cc',
      'train-worker',
      'worker-mine',
      'build-barracks',
      'train-rifleman',
    ]);
  });

  test('처음에는 1번 목표, 화살표는 지휘관', () => {
    const input = makeInput();
    const view = viewTutorial(startTutorial(input), input, 0);
    expect(view).toMatchObject({ index: 0, total: 12, done: false, target: { kind: 'commander' } });
    expect(view?.title).toContain('지휘관');
  });

  test('해내기 전에는 넘어가지 않는다', () => {
    const input = makeInput();
    const state = stepTutorial(startTutorial(input), input, 5000);
    expect(state.index).toBe(0);
    expect(state.doneAtMs).toBeNull();
  });

  test('해내면 잠깐 완료를 보여 준 뒤 다음 목표로', () => {
    const input = makeInput();
    let state = startTutorial(input);
    input.selectedIds = new Set([input.world.commanderId]);
    state = stepTutorial(state, input, 1000);
    expect(viewTutorial(state, input, 1000)?.done).toBe(true);
    state = stepTutorial(state, input, 1000 + COMPLETE_SHOW_MS - 1);
    expect(state.index).toBe(0);
    state = stepTutorial(state, input, 1000 + COMPLETE_SHOW_MS);
    expect(state.index).toBe(1);
    expect(viewTutorial(state, input, 1000 + COMPLETE_SHOW_MS)?.done).toBe(false);
  });

  test('지금 목표 전에 해 둔 일은 세지 않는다 (목표가 시작될 때 기준)', () => {
    const input = makeInput();
    input.world.stats.berriesPicked = 3; // 선택 목표 중에 미리 딴 열매
    let { state } = advance(startTutorial({ ...input, selectedIds: new Set([1]) }), { ...input, selectedIds: new Set([1]) }, 0);
    expect(state.index).toBe(1);
    state = stepTutorial(state, input, 99999);
    expect(state.doneAtMs).toBeNull();
    input.world.stats.berriesPicked = 4;
    state = stepTutorial(state, input, 100000);
    expect(state.doneAtMs).toBe(100000);
  });
});

describe('튜토리얼 끝까지', () => {
  test('실제 게임 상태로 전부 해내면 마지막 안내를 보여 주고 사라진다', () => {
    const input = makeInput();
    const world = input.world;
    let state = startTutorial(input);
    let now = 0;

    input.selectedIds = new Set([world.commanderId]);
    ({ state, now } = advance(state, input, now));

    // 2. 열매: 화살표가 가리키는 덤불을 실제로 딴다
    const berryTarget = viewTutorial(state, input, now)?.target;
    expect(berryTarget?.kind).toBe('tile');
    if (berryTarget?.kind !== 'tile') throw new Error('덤불 화살표 없음');
    expect(node(world, berryTarget.x, berryTarget.y).kind).toBe('berry');
    commandGather(world, [world.commanderId], node(world, berryTarget.x, berryTarget.y).id);
    runUntil(world, () => world.stats.berriesPicked > 0, 30);
    ({ state, now } = advance(state, input, now));

    // 3. 잔해
    const debrisTarget = viewTutorial(state, input, now)?.target;
    if (debrisTarget?.kind !== 'tile') throw new Error('잔해 화살표 없음');
    commandGather(world, [world.commanderId], node(world, debrisTarget.x, debrisTarget.y).id);
    runUntil(world, () => world.stats.debrisLooted > 0, 30);
    ({ state, now } = advance(state, input, now));

    // 4. 미네랄
    const mineralTarget = viewTutorial(state, input, now)?.target;
    if (mineralTarget?.kind !== 'tile') throw new Error('미네랄 화살표 없음');
    expect(node(world, mineralTarget.x, mineralTarget.y).kind).toBe('mineral');
    commandGather(world, [world.commanderId], node(world, mineralTarget.x, mineralTarget.y).id);
    runUntil(world, () => world.stats.mineralMined > 0, 30);
    ({ state, now } = advance(state, input, now));

    // 5. 지도 둘러보기: 화살표는 미니맵
    expect(viewTutorial(state, input, now)?.target).toEqual({ kind: 'minimap' });
    input.cameraTravelTiles = 5;
    expect(stepTutorial(state, input, now).doneAtMs).toBeNull();
    input.cameraTravelTiles = 13;
    ({ state, now } = advance(state, input, now));

    // 6. F1
    input.commanderHotkeyCount = 1;
    ({ state, now } = advance(state, input, now));

    // 7. 사령부 자리: 화살표가 가리키는 추천 자리에 놓는다 (잔해 + 미네랄 한 번으로 250 이 모여 있어야 함)
    const spotTarget = viewTutorial(state, input, now)?.target;
    if (spotTarget?.kind !== 'tile') throw new Error('사령부 자리 화살표 없음');
    expect(world.stock.mineral).toBeGreaterThanOrEqual(250);
    const cc = commandBuild(world, [world.commanderId], 'commandCenter', { x: spotTarget.x - 1, y: spotTarget.y - 1 });
    expect(cc).not.toBeNull();
    ({ state, now } = advance(state, input, now));

    // 8. 완공: 진행률이 설명에 보이고, 다 지으면 완료
    expect(viewTutorial(state, input, now)?.detail).toMatch(/진행 \d+%/);
    runUntil(world, () => cc!.complete, 120);
    const beforeGrant = world.stock.mineral;
    ({ state, now } = advance(state, input, now));

    // 2장에 들어가면 미네랄을 준다 (튜토리얼은 빠르게)
    expect(world.stock.mineral).toBe(beforeGrant + TUTORIAL_RULES.chapterTwoMineral);
    world.tutorialRules = true;

    // 9. 일꾼: 화살표는 사령부
    expect(viewTutorial(state, input, now)?.target).toMatchObject({ kind: 'tile' });
    expect(commandTrain(world, cc!.id, 'worker')).toBe(true);
    runUntil(world, () => world.units.some((u) => u.kind === 'worker'), 30);
    ({ state, now } = advance(state, input, now));

    // 10. 일꾼으로 미네랄을 사령부까지 나른다
    const worker = world.units.find((u) => u.kind === 'worker')!;
    commandGather(world, [worker.id], node(world, 7, 21).id);
    runUntil(world, () => world.stats.workerMineral > 0, 60);
    ({ state, now } = advance(state, input, now));

    // 11. 병영: 화살표가 가리키는 추천 자리
    const barracksTarget = viewTutorial(state, input, now)?.target;
    if (barracksTarget?.kind !== 'tile') throw new Error('병영 자리 화살표 없음');
    const barracks = commandBuild(world, [worker.id], 'barracks', { x: barracksTarget.x - 1, y: barracksTarget.y - 1 });
    expect(barracks).not.toBeNull();
    runUntil(world, () => barracks!.complete, 60);
    ({ state, now } = advance(state, input, now));

    // 12. 소총병
    expect(commandTrain(world, barracks!.id, 'rifleman')).toBe(true);
    runUntil(world, () => world.units.some((u) => u.kind === 'rifleman'), 30);
    ({ state, now } = advance(state, input, now));

    expect(state.finishedAtMs).not.toBeNull();
    expect(viewTutorial(state, input, now)?.title).toContain('완료');
    expect(viewTutorial(state, input, now + FINAL_SHOW_MS)).toBeNull();
    expect(commander(world).hp).toBeGreaterThan(0);
  });

  test('딸 열매가 하나도 없으면 화살표가 없다', () => {
    const input = makeInput();
    for (const n of input.world.nodes) if (n.kind === 'berry') n.amount = 0;
    const state = { ...startTutorial(input), index: 1 };
    expect(viewTutorial(state, input, 0)?.target).toBeNull();
  });

  test('지휘관이 없으면 가장 가까운 대상을 못 정해 화살표가 없다', () => {
    const input = makeInput();
    input.world.units.length = 0;
    const state = { ...startTutorial(input), index: 2 };
    expect(viewTutorial(state, input, 0)?.target).toBeNull();
  });
});
