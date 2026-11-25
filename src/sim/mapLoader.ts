import { createGrid, type Grid, type Point } from './grid.ts';

/** 글자 지도 한 칸의 뜻 */
export type TileKind =
  | 'ground'
  | 'cliff'
  | 'start'
  | 'mineral'
  | 'feeder'
  | 'berry'
  | 'debris'
  | 'hunt'
  | 'entranceNorth'
  | 'entranceEast';

export const TILE_LEGEND: Readonly<Record<string, TileKind>> = {
  '.': 'ground',
  '#': 'cliff',
  S: 'start',
  M: 'mineral',
  F: 'feeder',
  B: 'berry',
  D: 'debris',
  H: 'hunt',
  N: 'entranceNorth',
  E: 'entranceEast',
};

export interface MapFeatures {
  readonly start: Point;
  readonly minerals: readonly Point[];
  readonly feeders: readonly Point[];
  readonly berries: readonly Point[];
  readonly debris: readonly Point[];
  readonly hunts: readonly Point[];
  readonly entrances: {
    readonly north: readonly Point[];
    readonly east: readonly Point[];
  };
}

export interface MapDef {
  /** 지형만 (절벽만 막힘). 자원·건물이 칸을 막는 것은 규칙 쪽에서 따로 다룬다 */
  readonly grid: Grid;
  readonly features: MapFeatures;
}

function readKinds(rows: readonly string[]): TileKind[][] {
  if (rows.length === 0) throw new Error('지도가 비어 있음');
  const width = rows[0]!.length;
  if (width === 0) throw new Error('지도 첫 줄이 비어 있음');
  return rows.map((row, y) => {
    if (row.length !== width) {
      throw new Error(`지도 ${y}번째 줄 길이가 ${row.length} (첫 줄은 ${width})`);
    }
    return [...row].map((ch, x) => {
      const kind = TILE_LEGEND[ch];
      if (kind === undefined) throw new Error(`지도 (${x}, ${y})에 모르는 글자 '${ch}'`);
      return kind;
    });
  });
}

function collect(kinds: readonly TileKind[][], wanted: TileKind): Point[] {
  const found: Point[] = [];
  kinds.forEach((row, y) =>
    row.forEach((kind, x) => {
      if (kind === wanted) found.push({ x, y });
    }),
  );
  return found;
}

export function parseMap(rows: readonly string[]): MapDef {
  const kinds = readKinds(rows);
  const starts = collect(kinds, 'start');
  if (starts.length !== 1) throw new Error(`시작 지점(S)은 1개여야 하는데 ${starts.length}개`);

  const grid = createGrid(kinds[0]!.length, kinds.length, (x, y) => kinds[y]![x] !== 'cliff');

  return {
    grid,
    features: {
      start: starts[0]!,
      minerals: collect(kinds, 'mineral'),
      feeders: collect(kinds, 'feeder'),
      berries: collect(kinds, 'berry'),
      debris: collect(kinds, 'debris'),
      hunts: collect(kinds, 'hunt'),
      entrances: {
        north: collect(kinds, 'entranceNorth'),
        east: collect(kinds, 'entranceEast'),
      },
    },
  };
}
