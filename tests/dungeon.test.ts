import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle } from "../src/domain/battle.ts";
import {
  generateEquipment,
  isProfile,
  newProfile,
} from "../src/domain/profile.ts";
import { seededRandom } from "../src/domain/world.ts";

test("a geared character completes the full timed dungeon and keeps its rewards", () => {
  // A late-progression fixture validates the real time line without skipping phases
  // or injecting a victory. This is a rule integration test, not a balance benchmark.
  const p = newProfile(),
    rng = seededRandom(30);
  p.level = 20;
  p.learned.push("storm", "quake");
  p.loadout = ["storm", "quake"];
  for (const slot of ["sword", "armor", "ring"] as const) {
    const item = generateEquipment(15, 2, rng, slot);
    item.upgrade = 5;
    p.equipment.push(item);
    p.equipped[slot] = item.id;
  }
  const b = new Battle(p, 0, 42);
  let peakEnemies = 0;
  for (let frame = 0; frame < 60 * 300 && !b.result; frame++) {
    const nearest = b.enemies
      .filter((e) => e.hp > 0)
      .sort(
        (a, c) =>
          Math.hypot(a.x - b.player.x, a.y - b.player.y) -
          Math.hypot(c.x - b.player.x, c.y - b.player.y),
      )[0];
    const approach =
      nearest &&
      Math.hypot(nearest.x - b.player.x, nearest.y - b.player.y) > 1.4;
    b.advance(1 / 60, {
      x: approach ? nearest.x - b.player.x : 0,
      y: approach ? nearest.y - b.player.y : 0,
      cast: frame % 2,
    });
    peakEnemies = Math.max(peakEnemies, b.enemies.length);
    b.events.length = 0; // Renderer consumes transient events in the real game.
    assert.ok(Number.isFinite(b.player.hp));
  }
  assert.ok(
    b.result?.victory,
    `expected clear; time=${b.time}, hp=${b.player.hp}, bosses=${b.bossAlive.length}`,
  );
  assert.equal(b.bossCount, 6);
  assert.ok(b.time >= 120);
  assert.ok(peakEnemies <= 206);
  assert.ok(b.result.gear.some((item) => item.quality === 2));
  assert.ok(p.obtained.includes("dash"));
  assert.equal(p.clears[0], 1);
  assert.equal(p.unlocked, 1);
  assert.ok(isProfile(p));
});
