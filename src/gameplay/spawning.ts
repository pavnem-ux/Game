import type { Point } from '../weapon-attacks';
import { ALPHA } from './config';
export interface SpawnSettings {
  readonly enabled: boolean;
  readonly interval: number;
  readonly minimumInterval: number;
  readonly count: number;
  readonly maximumCount: number;
  readonly maxActive: number;
  readonly pressurePeriod: number;
  readonly intervalReduction: number;
  readonly margin: number;
  readonly bandWidth: number;
}
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}
export const DEFAULT_SPAWNING: SpawnSettings = Object.freeze({
  enabled: true,
  interval: 4,
  minimumInterval: 1.5,
  count: 3,
  maximumCount: 8,
  maxActive: ALPHA.enemyCap,
  pressurePeriod: 30,
  intervalReduction: 0.35,
  margin: 64,
  bandWidth: 180,
});
export function spawningSettings(input: Partial<SpawnSettings> = {}): SpawnSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('Invalid spawning settings.');
  for (const key of Object.keys(input))
    if (!(key in DEFAULT_SPAWNING)) throw new TypeError(`Unknown spawning setting: ${key}`);
  const config = { ...DEFAULT_SPAWNING, ...input };
  if (typeof config.enabled !== 'boolean') throw new TypeError('enabled must be boolean.');
  for (const [key, value] of Object.entries(config))
    if (key !== 'enabled' && (typeof value !== 'number' || !Number.isFinite(value)))
      throw new RangeError(`Invalid spawning ${key}.`);
  if (
    config.minimumInterval < 0.25 ||
    config.interval < config.minimumInterval ||
    config.interval > 60 ||
    config.pressurePeriod < 1 ||
    config.intervalReduction < 0 ||
    config.margin < 0 ||
    config.bandWidth <= 0 ||
    config.bandWidth > ALPHA.arenaSize
  )
    throw new RangeError('Invalid spawning timing or placement.');
  for (const key of ['count', 'maximumCount', 'maxActive'] as const)
    if (!Number.isInteger(config[key]) || config[key] < 1) throw new RangeError(`Invalid ${key}.`);
  if (
    config.count > config.maximumCount ||
    config.maximumCount > 24 ||
    config.maxActive > ALPHA.enemyCap
  )
    throw new RangeError('Spawn count/cap outside alpha limits.');
  return Object.freeze(config);
}
export function wavePressure(time: number, settings: SpawnSettings) {
  const stage = Math.floor(time / settings.pressurePeriod);
  return Object.freeze({
    stage,
    count: Math.min(settings.maximumCount, settings.count + stage),
    interval: Math.max(
      settings.minimumInterval,
      settings.interval - settings.intervalReduction * stage,
    ),
  });
}
export function viewportSize(input: ViewportSize): ViewportSize {
  if (
    !input ||
    !Number.isFinite(input.width) ||
    !Number.isFinite(input.height) ||
    input.width <= 0 ||
    input.height <= 0
  )
    throw new RangeError('Viewport dimensions must be finite and positive.');
  return Object.freeze({ width: input.width, height: input.height });
}
export function cameraRectangle(player: Point, viewport: ViewportSize) {
  const width = Math.min(viewport.width, ALPHA.arenaSize),
    height = Math.min(viewport.height, ALPHA.arenaSize);
  const left = Math.max(0, Math.min(ALPHA.arenaSize - width, player.x - width / 2));
  const top = Math.max(0, Math.min(ALPHA.arenaSize - height, player.y - height / 2));
  return { left, top, right: left + width, bottom: top + height };
}
/** A bounded, weighted choice among clipped off-screen rectangles. No rejection loop near corners. */
export function offscreenPosition(
  player: Point,
  viewport: ViewportSize,
  radius: number,
  settings: SpawnSettings,
  random: () => number,
): Point | null {
  const camera = cameraRectangle(player, viewport),
    safe = settings.margin + radius;
  const l = camera.left - safe,
    r = camera.right + safe,
    t = camera.top - safe,
    b = camera.bottom + safe;
  const clip = (v: number) => Math.max(radius, Math.min(ALPHA.arenaSize - radius, v));
  const rectangles = [
    [clip(l), clip(t - settings.bandWidth), clip(r), clip(t)],
    [clip(l), clip(b), clip(r), clip(b + settings.bandWidth)],
    [
      clip(l - settings.bandWidth),
      clip(t - settings.bandWidth),
      clip(l),
      clip(b + settings.bandWidth),
    ],
    [
      clip(r),
      clip(t - settings.bandWidth),
      clip(r + settings.bandWidth),
      clip(b + settings.bandWidth),
    ],
  ].filter(([x1, y1, x2, y2]) => x2 > x1 && y2 > y1);
  const total = rectangles.reduce((sum, [x1, y1, x2, y2]) => sum + (x2 - x1) * (y2 - y1), 0);
  if (total === 0) return null;
  let pick = random() * total;
  const chosen =
    rectangles.find(([x1, y1, x2, y2]) => {
      pick -= (x2 - x1) * (y2 - y1);
      return pick < 0;
    }) ?? rectangles.at(-1)!;
  const [x1, y1, x2, y2] = chosen;
  return Object.freeze({ x: x1 + random() * (x2 - x1), y: y1 + random() * (y2 - y1) });
}
