import Phaser from 'phaser';
import type { Cursor } from './cursor.ts';
import { DEPTH } from './palette.ts';
import { COLOR, FONT, RADIUS, textStyle } from './ui/tokens.ts';
import { makeFixer } from './ui/widgets.ts';

/**
 * 시작 화면과 일시정지 화면.
 * - 처음: "시작" 을 누르면 마우스를 가두고 게임 시작 (브라우저 규칙상 잠금은 클릭이 있어야 걸림)
 * - ESC: 브라우저가 잠금을 풀면 일시정지. 이때만 마우스가 화면 밖으로 나갈 수 있다
 * - 메뉴 버튼·F10: 잠금을 풀고 일시정지
 * - "계속하기" 를 누르면 다시 가두고 이어서
 */
export interface PauseMenu {
  /** 게임 시간이 흐르는 중인지 */
  readonly running: boolean;
  /** 메뉴 버튼·F10 */
  requestPause(): void;
  layout(width: number, height: number): void;
}

export const PAUSE_BUTTON_NAME = 'pause-button';
const DIALOG = { width: 440, height: 250 } as const;
const BUTTON_COLOR = '#1677ff';
const BUTTON_HOVER = '#4096ff';

export function createPauseMenu(
  scene: Phaser.Scene,
  cursor: Cursor,
  minimapCamera: Phaser.Cameras.Scene2D.Camera,
  heading: string,
): PauseMenu {
  let running = false;
  const fix = makeFixer(minimapCamera, DEPTH.pause);

  const shade = fix(scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.55).setOrigin(0, 0));
  const dialog = fix(scene.add.graphics());
  const title = fix(scene.add.text(0, 0, '', { ...textStyle(FONT.large), fontStyle: 'bold' }).setOrigin(0.5));
  const button = fix(
    scene.add
      .text(0, 0, '', {
        ...textStyle(FONT.number, '#ffffff'),
        fontStyle: 'bold',
        backgroundColor: BUTTON_COLOR,
        padding: { x: 32, y: 10 },
      })
      .setOrigin(0.5)
      .setName(PAUSE_BUTTON_NAME)
      .setInteractive({ useHandCursor: true }),
  );
  const note = fix(
    scene.add
      .text(0, 0, '게임 중에는 마우스가 화면 밖으로 나가지 않습니다.\nESC 를 누르면 일시정지하고 마우스를 꺼낼 수 있습니다', {
        ...textStyle(FONT.body, COLOR.textSecondary),
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5),
  );
  const parts = [shade, dialog, title, button, note];

  const show = (heading: string, label: string): void => {
    title.setText(heading);
    button.setText(label);
    for (const p of parts) p.setVisible(true);
  };
  const hide = (): void => {
    for (const p of parts) p.setVisible(false);
  };

  const resume = (): void => {
    running = true;
    hide();
    cursor.lock(); // 못 가두는 곳(?nolock, 거절)이면 그냥 마우스를 풀어 둔 채 진행
  };
  const pause = (): void => {
    if (!running) return;
    running = false;
    show('일시정지', '계속하기');
  };

  button.on('pointerover', () => button.setBackgroundColor(BUTTON_HOVER));
  button.on('pointerout', () => button.setBackgroundColor(BUTTON_COLOR));
  // 누를 때 재개하면 같은 클릭이 지도 클릭(선택 해제)으로도 처리된다. 뗄 때 재개한다 (떼기도 잠금에 필요한 사용자 동작)
  button.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    if (pointer.leftButtonReleased() && !running) resume();
  });

  cursor.onLockChange((locked) => {
    if (!locked) pause();
  });
  // 잠금이 없는 때(?nolock 등)에도 ESC 로 일시정지
  scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
    if (!cursor.locked) pause();
  });
  // 진행 중인데 잠금이 풀려 있으면(재잠금이 거절된 경우) 화면을 누를 때 다시 가둔다
  scene.input.on('pointerdown', () => {
    if (running && !cursor.locked) cursor.lock();
  });

  const menu: PauseMenu = {
    get running() {
      return running;
    },
    requestPause() {
      // 잠겨 있으면 풀기만 한다. 풀리면 onLockChange 가 일시정지를 건다
      if (cursor.locked) document.exitPointerLock();
      else pause();
    },
    layout(width, height) {
      shade.setSize(width, height);
      const x = (width - DIALOG.width) / 2;
      const y = (height - DIALOG.height) / 2;
      dialog.clear();
      dialog.fillStyle(COLOR.panelRaised, 0.96);
      dialog.fillRoundedRect(x, y, DIALOG.width, DIALOG.height, RADIUS.dialog);
      dialog.lineStyle(1, COLOR.border, 1);
      dialog.strokeRoundedRect(x + 0.5, y + 0.5, DIALOG.width - 1, DIALOG.height - 1, RADIUS.dialog);
      title.setPosition(width / 2, y + 48);
      button.setPosition(width / 2, y + 120);
      note.setPosition(width / 2, y + 196);
    },
  };
  menu.layout(scene.scale.width, scene.scale.height);
  show(heading, '시작');
  return menu;
}
