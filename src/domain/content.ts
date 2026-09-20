export type SkillId =
  "whirl" | "dash" | "cleave" | "wave" | "quake" | "storm" | "domain";
export type Slot = "sword" | "armor" | "ring";
export type Quality = 0 | 1 | 2;
export type Attribute = "attack" | "hp" | "armor" | "haste";
export interface Skill {
  id: SkillId;
  name: string;
  tier: string;
  cooldown: number;
  color: string;
  icon: string;
  description: string;
}
export const SKILLS: Record<SkillId, Skill> = {
  whirl: {
    id: "whirl",
    name: "旋風斬",
    tier: "普通",
    cooldown: 6,
    color: "#56b4a0",
    icon: "✺",
    description: "立即斬擊周圍 2.4 單位，造成 250% 攻擊傷害。",
  },
  dash: {
    id: "dash",
    name: "衝刺斬",
    tier: "稀有",
    cooldown: 5,
    color: "#609ee1",
    icon: "➶",
    description:
      "沿移動方向衝刺 3 單位，造成 150% 傷害。衝刺期間無敵，可穿越敵人。",
  },
  cleave: {
    id: "cleave",
    name: "重劈",
    tier: "普通",
    cooldown: 4,
    color: "#d99355",
    icon: "⚔",
    description: "蓄勢 0.35 秒，向前方重劈，造成 400% 傷害。",
  },
  wave: {
    id: "wave",
    name: "劍氣波",
    tier: "稀有",
    cooldown: 5,
    color: "#609ee1",
    icon: "≋",
    description: "發射可穿透敵人的劍氣，造成 300% 傷害，最遠飛行 8 單位。",
  },
  quake: {
    id: "quake",
    name: "裂地震擊",
    tier: "大師",
    cooldown: 10,
    color: "#aa7ac9",
    icon: "⋀",
    description:
      "前方範圍造成 450% 傷害，緩速 3 秒。普通怪減速 50%，Boss 減速 20%。",
  },
  storm: {
    id: "storm",
    name: "劍刃風暴",
    tier: "傳說",
    cooldown: 12,
    color: "#deab45",
    icon: "✥",
    description: "持續 3 秒，每 0.5 秒造成 100% 範圍傷害，共六次。",
  },
  domain: {
    id: "domain",
    name: "戰神領域",
    tier: "神話",
    cooldown: 20,
    color: "#e47783",
    icon: "♜",
    description: "持續 6 秒：攻擊 +75%、攻速 +40%、受到傷害再降低 20%。",
  },
};
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
export const SLOT_NAMES: Record<Slot, string> = {
  sword: "武器",
  armor: "胸甲",
  ring: "戒指",
};
export const ATTRIBUTE_NAMES: Record<Attribute, string> = {
  attack: "攻擊",
  hp: "生命",
  armor: "防禦",
  haste: "攻速",
};
export const QUALITY_NAMES = ["普通", "魔法", "稀有"];
export const QUALITY_COLORS = ["#66786a", "#4a88be", "#b7872f"];
export const DIFFICULTIES = [
  { name: "普通", hp: 1, damage: 1, spawn: 1, xp: 1, min: 1, max: 5 },
  { name: "困難", hp: 1.8, damage: 1.5, spawn: 1.2, xp: 1.5, min: 6, max: 10 },
  { name: "惡夢", hp: 3, damage: 2, spawn: 1.4, xp: 2, min: 11, max: 15 },
] as const;
export const ENEMIES = {
  chaser: {
    name: "苔芽獸",
    hp: 20,
    damage: 8,
    speed: 2.4,
    xp: 1,
    radius: 0.35,
  },
  runner: { name: "疾風狼", hp: 12, damage: 6, speed: 3.2, xp: 1, radius: 0.3 },
  ranger: {
    name: "晶芽妖精",
    hp: 16,
    damage: 10,
    speed: 2,
    xp: 2,
    radius: 0.35,
  },
  boss: {
    name: "岩角守衛",
    hp: 160,
    damage: 18,
    speed: 2,
    xp: 10,
    radius: 0.8,
  },
} as const;
export type EnemyKind = keyof typeof ENEMIES;
export const WAVES = [
  { rate: 1, weights: [1, 0, 0] },
  { rate: 1.4, weights: [0.8, 0.2, 0] },
  { rate: 1.8, weights: [0.65, 0.2, 0.15] },
  { rate: 2.2, weights: [0.6, 0.25, 0.15] },
  { rate: 2.6, weights: [0.55, 0.25, 0.2] },
  { rate: 3, weights: [0.5, 0.3, 0.2] },
];
export const BOSS_HP = [1, 1.2, 1.4, 1.6, 1.8, 3];
export const BOSS_DAMAGE = [1, 1, 1.1, 1.1, 1.2, 1.3];
export const BOSS_XP = [10, 12, 14, 16, 18, 40];
export const BOOK_SELL: Partial<Record<SkillId, number>> = {
  dash: 80,
  cleave: 30,
  wave: 80,
  quake: 200,
  storm: 500,
  domain: 1500,
};
export const BOOK_BUY = { cleave: 150, wave: 400, dash: 80 };
export const UNIT = 80;
