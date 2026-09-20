import { ATTRIBUTE_NAMES, DIFFICULTIES, SKILL_IDS } from "./content.ts";
import type { Attribute, Quality, SkillId, Slot } from "./content.ts";
export interface Affix {
  key: Attribute;
  value: number;
}
export interface Equipment {
  id: string;
  slot: Slot;
  quality: Quality;
  level: number;
  base: number;
  upgrade: number;
  affixes: Affix[];
  name: string;
  starter?: boolean;
  locked?: boolean;
}
export interface Profile {
  version: 1;
  level: number;
  xp: number;
  gold: number;
  unlocked: number;
  equipment: Equipment[];
  equipped: Record<Slot, string | null>;
  learned: SkillId[];
  loadout: [SkillId | null, SkillId | null];
  books: Partial<Record<SkillId, number>>;
  obtained: SkillId[];
  clears: [number, number, number];
  shop: Equipment[];
  purchased: string[];
}
export interface Stats {
  hp: number;
  attack: number;
  armor: number;
  haste: number;
}
export const randInt = (min: number, max: number, rng: () => number) =>
  min + Math.floor(rng() * (max - min + 1));
export function generateEquipment(
  level: number,
  quality: Quality,
  rng: () => number = Math.random,
  slot?: Slot,
): Equipment {
  const type =
    slot ?? (["sword", "armor", "ring"] as Slot[])[randInt(0, 2, rng)];
  const mins = {
    sword: 5 + 2 * (level - 1),
    armor: 8 + 3 * (level - 1),
    ring: 10 + 3 * (level - 1),
  };
  const widths = { sword: 3, armor: 4, ring: 6 };
  const pool: Attribute[] =
    type === "sword"
      ? ["attack", "haste", "hp"]
      : type === "armor"
        ? ["armor", "hp", "attack"]
        : ["attack", "haste", "armor"];
  const ranges: Record<Attribute, [number, number]> = {
    attack: [1 + Math.floor(level / 3), 3 + Math.floor(level / 2)],
    hp: [8 + 2 * level, 16 + 3 * level],
    armor: [2 + level, 4 + 2 * level],
    haste: [3 + Math.floor(level / 3), 6 + Math.floor(level / 2)],
  };
  const affixes: Affix[] = [];
  for (let i = 0; i < quality; i++) {
    const key = pool.splice(randInt(0, pool.length - 1, rng), 1)[0];
    affixes.push({ key, value: randInt(...ranges[key], rng) });
  }
  const names = {
    sword: ["旅人長劍", "青銅闊劍", "晨曦之刃"],
    armor: ["旅人胸甲", "守林護甲", "晨曦戰甲"],
    ring: ["琥珀指環", "微光指環", "星紋戒指"],
  };
  return {
    id: crypto.randomUUID(),
    slot: type,
    quality,
    level,
    base: randInt(mins[type], mins[type] + widths[type], rng),
    upgrade: 0,
    affixes,
    name: names[type][quality],
  };
}
export function refreshShop(p: Profile, rng: () => number = Math.random) {
  const d = DIFFICULTIES[p.unlocked];
  p.shop = (["sword", "armor", "ring"] as Slot[]).map((s) =>
    generateEquipment(randInt(d.min, d.max, rng), rng() < 0.5 ? 0 : 1, rng, s),
  );
  p.purchased = [];
}
export function newProfile(): Profile {
  const sword: Equipment = {
    id: "starter-sword",
    slot: "sword",
    quality: 0,
    level: 1,
    base: 5,
    upgrade: 0,
    affixes: [],
    name: "啟程長劍",
    starter: true,
  };
  const armor: Equipment = {
    id: "starter-armor",
    slot: "armor",
    quality: 0,
    level: 1,
    base: 8,
    upgrade: 0,
    affixes: [],
    name: "啟程護甲",
    starter: true,
  };
  const p: Profile = {
    version: 1,
    level: 1,
    xp: 0,
    gold: 0,
    unlocked: 0,
    equipment: [sword, armor],
    equipped: { sword: sword.id, armor: armor.id, ring: null },
    learned: ["whirl"],
    loadout: ["whirl", null],
    books: {},
    obtained: ["whirl"],
    clears: [0, 0, 0],
    shop: [],
    purchased: [],
  };
  refreshShop(p);
  return p;
}
export function stats(p: Profile): Stats {
  const s: Stats = {
    hp: 100 + 5 * (p.level - 1),
    attack: 5 + p.level - 1,
    armor: 0,
    haste: 0,
  };
  for (const slot of ["sword", "armor", "ring"] as Slot[]) {
    const item = p.equipment.find((e) => e.id === p.equipped[slot]);
    if (!item) continue;
    s[slot === "sword" ? "attack" : slot === "armor" ? "armor" : "hp"] +=
      item.base * (1 + 0.1 * item.upgrade);
    for (const a of item.affixes)
      s[a.key] += a.key === "haste" ? a.value / 100 : a.value;
  }
  s.haste = Math.min(1, s.haste);
  return s;
}
export const xpRequired = (level: number) => 50 + 25 * (level - 1);
export function addXp(p: Profile, amount: number): number {
  if (p.level >= 20) return 0;
  p.xp += Math.max(0, Math.floor(amount));
  let levels = 0;
  while (p.level < 20 && p.xp >= xpRequired(p.level)) {
    p.xp -= xpRequired(p.level);
    p.level++;
    levels++;
  }
  if (p.level === 20) p.xp = 0;
  return levels;
}
export const sellPrice = (e: Equipment) => [5, 10, 20][e.quality] * e.level;
export const buyPrice = (e: Equipment) => [25, 50, 100][e.quality] * e.level;
export const upgradeCost = (e: Equipment) => 10 * e.level * (e.upgrade + 1);
export function acquireBook(p: Profile, id: SkillId) {
  p.books[id] = (p.books[id] ?? 0) + 1;
  if (!p.obtained.includes(id)) p.obtained.push(id);
}
export function learnBook(p: Profile, id: SkillId): boolean {
  if (p.learned.includes(id) || !p.books[id]) return false;
  p.books[id]!--;
  p.learned.push(id);
  return true;
}
export function finishClear(p: Profile, difficulty: number): SkillId[] {
  for (let i = 0; i <= difficulty; i++) p.clears[i]++;
  const rewards: SkillId[] = [];
  for (const [skill, index, target] of [
    ["quake", 0, 10],
    ["storm", 1, 15],
    ["domain", 2, 20],
  ] as const) {
    if (p.clears[index] >= target && !p.obtained.includes(skill)) {
      acquireBook(p, skill);
      rewards.push(skill);
    }
  }
  p.unlocked = Math.min(2, Math.max(p.unlocked, difficulty + 1));
  refreshShop(p);
  return rewards;
}
export function equipmentLines(e: Equipment): string[] {
  const a = e.slot === "sword" ? "攻擊" : e.slot === "armor" ? "防禦" : "生命";
  return [
    `${a} +${Number((e.base * (1 + 0.1 * e.upgrade)).toFixed(1))}`,
    ...e.affixes.map(
      (v) =>
        `${ATTRIBUTE_NAMES[v.key]} +${v.value}${v.key === "haste" ? "%" : ""}`,
    ),
  ];
}
export function damageAfterDefense(raw: number, armor: number, domain = false) {
  return Math.max(
    1,
    Math.round(((raw * 100) / (100 + armor)) * (domain ? 0.8 : 1)),
  );
}
function isEquipment(value: unknown): value is Equipment {
  if (!value || typeof value !== "object") return false;
  const e = value as Equipment;
  return (
    typeof e.id === "string" &&
    e.id.length > 0 &&
    typeof e.name === "string" &&
    e.name.length > 0 &&
    ["sword", "armor", "ring"].includes(e.slot) &&
    Number.isFinite(e.base) &&
    e.base > 0 &&
    [0, 1, 2].includes(e.quality) &&
    Number.isInteger(e.level) &&
    e.level >= 1 &&
    e.level <= 15 &&
    Number.isInteger(e.upgrade) &&
    e.upgrade >= 0 &&
    e.upgrade <= 5 &&
    (e.starter === undefined || typeof e.starter === "boolean") &&
    (e.locked === undefined || typeof e.locked === "boolean") &&
    Array.isArray(e.affixes) &&
    e.affixes.length === e.quality &&
    e.affixes.every(
      (a) =>
        a &&
        typeof a === "object" &&
        ["attack", "hp", "armor", "haste"].includes(a.key) &&
        Number.isFinite(a.value) &&
        a.value >= 0,
    ) &&
    new Set(e.affixes.map((a) => a.key)).size === e.affixes.length
  );
}
export function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Profile;
  return (
    p.version === 1 &&
    Number.isInteger(p.level) &&
    p.level >= 1 &&
    p.level <= 20 &&
    Number.isSafeInteger(p.xp) &&
    p.xp >= 0 &&
    (p.level === 20 ? p.xp === 0 : p.xp < xpRequired(p.level)) &&
    Number.isSafeInteger(p.gold) &&
    p.gold >= 0 &&
    Number.isInteger(p.unlocked) &&
    p.unlocked >= 0 &&
    p.unlocked <= 2 &&
    Array.isArray(p.equipment) &&
    p.equipment.every(isEquipment) &&
    new Set(p.equipment.map((e) => e.id)).size === p.equipment.length &&
    !!p.equipped &&
    typeof p.equipped === "object" &&
    (["sword", "armor", "ring"] as Slot[]).every(
      (slot) =>
        (slot !== "sword" && p.equipped[slot] === null) ||
        p.equipment.some((e) => e.id === p.equipped[slot] && e.slot === slot),
    ) &&
    p.equipment.some((e) => e.id === p.equipped.sword && e.slot === "sword") &&
    Array.isArray(p.learned) &&
    p.learned.every((s) => SKILL_IDS.includes(s)) &&
    new Set(p.learned).size === p.learned.length &&
    Array.isArray(p.loadout) &&
    p.loadout.length === 2 &&
    p.loadout.every((s) => s === null || p.learned.includes(s)) &&
    (p.loadout[0] === null || p.loadout[0] !== p.loadout[1]) &&
    !!p.books &&
    typeof p.books === "object" &&
    !Array.isArray(p.books) &&
    Object.entries(p.books).every(
      ([s, n]) =>
        SKILL_IDS.includes(s as SkillId) && Number.isSafeInteger(n) && n >= 0,
    ) &&
    Array.isArray(p.obtained) &&
    p.obtained.every((s) => SKILL_IDS.includes(s)) &&
    Array.isArray(p.clears) &&
    p.clears.length === 3 &&
    p.clears.every((n) => Number.isSafeInteger(n) && n >= 0) &&
    Array.isArray(p.shop) &&
    p.shop.length === 3 &&
    p.shop.every(isEquipment) &&
    new Set(p.shop.map((e) => e.id)).size === 3 &&
    Array.isArray(p.purchased) &&
    p.purchased.every(
      (id) => typeof id === "string" && p.shop.some((e) => e.id === id),
    ) &&
    new Set(p.purchased).size === p.purchased.length
  );
}
