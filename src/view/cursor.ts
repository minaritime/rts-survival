import Phaser from 'phaser';

/**
 * 게임 커서. 마우스를 게임 화면 안에 가둔다 (브라우저 포인터 잠금).
 * - 잠그면 운영체제 커서가 사라지므로 직접 그리고, 움직인 양만큼 옮겨 화면 끝에서 멈춘다
 * - ESC 를 누르면 브라우저가 잠금을 푼다 → onLockChange(false) → 게임은 일시정지
 * - 잠금을 못 쓰는 곳(헤드리스 점검, 주소에 ?nolock)은 보통 마우스 위치를 그대로 쓴다
 * 클릭·가장자리 이동·미니맵은 전부 pointer.x 대신 이 커서의 x, y 를 쓴다.
 */
export interface Cursor {
  readonly x: number;
  readonly y: number;
  readonly locked: boolean;
  /** 마우스를 가둔다. 브라우저 규칙상 클릭 처리 안에서 불러야 한다 */
  lock(): void;
  onLockChange(listener: (locked: boolean) => void): void;
  /** 매 프레임: 커서 그림 갱신 */
  update(): void;
  /** 창 크기가 바뀌면 커서를 새 화면 안으로 */
  resize(width: number, height: number): void;
}

export function lockDisabledByUrl(): boolean {
  return new URLSearchParams(window.location.search).has('nolock');
}

/**
 * 커서 그림은 게임 화면 위에 띄운 HTML 요소다.
 * 미니맵이 따로 된 카메라라 Phaser 로 그리면 미니맵 위에서 커서가 가려지기 때문.
 */
const CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="24" viewBox="0 0 18 24">' +
  '<path d="M1 1 L1 19 L6 14 L10 22 L13 21 L9 13 L15 13 Z" fill="#ffffff" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"/>' +
  '</svg>';

function createCursorElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.innerHTML = CURSOR_SVG;
  Object.assign(el.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    pointerEvents: 'none',
    zIndex: '10',
    display: 'none',
  });
  document.body.appendChild(el);
  return el;
}

export function createCursor(scene: Phaser.Scene): Cursor {
  const canvas = scene.game.canvas;
  const disabled = lockDisabledByUrl();
  let locked = false;
  let x = scene.scale.width / 2;
  let y = scene.scale.height / 2;
  const listeners: ((locked: boolean) => void)[] = [];

  const element = createCursorElement();

  const onLockChange = (): void => {
    const now = document.pointerLockElement === canvas;
    if (now === locked) return;
    locked = now;
    element.style.display = locked ? 'block' : 'none';
    for (const l of listeners) l(locked);
  };
  const onMove = (e: MouseEvent): void => {
    if (!locked) return;
    x = Phaser.Math.Clamp(x + e.movementX, 0, scene.scale.width - 1);
    y = Phaser.Math.Clamp(y + e.movementY, 0, scene.scale.height - 1);
  };
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('mousemove', onMove);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('mousemove', onMove);
    element.remove();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  });

  return {
    get x() {
      return locked ? x : scene.input.activePointer.x;
    },
    get y() {
      return locked ? y : scene.input.activePointer.y;
    },
    get locked() {
      return locked;
    },
    lock() {
      if (disabled || locked) return;
      // 잠금 전 마지막 마우스 위치에서 이어 가게
      x = scene.input.activePointer.x;
      y = scene.input.activePointer.y;
      try {
        const result = canvas.requestPointerLock() as unknown;
        if (result instanceof Promise) result.catch(() => undefined); // 거절되면 잠금 없이 계속
      } catch {
        // 잠금을 못 쓰는 브라우저: 잠금 없이 계속
      }
    },
    onLockChange(listener) {
      listeners.push(listener);
    },
    resize(width, height) {
      x = Phaser.Math.Clamp(x, 0, width - 1);
      y = Phaser.Math.Clamp(y, 0, height - 1);
    },
    update() {
      if (!locked) return;
      const rect = canvas.getBoundingClientRect();
      element.style.transform = `translate(${rect.left + x}px, ${rect.top + y}px)`;
    },
  };
}
