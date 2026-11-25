import Phaser from 'phaser';
import type { BuildingKind } from '../../data/buildings.ts';
import type { Point } from '../../sim/grid.ts';
import type { World } from '../../sim/world.ts';
import type { ControlGroups } from '../controlGroups.ts';
import type { ScreenPoint } from '../coords.ts';
import { createBottomPanel } from './bottomPanel.ts';
import { createCommandCard } from './commandCard.ts';
import { createQueueRow } from './queueRow.ts';
import { createSelectionCard } from './selectionCard.ts';
import { computeLayout, contains, isOnHud, type HudLayout } from './layout.ts';
import { COLOR, FONT, textStyle } from './tokens.ts';
import { createTopBar } from './topBar.ts';
import { makeFixer } from './widgets.ts';

export interface HudCallbacks {
  readonly isActive: () => boolean;
  readonly getState: () => { world: World; selected: ReadonlySet<number> };
  /** 지금 커서의 화면 좌표 (마우스를 가둔 동안은 pointer.x 가 안 바뀜) */
  readonly cursorAt: () => ScreenPoint;
  /** 메뉴 버튼·F10 */
  readonly onMenu: () => void;
  /** 지휘관 카드를 눌렀을 때 */
  readonly onHeroCard: () => void;
  /** 건물 버튼: 자리 고르기 시작 */
  readonly startPlacement: (kind: BuildingKind) => void;
  /** 공격 버튼: 대상 고르기 시작 */
  readonly startAttack: () => void;
  readonly cancelAttack: () => void;
  /** 부대 지정 (선택 정보 칸 아래에 번호 표시) */
  readonly getGroups: () => ControlGroups;
  /** 살펴보는 칸 (배급처·사냥감·절벽 등) */
  readonly getInspected: () => Point | null;
  /** 여럿 고른 그림 칸 중 하나를 눌렀을 때: 그것만 고른다 */
  readonly selectOnly: (id: number) => void;
}

export interface Hud {
  readonly layout: HudLayout;
  update(cursor: ScreenPoint): void;
  resize(width: number, height: number): void;
  /** 이 자리가 HUD 위인지 (지도 클릭이 아님) */
  blocks(p: ScreenPoint): boolean;
}

/**
 * 화면 정보 전체. 배치는 layout.ts, 값은 tokens.ts.
 * 위 막대(자원·시계·메뉴) / 아래 판(미니맵 자리·지휘관 카드·선택 정보·명령 버튼) / 패배 표시.
 */
export function createHud(scene: Phaser.Scene, minimapCamera: Phaser.Cameras.Scene2D.Camera, cb: HudCallbacks): Hud {
  const fix = makeFixer(minimapCamera);
  const topBar = createTopBar(scene, minimapCamera);
  const bottom = createBottomPanel(scene, minimapCamera);
  const getContext = () => ({ ...cb.getState(), startPlacement: cb.startPlacement, startAttack: cb.startAttack, cancelAttack: cb.cancelAttack });
  const commands = createCommandCard(scene, minimapCamera, cb.isActive, getContext);
  const queue = createQueueRow(scene, minimapCamera);
  const card = createSelectionCard(scene, minimapCamera);
  const banner = fix(
    scene.add.text(0, 0, '패배', { ...textStyle(FONT.large * 2.5, COLOR.danger), fontStyle: 'bold' }).setOrigin(0.5).setVisible(false),
  );
  let layout = computeLayout(scene.scale.width, scene.scale.height);

  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (!cb.isActive() || !pointer.leftButtonDown()) return;
    const at = cb.cursorAt();
    if (contains(layout.menuButton, at)) cb.onMenu();
    else if (contains(layout.heroCard, at)) cb.onHeroCard();
    else {
      const { world, selected } = cb.getState();
      const only = card.pick(world, selected, at);
      if (only !== null) cb.selectOnly(only);
      else if (!queue.click(world, selected, at)) commands.click(getContext(), at);
    }
  });
  scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.F10).on('down', (_k: unknown, e: KeyboardEvent) => {
    e.preventDefault();
    if (cb.isActive()) cb.onMenu();
  });

  const hud: Hud = {
    get layout() {
      return layout;
    },
    update(cursor) {
      const { world, selected } = cb.getState();
      topBar.update(world, cursor);
      bottom.update(world, selected, cb.getGroups(), cb.getInspected(), null);
      commands.update(world, selected, cursor);
      queue.update(world, selected, cursor, cb.isActive());
      card.update(world, selected, cb.getInspected(), cursor, cb.isActive());
      banner.setVisible(false);
    },
    resize(width, height) {
      layout = computeLayout(width, height);
      topBar.layout(layout);
      bottom.layout(layout);
      commands.layout(layout);
      queue.layout(layout);
      card.layout(layout);
      banner.setPosition(width / 2, (height - layout.bottomPanel.height) / 2);
    },
    blocks(p) {
      return isOnHud(layout, p);
    },
  };
  hud.resize(scene.scale.width, scene.scale.height);
  return hud;
}
