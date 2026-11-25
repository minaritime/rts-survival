import Phaser from 'phaser';
import type { ScreenPoint } from './coords.ts';
import { DEPTH } from './palette.ts';
import { contains, type Rect } from './ui/layout.ts';
import { COLOR, FONT, RADIUS, textStyle } from './ui/tokens.ts';
import { makeFixer } from './ui/widgets.ts';

/**
 * 튜토리얼 완료 창: [1스테이지 시작] [계속 둘러보기].
 * [계속 둘러보기] 로 닫으면 위 줄 메뉴 버튼 옆에 작은 [1스테이지 시작] 버튼이 남는다 (사용자 요청 11/24).
 * 마우스를 가둔 동안에도 눌리도록 Phaser 의 클릭 판정 대신 게임 커서 위치로 판정한다.
 */
export interface StageDialog {
  readonly visible: boolean;
  /** 띄운다. [계속 둘러보기] 로 닫은 뒤에는 다시 안 뜬다 */
  show(): void;
  /** 창 위인지 (지도 클릭을 막을 때) */
  contains(p: ScreenPoint): boolean;
  update(cursor: ScreenPoint): void;
  layout(width: number, height: number): void;
}

const SIZE = { width: 420, height: 210 } as const;
const BUTTON = { width: 170, height: 44 } as const;
/** 위 줄 작은 버튼. 메뉴 버튼(layout.ts MENU_BUTTON 76x26, 오른쪽 여백 12) 왼쪽에 둔다 */
const MINI = { width: 140, height: 26, rightOfScreen: 12 + 76 + 8 } as const;

export function createStageDialog(
  scene: Phaser.Scene,
  minimapCamera: Phaser.Cameras.Scene2D.Camera,
  cursorAt: () => ScreenPoint,
  isActive: () => boolean,
  onStartStage: () => void,
): StageDialog {
  const fix = makeFixer(minimapCamera, DEPTH.pause - 1);
  const g = fix(scene.add.graphics());
  const title = fix(scene.add.text(0, 0, '튜토리얼 완료', { ...textStyle(FONT.large), fontStyle: 'bold' }).setOrigin(0.5));
  const body = fix(
    scene.add.text(0, 0, '이제 1스테이지를 처음부터 정상 속도로 시작할 수 있습니다', textStyle(FONT.body, COLOR.textSecondary)).setOrigin(0.5),
  );
  const startLabel = fix(scene.add.text(0, 0, '1스테이지 시작', { ...textStyle(FONT.number, '#ffffff'), fontStyle: 'bold' }).setOrigin(0.5));
  const stayLabel = fix(scene.add.text(0, 0, '계속 둘러보기', textStyle(FONT.number)).setOrigin(0.5));
  const parts = [title, body, startLabel, stayLabel];
  const miniLabel = fix(scene.add.text(0, 0, '1스테이지 시작 ▶', { ...textStyle(FONT.body, '#ffffff'), fontStyle: 'bold' }).setOrigin(0.5).setVisible(false));

  let visible = false;
  let dismissed = false;
  let box: Rect = { x: 0, y: 0, ...SIZE };
  let startBtn: Rect = { x: 0, y: 0, ...BUTTON };
  let stayBtn: Rect = { x: 0, y: 0, ...BUTTON };
  let miniBtn: Rect = { x: 0, y: 0, width: MINI.width, height: MINI.height };

  const setVisible = (v: boolean): void => {
    visible = v;
    for (const p of parts) p.setVisible(v);
  };
  setVisible(false);

  const drawMini = (cursor: ScreenPoint): void => {
    g.clear();
    g.fillStyle(contains(miniBtn, cursor) ? 0x4096ff : 0x1677ff, 1);
    g.fillRoundedRect(miniBtn.x, miniBtn.y, miniBtn.width, miniBtn.height, RADIUS.button);
  };

  const draw = (cursor: ScreenPoint): void => {
    g.clear();
    g.fillStyle(COLOR.panelRaised, 0.97);
    g.fillRoundedRect(box.x, box.y, box.width, box.height, RADIUS.dialog);
    g.lineStyle(1.5, COLOR.successNum, 1);
    g.strokeRoundedRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1, RADIUS.dialog);
    const startHover = contains(startBtn, cursor);
    g.fillStyle(startHover ? 0x4096ff : 0x1677ff, 1);
    g.fillRoundedRect(startBtn.x, startBtn.y, startBtn.width, startBtn.height, RADIUS.button);
    const stayHover = contains(stayBtn, cursor);
    g.fillStyle(stayHover ? 0x2b2b2b : COLOR.panel, 1);
    g.fillRoundedRect(stayBtn.x, stayBtn.y, stayBtn.width, stayBtn.height, RADIUS.button);
    g.lineStyle(1, COLOR.border, 1);
    g.strokeRoundedRect(stayBtn.x + 0.5, stayBtn.y + 0.5, stayBtn.width - 1, stayBtn.height - 1, RADIUS.button);
  };

  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if ((!visible && !dismissed) || !isActive() || !pointer.leftButtonDown()) return;
    const at = cursorAt();
    if (visible && contains(startBtn, at)) onStartStage();
    else if (visible && contains(stayBtn, at)) {
      dismissed = true;
      setVisible(false);
      miniLabel.setVisible(true);
    } else if (dismissed && contains(miniBtn, at)) onStartStage();
  });

  const dialog: StageDialog = {
    get visible() {
      return visible;
    },
    show() {
      if (!visible && !dismissed) setVisible(true);
    },
    contains(p) {
      return (visible && contains(box, p)) || (dismissed && contains(miniBtn, p));
    },
    update(cursor) {
      if (visible) draw(cursor);
      else if (dismissed) drawMini(cursor);
    },
    layout(width, height) {
      box = { x: (width - SIZE.width) / 2, y: (height - SIZE.height) / 2 - 60, ...SIZE };
      title.setPosition(width / 2, box.y + 42);
      body.setPosition(width / 2, box.y + 86);
      startBtn = { x: width / 2 - BUTTON.width - 8, y: box.y + 130, ...BUTTON };
      stayBtn = { x: width / 2 + 8, y: box.y + 130, ...BUTTON };
      startLabel.setPosition(startBtn.x + BUTTON.width / 2, startBtn.y + BUTTON.height / 2);
      stayLabel.setPosition(stayBtn.x + BUTTON.width / 2, stayBtn.y + BUTTON.height / 2);
      miniBtn = { x: width - MINI.rightOfScreen - MINI.width, y: 5, width: MINI.width, height: MINI.height };
      miniLabel.setPosition(miniBtn.x + MINI.width / 2, miniBtn.y + MINI.height / 2);
    },
  };
  dialog.layout(scene.scale.width, scene.scale.height);
  return dialog;
}
