export interface Point {
  x: number;
  y: number;
}
export interface Obstacle extends Point {
  radius: number;
  variant: number;
  key: string;
}
export function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mod = (n: number, d: number) => ((n % d) + d) % d;
export function obstacleAt(
  gx: number,
  gy: number,
  seed: number,
): Obstacle | null {
  // Four-unit grid, clear chunk borders and crossing corridors; obstacles never form walls.
  if ([0, 3, 4, 7].includes(mod(gx, 8)) || [0, 3, 4, 7].includes(mod(gy, 8)))
    return null;
  const h = hash(gx, gy, seed);
  if (h % 100 > 53) return null;
  const x = gx * 4 + 2 + (((h >>> 8) % 100) / 100 - 0.5),
    y = gy * 4 + 2 + (((h >>> 16) % 100) / 100 - 0.5);
  if (Math.hypot(x, y) < 5) return null;
  return {
    x,
    y,
    radius: 0.5 + (h % 4) * 0.08,
    variant: h % 3,
    key: `${gx}:${gy}`,
  };
}
export function nearbyObstacles(
  x: number,
  y: number,
  seed: number,
): Obstacle[] {
  const list: Obstacle[] = [];
  const gx = Math.floor(x / 4),
    gy = Math.floor(y / 4);
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const o = obstacleAt(gx + dx, gy + dy, seed);
      if (o) list.push(o);
    }
  return list;
}
export function resolveTerrain(
  p: Point,
  radius: number,
  seed: number,
): boolean {
  let hit = false;
  for (const o of nearbyObstacles(p.x, p.y, seed)) {
    const dx = p.x - o.x,
      dy = p.y - o.y,
      d = Math.hypot(dx, dy),
      r = radius + o.radius;
    if (d < r) {
      p.x = o.x + (d ? dx / d : 1) * r;
      p.y = o.y + (d ? dy / d : 0) * r;
      hit = true;
    }
  }
  return hit;
}
export function clearPosition(
  x: number,
  y: number,
  radius: number,
  seed: number,
) {
  return nearbyObstacles(x, y, seed).every(
    (o) => Math.hypot(o.x - x, o.y - y) > o.radius + radius + 0.15,
  );
}
export function inArc(
  origin: Point,
  target: Point,
  angle: number,
  range: number,
  halfAngle: number,
  targetRadius = 0,
) {
  const dx = target.x - origin.x,
    dy = target.y - origin.y;
  const d = Math.hypot(dx, dy);
  if (d > range + targetRadius) return false;
  if (d <= targetRadius) return true;
  const delta = Math.atan2(
    Math.sin(Math.atan2(dy, dx) - angle),
    Math.cos(Math.atan2(dy, dx) - angle),
  );
  return (
    Math.abs(delta) <= halfAngle + Math.asin(Math.min(1, targetRadius / d))
  );
}
export class SpatialHash<T extends Point> {
  private cells = new Map<string, T[]>();
  private size: number;
  constructor(size = 2) {
    this.size = size;
  }
  rebuild(items: Iterable<T>) {
    this.cells.clear();
    for (const p of items) {
      const k = `${Math.floor(p.x / this.size)},${Math.floor(p.y / this.size)}`;
      const cell = this.cells.get(k);
      if (cell) cell.push(p);
      else this.cells.set(k, [p]);
    }
  }
  near(x: number, y: number, radius: number) {
    const found: T[] = [];
    for (
      let gx = Math.floor((x - radius) / this.size);
      gx <= Math.floor((x + radius) / this.size);
      gx++
    )
      for (
        let gy = Math.floor((y - radius) / this.size);
        gy <= Math.floor((y + radius) / this.size);
        gy++
      ) {
        const c = this.cells.get(`${gx},${gy}`);
        if (c) found.push(...c);
      }
    return found;
  }
}
