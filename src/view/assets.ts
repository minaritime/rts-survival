import type Phaser from 'phaser';

/**
 * Blender 로 만든 그림 목록 (art/blender/render_sprites.py, render_terrain.py 가 만든 것).
 * 스프라이트는 전부 2x2칸 크기이고 그림 한가운데 = 바닥의 그 칸 한가운데.
 */
export const SPRITE_FRAME = 96;

/** 방향 시트: 줄 = 방향 0~7 (0 동, 시계 방향), 칸 = 장 (commander 는 0 서 있기, 1~4 걷기) */
export const SHEETS = {
  commander: { frames: 5 },
  worker: { frames: 5 },
  rifleman: { frames: 5 },
  assault: { frames: 5 },
  grazer: { frames: 1 },
  swarm: { frames: 5 },
  charger: { frames: 5 },
} as const;

/** 명령 버튼 아이콘 (art/tools/make-icons.mjs). 게임 안 이름(BuildingKind·UnitKind) → 그림 파일 이름 */
const ICON_FILES: Readonly<Record<string, string>> = {
  campfire: 'campfire',
  barricade: 'barricade',
  scrapTurret: 'scrap_turret',
  turret: 'turret',
  commandCenter: 'command_center',
  supplyDepot: 'supply_depot',
  barracks: 'barracks',
  infantryLab: 'infantry_lab',
  worker: 'worker',
  rifleman: 'rifleman',
  assault: 'assault',
  commander: 'commander',
  swarm: 'swarm',
  charger: 'charger',
  grazer: 'grazer',
  mineral: 'mineral_0',
  berry: 'berry_full',
  debris: 'debris_0',
  meat: 'meat',
};

export function iconKey(kind: string): string {
  return `icon_${ICON_FILES[kind] ?? kind}`;
}

export const IMAGES = [
  'mineral_0',
  'mineral_1',
  'mineral_2',
  'berry_full',
  'berry_half',
  'berry_empty',
  'debris_0',
  'debris_1',
  'feeder_on',
  'feeder_off',
  'meat',
  // 건물: 3x3 칸, 그림 192x288 (그림 한가운데 = 건물 자리 한가운데)
  'command_center',
  'command_center_frame',
  'campfire',
  'barricade',
  'scrap_turret',
  'supply_depot',
  'barracks',
  'turret',
  'infantry_lab',
  // 짓는 중 (크기 공용 비계): 1칸, 2x2, 3x3
  'frame_1',
  'frame_2',
  'frame_3',
] as const;

export type ImageKey = (typeof IMAGES)[number];
export type SheetKey = keyof typeof SHEETS;

/** 지도마다 지형 그림 한 장 (art/blender/render_terrain.py) */
export const TERRAIN_KEYS = { map1: 'terrain-map1', map3: 'terrain-map3' } as const;
export type MapName = keyof typeof TERRAIN_KEYS;

export function preloadAssets(scene: Phaser.Scene): void {
  const base = 'assets/';
  for (const [name, key] of Object.entries(TERRAIN_KEYS)) scene.load.image(key, `${base}terrain/${name}.jpg`);
  for (const key of IMAGES) scene.load.image(key, `${base}sprites/${key}.png`);
  for (const file of new Set(Object.values(ICON_FILES))) scene.load.image(`icon_${file}`, `${base}icons/${file}.png`);
  for (const key of Object.keys(SHEETS) as SheetKey[]) {
    scene.load.spritesheet(key, `${base}sprites/${key}.png`, { frameWidth: SPRITE_FRAME, frameHeight: SPRITE_FRAME });
  }
}

/** 화면 이동 방향 (dx, dy, 아래가 +) → 방향 번호 0~7 */
export function directionIndex(dx: number, dy: number): number {
  const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return ((k % 8) + 8) % 8;
}
