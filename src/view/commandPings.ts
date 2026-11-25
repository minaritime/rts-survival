import type Phaser from 'phaser';

/**
 * 명령을 내린 자리 표시 (사용자 요청 11/25: 우클릭·좌클릭 한 땅에 표현).
 * 스타처럼 그 자리에 고리가 잠깐 나타났다 줄어들며 사라진다.
 * - move: 초록 (이동)
 * - target: 노랑 (채집·짓기·수리·집결 지점 등 무언가를 찍음)
 * - attack: 빨강 (공격, 공격하며 이동)
 * 시간은 실제 시간(performance.now)으로 잰다. 일시정지 중에도 그냥 사라진다.
 */
export type PingKind = 'move' | 'target' | 'attack';

export interface Pings {
  /** 지도 픽셀 좌표 */
  add(x: number, y: number, kind: PingKind): void;
  draw(g: Phaser.GameObjects.Graphics, nowMs: number): void;
}

const LIFE_MS = 600;
const COLORS: Readonly<Record<PingKind, number>> = { move: 0x52c41a, target: 0xfadb14, attack: 0xff4d4f };

interface Ping {
  readonly x: number;
  readonly y: number;
  readonly kind: PingKind;
  readonly bornMs: number;
}

export function createPings(): Pings {
  let pings: Ping[] = [];
  return {
    add(x, y, kind) {
      // 한 번에 하나만 (새 명령이 앞 표시를 대신)
      pings = [{ x, y, kind, bornMs: performance.now() }];
    },
    draw(g, nowMs) {
      pings = pings.filter((p) => nowMs - p.bornMs < LIFE_MS);
      for (const p of pings) {
        const t = (nowMs - p.bornMs) / LIFE_MS;
        const alpha = 1 - t;
        const color = COLORS[p.kind];
        // 납작한 고리 둘 (비스듬히 내려다보는 땅에 맞게 가로로 넓게)
        const r = 26 * (1 - t) + 8;
        g.lineStyle(3, color, alpha);
        g.strokeEllipse(p.x, p.y, r * 2, r);
        g.lineStyle(2, color, alpha * 0.8);
        g.strokeEllipse(p.x, p.y, r, r / 2);
        if (p.kind === 'attack') {
          const s = 7;
          g.lineBetween(p.x - s, p.y - s / 2, p.x + s, p.y + s / 2);
          g.lineBetween(p.x + s, p.y - s / 2, p.x - s, p.y + s / 2);
        }
      }
    },
  };
}
