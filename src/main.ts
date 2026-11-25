import Phaser from 'phaser';
import { GameScene } from './view/GameScene.ts';

declare global {
  interface Window {
    /** 개발 서버에서만: 화면 점검 스크립트(scripts/screenshot.mjs)가 카메라 위치를 읽는 데 씀 */
    __rtsGame?: Phaser.Game;
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#111111',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  // 오른쪽 클릭을 게임 명령으로 쓰므로 브라우저 메뉴를 막는다
  disableContextMenu: true,
  scene: [GameScene],
});

if (import.meta.env.DEV) window.__rtsGame = game;
