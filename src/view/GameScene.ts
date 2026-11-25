import Phaser from 'phaser';
import { MAX_TICKS_PER_FRAME, TICK_SECONDS, TILE_SIZE } from '../data/constants.ts';
import { MAP1_ROWS } from '../maps/map1.ts';
import { createStepper, type Stepper } from '../sim/fixedStep.ts';
import { parseMap } from '../sim/mapLoader.ts';
import { createWorld, stepWorld, type World } from '../sim/world.ts';
import { startTutorial, stepTutorial, viewTutorial, type TutorialInput, type TutorialState } from '../tutorial/quests.ts';
import { preloadAssets, TERRAIN_KEY } from './assets.ts';
import { createCameraControl, type CameraControl } from './cameraControl.ts';
import { createCursor, type Cursor } from './cursor.ts';
import { createHud, type Hud } from './ui/hud.ts';
import { BOTTOM_PANEL_HEIGHT } from './ui/layout.ts';
import { createMinimap, type Minimap } from './minimap.ts';
import { drawOverlays } from './overlayDraw.ts';
import { DEPTH } from './palette.ts';
import { createPauseMenu, type PauseMenu } from './pauseMenu.ts';
import { createPlacement, type Placement } from './placement.ts';
import { createSpriteLayer, type SpriteLayer } from './spriteLayer.ts';
import { createStageDialog, type StageDialog } from './stageDialog.ts';
import { canBuild } from '../sim/entities.ts';
import { createTutorialView, type TutorialView } from './tutorialView.ts';
import { createUnitInput, type UnitInput } from './unitInput.ts';
import { createWaveBanner, type WaveBanner } from './waveBanner.ts';

const cursorPoint = (c: Cursor): { x: number; y: number } => ({ x: c.x, y: c.y });

/** tutorial: 1맵 튜토리얼 (빠른 규칙 + 목표 칸) / stage1: 같은 지도를 정상 규칙으로 */
export type GameMode = 'tutorial' | 'stage1';

export class GameScene extends Phaser.Scene {
  private world!: World;
  private stepper!: Stepper;
  private cursor!: Cursor;
  private pauseMenu!: PauseMenu;
  private cameraControl!: CameraControl;
  private minimap!: Minimap;
  private hud!: Hud;
  private unitInput!: UnitInput;
  private sprites!: SpriteLayer;
  private placement!: Placement;
  private tutorialView!: TutorialView;
  private tutorial!: TutorialState;
  private stageDialog!: StageDialog;
  private waveBanner!: WaveBanner;
  private mode: GameMode = 'tutorial';
  private groundOverlay!: Phaser.GameObjects.Graphics;
  private topOverlay!: Phaser.GameObjects.Graphics;
  /** 튜토리얼 "지도 둘러보기" 판정용: 카메라가 움직인 거리 합 (칸) */
  private cameraTravelTiles = 0;
  /** 게임이 진행된 시간 (일시정지 동안은 안 흐름). 튜토리얼 표시 시간에 씀 */
  private playMs = 0;
  private lastScroll = { x: 0, y: 0 };

  constructor() {
    super('game');
  }

  /** scene.restart({ mode }) 로 넘어온 값 */
  init(data: { mode?: GameMode }): void {
    this.mode = data.mode ?? 'tutorial';
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    // Phaser 는 다시 시작해도 같은 씬 객체를 쓴다. 필드 초깃값이 남지 않게 여기서 비운다
    this.cameraTravelTiles = 0;
    this.playMs = 0;
    this.world = createWorld(parseMap(MAP1_ROWS));
    // 튜토리얼: 끝날 때까지 짓기·채집·생산을 빠르게 (data/tutorial.ts). 1스테이지는 정상 규칙
    this.world.tutorialRules = this.mode === 'tutorial';
    // 괴물 공격은 1스테이지부터 (튜토리얼은 배우는 데만 집중)
    this.world.waves.enabled = this.mode === 'stage1';
    this.stepper = createStepper(TICK_SECONDS, MAX_TICKS_PER_FRAME);

    const { grid, features } = this.world.map;
    const worldWidth = grid.width * TILE_SIZE;
    const worldHeight = grid.height * TILE_SIZE;

    // 지형은 Blender 로 지도 한 장을 통째로 찍은 그림 (art/blender/render_terrain.py)
    this.add.image(0, 0, TERRAIN_KEY).setOrigin(0, 0).setDisplaySize(worldWidth, worldHeight).setDepth(DEPTH.terrain);
    this.groundOverlay = this.add.graphics().setDepth(DEPTH.groundOverlay);
    this.sprites = createSpriteLayer(this, this.world);
    this.topOverlay = this.add.graphics().setDepth(DEPTH.topOverlay);

    const main = this.cameras.main;
    // 아래 판이 지도 끝을 가리지 않게 그 높이만큼 더 내려갈 수 있게 한다 (위 줄은 바탕이 없어 안 가림)
    main.setBounds(0, 0, worldWidth, worldHeight + BOTTOM_PANEL_HEIGHT);
    main.centerOn((features.start.x + 0.5) * TILE_SIZE, (features.start.y + 0.5) * TILE_SIZE);
    this.lastScroll = { x: main.scrollX, y: main.scrollY };

    const isRunning = (): boolean => this.pauseMenu?.running ?? false;
    const cursorAt = (): { x: number; y: number } => ({ x: this.cursor.x, y: this.cursor.y });

    this.minimap = createMinimap(this, worldWidth, worldHeight, grid.width, grid.height, cursorAt, isRunning);
    this.cursor = createCursor(this);
    this.hud = createHud(this, this.minimap.camera, {
      isActive: isRunning,
      getState: () => ({ world: this.world, selected: this.unitInput.selected }),
      cursorAt,
      onMenu: () => this.pauseMenu.requestPause(),
      onHeroCard: () => this.unitInput.selectCommander(),
      startPlacement: (kind) => {
        if (this.builders().length > 0) this.placement.start(kind);
      },
      startAttack: () => this.unitInput.startAttackTarget(),
      cancelAttack: () => this.unitInput.cancelTargeting(),
      getGroups: () => this.unitInput.groups,
      getInspected: () => this.unitInput.inspected,
    });
    this.minimap.layout(this.hud.layout.minimap);
    this.cameraControl = createCameraControl(this, this.cursor, this.minimap.contains);
    this.tutorialView = createTutorialView(this, this.minimap.camera, () => this.hud.layout);
    this.unitInput = createUnitInput(this, {
      getWorld: () => this.world,
      getAlpha: () => this.stepper.alpha,
      cursorAt,
      isBlockedAt: (p) => this.minimap.contains(p) || this.hud.blocks(p) || this.stageDialog.contains(p),
      isActive: isRunning,
      isPlacing: () => this.placement?.active ?? false,
      minimapCamera: this.minimap.camera,
    });
    // unitInput 다음에 만든다: 같은 클릭에서 unitInput 이 먼저 "놓는 중" 을 보고 양보해야 함
    this.placement = createPlacement(this, {
      getWorld: () => this.world,
      getBuilders: () => this.builders(),
      cursorAt,
      isBlockedAt: (p) => this.minimap.contains(p) || this.hud.blocks(p) || this.stageDialog.contains(p),
      isActive: isRunning,
      minimapCamera: this.minimap.camera,
    });
    this.waveBanner = createWaveBanner(this, this.minimap.camera);
    this.waveBanner.layout(this.scale.width);
    this.pauseMenu = createPauseMenu(this, this.cursor, this.minimap.camera, this.mode === 'tutorial' ? '튜토리얼' : '1스테이지 초원');
    this.tutorial = startTutorial(this.tutorialInput());
    this.stageDialog = createStageDialog(this, this.minimap.camera, cursorAt, isRunning, () =>
      this.scene.restart({ mode: 'stage1' }),
    );

    // 다시 시작해도 키 처리가 겹치지 않게 (Phaser 키보드는 씬을 다시 시작해도 키를 들고 있음)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.removeAllKeys(true));

    // scale 은 게임 전체가 같이 쓰므로, 씬이 끝날 때 직접 떼어 내야 옛 씬의 layout 이 남지 않는다
    const onResize = (size: Phaser.Structs.Size): void => this.layout(size.width, size.height);
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize));
  }

  update(time: number, deltaMs: number): void {
    const running = this.pauseMenu.running;
    if (running) {
      this.playMs += deltaMs;
      this.stepper.advance(deltaMs / 1000, () => stepWorld(this.world));
      this.cameraControl.update(deltaMs);
    }
    this.trackCameraTravel();

    const alpha = this.stepper.alpha;
    this.sprites.update(this.world, alpha, time);
    drawOverlays(this.groundOverlay, this.topOverlay, this.world, alpha, this.unitInput.selected, this.unitInput.inspected);
    this.minimap.update(this.world, time);
    this.waveBanner.update(this.world, time);
    this.hud.update(cursorPoint(this.cursor));
    this.cursor.update();
    this.unitInput.update();
    this.placement.update();

    this.stageDialog.update(cursorPoint(this.cursor));
    if (this.mode !== 'tutorial') {
      this.tutorialView.update(null, this.world, alpha, time, false);
      return;
    }
    const input = this.tutorialInput();
    if (running) this.tutorial = stepTutorial(this.tutorial, input, this.playMs);
    if (this.tutorial.finishedAtMs !== null) {
      this.world.tutorialRules = false;
      this.stageDialog.show();
    }
    this.tutorialView.update(viewTutorial(this.tutorial, input, this.playMs), this.world, alpha, time, running);
  }

  /** 고른 것 중 건물을 지을 수 있는 유닛 (지휘관·일꾼) */
  private builders(): number[] {
    return this.world.units.filter((u) => this.unitInput.selected.has(u.id) && u.hp > 0 && canBuild(u)).map((u) => u.id);
  }

  private tutorialInput(): TutorialInput {
    return {
      world: this.world,
      selectedIds: this.unitInput.selected,
      cameraTravelTiles: this.cameraTravelTiles,
      commanderHotkeyCount: this.unitInput.commanderHotkeyCount,
    };
  }

  private trackCameraTravel(): void {
    const cam = this.cameras.main;
    const moved = Math.hypot(cam.scrollX - this.lastScroll.x, cam.scrollY - this.lastScroll.y);
    this.cameraTravelTiles += moved / TILE_SIZE;
    this.lastScroll = { x: cam.scrollX, y: cam.scrollY };
  }

  private layout(width: number, height: number): void {
    this.cameras.main.setSize(width, height);
    this.hud.resize(width, height);
    this.cursor.resize(width, height);
    this.minimap.layout(this.hud.layout.minimap);
    this.pauseMenu.layout(width, height);
    this.stageDialog.layout(width, height);
    this.waveBanner.layout(width);
  }
}
