import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acquireBook,
  addXp,
  damageAfterDefense,
  finishClear,
  generateEquipment,
  isProfile,
  learnBook,
  newProfile,
  stats,
  upgradeCost,
  xpRequired,
} from "../src/domain/profile.ts";
import {
  clearPosition,
  inArc,
  obstacleAt,
  resolveTerrain,
  seededRandom,
  SpatialHash,
} from "../src/domain/world.ts";
import { Battle } from "../src/domain/battle.ts";

test("starter equipment preserves agreed level-one totals", () => {
  assert.deepEqual(stats(newProfile()), {
    hp: 100,
    attack: 10,
    armor: 8,
    haste: 0,
  });
});
test("experience overflow advances levels without resetting permanent progress", () => {
  const p = newProfile();
  assert.equal(addXp(p, 130), 2);
  assert.equal(p.level, 3);
  assert.equal(p.xp, 5);
  assert.equal(stats(p).attack, 12);
  assert.equal(stats(p).hp, 110);
  assert.equal(xpRequired(3), 100);
});
test("level cap stops experience accumulation", () => {
  const p = newProfile();
  addXp(p, 100000);
  assert.equal(p.level, 20);
  assert.equal(p.xp, 0);
  assert.equal(addXp(p, 100), 0);
});
test("equipment rolls respect level ranges and unique legal affixes", () => {
  const rng = seededRandom(132);
  for (let l = 1; l <= 15; l++)
    for (let n = 0; n < 20; n++) {
      const e = generateEquipment(l, 2, rng);
      assert.equal(new Set(e.affixes.map((a) => a.key)).size, 2);
      assert.ok(e.upgrade === 0);
      const min =
        e.slot === "sword"
          ? 5 + 2 * (l - 1)
          : e.slot === "armor"
            ? 8 + 3 * (l - 1)
            : 10 + 3 * (l - 1);
      const spread = e.slot === "sword" ? 3 : e.slot === "armor" ? 4 : 6;
      assert.ok(e.base >= min && e.base <= min + spread);
      if (e.slot === "armor")
        assert.ok(!e.affixes.some((a) => a.key === "haste"));
    }
});
test("enhancement adds original base percentages, never compounds affixes", () => {
  const p = newProfile(),
    s = p.equipment[0];
  s.base = 10;
  s.upgrade = 3;
  s.affixes = [{ key: "attack", value: 2 }];
  assert.equal(stats(p).attack, 20);
  s.level = 5;
  s.upgrade = 0;
  let cost = 0;
  while (s.upgrade < 5) {
    cost += upgradeCost(s);
    s.upgrade++;
  }
  assert.equal(cost, 750);
});
test("defense, domain reduction and minimum damage use the documented order", () => {
  assert.equal(damageAfterDefense(25, 25), 20);
  assert.equal(damageAfterDefense(25, 25, true), 16);
  assert.equal(damageAfterDefense(1, 500), 1);
});
test("learning consumes one book, does not auto-configure, and never creates skill levels", () => {
  const p = newProfile();
  acquireBook(p, "dash");
  assert.ok(learnBook(p, "dash"));
  assert.equal(p.loadout[1], null);
  assert.equal(p.books.dash, 0);
  assert.ok(!learnBook(p, "dash"));
  assert.ok(p.obtained.includes("dash"));
});
test("pity does not duplicate a book acquired on the threshold clear", () => {
  const p = newProfile();
  p.clears[0] = 9;
  acquireBook(p, "quake");
  assert.deepEqual(finishClear(p, 0), []);
  assert.equal(p.books.quake, 1);
});
test("pity is first-acquisition only and higher difficulties qualify for lower counters", () => {
  const p = newProfile();
  p.clears = [9, 14, 19];
  assert.deepEqual(finishClear(p, 2), ["quake", "storm", "domain"]);
  p.books.quake = 0;
  p.books.storm = 0;
  p.books.domain = 0;
  assert.deepEqual(finishClear(p, 2), []);
  assert.deepEqual(p.clears, [11, 16, 21]);
});
test("terrain is reproducible across negative coordinates and chunk borders stay clear", () => {
  for (let x = -30; x < 30; x++)
    for (let y = -10; y < 10; y++) {
      assert.deepEqual(obstacleAt(x, y, 13), obstacleAt(x, y, 13));
      if (((x % 8) + 8) % 8 === 0) assert.equal(obstacleAt(x, y, 13), null);
    }
  assert.ok(clearPosition(0, 0, 0.35, 13));
});
test("terrain resolution removes overlap rather than tunneling through solids", () => {
  let o = null;
  for (let x = 0; x < 20 && !o; x++)
    for (let y = 0; y < 20 && !o; y++) o = obstacleAt(x, y, 7);
  assert.ok(o);
  const p = { x: o.x, y: o.y };
  assert.ok(resolveTerrain(p, 0.35, 7));
  assert.ok(Math.hypot(p.x - o.x, p.y - o.y) >= o.radius + 0.35 - 0.000001);
});
test("spatial queries include nearby entities on either side of zero", () => {
  const h = new SpatialHash<{ x: number; y: number; id: number }>();
  h.rebuild([
    { x: -0.1, y: 0, id: 1 },
    { x: 0.1, y: 0, id: 2 },
    { x: 30, y: 0, id: 3 },
  ]);
  assert.deepEqual(
    h
      .near(0, 0, 1)
      .map((p) => p.id)
      .sort(),
    [1, 2],
  );
});
test("directional attacks do not damage enemies behind the player", () => {
  assert.ok(inArc({ x: 0, y: 0 }, { x: 1, y: 0 }, 0, 1.8, Math.PI / 4));
  assert.ok(!inArc({ x: 0, y: 0 }, { x: -1, y: 0 }, 0, 1.8, Math.PI / 4));
});
test("pause freezes combat time, cooldowns, spawning and player movement", () => {
  const b = new Battle(newProfile(), 0, 4);
  b.paused = true;
  b.advance(10, { x: 1, y: 0, cast: 0 });
  assert.equal(b.time, 0);
  assert.equal(b.enemies.length, 0);
  assert.equal(b.player.x, 0);
});
test("bosses accumulate, while final phase clears normals and their projectiles", () => {
  const b = new Battle(newProfile(), 0, 4);
  b.time = 19.99;
  b.step(0.02, { x: 0, y: 0, cast: null });
  assert.equal(b.bossCount, 1);
  b.time = 39.99;
  b.step(0.02, { x: 0, y: 0, cast: null });
  assert.equal(b.bossAlive.length, 2);
  b.spawnEnemy("chaser", 0, { x: 10, y: 0 });
  b.projectiles.push({
    id: 900,
    x: 10,
    y: 0,
    angle: 0,
    speed: 7,
    remaining: 2,
    friendly: false,
    damage: 10,
    hit: new Set(),
  });
  b.time = 119.99;
  b.step(0.02, { x: 0, y: 0, cast: null });
  assert.equal(b.bossCount, 6);
  assert.equal(b.bossAlive.length, 6);
  assert.ok(b.enemies.every((e) => e.kind === "boss"));
  assert.ok(b.projectiles.every((p) => p.friendly));
});
test("simultaneous final elimination and player death awards victory once", () => {
  const p = newProfile(),
    b = new Battle(p, 0, 4);
  b.bossCount = 6;
  b.player.hp = 0;
  b.step(1 / 60, { x: 0, y: 0, cast: null });
  assert.ok(b.result?.victory);
  assert.equal(p.clears[0], 1);
  b.finish(true);
  assert.equal(p.clears[0], 1);
});
test("victory collects distant drops, failure does not", () => {
  const p = newProfile(),
    b = new Battle(p, 0, 4);
  b.loot.push({ id: 1, x: 1000, y: 1000, type: "book", book: "dash" });
  b.finish(true);
  assert.equal(p.books.dash, 1);
  const q = newProfile(),
    c = new Battle(q, 0, 4);
  c.loot.push({ id: 1, x: 0, y: 0, type: "book", book: "dash" });
  c.finish(false);
  assert.equal(q.books.dash, undefined);
});
test("cast respects cooldown and one strike cannot damage the same enemy twice", () => {
  const p = newProfile();
  const b = new Battle(p, 0, 2);
  const e = b.spawnEnemy("chaser", 0, { x: 2, y: 0 })!;
  e.hp = e.maxHp = 1000;
  b.step(1 / 60, { x: 0, y: 0, cast: null });
  const before = e.hp;
  assert.ok(b.cast(0));
  assert.equal(e.hp, before - 25);
  assert.ok(!b.cast(0));
  assert.equal(e.hp, before - 25);
});
test("new profile round-trips, malformed save is rejected", () => {
  const p = newProfile();
  assert.ok(isProfile(JSON.parse(JSON.stringify(p))));
  assert.ok(!isProfile({ version: 1, level: 100 }));
  assert.ok(!isProfile(null));
});
