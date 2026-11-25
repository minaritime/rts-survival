import { COMMANDER } from '../../data/commander.ts';
import { commanderOf, type World } from '../world.ts';

/**
 * 지휘관 배고픔 (기획.md 3장).
 * 배부름이 4초마다 1 줄고, 60 미만이면 저장 식량에서 1씩 먹어 채운다.
 * 0 이면 체력이 초당 1 줄고, 체력 0 이면 패배.
 */
export function stepHunger(world: World, dt: number): void {
  const commander = commanderOf(world);
  if (!commander) return;

  world.satiety = Math.max(0, world.satiety - dt / COMMANDER.secondsPerSatiety);

  while (world.satiety < COMMANDER.autoEatBelow && world.stock.food >= 1) {
    world.stock.food -= 1;
    world.satiety = Math.min(COMMANDER.maxSatiety, world.satiety + 1);
  }

  if (world.satiety <= 0) {
    commander.hp = Math.max(0, commander.hp - COMMANDER.starvingHpPerSecond * dt);
  }
  if (commander.hp <= 0) world.outcome = 'defeat';
}

export function isStarving(world: World): boolean {
  return world.satiety <= 0;
}
