import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isProfile,
  newProfile,
  addXp,
  acquireBook,
  learnBook,
} from "../src/domain/profile.ts";
import { LocalPreviewRepository } from "../src/infrastructure/local-profile.ts";
import {
  DEFAULT_KEYS,
  canBindKey,
  isKeyBindings,
} from "../src/domain/input.ts";

test("nested corrupt save entries are rejected without throwing", () => {
  for (const modify of [
    (p: any) => p.equipment.push(null),
    (p: any) => (p.equipment[0].affixes = [null]),
    (p: any) => (p.shop[0] = {}),
    (p: any) => (p.equipment[0].name = 3),
    (p: any) => (p.books = []),
    (p: any) => (p.equipped.armor = "missing"),
    (p: any) => p.equipment.push(structuredClone(p.equipment[0])),
    (p: any) => (p.loadout = ["whirl", "whirl"]),
    (p: any) => (p.purchased = ["missing"]),
  ]) {
    const p = newProfile();
    modify(p);
    assert.equal(isProfile(p), false);
  }
});

test("permanent character, equipment and skills survive repository round trip", () => {
  const entries = new Map<string, string>();
  const repo = new LocalPreviewRepository({
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  });
  const p = repo.load();
  addXp(p, 180);
  p.gold = 80;
  acquireBook(p, "dash");
  learnBook(p, "dash");
  p.loadout[1] = "dash";
  p.equipment[0].upgrade = 2;
  repo.save(p);
  assert.deepEqual(repo.load(), p);
});

test("broken persisted data is preserved instead of overwritten with a new character", () => {
  for (const raw of [
    "{broken",
    JSON.stringify({ version: 999 }),
    JSON.stringify({ ...newProfile(), shop: [null] }),
  ]) {
    let stored = raw;
    const repo = new LocalPreviewRepository({
      getItem: () => stored,
      setItem: (_, value) => {
        stored = value;
      },
    });
    assert.throws(() => repo.load(), /已保留原始資料/);
    assert.equal(stored, raw);
  }
});

test("storage quota failures are observable to the UI", () => {
  const repo = new LocalPreviewRepository({
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
  });
  assert.throws(() => repo.save(newProfile()), /quota/);
});

test("key bindings reject duplicate, incomplete and reserved physical keys", () => {
  assert.ok(isKeyBindings(DEFAULT_KEYS));
  assert.ok(isKeyBindings({ ...DEFAULT_KEYS, skill1: "KeyQ" }));
  assert.equal(isKeyBindings({ ...DEFAULT_KEYS, skill1: "KeyW" }), false);
  assert.equal(isKeyBindings({ up: "KeyW" }), false);
  for (const code of [
    "Escape",
    "ArrowUp",
    "Numpad1",
    "F5",
    "Tab",
    "ControlLeft",
  ]) {
    assert.equal(canBindKey(code), false);
    assert.equal(isKeyBindings({ ...DEFAULT_KEYS, skill1: code }), false);
  }
});
