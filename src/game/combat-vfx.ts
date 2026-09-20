import type Phaser from "phaser";

type Graphics = Phaser.GameObjects.Graphics;

/** Layered, tapered ribbon. Only presentation: never changes the damage geometry. */
export function drawSlash(
  g: Graphics,
  x: number,
  y: number,
  radius: number,
  angle: number,
  half: number,
  progress: number,
  color: number,
  heavy = false,
) {
  const fade = Math.pow(1 - progress, 0.65);
  const tip = angle - half + 2 * half * Math.min(1, progress / 0.62);
  const tail = Math.max(angle - half, tip - 1.65);
  if (tip - tail < 0.01) return;
  for (const [scale, width, alpha, tint] of [
    [1.04, heavy ? 42 : 30, 0.18, color],
    [1, heavy ? 25 : 18, 0.8, color],
    [0.99, 5, 0.95, 0xfffff2],
  ]) {
    g.fillStyle(tint, alpha * fade);
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = i / 24,
        a = tail + (tip - tail) * t;
      const r = radius * scale + Math.sin(t * Math.PI) * width * 0.5;
      if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    for (let i = 24; i >= 0; i--) {
      const t = i / 24,
        a = tail + (tip - tail) * t;
      const r = radius * scale - Math.sin(t * Math.PI) * width;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
    g.fillPath();
  }
}

export function drawSword(
  g: Graphics,
  x: number,
  y: number,
  angle: number,
  alpha: number,
) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const point = (along: number, across: number) => [
    x + c * along - s * across,
    y + s * along + c * across,
  ];
  const polygon = (points: number[][], color: number) => {
    g.fillStyle(color, alpha);
    g.beginPath();
    points.forEach(([a, b], i) => {
      const [px, py] = point(a, b);
      if (!i) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
    g.fillPath();
  };
  polygon(
    [
      [10, -4],
      [30, -4],
      [30, 4],
      [10, 4],
    ],
    0x805840,
  );
  polygon(
    [
      [28, -7],
      [92, -5],
      [108, 0],
      [92, 7],
      [28, 7],
    ],
    0x537c79,
  );
  polygon(
    [
      [30, -5],
      [92, -3],
      [106, 0],
      [30, 1],
    ],
    0xfffff0,
  );
  polygon(
    [
      [30, 1],
      [106, 0],
      [92, 5],
      [30, 5],
    ],
    0xb8dfd8,
  );
  polygon(
    [
      [24, -14],
      [32, -14],
      [32, 14],
      [24, 14],
    ],
    0xeac66d,
  );
  const [hx, hy] = point(17, 0);
  g.fillStyle(0xedbd89, alpha).fillCircle(hx, hy, 6);
}

export function drawImpact(
  g: Graphics,
  x: number,
  y: number,
  age: number,
  angle: number,
  color: number,
  heavy: boolean,
  dust = false,
) {
  const duration = dust ? 0.26 : 0.23,
    p = Math.min(1, age / duration);
  if (p >= 1) return;
  const alpha = 1 - p,
    size = heavy ? 1.45 : 1;
  g.fillStyle(color, alpha * 0.18).fillCircle(x, y, (10 + p * 27) * size);
  if (!dust) {
    g.lineStyle(3 * alpha, color, alpha * 0.75).strokeCircle(
      x,
      y,
      (5 + p * 30) * size,
    );
    g.fillStyle(0xffffef, alpha).fillCircle(
      x,
      y,
      Math.max(0, 10 * (1 - p * 3)) * size,
    );
  }
  for (let i = 0; i < (dust ? 5 : 8); i++) {
    const a = angle + i * 2.39996,
      distance = (8 + p * (25 + (i % 3) * 10)) * size;
    const px = x + Math.cos(a) * distance,
      py = y + Math.sin(a) * distance * (dust ? 0.4 : 1);
    if (dust) g.fillStyle(color, alpha * 0.65).fillCircle(px, py, 3 + 4 * p);
    else {
      g.lineStyle((i % 2 ? 3 : 5) * alpha, i % 2 ? color : 0xffffeb, alpha);
      g.lineBetween(
        px,
        py,
        px + Math.cos(a) * 12 * alpha * size,
        py + Math.sin(a) * 12 * alpha * size,
      );
    }
  }
}
