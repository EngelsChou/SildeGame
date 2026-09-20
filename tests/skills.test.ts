import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle } from "../src/domain/battle.ts";
import { newProfile } from "../src/domain/profile.ts";
import type { SkillId } from "../src/domain/content.ts";

function fixture(skill: SkillId, distance = 2.7) {
  const p = newProfile();
  p.learned.push(skill);
  p.loadout[0] = skill;
  const b = new Battle(p, 0, 2);
  const target = b.spawnEnemy("chaser", 0, { x: distance, y: 0 })!;
  target.hp = target.maxHp = 1000;
  target.state = "recover";
  target.until = 1000;
  b.step(0, { x: 0, y: 0, cast: null });
  b.events.length = 0;
  return { b, target };
}
const idle = { x: 0, y: 0, cast: null };

test("storm waits half a second and delivers exactly six pulses", () => {
  const { b, target } = fixture("storm");
  const hp = target.hp;
  assert.ok(b.cast(0));
  for (let i = 0; i < 29; i++) b.step(1 / 60, idle);
  assert.equal(target.hp, hp);
  for (let i = 29; i < 190; i++) b.step(1 / 60, idle);
  assert.equal(target.hp, hp - 60);
  assert.equal(b.events.filter((e) => e.type === "ring").length, 6);
});

test("piercing wave hits each target once over multiple frames", () => {
  const { b, target } = fixture("wave", 4);
  assert.ok(b.cast(0));
  for (let i = 0; i < 50; i++) b.step(1 / 60, idle);
  assert.equal(target.hp, 970);
  assert.equal(b.projectiles.length, 0);
});

test("cleave waits for its windup before dealing its heavy hit", () => {
  const { b, target } = fixture("cleave", 1.5);
  const hp = target.hp;
  assert.ok(b.cast(0));
  for (let i = 0; i < 20; i++) b.step(1 / 60, idle);
  assert.equal(target.hp, hp);
  for (let i = 0; i < 3; i++) b.step(1 / 60, idle);
  assert.equal(
    b.events.filter((e) => e.type === "hit" && e.value === 40).length,
    1,
  );
});

test("quake deals directional damage and applies its three-second slow", () => {
  const { b, target } = fixture("quake", 3);
  assert.ok(b.cast(0));
  assert.equal(target.hp, 955);
  assert.equal(target.slowUntil, 3);
});

test("domain bonuses expire without modifying permanent character stats", () => {
  const { b } = fixture("domain", 20);
  assert.ok(b.cast(0));
  assert.equal(b.attack, 17.5);
  assert.equal(b.haste, 0.4);
  for (let i = 0; i < 361; i++) b.step(1 / 60, idle);
  assert.equal(b.attack, 10);
  assert.equal(b.haste, 0);
  assert.equal(b.profile.level, 1);
});

test("dash travels about three units and damages one enemy once", () => {
  const { b, target } = fixture("dash", 1.5);
  b.player.angle = 0;
  const hp = target.hp;
  assert.ok(b.cast(0));
  for (let i = 0; i < 16; i++) b.step(1 / 60, idle);
  assert.ok(Math.abs(b.player.x - 3) < 0.21);
  assert.equal(
    b.events.filter((e) => e.type === "hit" && e.value === 15).length,
    1,
  );
  assert.ok(target.hp <= hp - 15);
});
