import Phaser from 'phaser';
import { TILE_SIZE } from '../data/constants.ts';
import { commandAttack, commandAttackMove, commandSmart } from '../sim/commands.ts';
import type { Point } from '../sim/grid.ts';
import { buildingAt, commanderOf, nodeAt, type World } from '../sim/world.ts';
import { unitScreenPos, type ScreenPoint } from './coords.ts';
import { DEPTH, PALETTE } from './palette.ts';
import {
  addToGroup,
  assignGroup,
  isDoubleTap,
  recallGroup,
  slotFromCode,
  type ControlGroups,
  type LastRecall,
} from './controlGroups.ts';
import { DRAG_THRESHOLD, nextSelection, unitAt, unitsInBox, type WorldPoint } from './selection.ts';

export interface UnitInput {
  readonly selected: ReadonlySet<number>;
  /** F1·지휘관 카드로 지휘관을 고른 횟수 (튜토리얼 판정용) */
  readonly commanderHotkeyCount: number;
  /** 지휘관을 고르고 화면을 지휘관에게 옮긴다 (F1, 지휘관 카드) */
  selectCommander(): void;
  /** 부대 지정 (아래 판에 번호를 보여 줄 때 씀) */
  readonly groups: ControlGroups;
  /**
   * 고를 수 없는 것(배급처·사냥감·절벽·괴물 입구)을 누른 칸. 아래 판이 무엇인지 보여 준다.
   * 무언가를 고르면 지워진다
   */
  readonly inspected: Point | null;
  /** 공격 대상 고르는 중 (A 또는 공격 버튼 뒤 다음 왼쪽 클릭이 공격, 오른쪽 클릭은 취소) */
  readonly targeting: boolean;
  startAttackTarget(): void;
  cancelTargeting(): void;
  /** 매 프레임: 끄는 중이면 선택 상자를, 공격 대상 고르는 중이면 조준 표시를 그린다 */
  update(): void;
}

export interface UnitInputDeps {
  readonly getWorld: () => World;
  readonly getAlpha: () => number;
  /** 지금 커서의 화면 좌표 (cursor.ts). 마우스를 가둔 동안은 pointer.x 가 안 바뀐다 */
  readonly cursorAt: () => ScreenPoint;
  /** 미니맵·HUD 위 (지도 클릭이 아님) */
  readonly isBlockedAt: (p: ScreenPoint) => boolean;
  /** 일시정지 중이면 false */
  readonly isActive: () => boolean;
  /** 건물 자리를 고르는 중이면 지도 클릭을 placement.ts 에 양보한다 */
  readonly isPlacing: () => boolean;
  readonly minimapCamera: Phaser.Cameras.Scene2D.Camera;
}

interface Drag {
  /** 누른 자리 (지도 좌표. 끄는 동안 화면이 움직여도 시작점은 지도에 붙어 있음) */
  readonly startWorld: WorldPoint;
  readonly startScreen: ScreenPoint;
  readonly additive: boolean;
}

/**
 * 스타식 고르기와 명령.
 * - 왼쪽 클릭: 하나 고르기 (빈 땅이면 선택 해제) / 왼쪽으로 끌기: 상자 안 유닛 모두 / Shift: 지금 선택에 더하기
 * - 오른쪽 클릭: 명령 (괴물·사냥감이면 공격, 자원이면 채집, 땅이면 이동)
 * - A(공격 버튼) 다음 왼쪽 클릭: 괴물이면 공격, 땅이면 공격하며 이동. 오른쪽 클릭은 취소
 * - F1: 지휘관 고르기 + 화면 이동
 * - Ctrl+숫자 부대 지정 / Shift+숫자 더하기 / 숫자 불러오기 / 두 번 빨리: 화면 이동 (controlGroups.ts)
 */
export function createUnitInput(scene: Phaser.Scene, deps: UnitInputDeps): UnitInput {
  let selected = new Set<number>();
  let hotkeyCount = 0;
  let drag: Drag | null = null;
  let inspected: Point | null = null;
  let targeting = false;
  const main = scene.cameras.main;
  const box = scene.add.graphics().setDepth(DEPTH.topOverlay);
  deps.minimapCamera.ignore(box);

  const toWorld = (p: ScreenPoint): WorldPoint => {
    const w = main.getWorldPoint(p.x, p.y);
    return { x: w.x, y: w.y };
  };
  const dragDistance = (d: Drag): number => {
    const now = deps.cursorAt();
    return Math.hypot(now.x - d.startScreen.x, now.y - d.startScreen.y);
  };

  /** 내가 고른 것 중 살아 있는 유닛 */
  const myUnits = (): number[] => {
    const world = deps.getWorld();
    return world.units.filter((u) => selected.has(u.id) && u.hp > 0).map((u) => u.id);
  };

  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    const screen = deps.cursorAt();
    if (!deps.isActive() || deps.isPlacing() || deps.isBlockedAt(screen)) return;
    const world = deps.getWorld();
    const at = toWorld(screen);
    const foe = unitAt(world.creatures, at, deps.getAlpha());

    if (targeting) {
      targeting = false;
      if (!pointer.leftButtonDown()) return; // 오른쪽 클릭 = 취소
      if (foe) commandAttack(world, myUnits(), foe.id);
      else commandAttackMove(world, myUnits(), tileOf(at));
      return;
    }
    if (pointer.rightButtonDown()) {
      if (foe && myUnits().length > 0) commandAttack(world, [...selected], foe.id);
      else commandSmart(world, [...selected], tileOf(at));
      return;
    }
    if (!pointer.leftButtonDown()) return;
    const shift = (pointer.event as MouseEvent | undefined)?.shiftKey ?? false;
    drag = { startWorld: toWorld(screen), startScreen: screen, additive: shift };
  });

  scene.input.on('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    box.clear();
    if (!deps.isActive()) return;
    const world = deps.getWorld();
    const alpha = deps.getAlpha();
    const end = toWorld(deps.cursorAt());
    const picked =
      dragDistance(d) > DRAG_THRESHOLD
        ? unitsInBox(world.units, d.startWorld, end, alpha).map((u) => u.id)
        : [clickPick(world, end, alpha)].filter((id): id is number => id !== undefined);
    selected = nextSelection(selected, picked, d.additive);
    targeting = false;
    // 아무것도 못 골랐으면 그 칸을 살펴본다 (배급처·사냥감·절벽 등이 무엇인지 아래 판에)
    inspected = picked.length === 0 && dragDistance(d) <= DRAG_THRESHOLD ? tileOf(end) : null;
  });

  // 부대 지정. 브라우저의 Ctrl+숫자(탭 전환)보다 먼저 받으려고 창 전체에서 capture 로 듣는다
  let groups: ControlGroups = new Map();
  let lastRecall: LastRecall | null = null;
  const onKeyDown = (e: KeyboardEvent): void => {
    const slot = slotFromCode(e.code);
    if (slot === null || e.altKey || !deps.isActive()) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) e.preventDefault();
    if (e.repeat) return;
    const world = deps.getWorld();
    // 부대에는 내 유닛·건물만 (괴물·자원을 골라 둔 채 눌러도 담기지 않게)
    const own = [...selected].filter(
      (id) => world.units.some((u) => u.id === id && u.hp > 0) || world.buildings.some((b) => b.id === id),
    );
    if (e.ctrlKey || e.metaKey) {
      if (own.length > 0) groups = assignGroup(groups, slot, own); // 빈 선택이면 아무 일 없음 (스타)
      return;
    }
    if (e.shiftKey) {
      if (own.length > 0) groups = addToGroup(groups, slot, own);
      return;
    }
    const ids = recallGroup(
      groups,
      slot,
      (id) => world.units.some((u) => u.id === id && u.hp > 0) || world.buildings.some((b) => b.id === id),
    );
    if (ids.length === 0) return;
    selected = new Set(ids);
    inspected = null;
    targeting = false;
    const now = performance.now();
    if (isDoubleTap(lastRecall, slot, now)) centerOn(ids);
    lastRecall = { slot, timeMs: now };
  };
  window.addEventListener('keydown', onKeyDown, { capture: true });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', onKeyDown, { capture: true }));

  function tileOf(at: WorldPoint): Point {
    return { x: Math.floor(at.x / TILE_SIZE), y: Math.floor(at.y / TILE_SIZE) };
  }

  /**
   * 클릭 한 번으로 고르는 것: 유닛 → 건물 → 자원(미네랄·열매·잔해) 순.
   * 자원 그림은 칸 위로 솟아 있어서 누른 칸 바로 아래 칸의 자원도 본다.
   */
  function clickPick(world: World, at: WorldPoint, alpha: number): number | undefined {
    const unit = unitAt(world.units, at, alpha);
    if (unit) return unit.id;
    const creature = unitAt(world.creatures, at, alpha);
    if (creature) return creature.id;
    const t = tileOf(at);
    return buildingAt(world, t.x, t.y)?.id ?? nodeAt(world, t.x, t.y)?.id ?? nodeAt(world, t.x, t.y + 1)?.id;
  }

  /** 유닛·건물들 가운데로 화면 이동 */
  function centerOn(ids: readonly number[]): void {
    const alpha = deps.getAlpha();
    const world = deps.getWorld();
    const points = [
      ...world.units.filter((u) => ids.includes(u.id)).map((u) => unitScreenPos(u, alpha)),
      ...world.buildings
        .filter((b) => ids.includes(b.id))
        .map((b) => ({ x: (b.x + b.width / 2) * TILE_SIZE, y: (b.y + b.height / 2) * TILE_SIZE })),
    ];
    if (points.length === 0) return;
    main.centerOn(
      points.reduce((s, p) => s + p.x, 0) / points.length,
      points.reduce((s, p) => s + p.y, 0) / points.length,
    );
  }

  const keyboard = scene.input.keyboard;
  if (!keyboard) throw new Error('키보드 입력을 쓸 수 없음');
  keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F1).on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => {
    event.preventDefault(); // 브라우저 도움말 창 막기
    if (deps.isActive()) selectCommander();
  });

  function selectCommander(): void {
    const commander = commanderOf(deps.getWorld());
    if (!commander || commander.hp <= 0) return;
    selected = new Set([commander.id]);
    inspected = null;
    targeting = false;
    hotkeyCount += 1;
    centerOn([commander.id]);
  }

  return {
    get selected() {
      return selected;
    },
    get commanderHotkeyCount() {
      return hotkeyCount;
    },
    get groups() {
      return groups;
    },
    get inspected() {
      return inspected;
    },
    get targeting() {
      return targeting;
    },
    startAttackTarget() {
      if (myUnits().length > 0) targeting = true;
    },
    cancelTargeting() {
      targeting = false;
    },
    selectCommander,
    update() {
      box.clear();
      if (targeting && (myUnits().length === 0 || deps.isPlacing())) targeting = false;
      if (targeting && deps.isActive()) {
        // 조준 표시 (지도 좌표에 그림)
        const c = toWorld(deps.cursorAt());
        box.lineStyle(2, 0xff4d4f, 0.95);
        box.strokeCircle(c.x, c.y, 14);
        box.lineBetween(c.x - 20, c.y, c.x - 8, c.y);
        box.lineBetween(c.x + 8, c.y, c.x + 20, c.y);
        box.lineBetween(c.x, c.y - 20, c.x, c.y - 8);
        box.lineBetween(c.x, c.y + 8, c.x, c.y + 20);
      }
      if (!drag || !deps.isActive() || dragDistance(drag) <= DRAG_THRESHOLD) return;
      const end = toWorld(deps.cursorAt());
      const x = Math.min(drag.startWorld.x, end.x);
      const y = Math.min(drag.startWorld.y, end.y);
      const w = Math.abs(end.x - drag.startWorld.x);
      const h = Math.abs(end.y - drag.startWorld.y);
      box.fillStyle(PALETTE.selection, 0.12);
      box.fillRect(x, y, w, h);
      box.lineStyle(1.5, PALETTE.selection, 0.9);
      box.strokeRect(x, y, w, h);
    },
  };
}
