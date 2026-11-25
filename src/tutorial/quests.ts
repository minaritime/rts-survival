import { BUILDINGS, type BuildingKind } from '../data/buildings.ts';
import { TUTORIAL_RULES } from '../data/tutorial.ts';
import type { UnitKind } from '../data/units.ts';
import type { NodeKind, ResourceNode } from '../sim/entities.ts';
import { commanderOf, type Stats, type World } from '../sim/world.ts';

/**
 * 1맵 튜토리얼: 왼쪽 위 "목표" 칸에 할 일을 하나씩 보여 주고, 대상에 화살표를 띄운다.
 * Phaser 를 모르는 순수 함수라 테스트로 확인한다. 화면은 viewTutorial 결과를 그리기만 한다.
 * 3단계(건설)부터 모닥불·사령부 같은 목표를 QUESTS 에 이어 붙인다.
 */

/** 튜토리얼이 판정에 쓰는 것. 화면 쪽 상태(선택, 카메라 이동, F1)도 함께 받는다 */
export interface TutorialInput {
  world: World;
  selectedIds: ReadonlySet<number>;
  /** 게임 시작부터 카메라가 움직인 거리 합 (칸) */
  cameraTravelTiles: number;
  /** F1 을 누른 횟수 */
  commanderHotkeyCount: number;
}

export type QuestTarget =
  | { readonly kind: 'commander' }
  | { readonly kind: 'tile'; readonly x: number; readonly y: number }
  | { readonly kind: 'minimap' }
  | null;

/** 목표가 시작될 때의 기록. "목표가 시작된 뒤에 해낸 것"만 세려고 둔다 */
interface Baseline {
  readonly stats: Readonly<Stats>;
  readonly cameraTravelTiles: number;
  readonly commanderHotkeyCount: number;
}

interface Quest {
  readonly id: string;
  readonly title: string;
  /** 설명. 진행률처럼 바뀌는 값을 넣을 때는 함수 */
  readonly detail: string | ((input: TutorialInput) => string);
  /** 이 목표가 시작될 때 한 번 (튜토리얼 보급 등) */
  readonly onStart?: (input: TutorialInput) => void;
  isDone(input: TutorialInput, base: Baseline): boolean;
  target(input: TutorialInput): QuestTarget;
}

/** 1맵 사령부 추천 자리 (왼쪽 위 칸). 미네랄(x=7)과 두 칸 띄워 일꾼이 오갈 길을 남김 */
export const SUGGESTED_COMMAND_CENTER = { x: 10, y: 20 } as const;

const commandCenters = (world: World) => world.buildings.filter((b) => b.kind === 'commandCenter');

/** 1맵 병영 추천 자리 (왼쪽 위 칸): 사령부 오른쪽 */
export const SUGGESTED_BARRACKS = { x: 15, y: 20 } as const;

const unitsOf = (world: World, kind: UnitKind) => world.units.filter((u) => u.kind === kind && u.hp > 0).length;

/** 그 건물(첫 번째) 한가운데 칸 */
function buildingTarget(world: World, kind: BuildingKind): QuestTarget {
  const b = world.buildings.find((x) => x.kind === kind);
  return b ? { kind: 'tile', x: b.x + Math.floor(b.width / 2), y: b.y + Math.floor(b.height / 2) } : null;
}

/** 지도 둘러보기 목표: 카메라가 이만큼(칸) 움직이면 완료 */
const CAMERA_TRAVEL_GOAL = 12;
/** 목표를 해낸 뒤 "완료" 를 보여 주는 시간 */
export const COMPLETE_SHOW_MS = 1500;
/** 마지막 안내를 보여 주는 시간 */
export const FINAL_SHOW_MS = 6000;

function nearestNode(world: World, kind: NodeKind): QuestTarget {
  const c = commanderOf(world);
  if (!c) return null;
  let best: ResourceNode | undefined;
  let bestDist = Infinity;
  for (const n of world.nodes) {
    if (n.kind !== kind || n.amount <= 0) continue;
    const d = Math.hypot(n.x - c.x, n.y - c.y);
    if (d < bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return best ? { kind: 'tile', x: best.x, y: best.y } : null;
}

export const QUESTS: readonly Quest[] = [
  {
    id: 'select',
    title: '지휘관을 선택하세요',
    detail: '지휘관을 왼쪽 클릭합니다',
    isDone: (input) => input.selectedIds.has(input.world.commanderId),
    target: () => ({ kind: 'commander' }),
  },
  {
    id: 'berry',
    title: '열매를 따세요',
    detail: '지휘관을 고른 채 열매 덤불을 오른쪽 클릭합니다.\n모은 식량은 배고플 때 저절로 먹습니다',
    isDone: (input, base) => input.world.stats.berriesPicked > base.stats.berriesPicked,
    target: (input) => nearestNode(input.world, 'berry'),
  },
  {
    id: 'debris',
    title: '잔해를 뒤지세요',
    detail: '잔해를 오른쪽 클릭하면 미네랄이 나옵니다',
    isDone: (input, base) => input.world.stats.debrisLooted > base.stats.debrisLooted,
    target: (input) => nearestNode(input.world, 'debris'),
  },
  {
    id: 'mineral',
    title: '미네랄을 캐세요',
    detail: '빛나는 결정을 오른쪽 클릭합니다.\n미네랄은 건물을 지을 때 씁니다',
    isDone: (input, base) => input.world.stats.mineralMined > base.stats.mineralMined,
    target: (input) => nearestNode(input.world, 'mineral'),
  },
  {
    id: 'camera',
    title: '지도를 둘러보세요',
    detail: '마우스를 화면 끝에 대거나 방향키를 누릅니다.\n왼쪽 아래 작은 지도를 클릭해도 됩니다',
    isDone: (input, base) => input.cameraTravelTiles - base.cameraTravelTiles >= CAMERA_TRAVEL_GOAL,
    target: () => ({ kind: 'minimap' }),
  },
  {
    id: 'hotkey',
    title: '지휘관에게 돌아오세요',
    detail: 'F1 키를 누르면 지휘관을 고르고 화면이 지휘관에게 갑니다',
    isDone: (input, base) => input.commanderHotkeyCount > base.commanderHotkeyCount,
    target: () => null,
  },
  {
    // 미리 지어 둔 경우에도 넘어가도록 "지금 있는지"로 판정한다
    id: 'place-cc',
    title: '사령부를 지을 자리를 정하세요',
    detail: '지휘관을 고르고 아래 명령 칸의 사령부(C)를 누른 뒤\n화살표가 가리키는 빈 땅을 클릭합니다. 미네랄 ' + BUILDINGS.commandCenter.mineral + '이 듭니다',
    isDone: (input) => commandCenters(input.world).length > 0,
    target: () => ({ kind: 'tile', x: SUGGESTED_COMMAND_CENTER.x + 1, y: SUGGESTED_COMMAND_CENTER.y + 1 }),
  },
  {
    id: 'finish-cc',
    title: '사령부가 다 지어질 때까지 기다리세요',
    detail: (input) => {
      const cc = commandCenters(input.world)[0];
      const percent = cc ? Math.floor(cc.progress * 100) : 0;
      return `첫 사령부는 혼자 지어집니다. 그동안 지휘관은 자유롭게 움직입니다.\n다른 건물은 지휘관이나 일꾼이 곁에 있어야 지어집니다.\n진행 ${percent}%`;
    },
    isDone: (input) => commandCenters(input.world).some((b) => b.complete),
    target: (input) => {
      const cc = commandCenters(input.world)[0];
      return cc ? { kind: 'tile', x: cc.x + 1, y: cc.y + 1 } : null;
    },
  },
  // ---------- 2장: 일꾼·병영·소총병 (사용자 요청 11/24: 핵심만 짧게) ----------
  {
    id: 'train-worker',
    title: '일꾼을 뽑으세요',
    detail: '사령부를 클릭하고 아래 명령 칸의 일꾼(S)을 누릅니다.\n튜토리얼 보급으로 미네랄을 받았습니다',
    // 2장 시작: 미네랄을 모으느라 기다리지 않게 넉넉히 준다 (튜토리얼은 빠르게)
    onStart: (input) => {
      input.world.stock.mineral += TUTORIAL_RULES.chapterTwoMineral;
    },
    isDone: (input) => unitsOf(input.world, 'worker') > 0,
    target: (input) => buildingTarget(input.world, 'commandCenter'),
  },
  {
    id: 'worker-mine',
    title: '일꾼으로 미네랄을 나르세요',
    detail: '일꾼을 클릭하고 미네랄을 오른쪽 클릭합니다.\n일꾼은 캔 미네랄을 사령부까지 들고 와야 들어옵니다',
    isDone: (input, base) => input.world.stats.workerMineral > base.stats.workerMineral,
    target: (input) => nearestNode(input.world, 'mineral'),
  },
  {
    id: 'build-barracks',
    title: '병영을 지으세요',
    detail: '지휘관이나 일꾼을 고르고 명령 칸의 병영(B)을 누른 뒤\n화살표가 가리키는 빈 땅을 클릭합니다',
    isDone: (input) => input.world.buildings.some((b) => b.kind === 'barracks' && b.complete),
    target: (input) => {
      const b = input.world.buildings.find((x) => x.kind === 'barracks');
      return b ? { kind: 'tile', x: b.x + 1, y: b.y + 1 } : { kind: 'tile', x: SUGGESTED_BARRACKS.x + 1, y: SUGGESTED_BARRACKS.y + 1 };
    },
  },
  {
    id: 'train-rifleman',
    title: '소총병을 뽑으세요',
    detail: '병영을 클릭하고 명령 칸의 소총병(A)을 누릅니다.\n여럿을 뽑으면 끌어서 한꺼번에 고를 수 있습니다',
    isDone: (input) => unitsOf(input.world, 'rifleman') > 0,
    target: (input) => buildingTarget(input.world, 'barracks'),
  },
];

const FINAL = {
  title: '튜토리얼 완료',
  detail: '이제 1스테이지를 시작할 수 있습니다',
} as const;

export interface TutorialState {
  readonly index: number;
  readonly baseline: Baseline;
  /** 지금 목표를 해낸 시각. 아직이면 null */
  readonly doneAtMs: number | null;
  /** 모든 목표를 마친 시각. 아직이면 null */
  readonly finishedAtMs: number | null;
}

function snapshot(input: TutorialInput): Baseline {
  return {
    stats: { ...input.world.stats },
    cameraTravelTiles: input.cameraTravelTiles,
    commanderHotkeyCount: input.commanderHotkeyCount,
  };
}

export function startTutorial(input: TutorialInput): TutorialState {
  return { index: 0, baseline: snapshot(input), doneAtMs: null, finishedAtMs: null };
}

/** 매 프레임: 지금 목표를 해냈는지 보고, 완료 표시가 끝나면 다음 목표로. 새 상태를 돌려준다 */
export function stepTutorial(state: TutorialState, input: TutorialInput, nowMs: number): TutorialState {
  if (state.finishedAtMs !== null) return state;
  const quest = QUESTS[state.index];
  if (!quest) return { ...state, finishedAtMs: nowMs };

  if (state.doneAtMs === null) {
    return quest.isDone(input, state.baseline) ? { ...state, doneAtMs: nowMs } : state;
  }
  if (nowMs - state.doneAtMs < COMPLETE_SHOW_MS) return state;

  const next = state.index + 1;
  if (next >= QUESTS.length) return { ...state, index: next, doneAtMs: null, finishedAtMs: nowMs };
  QUESTS[next]!.onStart?.(input);
  return { index: next, baseline: snapshot(input), doneAtMs: null, finishedAtMs: null };
}

export interface QuestView {
  readonly index: number;
  readonly total: number;
  readonly title: string;
  readonly detail: string;
  readonly done: boolean;
  readonly target: QuestTarget;
}

/** 목표 칸에 보여 줄 것. 튜토리얼이 끝나고 마지막 안내도 지나면 null */
export function viewTutorial(state: TutorialState, input: TutorialInput, nowMs: number): QuestView | null {
  if (state.finishedAtMs !== null) {
    if (nowMs - state.finishedAtMs >= FINAL_SHOW_MS) return null;
    return { index: QUESTS.length, total: QUESTS.length, ...FINAL, done: true, target: null };
  }
  const quest = QUESTS[state.index]!;
  const done = state.doneAtMs !== null;
  return {
    index: state.index,
    total: QUESTS.length,
    title: quest.title,
    detail: typeof quest.detail === 'function' ? quest.detail(input) : quest.detail,
    done,
    target: done ? null : quest.target(input),
  };
}
