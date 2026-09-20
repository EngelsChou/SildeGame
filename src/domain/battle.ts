import {
  BOSS_DAMAGE,
  BOSS_HP,
  BOSS_XP,
  DIFFICULTIES,
  ENEMIES,
  SKILLS,
  WAVES,
} from "./content.ts";
import type { EnemyKind, SkillId } from "./content.ts";
import {
  acquireBook,
  addXp,
  damageAfterDefense,
  finishClear,
  generateEquipment,
  randInt,
  stats,
} from "./profile.ts";
import type { Equipment, Profile, Stats } from "./profile.ts";
import {
  clearPosition,
  inArc,
  nearbyObstacles,
  resolveTerrain,
  seededRandom,
  SpatialHash,
} from "./world.ts";
import type { Point } from "./world.ts";

export interface Input {
  x: number;
  y: number;
  cast: number | null;
}
export type Attack = "cleave" | "slam" | "charge" | "shot" | "rush";
export interface Enemy extends Point {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  radius: number;
  phase: number;
  angle: number;
  state: "spawn" | "walk" | "windup" | "dash" | "recover";
  until: number;
  action: Attack | null;
  ready: number;
  cooldowns: Record<string, number>;
  contact: number;
  slowUntil: number;
  damageScale: number;
}
export interface Projectile extends Point {
  id: number;
  angle: number;
  speed: number;
  remaining: number;
  friendly: boolean;
  damage: number;
  hit: Set<number>;
}
export interface Loot extends Point {
  id: number;
  type: "gear" | "book" | "heal";
  gear?: Equipment;
  book?: SkillId;
}
export interface Effect extends Point {
  type: "hit" | "slash" | "ring" | "dash" | "level" | "message" | "bump";
  source?: "player" | "enemy";
  targetId?: number;
  halfAngle?: number;
  heavy?: boolean;
  value?: number;
  angle?: number;
  radius?: number;
  color?: number;
  text?: string;
}
export interface Result {
  victory: boolean;
  abandoned: boolean;
  time: number;
  kills: number;
  xp: number;
  gear: Equipment[];
  books: SkillId[];
}

export class Battle {
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly loot: Loot[] = [];
  readonly events: Effect[] = [];
  readonly seed: number;
  readonly difficulty: number;
  readonly profile: Profile;
  readonly player = {
    x: 0,
    y: 0,
    angle: Math.PI / 2,
    hp: 100,
    maxHp: 100,
    invulnerableUntil: 0,
    dashUntil: 0,
    dashAngle: 0,
  };
  time = 0;
  paused = false;
  result: Result | null = null;
  bossCount = 0;
  kills = 0;
  totalXp = 0;
  cooldowns: Partial<Record<SkillId, number>> = {};
  domainUntil = 0;
  stormUntil = 0;
  stormNext = 0;
  gainedGear: Equipment[] = [];
  gainedBooks: SkillId[] = [];
  onProgress: () => void = () => {};
  private baseStats: Stats;
  private rng: () => number;
  private nextId = 1;
  private spawnBudget = 0;
  private attackReady = 0;
  private heavy: { at: number; angle: number } | null = null;
  private dashHit = new Set<number>();
  private bossAttackReady = 0;
  private bumpReady = 0;
  private grid = new SpatialHash<Enemy>(2);
  constructor(profile: Profile, difficulty: number, seed: number) {
    this.profile = profile;
    this.difficulty = difficulty;
    this.seed = seed;
    this.rng = seededRandom(seed);
    this.baseStats = stats(profile);
    this.player.hp = this.player.maxHp = this.baseStats.hp;
  }
  get attack() {
    return this.baseStats.attack * (this.domainUntil > this.time ? 1.75 : 1);
  }
  get haste() {
    return Math.min(
      1,
      this.baseStats.haste + (this.domainUntil > this.time ? 0.4 : 0),
    );
  }
  get bossAlive() {
    return this.enemies.filter((e) => e.kind === "boss" && e.hp > 0);
  }
  private notify(text: string) {
    this.events.push({
      type: "message",
      x: this.player.x,
      y: this.player.y,
      text,
    });
  }
  private positionOutside(radius: number): Point | null {
    for (let i = 0; i < 24; i++) {
      const angle = this.rng() * Math.PI * 2;
      const r =
        1 /
          Math.max(
            Math.abs(Math.cos(angle)) / 13.2,
            Math.abs(Math.sin(angle)) / 8,
          ) +
        this.rng() * 1.2;
      const p = {
        x: this.player.x + Math.cos(angle) * r,
        y: this.player.y + Math.sin(angle) * r,
      };
      if (
        clearPosition(p.x, p.y, radius, this.seed) &&
        this.enemies.every(
          (e) => Math.hypot(e.x - p.x, e.y - p.y) > e.radius + radius + 0.15,
        )
      )
        return p;
    }
    return null;
  }
  spawnEnemy(kind: EnemyKind, phase = 0, position?: Point): Enemy | null {
    const c = ENEMIES[kind],
      d = DIFFICULTIES[this.difficulty];
    let pos = position ?? this.positionOutside(c.radius);
    if (!pos && kind === "boss") {
      // Search wider clear corridors rather than silently dropping a scheduled boss.
      for (let r = 17; r < 40 && !pos; r += 2)
        for (let a = 0; a < 32 && !pos; a++) {
          const p = {
            x: this.player.x + Math.cos((a * Math.PI) / 16) * r,
            y: this.player.y + Math.sin((a * Math.PI) / 16) * r,
          };
          if (clearPosition(p.x, p.y, c.radius, this.seed)) pos = p;
        }
    }
    if (!pos) return null;
    const hp = c.hp * d.hp * (kind === "boss" ? BOSS_HP[phase] : 1);
    const e: Enemy = {
      ...pos,
      id: this.nextId++,
      kind,
      hp,
      maxHp: hp,
      radius: c.radius,
      phase,
      angle: 0,
      state: kind === "boss" ? "spawn" : "walk",
      until: this.time + 1.5,
      action: null,
      ready: this.time + 1,
      cooldowns: {},
      contact: -100,
      slowUntil: 0,
      damageScale: d.damage * (kind === "boss" ? BOSS_DAMAGE[phase] : 1),
    };
    this.enemies.push(e);
    if (kind === "boss")
      this.notify(
        phase === 5
          ? "最後的試煉 · 岩角守衛降臨"
          : `第 ${phase + 1} 波守衛出現`,
      );
    return e;
  }
  step(dt: number, input: Input) {
    if (this.paused || this.result) return;
    this.time += dt;
    this.grid.rebuild(this.enemies.filter((e) => e.hp > 0));
    this.schedule();
    const moving = Math.hypot(input.x, input.y) > 0;
    if (moving && this.player.dashUntil <= this.time && !this.heavy)
      this.player.angle = Math.atan2(input.y, input.x);
    if (input.cast !== null) this.cast(input.cast);
    if (this.heavy && this.time >= this.heavy.at) {
      this.strike(this.heavy.angle, 1.8, Math.PI / 6, 4);
      this.heavy = null;
    }
    if (this.player.dashUntil > this.time) {
      this.player.x += Math.cos(this.player.dashAngle) * 12 * dt;
      this.player.y += Math.sin(this.player.dashAngle) * 12 * dt;
      if (resolveTerrain(this.player, 0.35, this.seed)) {
        this.player.dashUntil = this.time;
        this.bump(this.player.dashAngle);
      }
      for (const e of this.grid.near(this.player.x, this.player.y, 1.5))
        if (
          e.hp > 0 &&
          !this.dashHit.has(e.id) &&
          Math.hypot(e.x - this.player.x, e.y - this.player.y) < e.radius + 0.7
        ) {
          this.dashHit.add(e.id);
          this.hitEnemy(e, this.attack * 1.5);
        }
    } else if (moving) {
      const length = Math.hypot(input.x, input.y);
      this.player.x += (input.x / length) * 4 * dt;
      this.player.y += (input.y / length) * 4 * dt;
      if (resolveTerrain(this.player, 0.35, this.seed))
        this.bump(this.player.angle);
      for (const e of this.grid.near(this.player.x, this.player.y, 1.6)) {
        if (e.hp <= 0 || e.state === "spawn") continue;
        const dx = this.player.x - e.x,
          dy = this.player.y - e.y,
          d = Math.hypot(dx, dy),
          r = 0.35 + e.radius;
        if (d < r) {
          this.bump(Math.atan2(-dy, -dx));
          this.player.x = e.x + (d ? dx / d : 1) * r;
          this.player.y = e.y + (d ? dy / d : 0) * r;
        }
      }
      resolveTerrain(this.player, 0.35, this.seed);
    }
    if (
      !this.heavy &&
      this.player.dashUntil <= this.time &&
      this.time >= this.attackReady
    ) {
      const nearest = this.nearest(1.8);
      if (nearest) {
        const angle = Math.atan2(
          nearest.y - this.player.y,
          nearest.x - this.player.x,
        );
        this.strike(angle, 1.8, Math.PI / 4, 1);
        this.attackReady = this.time + 0.8 / (1 + this.haste);
      }
    }
    while (
      this.stormNext > 0 &&
      this.stormNext <= this.time &&
      this.stormNext <= this.stormUntil + 0.0001
    ) {
      this.radial(3, 1, 0, 0xf8d464);
      this.stormNext += 0.5;
      if (this.stormNext > this.stormUntil + 0.0001) this.stormNext = 0;
    }
    for (const e of this.enemies) if (e.hp > 0) this.updateEnemy(e, dt);
    this.updateProjectiles(dt);
    if (this.player.hp > 0) this.pickup();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (
        e.hp <= 0 ||
        (e.kind !== "boss" &&
          Math.hypot(e.x - this.player.x, e.y - this.player.y) > 36)
      )
        this.enemies.splice(i, 1);
    }
    if (this.bossCount === 6 && !this.bossAlive.length) this.finish(true);
    else if (this.player.hp <= 0) this.finish(false);
  }
  private schedule() {
    while (this.bossCount < 6 && this.time >= (this.bossCount + 1) * 20) {
      const phase = this.bossCount;
      if (phase === 5) {
        for (let i = this.enemies.length - 1; i >= 0; i--)
          if (this.enemies[i].kind !== "boss") this.enemies.splice(i, 1);
        for (let i = this.projectiles.length - 1; i >= 0; i--)
          if (!this.projectiles[i].friendly) this.projectiles.splice(i, 1);
      }
      if (this.spawnEnemy("boss", phase)) this.bossCount++;
      else break;
    }
    if (this.time >= 120) return;
    // The fixed-step caller advances the budget below; no spawn debt is kept at the cap.
  }
  advance(dt: number, input: Input) {
    if (this.paused || this.result) return;
    if (this.time < 120) {
      const w = WAVES[Math.min(5, Math.floor(this.time / 20))];
      this.spawnBudget += w.rate * DIFFICULTIES[this.difficulty].spawn * dt;
      while (this.spawnBudget >= 1) {
        this.spawnBudget--;
        if (
          this.enemies.filter((e) => e.kind !== "boss" && e.hp > 0).length >=
          200
        ) {
          this.spawnBudget = 0;
          break;
        }
        const roll = this.rng();
        this.spawnEnemy(
          roll < w.weights[0]
            ? "chaser"
            : roll < w.weights[0] + w.weights[1]
              ? "runner"
              : "ranger",
        );
      }
    }
    this.step(dt, input);
  }
  nearest(range: number): Enemy | null {
    let best: Enemy | null = null,
      distance = Infinity;
    for (const e of this.grid.near(this.player.x, this.player.y, range + 1)) {
      if (e.hp <= 0 || e.state === "spawn") continue;
      const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (d <= range + e.radius && d < distance) {
        best = e;
        distance = d;
      }
    }
    return best;
  }
  cast(slot: number): boolean {
    const id = this.profile.loadout[slot];
    if (
      !id ||
      !this.profile.learned.includes(id) ||
      (this.cooldowns[id] ?? 0) > this.time ||
      this.player.dashUntil > this.time ||
      this.heavy
    )
      return false;
    const range = id === "wave" ? 8 : id === "quake" ? 4 : 1.8;
    const target = this.nearest(range);
    const angle = target
      ? Math.atan2(target.y - this.player.y, target.x - this.player.x)
      : this.player.angle;
    this.cooldowns[id] = this.time + SKILLS[id].cooldown;
    if (id === "whirl") this.radial(2.4, 2.5, 0, 0xc4f6d7);
    if (id === "dash") {
      this.player.dashAngle = this.player.angle;
      this.player.dashUntil = this.time + 0.25;
      this.dashHit.clear();
      this.events.push({
        type: "dash",
        ...this.player,
        angle: this.player.angle,
      });
    }
    if (id === "cleave") this.heavy = { at: this.time + 0.35, angle };
    if (id === "wave")
      this.projectiles.push({
        id: this.nextId++,
        ...this.player,
        angle,
        speed: 12,
        remaining: 8 / 12,
        friendly: true,
        damage: 3,
        hit: new Set(),
      });
    if (id === "quake") {
      this.strike(angle, 4, Math.PI / 4, 4.5, 3, 0xc1a2ed);
    }
    if (id === "storm") {
      this.stormUntil = this.time + 3;
      this.stormNext = this.time + 0.5;
    }
    if (id === "domain") {
      this.domainUntil = this.time + 6;
      this.events.push({
        type: "ring",
        ...this.player,
        radius: 2.2,
        color: 0xffc960,
      });
    }
    return true;
  }
  private strike(
    angle: number,
    range: number,
    halfAngle: number,
    multiplier: number,
    slow = 0,
    color = 0xffeaa2,
  ) {
    this.events.push({
      type: "slash",
      ...this.player,
      angle,
      radius: range,
      color,
      source: "player",
      halfAngle,
      heavy: multiplier >= 4,
    });
    for (const e of this.grid.near(this.player.x, this.player.y, range + 1))
      if (
        e.hp > 0 &&
        inArc(this.player, e, angle, range, halfAngle, e.radius)
      ) {
        this.hitEnemy(e, this.attack * multiplier);
        if (slow) e.slowUntil = this.time + slow;
      }
  }
  private radial(
    range: number,
    multiplier: number,
    slow = 0,
    color = 0xffeaa2,
  ) {
    this.events.push({
      type: "ring",
      ...this.player,
      radius: range,
      color,
      source: "player",
    });
    for (const e of this.grid.near(this.player.x, this.player.y, range + 1))
      if (
        e.hp > 0 &&
        Math.hypot(e.x - this.player.x, e.y - this.player.y) <= range + e.radius
      ) {
        this.hitEnemy(e, this.attack * multiplier);
        if (slow) e.slowUntil = this.time + slow;
      }
  }
  private hitEnemy(e: Enemy, raw: number) {
    if (e.hp <= 0 || e.state === "spawn") return;
    const amount = Math.max(1, Math.round(raw));
    e.hp -= amount;
    this.events.push({
      type: "hit",
      x: e.x,
      y: e.y,
      value: amount,
      color: 0xfff0b3,
      targetId: e.id,
      angle: Math.atan2(e.y - this.player.y, e.x - this.player.x),
      heavy: amount >= this.attack * 3,
    });
    if (e.hp <= 0) this.kill(e);
  }
  private bump(angle: number) {
    if (this.time < this.bumpReady) return;
    this.bumpReady = this.time + 0.18;
    this.events.push({
      type: "bump",
      x: this.player.x + Math.cos(angle) * 0.35,
      y: this.player.y + Math.sin(angle) * 0.35,
      angle,
      color: 0xe9dfbd,
    });
  }
  private hurt(raw: number, from?: Point) {
    if (
      this.player.hp <= 0 ||
      this.player.dashUntil > this.time ||
      this.player.invulnerableUntil > this.time
    )
      return;
    const amount = damageAfterDefense(
      raw,
      this.baseStats.armor,
      this.domainUntil > this.time,
    );
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.player.invulnerableUntil = this.time + 0.4;
    this.events.push({
      type: "hit",
      ...this.player,
      value: -amount,
      color: 0xf7756b,
      targetId: 0,
      angle: from
        ? Math.atan2(this.player.y - from.y, this.player.x - from.x)
        : this.player.angle + Math.PI,
    });
  }
  private kill(e: Enemy) {
    this.kills++;
    const xp = Math.floor(
      (e.kind === "boss" ? BOSS_XP[e.phase] : ENEMIES[e.kind].xp) *
        DIFFICULTIES[this.difficulty].xp,
    );
    if (this.profile.level < 20) this.totalXp += xp;
    const levels = addXp(this.profile, xp);
    if (levels) {
      this.baseStats = stats(this.profile);
      this.player.maxHp = this.baseStats.hp;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 5 * levels);
      this.events.push({
        type: "level",
        ...this.player,
        text: `LEVEL ${this.profile.level}`,
      });
    }
    if (e.kind === "boss") {
      this.dropGear(e, e.phase === 5 ? 2 : undefined);
      if (e.phase === 5) this.dropGear({ x: e.x + 0.55, y: e.y + 0.35 });
      if (e.phase === 0 && !this.profile.obtained.includes("dash"))
        this.dropBook(e, "dash");
      const chance = e.phase === 5 ? [0.3, 0.4, 0.5][this.difficulty] : 0.03;
      if (this.rng() < chance) {
        const choices: SkillId[] =
          e.phase === 5
            ? this.difficulty === 0
              ? ["cleave", "wave", "quake"]
              : this.difficulty === 1
                ? ["cleave", "wave", "quake", "storm"]
                : ["cleave", "wave", "quake", "storm", "domain"]
            : ["cleave", "wave"];
        const weights =
          e.phase !== 5
            ? [0.5, 0.5]
            : this.difficulty === 0
              ? [0.2, 0.4, 0.4]
              : this.difficulty === 1
                ? [0.1, 0.2, 0.4, 0.3]
                : [0.1, 0.1, 0.3, 0.4, 0.1];
        let roll = this.rng(),
          chosen = choices[choices.length - 1];
        for (let i = 0; i < weights.length; i++) {
          roll -= weights[i];
          if (roll < 0) {
            chosen = choices[i];
            break;
          }
        }
        this.dropBook({ x: e.x - 0.6, y: e.y }, chosen);
      }
    } else {
      if (this.rng() < 0.02) this.dropGear(e, undefined, true);
      if (this.rng() < 0.05)
        this.loot.push({ id: this.nextId++, x: e.x, y: e.y, type: "heal" });
    }
    this.onProgress();
  }
  private dropGear(p: Point, force?: 0 | 1 | 2, normal = false) {
    const d = DIFFICULTIES[this.difficulty],
      roll = this.rng();
    const quality =
      force ??
      (normal
        ? roll < 0.8
          ? 0
          : roll < 0.98
            ? 1
            : 2
        : roll < 0.2
          ? 0
          : roll < 0.85
            ? 1
            : 2);
    this.loot.push({
      id: this.nextId++,
      x: p.x,
      y: p.y,
      type: "gear",
      gear: generateEquipment(
        randInt(d.min, d.max, this.rng),
        quality,
        this.rng,
      ),
    });
  }
  private dropBook(p: Point, book: SkillId) {
    this.loot.push({ id: this.nextId++, x: p.x, y: p.y, type: "book", book });
  }
  private collect(l: Loot) {
    if (l.gear) {
      if (!this.profile.equipment.some((e) => e.id === l.gear!.id)) {
        this.profile.equipment.push(l.gear);
        this.gainedGear.push(l.gear);
        this.notify(`取得 ${l.gear.name}`);
      }
    }
    if (l.book) {
      acquireBook(this.profile, l.book);
      this.gainedBooks.push(l.book);
      this.notify(`取得技能書 · ${SKILLS[l.book].name}`);
    }
    if (l.type === "heal") {
      const heal = Math.min(
        this.player.maxHp - this.player.hp,
        this.player.maxHp * 0.2,
      );
      this.player.hp += heal;
      this.events.push({
        type: "hit",
        ...this.player,
        value: Math.round(heal),
        color: 0x83e7a2,
      });
    }
    this.onProgress();
  }
  private pickup() {
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      if (
        Math.hypot(l.x - this.player.x, l.y - this.player.y) >
        (l.type === "heal" ? 1 : 1.5)
      )
        continue;
      if (l.type === "heal" && this.player.hp >= this.player.maxHp) continue;
      this.collect(l);
      this.loot.splice(i, 1);
    }
  }
  finish(victory: boolean, abandoned = false) {
    if (this.result) return;
    if (victory) {
      for (const l of this.loot) if (l.type !== "heal") this.collect(l);
      this.gainedBooks.push(...finishClear(this.profile, this.difficulty));
    }
    this.loot.length = 0;
    this.result = {
      victory,
      abandoned,
      time: this.time,
      kills: this.kills,
      xp: this.totalXp,
      gear: [...this.gainedGear],
      books: [...this.gainedBooks],
    };
    this.onProgress();
  }
  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.remaining -= dt;
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;
      if (p.remaining <= 0 || !clearPosition(p.x, p.y, 0.13, this.seed)) {
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.friendly) {
        for (const e of this.grid.near(p.x, p.y, 1.6))
          if (
            e.hp > 0 &&
            !p.hit.has(e.id) &&
            Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 0.5
          ) {
            p.hit.add(e.id);
            this.hitEnemy(e, this.attack * p.damage);
          }
      } else if (Math.hypot(p.x - this.player.x, p.y - this.player.y) < 0.5) {
        this.hurt(p.damage, p);
        this.projectiles.splice(i, 1);
      }
    }
  }
  private moveEnemy(
    e: Enemy,
    angle: number,
    speed: number,
    dt: number,
    steer = true,
  ) {
    if (steer) {
      for (const o of nearbyObstacles(e.x, e.y, this.seed)) {
        const dx = o.x - e.x,
          dy = o.y - e.y,
          d = Math.hypot(dx, dy);
        if (
          d < o.radius + e.radius + 1.4 &&
          dx * Math.cos(angle) + dy * Math.sin(angle) > 0
        ) {
          const cross = Math.cos(angle) * dy - Math.sin(angle) * dx;
          angle += (cross >= 0 ? -1 : 1) * 0.8;
          break;
        }
      }
    }
    e.x += Math.cos(angle) * speed * dt;
    e.y += Math.sin(angle) * speed * dt;
    const blocked = resolveTerrain(e, e.radius, this.seed);
    if (steer) {
      for (const other of this.grid.near(e.x, e.y, 2)) {
        if (other.id === e.id || other.hp <= 0 || other.state === "spawn")
          continue;
        const dx = e.x - other.x,
          dy = e.y - other.y,
          d = Math.hypot(dx, dy),
          r = (e.radius + other.radius) * 0.9;
        if (d < r && d > 0.001) {
          const push = Math.min(0.04, (r - d) * 0.2);
          e.x += (dx / d) * push;
          e.y += (dy / d) * push;
        }
      }
      resolveTerrain(e, e.radius, this.seed);
    }
    return blocked;
  }
  private updateEnemy(e: Enemy, dt: number) {
    const p = this.player,
      dx = p.x - e.x,
      dy = p.y - e.y,
      dist = Math.hypot(dx, dy),
      toward = Math.atan2(dy, dx);
    if (e.state === "spawn") {
      if (this.time >= e.until) e.state = "walk";
      return;
    }
    if (e.state === "windup") {
      if (e.action === "rush") e.angle = toward;
      if (this.time >= e.until) {
        if (e.action === "charge" || e.action === "rush") {
          e.state = "dash";
          e.until = this.time + (e.action === "charge" ? 0.75 : 1);
        } else {
          if (e.action === "shot")
            this.projectiles.push({
              id: this.nextId++,
              x: e.x,
              y: e.y,
              angle: e.angle,
              speed: 7,
              remaining: 2,
              friendly: false,
              damage: 10 * e.damageScale,
              hit: new Set(),
            });
          if (e.action === "cleave") {
            this.events.push({
              type: "slash",
              x: e.x,
              y: e.y,
              angle: e.angle,
              radius: 2.6,
              color: 0xf47c65,
            });
            if (inArc(e, p, e.angle, 2.6, Math.PI / 3, 0.35))
              this.hurt(18 * e.damageScale, e);
          }
          if (e.action === "slam") {
            this.events.push({
              type: "ring",
              x: e.x,
              y: e.y,
              radius: 3,
              color: 0xf47c65,
            });
            if (dist < 3.35) this.hurt(24 * e.damageScale, e);
          }
          e.state = "recover";
          e.until = this.time + 0.5;
        }
      }
      return;
    }
    if (e.state === "dash") {
      const blocked = this.moveEnemy(
        e,
        e.angle,
        e.action === "charge" ? 8 : 6,
        dt,
        false,
      );
      if (
        Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 0.4 &&
        this.time - e.contact >= 1
      ) {
        this.hurt((e.action === "charge" ? 15 : 6) * e.damageScale, e);
        e.contact = this.time;
      }
      if (blocked || this.time >= e.until) {
        e.state = "recover";
        e.until = this.time + 0.5;
      }
      return;
    }
    if (e.state === "recover") {
      if (this.time >= e.until) {
        e.state = "walk";
        e.action = null;
      }
      return;
    }
    let speed: number = ENEMIES[e.kind].speed;
    if (e.slowUntil > this.time) speed *= e.kind === "boss" ? 0.8 : 0.5;
    e.angle = toward;
    if (e.kind === "boss") {
      if (this.time >= this.bossAttackReady) {
        let action: Attack | null = null;
        if (dist < 3.4 && (e.cooldowns.slam ?? 0) <= this.time) action = "slam";
        else if (dist < 3 && (e.cooldowns.cleave ?? 0) <= this.time)
          action = "cleave";
        else if (dist < 8 && (e.cooldowns.charge ?? 0) <= this.time)
          action = "charge";
        if (action) {
          e.action = action;
          e.state = "windup";
          e.until =
            this.time +
            { slam: 1, cleave: 0.7, charge: 0.8 }[
              action as "slam" | "cleave" | "charge"
            ];
          e.cooldowns[action] =
            this.time +
            { slam: 8, cleave: 4, charge: 7 }[
              action as "slam" | "cleave" | "charge"
            ];
          this.bossAttackReady = this.time + 0.6;
          return;
        }
      }
      if (dist > e.radius + 0.5) this.moveEnemy(e, toward, speed, dt);
    } else if (e.kind === "runner" && dist < 7 && this.time >= e.ready) {
      e.action = "rush";
      e.state = "windup";
      e.until = this.time + 0.5;
      e.ready = this.time + 4;
    } else if (e.kind === "ranger") {
      if (dist < 8 && this.time >= e.ready) {
        e.action = "shot";
        e.state = "windup";
        e.until = this.time + 0.4;
        e.ready = this.time + 2;
      } else if (dist < 5.5) this.moveEnemy(e, toward + Math.PI, speed, dt);
      else if (dist > 7.5) this.moveEnemy(e, toward, speed, dt);
    } else if (dist > e.radius + 0.35) this.moveEnemy(e, toward, speed, dt);
    if (
      (e.kind === "chaser" || e.kind === "runner") &&
      Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 0.43 &&
      this.time - e.contact >= 1
    ) {
      this.hurt(ENEMIES[e.kind].damage * e.damageScale, e);
      e.contact = this.time;
    }
  }
}
