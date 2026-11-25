/**
 * 화면(HUD) 디자인 값.
 * Ant Design v5 다크 테마 값을 바탕으로 했다 (배경 #000 위에 패널 #141414, 떠 있는 패널 #1f1f1f, 테두리 #424242).
 * 글자는 Xbox 접근성 기준(1080p 18px → 800p 약 14px)에 맞춰 14px 미만을 쓰지 않는다.
 * 조사 근거: CLAUDE.md "화면 구성" 절.
 */
export const COLOR = {
  panel: 0x141414,
  panelRaised: 0x1f1f1f,
  border: 0x424242,
  text: '#d9d9d9',
  textSecondary: '#a6a6a6',
  accent: '#4096ff',
  accentNum: 0x4096ff,
  success: '#52c41a',
  successNum: 0x52c41a,
  warning: '#faad14',
  warningNum: 0xfaad14,
  danger: '#ff4d4f',
  dangerNum: 0xff4d4f,
  hp: 0x52c41a,
  satiety: 0xfaad14,
  barBack: 0x000000,
  /** 튜토리얼 화살표·목표 테두리 */
  quest: 0xffd54f,
  questText: '#ffd54f',
} as const;

export const FONT = {
  family: '"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
  body: 14,
  number: 16,
  title: 20,
  large: 24,
} as const;

/** Ant Design 4px 단위 간격 */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const RADIUS = { button: 4, panel: 6, dialog: 8 } as const;

export const ALPHA = {
  /** 늘 붙어 있는 판 (위 막대, 아래 판) */
  fixedPanel: 0.96,
  /** 떠 있는 판 (목표, 알림) */
  floatingPanel: 0.78,
} as const;

export function textStyle(size: number = FONT.body, color: string = COLOR.text): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT.family, fontSize: `${size}px`, color };
}
