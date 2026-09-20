import Phaser from "phaser";
import { Battle } from "../domain/battle.ts";
import type { Effect, Enemy, Result } from "../domain/battle.ts";
import { UNIT } from "../domain/content.ts";
import { hash, obstacleAt } from "../domain/world.ts";
import { createArt } from "./art.ts";
import { GameAudio } from "./audio.ts";
import type { KeyBindings } from "../domain/input.ts";
import { drawImpact, drawSlash, drawSword } from "./combat-vfx.ts";

export interface GameHandlers {
  hud: (b: Battle, fps: number) => void;
  pause: (paused: boolean) => void;
  result: (result: Result) => void;
  message: (text: string) => void;
}
export class BattleScene extends Phaser.Scene {
  private model: Battle;
  private handlers: GameHandlers;
  private audio: GameAudio;
  private bindings: KeyBindings;
  private pressed = new Set<string>();
  private queued: number | null = null;
  private accumulator = 0;
  private hudTime = 0;
  private done = false;
  private recoil = new Map<
    number,
    { at: number; angle: number; heavy: boolean }
  >();
  private swing: {
    at: number;
    angle: number;
    duration: number;
    spin: boolean;
    heavy: boolean;
  } | null = null;
  private shakeUntil = 0;
  private actors = new Map<number, Phaser.GameObjects.Image>();
  private drops = new Map<number, Phaser.GameObjects.Image>();
  private chunks = new Map<string, Phaser.GameObjects.GameObject[]>();
  private hero!: Phaser.GameObjects.Image;
  private foreground!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private effects: (Effect & {
    life: number;
    max: number;
    textObject?: Phaser.GameObjects.Text;
  })[] = [];
  constructor(
    model: Battle,
    handlers: GameHandlers,
    audio: GameAudio,
    bindings: KeyBindings,
  ) {
    super("battle");
    this.model = model;
    this.handlers = handlers;
    this.audio = audio;
    this.bindings = bindings;
  }
  create() {
    createArt(this);
    this.cameras.main.setBackgroundColor("#99b975");
    this.hero = this.add.image(0, 0, "hero-down").setOrigin(0.5, 0.78);
    this.foreground = this.add.graphics().setDepth(200000);
    this.bars = this.add.graphics().setDepth(200001);
    const down = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      const codes = [
        ...Object.values(this.bindings),
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Numpad1",
        "Numpad2",
        "Escape",
      ];
      if (!codes.includes(event.code)) return;
      event.preventDefault();
      this.pressed.add(event.code);
      if (event.repeat) return;
      if (event.code === "Escape") {
        this.handlers.pause(!this.model.paused);
        this.pressed.clear();
        this.queued = null;
        return;
      }
      if (this.model.paused) return;
      if (event.code === this.bindings.skill1 || event.code === "Numpad1")
        this.queued = 0;
      else if (
        (event.code === this.bindings.skill2 || event.code === "Numpad2") &&
        this.queued === null
      )
        this.queued = 1;
    };
    const up = (event: KeyboardEvent) => {
      this.pressed.delete(event.code);
    };
    const hide = () => {
      if (document.hidden && !this.done) {
        this.pressed.clear();
        this.queued = null;
        this.handlers.pause(true);
      }
    };
    const blur = () => {
      this.pressed.clear();
      this.queued = null;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hide);
    this.events.once("shutdown", () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hide);
    });
    this.renderWorld();
    this.handlers.hud(this.model, 60);
  }
  update(_time: number, delta: number) {
    if (this.done) return;
    const dt = Math.min(delta / 1000, 0.1);
    if (!this.model.paused) {
      this.accumulator += dt;
      while (this.accumulator >= 1 / 60 && !this.model.result) {
        const k = this.bindings;
        const input = {
          x:
            Number(
              this.pressed.has(k.right) || this.pressed.has("ArrowRight"),
            ) -
            Number(this.pressed.has(k.left) || this.pressed.has("ArrowLeft")),
          y:
            Number(this.pressed.has(k.down) || this.pressed.has("ArrowDown")) -
            Number(this.pressed.has(k.up) || this.pressed.has("ArrowUp")),
          cast: this.queued,
        };
        this.queued = null;
        this.model.advance(1 / 60, input);
        this.accumulator -= 1 / 60;
      }
    } else {
      this.accumulator = 0;
      this.queued = null;
    }
    for (const event of this.model.events.splice(0)) this.addEffect(event);
    this.renderWorld();
    this.renderActors();
    this.renderEffects(this.model.paused ? 0 : dt);
    this.hudTime += dt;
    if (this.hudTime > 0.1) {
      this.handlers.hud(this.model, this.game.loop.actualFps);
      this.hudTime = 0;
    }
    if (this.model.result) {
      this.done = true;
      this.handlers.result(this.model.result);
    }
  }
  private renderWorld() {
    const p = this.model.player,
      cx = Math.floor(p.x / 32),
      cy = Math.floor(p.y / 32),
      wanted = new Set<string>();
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const x = cx + dx,
          y = cy + dy,
          key = `${x},${y}`;
        wanted.add(key);
        if (this.chunks.has(key)) continue;
        const objects: Phaser.GameObjects.GameObject[] = [];
        const g = this.add.graphics().setDepth(-1000000);
        objects.push(g);
        const left = x * 32 * UNIT,
          top = y * 32 * UNIT;
        g.fillStyle(0x99b975);
        g.fillRect(left, top, 32 * UNIT, 32 * UNIT);
        // Sparse patches, clover and flowers, all deterministically anchored to world coordinates.
        for (let i = 0; i < 180; i++) {
          const h = hash(x * 211 + i, y * 197 - i, this.model.seed);
          const px = left + (h % 2500),
            py = top + ((h >>> 10) % 2500);
          if (i < 18) {
            g.fillStyle(i % 2 ? 0x91b16d : 0xa4c37c, 0.55);
            g.fillEllipse(px, py, 100 + (h % 180), 40 + ((h >>> 8) % 100));
          } else {
            g.lineStyle(2, i % 3 ? 0x759f61 : 0xbacf90, 0.6);
            g.lineBetween(px - 4, py + 3, px, py - 5);
            g.lineBetween(px, py - 5, px + 3, py + 1);
            if (i % 9 === 0) {
              g.fillStyle(i % 2 ? 0xf7edc1 : 0xd9b9d2, 0.9);
              g.fillCircle(px, py - 7, 3);
            }
          }
        }
        for (let gx = x * 8; gx < x * 8 + 8; gx++)
          for (let gy = y * 8; gy < y * 8 + 8; gy++) {
            const o = obstacleAt(gx, gy, this.model.seed);
            if (!o) continue;
            const image = this.add
              .image(o.x * UNIT, o.y * UNIT, o.variant === 2 ? "rock" : "tree")
              .setOrigin(0.5, o.variant === 2 ? 0.8 : 0.88)
              .setDepth(10000 + o.y * UNIT);
            objects.push(image);
          }
        this.chunks.set(key, objects);
      }
    for (const [key, objects] of this.chunks)
      if (!wanted.has(key)) {
        objects.forEach((o) => o.destroy());
        this.chunks.delete(key);
      }
    const shake = Math.max(0, this.shakeUntil - this.model.time) / 0.16;
    this.cameras.main.centerOn(
      p.x * UNIT + Math.sin(this.model.time * 170) * 5 * shake,
      p.y * UNIT + Math.cos(this.model.time * 130) * 3 * shake,
    );
  }
  private renderActors() {
    const p = this.model.player,
      t = this.model.time;
    // Lethal hits can remove a target before a sprite is ever created.
    for (const [id, hit] of this.recoil)
      if (t - hit.at >= 0.2) this.recoil.delete(id);
    const swing =
      this.swing && t < this.swing.at + this.swing.duration ? this.swing : null;
    const angle = swing ? swing.angle : p.dashUntil > t ? p.dashAngle : p.angle;
    const swingPulse = swing
      ? Math.sin(Math.PI * Math.min(1, (t - swing.at) / swing.duration))
      : 0;
    const direction =
      Math.abs(Math.cos(angle)) > 0.7
        ? Math.cos(angle) > 0
          ? "right"
          : "left"
        : Math.sin(angle) > 0
          ? "down"
          : "up";
    this.hero
      .setTexture(`hero-${swing ? "swing-" : ""}${direction}`)
      .setPosition(
        p.x * UNIT + Math.cos(angle) * 7 * swingPulse,
        p.y * UNIT + Math.sin(angle) * 7 * swingPulse,
      )
      .setRotation(swingPulse * (Math.cos(angle) >= 0 ? 0.11 : -0.11))
      .setScale(1 + 0.06 * swingPulse, 1 - 0.04 * swingPulse)
      .setDepth(10000 + p.y * UNIT)
      .setAlpha(p.invulnerableUntil > t ? 0.5 + 0.5 * Math.sin(t * 45) : 1);
    this.hero.setTint(
      this.model.domainUntil > t
        ? 0xffdf91
        : p.dashUntil > t
          ? 0xb8e9ef
          : 0xffffff,
    );
    this.applyRecoil(this.hero, 0, t);
    const alive = new Set<number>();
    this.bars.clear();
    for (const e of this.model.enemies) {
      alive.add(e.id);
      let s = this.actors.get(e.id);
      if (!s) {
        s = this.add
          .image(e.x * UNIT, e.y * UNIT, e.kind)
          .setOrigin(0.5, e.kind === "boss" ? 0.85 : 0.8);
        this.actors.set(e.id, s);
      }
      const bob =
        e.state === "walk"
          ? Math.sin(t * (e.kind === "boss" ? 6 : 10) + e.id) * 2
          : 0;
      s.setPosition(e.x * UNIT, e.y * UNIT + bob)
        .setDepth(10000 + e.y * UNIT)
        .setFlipX(e.kind === "runner" && Math.cos(e.angle) < 0)
        .setAlpha(e.state === "spawn" ? 0.4 + 0.25 * Math.sin(t * 14) : 1);
      s.setTint(
        e.slowUntil > t
          ? 0xc6d9fb
          : e.phase === 5 && e.kind === "boss"
            ? 0xf4cd9d
            : 0xffffff,
      );
      s.setScale(1).setRotation(0);
      this.applyRecoil(s, e.id, t, e.kind === "boss" ? 0.35 : 1);
      if (e.hp < e.maxHp && e.state !== "spawn") {
        const w = e.kind === "boss" ? 100 : 44,
          x = e.x * UNIT - w / 2,
          y = e.y * UNIT - (e.kind === "boss" ? 174 : 83);
        this.bars.fillStyle(0x24483c, 0.65).fillRoundedRect(x, y, w, 6, 3);
        this.bars
          .fillStyle(e.kind === "boss" ? 0xeeb267 : 0xd9ead0)
          .fillRoundedRect(x, y, w * Math.max(0, e.hp / e.maxHp), 6, 3);
      }
    }
    for (const [id, s] of this.actors)
      if (!alive.has(id)) {
        s.destroy();
        this.actors.delete(id);
        this.recoil.delete(id);
      }
    const visible = new Set<number>();
    for (const l of this.model.loot) {
      if (Math.abs(l.x - p.x) > 15 || Math.abs(l.y - p.y) > 10) continue;
      visible.add(l.id);
      let s = this.drops.get(l.id);
      if (!s) {
        s = this.add
          .image(
            0,
            0,
            l.type === "gear"
              ? `gear-${l.gear!.quality}`
              : l.type === "book"
                ? "book"
                : "heal",
          )
          .setOrigin(0.5, 0.75);
        this.drops.set(l.id, s);
      }
      s.setPosition(
        l.x * UNIT,
        l.y * UNIT + Math.sin(t * 3 + l.id) * 3,
      ).setDepth(9000 + l.y * UNIT);
    }
    for (const [id, s] of this.drops)
      if (!visible.has(id)) {
        s.destroy();
        this.drops.delete(id);
      }
  }
  private applyRecoil(
    sprite: Phaser.GameObjects.Image,
    id: number,
    time: number,
    scale = 1,
  ) {
    const hit = this.recoil.get(id);
    if (!hit) return;
    const age = time - hit.at,
      duration = 0.2;
    if (age >= duration) {
      this.recoil.delete(id);
      return;
    }
    const pulse = Math.sin((Math.PI * age) / duration),
      distance = (hit.heavy ? 13 : 8) * pulse * scale;
    sprite.x += Math.cos(hit.angle) * distance;
    sprite.y += Math.sin(hit.angle) * distance;
    sprite.setScale(1 + 0.13 * pulse * scale, 1 - 0.11 * pulse * scale);
    if (age < 0.075) sprite.setTintFill(id === 0 ? 0xffb3a0 : 0xfff5d0);
  }
  private wedge(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    r: number,
    angle: number,
    half: number,
    color: number,
    alpha: number,
  ) {
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i <= 20; i++) {
      const a = angle - half + (2 * half * i) / 20;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
    g.fillPath();
    g.lineStyle(2, color, 0.8);
    g.strokePath();
  }
  private warning(e: Enemy) {
    const g = this.foreground,
      x = e.x * UNIT,
      y = e.y * UNIT;
    if (e.state === "spawn") {
      g.lineStyle(4, 0xe8c778, 0.8).strokeCircle(x, y, 80);
      g.lineStyle(2, 0xffe9ae, 0.5).strokeCircle(x, y, 100);
      return;
    }
    if (e.state !== "windup") return;
    if (e.action === "slam") {
      g.fillStyle(0xe37565, 0.2).fillCircle(x, y, 3 * UNIT);
      g.lineStyle(3, 0xeb7763, 0.9).strokeCircle(x, y, 3 * UNIT);
    } else if (e.action === "cleave")
      this.wedge(g, x, y, 2.6 * UNIT, e.angle, Math.PI / 3, 0xea7765, 0.25);
    else {
      const length = (e.action === "shot" ? 8 : 6) * UNIT,
        width = e.action === "charge" ? 60 : 25;
      const c = Math.cos(e.angle),
        s = Math.sin(e.angle);
      g.fillStyle(e.action === "shot" ? 0xb88fe0 : 0xee9367, 0.22);
      g.beginPath();
      g.moveTo(x - s * width, y + c * width);
      g.lineTo(x + c * length - s * width, y + s * length + c * width);
      g.lineTo(x + c * length + s * width, y + s * length - c * width);
      g.lineTo(x + s * width, y - c * width);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, 0xf4ba8a, 0.85);
      g.strokePath();
    }
  }
  private addEffect(e: Effect) {
    if (e.type === "message") {
      this.handlers.message(e.text!);
      return;
    }
    const max =
      e.type === "hit"
        ? 0.65
        : e.type === "level"
          ? 1.2
          : e.type === "slash"
            ? 0.3
            : 0.35;
    if (e.type === "hit" && e.targetId !== undefined) {
      this.recoil.set(e.targetId, {
        at: this.model.time,
        angle: e.angle ?? 0,
        heavy: !!e.heavy,
      });
      if (e.targetId === 0) this.shakeUntil = this.model.time + 0.16;
    }
    if ((e.type === "slash" || e.type === "ring") && e.source === "player") {
      this.swing = {
        at: this.model.time,
        angle: e.angle ?? this.model.player.angle,
        duration: e.type === "ring" ? 0.35 : 0.3,
        spin: e.type === "ring",
        heavy: !!e.heavy,
      };
    }
    let textObject: Phaser.GameObjects.Text | undefined;
    if (e.type === "hit" || e.type === "level") {
      if (this.effects.filter((f) => f.textObject).length < 80)
        textObject = this.add
          .text(e.x * UNIT, e.y * UNIT - 60, e.text ?? `${e.value}`, {
            fontFamily: "Trebuchet MS, Microsoft JhengHei, sans-serif",
            fontSize: e.type === "level" ? "32px" : "25px",
            fontStyle: "bold",
            color: `#${(e.color ?? 0xffedb3).toString(16).padStart(6, "0")}`,
            stroke: "#3a5144",
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setDepth(300000);
    }
    this.effects.push({ ...e, life: max, max, textObject });
    // Bound visual work without dropping any combat damage or loot events.
    while (this.effects.length > 160)
      this.effects.shift()?.textObject?.destroy();
    this.audio.play(
      e.type === "bump"
        ? "bump"
        : e.type === "slash" && e.source === "player"
          ? "swing"
          : e.type === "hit"
            ? e.value! < 0
              ? "hurt"
              : "hit"
            : e.type === "level"
              ? "level"
              : "skill",
    );
  }
  private renderEffects(dt: number) {
    const g = this.foreground;
    g.clear();
    for (const e of this.model.enemies) this.warning(e);
    const p = this.model.player;
    if (this.model.domainUntil > this.model.time) {
      g.lineStyle(3, 0xffdb7b, 0.8).strokeCircle(p.x * UNIT, p.y * UNIT, 85);
      g.lineStyle(2, 0xffefb4, 0.4).strokeCircle(p.x * UNIT, p.y * UNIT, 100);
    }
    for (const bullet of this.model.projectiles) {
      const x = bullet.x * UNIT,
        y = bullet.y * UNIT;
      g.lineStyle(
        bullet.friendly ? 22 : 9,
        bullet.friendly ? 0xe0f5f1 : 0xab80d4,
        0.9,
      );
      g.lineBetween(
        x - Math.cos(bullet.angle) * 25,
        y - Math.sin(bullet.angle) * 25,
        x + Math.cos(bullet.angle) * 12,
        y + Math.sin(bullet.angle) * 12,
      );
      g.fillStyle(0xfff6d9).fillCircle(x, y, bullet.friendly ? 5 : 4);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      const alpha = Math.max(0, e.life / e.max),
        progress = 1 - alpha,
        x = e.x * UNIT,
        y = e.y * UNIT;
      if (e.textObject) {
        e.textObject.setY(y - 60 - progress * 55).setAlpha(alpha);
      }
      if (e.type === "hit" || e.type === "bump") {
        drawImpact(
          g,
          x,
          y - (e.type === "hit" ? 30 : 0),
          e.max - e.life,
          e.angle ?? 0,
          e.color ?? 0xffdf92,
          !!e.heavy,
          e.type === "bump",
        );
      } else if (e.type === "ring" || e.type === "level") {
        const r = (e.radius ?? 2) * UNIT;
        g.lineStyle(10 * alpha, e.color ?? 0xfbe6a3, alpha).strokeCircle(
          x,
          y,
          r * (0.65 + progress * 0.35),
        );
        g.lineStyle(3, e.color ?? 0xfbe6a3, alpha * 0.5).strokeCircle(
          x,
          y,
          r * (0.4 + progress * 0.55),
        );
      } else if (e.type === "slash") {
        const r = (e.radius ?? 1.8) * UNIT;
        drawSlash(
          g,
          x,
          y - 18,
          r * 0.88,
          e.angle ?? 0,
          e.halfAngle ?? 1.05,
          progress,
          e.color ?? 0xffefb0,
          !!e.heavy,
        );
      } else if (e.type === "dash") {
        g.lineStyle(18 * alpha, 0xd4f7f1, alpha * 0.5);
        g.lineBetween(
          x,
          y,
          x + Math.cos(e.angle ?? 0) * 240 * progress,
          y + Math.sin(e.angle ?? 0) * 240 * progress,
        );
      }
      if (e.life <= 0) {
        e.textObject?.destroy();
        this.effects.splice(i, 1);
      }
    }
    if (this.swing) {
      const t = (this.model.time - this.swing.at) / this.swing.duration;
      if (t < 1) {
        const angle =
          this.swing.angle +
          (this.swing.spin
            ? t * Math.PI * 2
            : -1.05 + 2.1 * Math.min(1, t / 0.65));
        if (this.swing.spin)
          drawSlash(
            g,
            p.x * UNIT,
            p.y * UNIT - 18,
            110,
            angle,
            1.4,
            t,
            0xb8f6df,
          );
        drawSword(
          g,
          p.x * UNIT,
          p.y * UNIT - 20,
          angle,
          Math.min(1, (1 - t) * 5),
        );
      } else this.swing = null;
    }
    // Off-screen boss direction markers stay within the gameplay viewport.
    for (const boss of this.model.bossAlive) {
      const dx = boss.x - p.x,
        dy = boss.y - p.y;
      if (Math.abs(dx) < 11 && Math.abs(dy) < 5.7) continue;
      const f = Math.min(
        10.7 / Math.max(0.001, Math.abs(dx)),
        5.6 / Math.max(0.001, Math.abs(dy)),
      );
      const x = (p.x + dx * f) * UNIT,
        y = (p.y + dy * f) * UNIT,
        a = Math.atan2(dy, dx);
      g.fillStyle(boss.phase === 5 ? 0xef8c62 : 0xf0d07e);
      g.fillTriangle(
        x + Math.cos(a) * 18,
        y + Math.sin(a) * 18,
        x + Math.cos(a + 2.4) * 15,
        y + Math.sin(a + 2.4) * 15,
        x + Math.cos(a - 2.4) * 15,
        y + Math.sin(a - 2.4) * 15,
      );
    }
  }
}
