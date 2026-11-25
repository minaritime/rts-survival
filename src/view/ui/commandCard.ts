import Phaser from 'phaser';
import { BUILDINGS, FIRST_COMMAND_CENTER, type BuildingKind } from '../../data/buildings.ts';
import { UNITS, PRODUCTION_QUEUE_MAX, type TrainableKind } from '../../data/units.ts';
import { commandCancelTrain, commandStop, commandTrain, isFirstCommandCenter, missingRequirement } from '../../sim/commands.ts';
import { UNIT_ATTACK } from '../../data/combat.ts';
import { canBuild, type Building } from '../../sim/entities.ts';
import type { World } from '../../sim/world.ts';
import { iconKey } from '../assets.ts';
import { DEPTH } from '../palette.ts';
import { buildingRole, type SelectionText } from './describe.ts';
import { COMMAND_GRID, COMMAND_HOTKEYS, commandCellRect, contains, type HudLayout, type Rect } from './layout.ts';
import { COLOR, FONT, RADIUS, SPACE, textStyle } from './tokens.ts';
import { hotkeyBadge, makeFixer } from './widgets.ts';

/** 명령 버튼이 쓰는 것: 게임 상태 + 화면 쪽 동작(건물 자리 고르기 시작) */
export interface CommandContext {
  readonly world: World;
  readonly selected: ReadonlySet<number>;
  readonly startPlacement: (kind: BuildingKind) => void;
  /** 공격 대상 고르기 시작 (다음 왼쪽 클릭) */
  readonly startAttack: () => void;
  /** 다른 명령을 고르면 공격 대상 고르기를 푼다 */
  readonly cancelAttack: () => void;
}

/**
 * 명령 버튼 하나. 자리(줄, 칸)가 곧 단축키 (QWERT / ASDFG / ZXCVB).
 * 그림은 아이콘(건물·유닛, art/tools/make-icons.mjs) 또는 기호(정지·취소). 글자는 말풍선에만 (사용자 요청 11/24)
 */
export interface CommandButton {
  readonly row: number;
  readonly col: number;
  readonly icon?: string;
  readonly symbol?: 'stop' | 'cancel' | 'attack';
  /** false 면 흐리게 (미네랄이 모자라도 자리 고르기는 시작함: 스타처럼 놓을 때 막힘) */
  readonly enabled: boolean;
  /** 마우스를 올리면 버튼 위 말풍선 */
  readonly tooltip: SelectionText;
  run(ctx: CommandContext): void;
}

const hotkeyOf = (row: number, col: number): string => COMMAND_HOTKEYS[row]![col]!;

/**
 * 짓는 유닛(지휘관·일꾼)의 건물 버튼 자리.
 * 윗줄(QWER) = 맨손 건물과 포탑, 아랫줄(CVB) = 기지 건물. 가운뎃줄은 유닛 명령(A 공격, S 정지)
 */
const BUILD_BUTTONS: readonly { readonly row: number; readonly col: number; readonly kind: BuildingKind }[] = [
  { row: 0, col: 0, kind: 'campfire' },
  { row: 0, col: 1, kind: 'barricade' },
  { row: 0, col: 2, kind: 'scrapTurret' },
  { row: 0, col: 3, kind: 'turret' },
  { row: 2, col: 2, kind: 'commandCenter' },
  { row: 2, col: 3, kind: 'supplyDepot' },
  { row: 2, col: 4, kind: 'barracks' },
];

/** 건물이 뽑는 유닛의 버튼 자리 (스타처럼 일꾼 S, 소총병 A) */
const TRAIN_BUTTONS: Readonly<Record<TrainableKind, { readonly row: number; readonly col: number }>> = {
  worker: { row: 1, col: 1 },
  rifleman: { row: 1, col: 0 },
};

const UNIT_ROLE: Readonly<Record<TrainableKind, string>> = {
  worker: '미네랄을 캐서 사령부로 나르고, 건물을 짓습니다',
  rifleman: `기본 보병. 공격 ${UNIT_ATTACK.rifleman.damage}, 사거리 ${UNIT_ATTACK.rifleman.range}`,
};

const ATTACK: CommandButton = {
  row: 1,
  col: 0,
  symbol: 'attack',
  enabled: true,
  tooltip: {
    title: '공격 (A)',
    status: '괴물을 누르면 그 괴물을 공격합니다\n땅을 누르면 가는 길에 만나는 괴물과 싸우며 이동합니다\n내 건물을 누르면 그 건물을 부숩니다',
  },
  run: (ctx) => ctx.startAttack(),
};

const STOP: CommandButton = {
  row: 1,
  col: 1,
  symbol: 'stop',
  enabled: true,
  tooltip: { title: '정지 (S)', status: '하던 일을 멈춥니다' },
  run: (ctx) => commandStop(ctx.world, [...ctx.selected]),
};

function buildButton(row: number, col: number, kind: BuildingKind, world: World): CommandButton {
  const spec = BUILDINGS[kind];
  const missing = missingRequirement(world, kind);
  const short = spec.mineral - world.stock.mineral;
  const lines = isFirstCommandCenter(world, kind)
    ? [`미네랄 ${spec.mineral}, 짓는 시간 ${FIRST_COMMAND_CENTER.buildSeconds}초`, '첫 사령부는 놓으면 혼자 지어집니다. 그동안 지휘관은 자유롭게 움직입니다', buildingRole(kind)]
    : [`미네랄 ${spec.mineral}, 짓는 시간 ${spec.buildSeconds}초`, buildingRole(kind)];
  if (missing) lines.push(`${BUILDINGS[missing].name}가 있어야 지을 수 있습니다`);
  else if (short > 0) lines.push(`미네랄이 ${short} 모자랍니다`);
  return {
    row,
    col,
    icon: iconKey(kind),
    enabled: missing === null && short <= 0,
    tooltip: { title: `${spec.name} (${hotkeyOf(row, col)})`, status: lines.join('\n') },
    run: (ctx) => {
      if (missingRequirement(ctx.world, kind) === null) ctx.startPlacement(kind);
    },
  };
}

function trainButton(kind: TrainableKind, buildings: readonly Building[], world: World): CommandButton {
  const spec = UNITS[kind];
  const { row, col } = TRAIN_BUTTONS[kind];
  const short = spec.mineral - world.stock.mineral;
  const full = buildings.every((b) => b.trainQueue.length >= PRODUCTION_QUEUE_MAX);
  const lines = [`미네랄 ${spec.mineral}, 만드는 시간 ${spec.trainSeconds}초, 보급 ${spec.supply}`, UNIT_ROLE[kind]];
  if (full) lines.push(`예약은 ${PRODUCTION_QUEUE_MAX}개까지입니다`);
  else if (short > 0) lines.push(`미네랄이 ${short} 모자랍니다`);
  return {
    row,
    col,
    icon: iconKey(kind),
    enabled: !full && short <= 0,
    tooltip: { title: `${spec.name} (${hotkeyOf(row, col)})`, status: lines.join('\n') },
    // 여러 건물을 골랐으면 줄이 가장 짧은 곳에 (스타처럼 나눠 뽑기)
    run: (ctx) => {
      const target = [...buildings].sort((a, b) => a.trainQueue.length - b.trainQueue.length)[0];
      if (target) commandTrain(ctx.world, target.id, kind);
    },
  };
}

function cancelButton(buildings: readonly Building[]): CommandButton {
  return {
    row: 2,
    col: 4,
    symbol: 'cancel',
    enabled: buildings.some((b) => b.trainQueue.length > 0),
    tooltip: { title: '취소 (B)', status: '마지막 예약을 취소하고 미네랄을 돌려받습니다' },
    run: (ctx) => {
      const target = [...buildings].sort((a, b) => b.trainQueue.length - a.trainQueue.length)[0];
      if (target) commandCancelTrain(ctx.world, target.id);
    },
  };
}

/**
 * 지금 고른 것에 맞는 명령들.
 * - 지휘관·일꾼이 있으면: 정지 + 건물
 * - 다른 유닛만: 정지
 * - 생산 건물만(첫 건물과 같은 종류, 다 지은 것): 유닛 + 취소
 */
export function commandsFor(world: World, selected: ReadonlySet<number>): readonly CommandButton[] {
  const units = world.units.filter((u) => selected.has(u.id) && u.hp > 0 && u.owner === 'player');
  if (units.some(canBuild)) return [ATTACK, STOP, ...BUILD_BUTTONS.map((b) => buildButton(b.row, b.col, b.kind, world))];
  if (units.length > 0) return [ATTACK, STOP];
  const first = world.buildings.find((b) => selected.has(b.id) && b.complete && b.owner === 'player');
  if (!first) return [];
  const same = world.buildings.filter((b) => selected.has(b.id) && b.complete && b.kind === first.kind && b.owner === 'player');
  const trains = BUILDINGS[first.kind].trains ?? [];
  if (trains.length === 0) return [];
  return [...trains.map((k) => trainButton(k, same, world)), cancelButton(same)];
}

/** 버튼 실행. 공격 말고 다른 명령을 고르면 공격 대상 고르기는 푼다 */
function runButton(button: CommandButton, ctx: CommandContext): void {
  if (button.symbol !== 'attack') ctx.cancelAttack();
  button.run(ctx);
}

export interface CommandCard {
  update(world: World, selected: ReadonlySet<number>, cursor: { x: number; y: number }): void;
  layout(layout: HudLayout): void;
  /** 이 자리를 눌렀으면 명령을 실행하고 true */
  click(ctx: CommandContext, at: { x: number; y: number }): boolean;
}

const ICON_SIZE = 44;
const BUBBLE_WIDTH = 280;

/** 기호: 정지(네모), 취소(X), 공격(조준경) */
function drawSymbol(g: Phaser.GameObjects.Graphics, symbol: 'stop' | 'cancel' | 'attack', cell: Rect, enabled: boolean): void {
  const cx = cell.x + cell.width / 2;
  const cy = cell.y + cell.height / 2 + 4;
  const alpha = enabled ? 1 : 0.35;
  if (symbol === 'attack') {
    g.lineStyle(3, 0xff7a45, alpha);
    g.strokeCircle(cx, cy, 11);
    g.lineBetween(cx - 17, cy, cx - 6, cy);
    g.lineBetween(cx + 6, cy, cx + 17, cy);
    g.lineBetween(cx, cy - 17, cx, cy - 6);
    g.lineBetween(cx, cy + 6, cx, cy + 17);
    return;
  }
  if (symbol === 'stop') {
    g.fillStyle(COLOR.dangerNum, alpha);
    g.fillRoundedRect(cx - 11, cy - 11, 22, 22, 3);
    return;
  }
  g.lineStyle(4, COLOR.dangerNum, alpha);
  g.lineBetween(cx - 10, cy - 10, cx + 10, cy + 10);
  g.lineBetween(cx + 10, cy - 10, cx - 10, cy + 10);
}

export function createCommandCard(
  scene: Phaser.Scene,
  minimapCamera: Phaser.Cameras.Scene2D.Camera,
  isActive: () => boolean,
  getContext: () => CommandContext,
): CommandCard {
  const fix = makeFixer(minimapCamera);
  const fixTop = makeFixer(minimapCamera, DEPTH.hud + 2);
  const bg = fix(scene.add.graphics());
  const icons: Phaser.GameObjects.Image[][] = [];
  const badges: Phaser.GameObjects.Text[][] = [];
  for (let r = 0; r < COMMAND_GRID.rows; r++) {
    icons.push([]);
    badges.push([]);
    for (let c = 0; c < COMMAND_GRID.cols; c++) {
      icons[r]!.push(fix(scene.add.image(0, 0, iconKey('worker')).setVisible(false)));
      badges[r]!.push(fix(hotkeyBadge(scene, hotkeyOf(r, c))).setDepth(DEPTH.hud + 1));
    }
  }
  // 말풍선 (버튼 위)
  const bubble = fixTop(scene.add.graphics());
  const bubbleTitle = fixTop(scene.add.text(0, 0, '', { ...textStyle(FONT.number), fontStyle: 'bold' }));
  const bubbleBody = fixTop(
    scene.add.text(0, 0, '', {
      ...textStyle(FONT.body, COLOR.textSecondary),
      wordWrap: { width: BUBBLE_WIDTH - SPACE.md * 2 },
      lineSpacing: 3,
    }),
  );

  let current: HudLayout | undefined;
  /** 마지막으로 그린 상태. 같으면 다시 그리지 않는다 */
  let drawnKey = '';

  const buttonAt = (world: World, selected: ReadonlySet<number>, at: { x: number; y: number }): CommandButton | undefined => {
    if (!current) return undefined;
    const card = current.commandCard;
    return commandsFor(world, selected).find((b) => contains(commandCellRect(card, b.row, b.col), at));
  };

  const drawBubble = (button: CommandButton | undefined): void => {
    bubble.clear();
    const show = button !== undefined && current !== undefined;
    bubbleTitle.setVisible(show);
    bubbleBody.setVisible(show);
    if (!show || !current || !button) return;
    bubbleTitle.setText(button.tooltip.title);
    bubbleBody.setText(button.tooltip.status);
    const cell = commandCellRect(current.commandCard, button.row, button.col);
    const height = SPACE.md * 2 + bubbleTitle.height + SPACE.xs + bubbleBody.height;
    const screenW = scene.scale.width;
    const x = Phaser.Math.Clamp(cell.x + cell.width / 2 - BUBBLE_WIDTH / 2, SPACE.sm, screenW - BUBBLE_WIDTH - SPACE.sm);
    const y = current.commandCard.y - SPACE.md - height;
    bubble.fillStyle(COLOR.panelRaised, 0.97);
    bubble.fillRoundedRect(x, y, BUBBLE_WIDTH, height, RADIUS.panel);
    bubble.lineStyle(1, button.enabled ? COLOR.accentNum : COLOR.border, 1);
    bubble.strokeRoundedRect(x + 0.5, y + 0.5, BUBBLE_WIDTH - 1, height - 1, RADIUS.panel);
    // 꼬리: 버튼 쪽을 가리키는 삼각형
    const tx = cell.x + cell.width / 2;
    bubble.fillStyle(COLOR.panelRaised, 0.97);
    bubble.fillTriangle(tx - 8, y + height - 1, tx + 8, y + height - 1, tx, y + height + 9);
    bubbleTitle.setPosition(x + SPACE.md, y + SPACE.md);
    bubbleBody.setPosition(x + SPACE.md, bubbleTitle.y + bubbleTitle.height + SPACE.xs);
  };

  // 단축키: 버튼 자리의 글자. Ctrl·Alt·Meta 와 같이 누르면 무시 (브라우저 단축키와 겹치지 않게)
  const keyboard = scene.input.keyboard;
  COMMAND_HOTKEYS.forEach((row, r) =>
    row.forEach((letter, c) => {
      keyboard?.addKey(letter, false).on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => {
        if (!isActive() || event.ctrlKey || event.altKey || event.metaKey) return;
        const ctx = getContext();
        const button = commandsFor(ctx.world, ctx.selected).find((b) => b.row === r && b.col === c);
        if (button) runButton(button, ctx);
      });
    }),
  );

  return {
    update(world, selected, cursor) {
      if (!current) return;
      const card = current.commandCard;
      const buttons = commandsFor(world, selected);
      const hovered = isActive() ? buttonAt(world, selected, cursor) : undefined;
      const key = `${buttons.map((b) => `${b.row}${b.col}${b.icon ?? b.symbol}${b.enabled}`).join(',')}|${hovered?.tooltip.title ?? ''}|${hovered?.tooltip.status ?? ''}`;
      if (key === drawnKey) return;
      drawnKey = key;
      bg.clear();
      for (let r = 0; r < COMMAND_GRID.rows; r++) {
        for (let c = 0; c < COMMAND_GRID.cols; c++) {
          const cell = commandCellRect(card, r, c);
          const button = buttons.find((b) => b.row === r && b.col === c);
          const fill = button === undefined ? COLOR.panel : button === hovered ? 0x2b3a55 : COLOR.panelRaised;
          bg.fillStyle(fill, button ? 1 : 0.6);
          bg.fillRoundedRect(cell.x, cell.y, cell.width, cell.height, RADIUS.button);
          const border = button ? (button === hovered ? COLOR.quest : button.enabled ? COLOR.accentNum : COLOR.border) : COLOR.border;
          bg.lineStyle(button === hovered ? 2 : 1, border, button ? 0.95 : 0.6);
          bg.strokeRoundedRect(cell.x + 0.5, cell.y + 0.5, cell.width - 1, cell.height - 1, RADIUS.button);
          const icon = icons[r]![c]!;
          if (button?.icon) {
            icon
              .setTexture(button.icon)
              .setDisplaySize(ICON_SIZE, ICON_SIZE)
              .setPosition(cell.x + cell.width / 2, cell.y + cell.height / 2 + 3)
              .setAlpha(button.enabled ? 1 : 0.35)
              .setVisible(true);
          } else icon.setVisible(false);
          if (button?.symbol) drawSymbol(bg, button.symbol, cell, button.enabled);
          badges[r]![c]!.setVisible(button !== undefined).setPosition(cell.x + 2, cell.y + 1);
        }
      }
      drawBubble(hovered);
    },
    layout(layout) {
      current = layout;
      drawnKey = ''; // 자리가 바뀌었으니 다시 그리기
    },
    click(ctx, at) {
      const button = buttonAt(ctx.world, ctx.selected, at);
      if (!button) return false;
      runButton(button, ctx);
      return true;
    },
  };
}
