import { describe, expect, test } from 'vitest';
import { commandBuild, commandGather, commandTrain } from '../src/sim/commands.ts';
import { describeGroups, describeOrder, describeSelection, describeTile } from '../src/view/ui/describe.ts';
import { commander, newWorld, node, run } from './helpers.ts';

describe('선택 정보 글', () => {
  test('아무것도 안 고르면 null', () => {
    expect(describeSelection(newWorld(), new Set())).toBeNull();
  });

  test('지휘관 하나: 이름 + 하는 일 (체력은 막대로 따로)', () => {
    const world = newWorld();
    const text = describeSelection(world, new Set([world.commanderId]));
    expect(text?.title).toBe('지휘관');
    expect(text?.status).toContain('대기 중');
    expect(text?.status).not.toContain('체력');
  });

  test('하는 일: 채집하러 가는 중 → 캐는 중', () => {
    const world = newWorld();
    commandGather(world, [world.commanderId], node(world, 7, 21).id);
    run(world, 0.1);
    expect(describeOrder(world, commander(world))).toBe('미네랄 캐러 가는 중');
    run(world, 5);
    expect(describeOrder(world, commander(world))).toBe('미네랄 캐는 중');
  });

  test('짓는 중인 사령부: 진행률, 다 지으면 완성', () => {
    const world = newWorld();
    world.stock.mineral = 300;
    const cc = commandBuild(world, [world.commanderId], 'commandCenter', { x: 10, y: 20 })!;
    run(world, 5);
    const building = describeSelection(world, new Set([cc.id]));
    expect(building?.title).toBe('사령부');
    expect(building?.status).toMatch(/짓는 중 \d+%/);
    run(world, 10);
    // 다 지으면 하는 일을 보여 준다
    expect(describeSelection(world, new Set([cc.id]))?.status).toContain('보급 +10');
    // 생산 중이면 생산 상태
    world.stock.mineral = 500;
    commandTrain(world, cc.id, 'worker');
    commandTrain(world, cc.id, 'worker');
    run(world, 6);
    expect(describeSelection(world, new Set([cc.id]))?.status).toMatch(/^일꾼 만드는 중 \d+%$/);
  });

  test('여럿이면 개수만', () => {
    const world = newWorld();
    world.stock.mineral = 300;
    const cc = commandBuild(world, [world.commanderId], 'commandCenter', { x: 10, y: 20 })!;
    expect(describeSelection(world, new Set([world.commanderId, cc.id]))).toEqual({ title: '지휘관, 사령부', status: '2개 선택' });
  });

  test('미네랄·열매 덤불·잔해를 고르면 무엇인지와 상태가 나온다', () => {
    const world = newWorld();
    const mineral = node(world, 7, 21);
    expect(describeSelection(world, new Set([mineral.id]))).toEqual({
      title: '미네랄',
      status: '고갈되지 않습니다\n한 번에 8씩 캡니다',
    });
    const bush = node(world, 22, 20);
    expect(describeSelection(world, new Set([bush.id]))?.title).toBe('열매 덤불');
    expect(describeSelection(world, new Set([bush.id]))?.status).toContain('열매 15 / 15');
    bush.amount = 0;
    bush.regrowAt = 90;
    expect(describeSelection(world, new Set([bush.id]))?.status).toContain('90초 뒤 다시 찹니다');
    const debris = node(world, 18, 31);
    expect(describeSelection(world, new Set([debris.id]))?.status).toContain('미네랄 50');
  });

  test('배급처·절벽·괴물 입구는 칸을 눌러 무엇인지 본다, 빈 땅은 null', () => {
    const world = newWorld();
    expect(describeTile(world, { x: 10, y: 28 })?.title).toBe('식량 배급처');
    expect(describeTile(world, { x: 0, y: 0 })?.title).toBe('절벽');
    expect(describeTile(world, { x: 30, y: 0 })?.title).toBe('괴물 입구');
    expect(describeTile(world, { x: 20, y: 24 })).toBeNull();
  });

  test('부대 번호 줄: 1~9, 0 순서', () => {
    expect(describeGroups(new Map())).toBe('');
    expect(
      describeGroups(
        new Map([
          [0, [1]],
          [3, [1, 2]],
          [1, [5]],
        ]),
      ),
    ).toBe('부대  1(1)  3(2)  0(1)');
  });
});

describe('괴물·사냥감 설명 (5단계)', () => {
  test('사냥감은 골라서 이름·설명을 본다', () => {
    const world = newWorld();
    const grazer = world.creatures.find((c) => c.kind === 'grazer')!;
    const text = describeSelection(world, new Set([grazer.id]));
    expect(text?.title).toBe('사냥감');
    expect(text?.status).toContain('초식 동물');
  });

  test('괴물이 4칸 안에 있으면 배급처는 막힘', () => {
    const world = newWorld();
    const feeder = world.feeders.find((f) => f.x === 10 && f.y === 28)!;
    feeder.active = true;
    feeder.blocked = true;
    expect(describeTile(world, { x: 10, y: 28 })?.status).toContain('막힘');
  });
});
