import Phaser from "phaser";
import "./style.css";
import {
  BOOK_BUY,
  BOOK_SELL,
  DIFFICULTIES,
  QUALITY_COLORS,
  QUALITY_NAMES,
  SKILLS,
  SKILL_IDS,
  SLOT_NAMES,
} from "./domain/content.ts";
import type { SkillId, Slot } from "./domain/content.ts";
import {
  acquireBook,
  buyPrice,
  equipmentLines,
  learnBook,
  sellPrice,
  stats,
  upgradeCost,
  xpRequired,
} from "./domain/profile.ts";
import type { Equipment, Profile } from "./domain/profile.ts";
import { Battle } from "./domain/battle.ts";
import type { Result } from "./domain/battle.ts";
import { LocalPreviewRepository } from "./infrastructure/local-profile.ts";
import { BattleScene } from "./game/scene.ts";
import { DEFAULT_KEYS, canBindKey, isKeyBindings } from "./domain/input.ts";
import type { KeyBindings } from "./domain/input.ts";
import { GameAudio } from "./game/audio.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
const repo = new LocalPreviewRepository(),
  audio = new GameAudio();
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const fmt = (n: number) => Number(n.toFixed(1)).toLocaleString("zh-TW");
let profile: Profile;
let tab = "camp",
  difficulty = 0,
  filter = "all",
  sort = "level",
  selected: string | null = null;
let game: Phaser.Game | null = null,
  battle: Battle | null = null,
  pauseSince = 0,
  pauseInterval = 0;
let keys: KeyBindings = { ...DEFAULT_KEYS };
let rebind: keyof KeyBindings | null = null;
let saveError = false;
try {
  const stored = JSON.parse(
    localStorage.getItem("gogo-rpg.development.settings") ?? "null",
  );
  if (isKeyBindings(stored?.keys)) keys = stored.keys;
  audio.enabled = stored?.sound !== false;
} catch {
  /* Defaults preserve a playable input configuration. */
}
const keyLabel = (code: string) =>
  code
    .replace("Key", "")
    .replace("Digit", "")
    .replace("Arrow", "方向 ")
    .replace("Numpad", "數字區 ");
function toast(text: string) {
  let tray = document.querySelector<HTMLDivElement>("#toast-tray");
  if (!tray) {
    tray = document.createElement("div");
    tray.id = "toast-tray";
    document.body.append(tray);
  }
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = text;
  tray.append(item);
  while (tray.children.length > 4) tray.firstElementChild?.remove();
  setTimeout(() => item.remove(), 3800);
}
function save() {
  try {
    repo.save(profile);
    saveError = false;
  } catch {
    if (!saveError)
      toast("本機儲存空間不足或不可用，目前進度尚未保存。請保持頁面開啟。");
    saveError = true;
  }
  const label = document.querySelector("#save-status");
  if (label) label.textContent = saveError ? "進度尚未保存" : "本機開發存檔";
}
function saveSettings() {
  try {
    localStorage.setItem(
      "gogo-rpg.development.settings",
      JSON.stringify({ keys, sound: audio.enabled }),
    );
  } catch {
    toast("設定無法保存，這次遊玩仍可使用。");
  }
}
function shell() {
  return `<header class="topbar"><a class="brand" href="/" aria-label="GOGO RPG 首頁"><span>GOGO<span class="brand-dot">✦</span></span><small>RPG</small></a><span class="header-divider"></span><span class="world-name">晨風原野 <span>冒險者營地</span></span><div class="top-right"><span class="local-badge"><i></i><span id="save-status">${saveError ? "進度尚未保存" : "本機開發存檔"}</span></span><span class="gold"><b>◆</b> ${profile.gold.toLocaleString()}</span><button class="avatar" data-action="tab" data-tab="settings" title="設定">旅</button></div></header>`;
}
const tabs = [
  ["camp", "⌂", "冒險營地"],
  ["inventory", "▣", "角色與背包"],
  ["skills", "✧", "技能手冊"],
  ["shop", "♧", "旅行商店"],
  ["forge", "⚒", "裝備工坊"],
  ["settings", "⚙", "設定"],
];
function gearIcon(e: Equipment) {
  return e.slot === "sword" ? "⚔" : e.slot === "armor" ? "♜" : "◈";
}
function itemCard(e: Equipment, action = "select", extra = "") {
  const worn = Object.values(profile.equipped).includes(e.id);
  return `<button class="item-card ${selected === e.id ? "selected" : ""}" data-action="${action}" data-id="${e.id}" style="--rarity:${QUALITY_COLORS[e.quality]}"><span class="item-icon">${gearIcon(e)}</span><span class="item-copy"><strong>${esc(e.name)}${e.upgrade ? ` <em>+${e.upgrade}</em>` : ""}</strong><small>物品等級 ${e.level} · ${QUALITY_NAMES[e.quality]}${worn ? " · 穿戴中" : ""}${e.locked ? " · 已鎖定" : ""}</small><span>${equipmentLines(e).map(esc).join("　")}</span></span>${extra || '<span class="item-arrow">›</span>'}</button>`;
}
function camp() {
  const d = DIFFICULTIES[difficulty];
  return `<section class="welcome"><div><span class="eyebrow">A LITTLE COURAGE. A GREAT ADVENTURE.</span><h1>下一段冒險，<br><span>從這裡開始。</span></h1><p>磨亮你的劍，帶上新的招式。<br>晨風原野的古老守衛，正等待下一位挑戰者。</p></div><div class="welcome-note"><span>01</span> CHAPTER ONE</div></section>
    <section class="expedition-card"><div class="landscape"><img src="/art/camp.svg" alt="陽光下的草原、古代石門與冒險者長劍"/><div class="landscape-label"><span>THE WINDWORN MEADOWS</span><h2>晨風原野</h2><p>草木之間，古老的魔力再次甦醒。</p></div><span class="region-tag">✦ 開放式荒野</span></div><div class="expedition-controls"><div class="difficulty-tabs">${DIFFICULTIES.map((x, i) => `<button data-action="difficulty" data-level="${i}" class="${difficulty === i ? "active" : ""}" ${i > profile.unlocked ? "disabled" : ""}>${i > profile.unlocked ? "⌑ " : ""}${x.name}</button>`).join("")}</div><div class="expedition-facts"><div><small>主階段</small><strong>02:00 <span>＋決戰</span></strong></div><div><small>裝備等級</small><strong>${d.min}–${d.max}</strong></div><div><small>守衛挑戰</small><strong>5 <span>＋最終 Boss</span></strong></div></div><button class="primary embark" data-action="start">出發冒險 <span>↗</span></button><p class="micro">${[keys.up, keys.left, keys.down, keys.right].map(keyLabel).join(" / ")} 移動 · 自動普攻 · ${keyLabel(keys.skill1)} / ${keyLabel(keys.skill2)} 手動技能</p></div></section>
    <div class="bottom-cards"><article class="tip-card"><span class="tip-icon">✧</span><div><h3>讓每一次出發都有收穫</h3><p>即使挑戰失敗，已取得的經驗與拾取物仍會保留。</p></div></article><article class="tip-card"><span class="tip-icon gold-tone">♜</span><div><h3>你的第一個新招式</h3><p>${profile.obtained.includes("dash") ? "前往技能手冊，配置適合這次冒險的兩個技能。" : "擊敗第一隻守衛，取得衝刺斬技能書，再回營地學習。"}</p></div></article></div>`;
}
function inventory() {
  let items = profile.equipment.filter(
    (e) => filter === "all" || e.slot === filter,
  );
  items = items.sort((a, b) =>
    sort === "quality"
      ? b.quality - a.quality || b.level - a.level
      : b.level - a.level || b.quality - a.quality,
  );
  const e = items.find((x) => x.id === selected) ?? items[0];
  if (e) selected = e.id;
  const wearing = e
    ? profile.equipment.find((x) => x.id === profile.equipped[e.slot])
    : null;
  return `<div class="section-title"><div><span class="eyebrow">YOUR NEXT GREAT FIND</span><h1>角色與背包</h1><p>每一件戰利品，都可能成為下一次突破。</p></div><span class="count-pill">${profile.equipment.length} 件裝備 · 無容量限制</span></div><div class="inventory-layout"><section class="paper-panel"><div class="filters"><select aria-label="裝備部位" id="item-filter"><option value="all">所有部位</option>${Object.entries(
    SLOT_NAMES,
  )
    .map(
      ([k, n]) =>
        `<option value="${k}" ${filter === k ? "selected" : ""}>${n}</option>`,
    )
    .join(
      "",
    )}</select><select aria-label="排序" id="item-sort"><option value="level">物品等級優先</option><option value="quality" ${sort === "quality" ? "selected" : ""}>品質優先</option></select></div><div class="item-list">${items.map((x) => itemCard(x)).join("") || '<p class="empty">這個部位還沒有裝備，出發尋找戰利品吧。</p>'}</div></section><section class="paper-panel detail">${
    e
      ? `<span class="eyebrow">${QUALITY_NAMES[e.quality]} · ${SLOT_NAMES[e.slot]}</span><div class="detail-icon" style="color:${QUALITY_COLORS[e.quality]}">${gearIcon(e)}</div><h2>${esc(e.name)} ${e.upgrade ? `+${e.upgrade}` : ""}</h2><p>物品等級 ${e.level}</p><div class="stat-lines">${equipmentLines(
          e,
        )
          .map((s) => `<div>${esc(s)}</div>`)
          .join(
            "",
          )}</div>${wearing && wearing.id !== e.id ? `<div class="comparison"><small>目前穿戴：${esc(wearing.name)}</small><p>${equipmentLines(wearing).map(esc).join(" · ")}</p></div>` : ""}<button class="primary full" data-action="equip" data-id="${e.id}" ${wearing?.id === e.id ? "disabled" : ""}>${wearing?.id === e.id ? "已穿戴" : "穿戴裝備"}</button><div class="button-pair"><button class="secondary" data-action="lock" data-id="${e.id}">${e.locked ? "解除鎖定" : "鎖定裝備"}</button><button class="secondary" data-action="sell" data-id="${e.id}" ${e.starter || e.locked || wearing?.id === e.id ? "disabled" : ""}>出售 ◆ ${sellPrice(e)}</button></div>${wearing?.id === e.id && e.slot !== "sword" ? `<button class="text-button" data-action="unequip" data-id="${e.id}">卸下裝備</button>` : ""}<small class="micro">已穿戴、已鎖定與初始裝備不能出售。</small>`
      : "<p>選擇一件裝備查看。</p>"
  }</section></div>`;
}
function skills() {
  return `<div class="section-title"><div><span class="eyebrow">MAKE IT YOUR OWN</span><h1>技能手冊</h1><p>技能永久習得，選擇兩招，找到你的戰鬥節奏。</p></div><span class="count-pill">已學會 ${profile.learned.length} / 7</span></div><div class="loadout-row">${profile.loadout.map((id, i) => `<div class="loadout"><kbd>${i + 1}</kbd><span class="skill-glyph" style="color:${id ? SKILLS[id].color : "#abb6a4"}">${id ? SKILLS[id].icon : "＋"}</span><div><small>技能格 ${i + 1} · 右側數字鍵亦可</small><strong>${id ? SKILLS[id].name : "尚未配置技能"}</strong></div></div>`).join("")}</div><div class="skill-grid">${SKILL_IDS.map(
    (id) => {
      const s = SKILLS[id],
        known = profile.learned.includes(id),
        book = profile.books[id] ?? 0;
      const assigned = profile.loadout.indexOf(id);
      return `<article class="skill-card ${known ? "known" : ""}" style="--skill-color:${s.color}"><div class="skill-card-top"><span class="skill-glyph">${s.icon}</span><span class="tier">${s.tier}</span></div><h3>${s.name}</h3><p>${s.description}</p><small>冷卻 ${s.cooldown} 秒 · 劍系</small><div class="skill-actions">${known ? `<button class="secondary" data-action="assign" data-id="${id}" data-slot="0" ${assigned === 0 ? "disabled" : ""}>${assigned === 0 ? "已配置 1" : "放入 1"}</button><button class="secondary" data-action="assign" data-id="${id}" data-slot="1" ${assigned === 1 ? "disabled" : ""}>${assigned === 1 ? "已配置 2" : "放入 2"}</button>` : book ? `<button class="primary full" data-action="learn" data-id="${id}">使用技能書學習</button>` : `<span class="locked-label">${id === "dash" ? "第一隻守衛保底掉落" : id === "cleave" || id === "wave" ? "商店購買或 Boss 掉落" : id === "quake" ? `普通以上通關保底 ${Math.min(10, profile.clears[0])}/10` : id === "storm" ? `困難以上通關保底 ${Math.min(15, profile.clears[1])}/15` : `惡夢通關保底 ${Math.min(20, profile.clears[2])}/20`}</span>`}</div>${book ? `<div class="book-row">持有技能書 ×${book}<button class="text-button" data-action="sell-book" data-id="${id}">出售 ◆ ${BOOK_SELL[id]}</button></div>` : ""}</article>`;
    },
  ).join("")}</div>`;
}
function shop() {
  return `<div class="section-title"><div><span class="eyebrow">A TRAVELER'S TREASURES</span><h1>旅行商店</h1><p>用旅途中的收穫，換一點下一次出發的底氣。</p></div><span class="count-pill">通關後刷新裝備</span></div><section class="paper-panel"><h3>今日裝備 <small>等級 ${DIFFICULTIES[profile.unlocked].min}–${DIFFICULTIES[profile.unlocked].max}</small></h3><div class="shop-list">${profile.shop.map((e) => `<div class="shop-row">${itemCard(e, "inspect-shop", `<span class="price">◆ ${buyPrice(e)}</span>`)}<button class="primary" data-action="buy" data-id="${e.id}" ${profile.purchased.includes(e.id) || profile.gold < buyPrice(e) ? "disabled" : ""}>${profile.purchased.includes(e.id) ? "已售出" : "購買"}</button></div>`).join("")}</div></section><section class="paper-panel book-shop"><h3>技能書 <small>學會後永久保留</small></h3><div class="book-shop-grid">${(
    [
      "cleave",
      "wave",
      ...(profile.obtained.includes("dash") ? ["dash"] : []),
    ] as SkillId[]
  )
    .map((id) => {
      const known = profile.learned.includes(id),
        held = (profile.books[id] ?? 0) > 0,
        price = BOOK_BUY[id as keyof typeof BOOK_BUY];
      return `<div class="book-offer"><span class="skill-glyph" style="color:${SKILLS[id].color}">${SKILLS[id].icon}</span><div><strong>${SKILLS[id].name}</strong><small>${id === "dash" ? "誤售購回" : SKILLS[id].tier} · 技能書</small></div><button class="secondary" data-action="buy-book" data-id="${id}" ${known || held || profile.gold < price ? "disabled" : ""}>${known ? "已學會" : held ? "已持有" : `◆ ${price}`}</button></div>`;
    })
    .join("")}</div></section>`;
}
function forge() {
  const e =
    profile.equipment.find((x) => x.id === selected) ?? profile.equipment[0];
  selected = e?.id ?? null;
  return `<div class="section-title"><div><span class="eyebrow">A BLADE WORTH KEEPING</span><h1>裝備工坊</h1><p>每次強化都必定成功。讓你的老夥伴，再往前一步。</p></div><span class="count-pill">最高 +5 · 不影響詞綴</span></div><div class="inventory-layout"><section class="paper-panel item-list">${profile.equipment.map((x) => itemCard(x)).join("")}</section><section class="paper-panel detail"><span class="eyebrow">UPGRADE YOUR GEAR</span><div class="detail-icon forge-icon">⚒</div><h2>${esc(e.name)}${e.upgrade ? ` +${e.upgrade}` : ""}</h2><div class="upgrade-preview"><span>+${e.upgrade}</span><span>→</span><strong>+${Math.min(5, e.upgrade + 1)}</strong></div><p>基礎屬性 ${fmt(e.base * (1 + 0.1 * e.upgrade))} → <b>${fmt(e.base * (1 + 0.1 * Math.min(5, e.upgrade + 1)))}</b></p><div class="stat-lines"><div>成功率 <b>100%</b></div><div>強化費用 <b>◆ ${e.upgrade === 5 ? "—" : upgradeCost(e)}</b></div></div><button class="primary full" data-action="upgrade" data-id="${e.id}" ${e.upgrade >= 5 || profile.gold < upgradeCost(e) ? "disabled" : ""}>${e.upgrade >= 5 ? "已達最高強化" : "確認強化"}</button><small class="micro">強化綁定此裝備，出售不退還投入金幣。</small></section></div>`;
}
function settings() {
  const names: Record<keyof KeyBindings, string> = {
    up: "向上",
    down: "向下",
    left: "向左",
    right: "向右",
    skill1: "技能格 1",
    skill2: "技能格 2",
  };
  return `<div class="section-title"><div><span class="eyebrow">YOUR ADVENTURE, YOUR WAY</span><h1>設定</h1><p>調整操作方式，準備好再出發。</p></div></div><section class="paper-panel"><h3>操作鍵位</h3><div class="key-grid">${(Object.keys(names) as (keyof KeyBindings)[]).map((k) => `<button class="key-setting ${rebind === k ? "listening" : ""}" data-action="rebind" data-key="${k}"><span>${names[k]}</span><kbd>${rebind === k ? "請按新按鍵" : keyLabel(keys[k])}</kbd></button>`).join("")}</div><p class="micro">方向鍵、右側數字鍵 1 / 2 與 Esc 始終保留。可設定字母、主鍵盤數字、空白鍵或 Shift；不可重複。</p><button class="secondary" data-action="reset-keys">還原預設鍵位</button></section><section class="paper-panel settings-row"><div><h3>戰鬥音效</h3><p>目前使用原創合成音效，正式配樂尚在後續製作階段。</p></div><button class="secondary" data-action="sound">${audio.enabled ? "已開啟 ♪" : "已靜音"}</button></section><section class="paper-panel local-notice"><h3>本機開發版本</h3><p>目前進度只保存在此瀏覽器。Google 登入與 Supabase 雲端尚未接通，此進度不會自動轉為正式雲端存檔。</p><button class="secondary" data-action="export">匯出本機進度備份</button></section>`;
}
function render() {
  const s = stats(profile);
  app.innerHTML = `${shell()}<div class="camp-layout"><aside class="sidebar"><div class="adventurer"><div class="portrait">⚔</div><span class="eyebrow">冒險者</span><h2>旅人</h2><span class="level-tag">LV. ${profile.level} · 劍系戰士</span><div class="small-xp"><i style="width:${profile.level === 20 ? 100 : (profile.xp / xpRequired(profile.level)) * 100}%"></i></div><small>${profile.level === 20 ? "已達最高等級" : `${profile.xp} / ${xpRequired(profile.level)} 經驗`}</small></div><nav>${tabs.map(([id, icon, label]) => `<button class="nav-item ${tab === id ? "active" : ""}" data-action="tab" data-tab="${id}"><span>${icon}</span>${label}${id === "skills" && Object.values(profile.books).some((n) => n! > 0) ? '<i class="nav-dot"></i>' : ""}</button>`).join("")}</nav><div class="sidebar-stats"><div><span>生命</span><strong>${fmt(s.hp)}</strong></div><div><span>攻擊</span><strong>${fmt(s.attack)}</strong></div><div><span>防禦</span><strong>${fmt(s.armor)}</strong></div><div><span>攻速加成</span><strong>${Math.round(s.haste * 100)}%</strong></div></div><div class="sidebar-footer">GOGO RPG <span>開發預覽 v0.1</span></div></aside><main class="main-content">${tab === "camp" ? camp() : tab === "inventory" ? inventory() : tab === "skills" ? skills() : tab === "shop" ? shop() : tab === "forge" ? forge() : settings()}</main></div>`;
}
function startBattle() {
  if (difficulty > profile.unlocked) return;
  audio.unlock();
  battle = new Battle(
    profile,
    difficulty,
    crypto.getRandomValues(new Uint32Array(1))[0],
  );
  battle.onProgress = save;
  app.innerHTML = `${shell()}<main class="battle-shell"><div id="battle-frame"><div id="game-canvas"></div><div class="battle-top"><div class="battle-place"><span class="eyebrow">CHAPTER 01</span><strong>晨風原野 <small>${DIFFICULTIES[difficulty].name}</small></strong></div><div class="clock"><span id="phase-label">下一位守衛</span><strong id="battle-clock">00:20</strong><small id="elapsed-clock">00:00 / 02:00</small></div><button class="pause-button" data-action="pause">Ⅱ <kbd>Esc</kbd></button></div><div id="boss-bars"></div><div class="battle-bottom"><div class="health-panel"><div class="health-label"><strong>旅人 <span id="battle-level">LV. ${profile.level}</span></strong><span id="health-label"></span></div><div class="health-track"><i id="health-fill"></i></div><div class="xp-track"><i id="xp-fill"></i></div><div class="battle-counters"><span id="kills-label">0 擊殺</span><span id="loot-label">0 件戰利品</span></div></div><div class="skill-bar">${profile.loadout.map((id, i) => `<div class="battle-skill ${id ? "" : "empty-slot"}" id="skill-${i}" style="--skill-color:${id ? SKILLS[id].color : "#b7c2b6"}"><kbd>${keyLabel(keys[i === 0 ? "skill1" : "skill2"])}</kbd><span class="skill-glyph">${id ? SKILLS[id].icon : "＋"}</span><div><strong>${id ? SKILLS[id].name : "未配置"}</strong><small>${id ? "手動技能" : "回營地學習技能"}</small></div><span class="cooldown-number" id="cooldown-${i}"></span><i class="cooldown-shade" id="shade-${i}"></i></div>`).join("")}</div><div class="battle-help">${[keys.up, keys.left, keys.down, keys.right].map(keyLabel).join(" / ")} 移動 · 自動普攻<br><span id="performance">— FPS</span> · 本機開發版本</div></div><div id="modal-layer"></div></div></main>`;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-canvas",
    width: 1920,
    height: 1080,
    backgroundColor: "#99b975",
    antialias: true,
    roundPixels: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [
      new BattleScene(
        battle,
        { hud: updateHud, pause: setPause, result: showResult, message: toast },
        audio,
        keys,
      ),
    ],
    audio: { noAudio: true },
    banner: false,
  });
  pauseInterval = window.setInterval(() => {
    if (
      battle?.paused &&
      !battle.result &&
      pauseSince &&
      Date.now() - pauseSince >= 600000
    ) {
      battle.finish(false, true);
      toast("暫停已超過 10 分鐘，本場結束。");
    }
    const el = document.querySelector("#pause-countdown");
    if (el && pauseSince)
      el.textContent = `暫停剩餘 ${clock(Math.max(0, 600 - (Date.now() - pauseSince) / 1000))}`;
  }, 1000);
}
function clock(seconds: number) {
  const n = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
}
function updateHud(b: Battle, fps: number) {
  const text = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  const fill = (id: string, value: number) => {
    const el = document.getElementById(id);
    if (el) el.style.width = `${Math.max(0, Math.min(100, value))}%`;
  };
  text(
    "health-label",
    `${Math.ceil(b.player.hp)} / ${Math.ceil(b.player.maxHp)}`,
  );
  fill("health-fill", (b.player.hp / b.player.maxHp) * 100);
  fill(
    "xp-fill",
    profile.level === 20 ? 100 : (profile.xp / xpRequired(profile.level)) * 100,
  );
  text("battle-level", `LV. ${profile.level}`);
  text("kills-label", `${b.kills} 擊殺`);
  text("loot-label", `${b.gainedGear.length + b.gainedBooks.length} 件戰利品`);
  text("performance", `${Math.round(fps)} FPS`);
  text(
    "phase-label",
    b.time >= 120 ? `決戰 · 剩餘 ${b.bossAlive.length} 位守衛` : "下一位守衛",
  );
  text(
    "battle-clock",
    clock(
      b.time >= 120
        ? b.time - 120
        : (Math.floor(b.time / 20) + 1) * 20 - b.time,
    ),
  );
  text(
    "elapsed-clock",
    b.time >= 120 ? "擊敗所有守衛即可通關" : `${clock(b.time)} / 02:00`,
  );
  profile.loadout.forEach((id, i) => {
    const remaining = id ? Math.max(0, (b.cooldowns[id] ?? 0) - b.time) : 0;
    text(`cooldown-${i}`, remaining > 0 ? remaining.toFixed(1) : "");
    const el = document.getElementById(`shade-${i}`);
    if (el)
      el.style.height = id
        ? `${(remaining / SKILLS[id].cooldown) * 100}%`
        : "0";
  });
  const boss = document.querySelector("#boss-bars");
  if (boss)
    boss.innerHTML = b.bossAlive
      .map(
        (e) =>
          `<div class="boss-hud ${e.phase === 5 ? "final" : ""}"><span>${e.phase === 5 ? "最終守衛" : `守衛 ${e.phase + 1}`} <small>${Math.ceil(e.hp)} / ${Math.ceil(e.maxHp)}</small></span><div><i style="width:${(e.hp / e.maxHp) * 100}%"></i></div></div>`,
      )
      .join("");
}
function setPause(paused: boolean) {
  if (!battle || battle.result) return;
  if (paused === battle.paused) return;
  battle.paused = paused;
  const layer = document.querySelector("#modal-layer")!;
  if (paused) {
    pauseSince = Date.now();
    layer.innerHTML = `<div class="modal-shade"><section class="game-modal"><span class="modal-emblem">Ⅱ</span><span class="eyebrow">TAKE A BREATH</span><h2>休息一下，再出發。</h2><p>戰鬥與所有技能計時已暫停。</p><small id="pause-countdown">暫停剩餘 10:00</small><button class="primary full" data-action="resume">繼續冒險</button><button class="secondary full" data-action="abandon-prompt">放棄本場，返回營地</button></section></div>`;
  } else {
    pauseSince = 0;
    layer.innerHTML = "";
    audio.unlock();
  }
}
function showResult(result: Result) {
  save();
  clearInterval(pauseInterval);
  const layer = document.querySelector("#modal-layer")!;
  layer.innerHTML = `<div class="modal-shade"><section class="game-modal result-modal"><span class="modal-emblem">${result.victory ? "✦" : "⚔"}</span><span class="eyebrow">${result.victory ? "A JOURNEY WELL FOUGHT" : "EVERY JOURNEY COUNTS"}</span><h2>${result.victory ? "原野重歸寧靜。" : result.abandoned ? "整裝，再出發。" : "這次冒險，到此為止。"}</h2><p>${result.victory ? "所有守衛已擊敗，地面裝備與技能書已全部收取。" : "已取得經驗與拾取物保留，地面未拾取物品失去。"}</p><div class="result-stats"><div><strong>${result.kills}</strong><small>擊殺</small></div><div><strong>+${result.xp}</strong><small>經驗</small></div><div><strong>${result.gear.length + result.books.length}</strong><small>戰利品</small></div></div><div class="result-loot">${result.gear
    .slice(0, 5)
    .map(
      (e) =>
        `<span style="color:${QUALITY_COLORS[e.quality]}">${gearIcon(e)} ${esc(e.name)}</span>`,
    )
    .join(
      "",
    )}${result.books.map((id) => `<span style="color:${SKILLS[id].color}">✧ ${SKILLS[id].name}技能書</span>`).join("")}${result.gear.length > 5 ? `<span>另有 ${result.gear.length - 5} 件裝備</span>` : ""}</div><button class="primary full" data-action="return">返回營地 <span>→</span></button><small class="micro">本機開發進度 · ${saveError ? "尚未保存，請先匯出備份" : "已保存至此瀏覽器"}</small></section></div>`;
}
function returnCamp() {
  clearInterval(pauseInterval);
  game?.destroy(true);
  game = null;
  battle = null;
  pauseSince = 0;
  save();
  tab = "camp";
  render();
}
app.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-action]",
  );
  if (!button || button.hasAttribute("disabled")) return;
  const action = button.dataset.action,
    id = button.dataset.id;
  if (action === "pause") {
    setPause(true);
    return;
  }
  if (action === "resume") {
    setPause(false);
    return;
  }
  if (action === "return") {
    returnCamp();
    return;
  }
  if (action === "abandon-prompt") {
    document.querySelector("#modal-layer")!.innerHTML =
      `<div class="modal-shade"><section class="game-modal"><h2>返回營地？</h2><p>保留已取得的經驗與拾取物。地面剩餘物品與本次通關機會將失去。</p><button class="primary full" data-action="abandon">確認放棄本場</button><button class="secondary full" data-action="resume">繼續戰鬥</button></section></div>`;
    return;
  }
  if (action === "abandon") {
    battle?.finish(false, true);
    return;
  }
  if (battle) return;
  const item = profile.equipment.find((e) => e.id === id);
  if (action === "tab") {
    tab = button.dataset.tab!;
    rebind = null;
  }
  if (action === "difficulty") difficulty = Number(button.dataset.level);
  if (action === "start") {
    startBattle();
    return;
  }
  if (action === "select") selected = id!;
  if (action === "equip" && item) {
    profile.equipped[item.slot] = item.id;
    toast(`已穿戴 ${item.name}`);
  }
  if (action === "unequip" && item && item.slot !== "sword")
    profile.equipped[item.slot] = null;
  if (action === "lock" && item) item.locked = !item.locked;
  if (
    action === "sell" &&
    item &&
    !item.starter &&
    !item.locked &&
    !Object.values(profile.equipped).includes(item.id)
  ) {
    profile.gold += sellPrice(item);
    profile.equipment = profile.equipment.filter((e) => e.id !== id);
    selected = null;
    toast(`出售獲得 ${sellPrice(item)} 金幣`);
  }
  if (
    action === "upgrade" &&
    item &&
    item.upgrade < 5 &&
    profile.gold >= upgradeCost(item)
  ) {
    profile.gold -= upgradeCost(item);
    item.upgrade++;
    toast(`${item.name} 強化成功 +${item.upgrade}`);
    audio.unlock();
    audio.play("level");
  }
  if (action === "learn" && id && learnBook(profile, id as SkillId))
    toast(`已學會 ${SKILLS[id as SkillId].name}，請選擇技能格配置。`);
  if (action === "assign" && id && profile.learned.includes(id as SkillId)) {
    const slot = Number(button.dataset.slot),
      other = 1 - slot;
    if (profile.loadout[other] === id)
      profile.loadout[other] = profile.loadout[slot];
    profile.loadout[slot] = id as SkillId;
  }
  if (action === "sell-book" && id && (profile.books[id as SkillId] ?? 0) > 0) {
    profile.books[id as SkillId]!--;
    profile.gold += BOOK_SELL[id as SkillId] ?? 0;
    toast("技能書已出售");
  }
  if (action === "buy") {
    const offer = profile.shop.find((e) => e.id === id);
    if (
      offer &&
      !profile.purchased.includes(offer.id) &&
      profile.gold >= buyPrice(offer)
    ) {
      profile.gold -= buyPrice(offer);
      profile.equipment.push(structuredClone(offer));
      profile.purchased.push(offer.id);
      toast(`已購買 ${offer.name}`);
    }
  }
  if (action === "buy-book" && id) {
    const skill = id as keyof typeof BOOK_BUY,
      price = BOOK_BUY[skill];
    if (
      price &&
      !profile.learned.includes(skill) &&
      !profile.books[skill] &&
      profile.gold >= price &&
      (skill !== "dash" || profile.obtained.includes("dash"))
    ) {
      profile.gold -= price;
      acquireBook(profile, skill);
      toast(`取得 ${SKILLS[skill].name}技能書`);
    }
  }
  if (action === "inspect-shop") {
    const offer = profile.shop.find((e) => e.id === id);
    if (offer) toast(`${offer.name}：${equipmentLines(offer).join("、")}`);
  }
  if (action === "sound") {
    audio.enabled = !audio.enabled;
    if (audio.enabled) audio.unlock();
    saveSettings();
  }
  if (action === "rebind") rebind = button.dataset.key as keyof KeyBindings;
  if (action === "reset-keys") {
    keys = { ...DEFAULT_KEYS };
    rebind = null;
    saveSettings();
  }
  if (action === "export") {
    const blob = new Blob([JSON.stringify(profile, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "gogo-rpg-local-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  save();
  render();
});
app.addEventListener("change", (event) => {
  const input = event.target as HTMLSelectElement;
  if (input.id === "item-filter") filter = input.value;
  if (input.id === "item-sort") sort = input.value;
  render();
});
window.addEventListener(
  "keydown",
  (event) => {
    if (!rebind || battle) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === "Escape") {
      rebind = null;
      render();
      return;
    }
    if (
      !canBindKey(event.code) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      Object.entries(keys).some(([k, v]) => k !== rebind && v === event.code)
    ) {
      toast("此按鍵已被使用或保留，請選擇其他按鍵。");
      return;
    }
    keys[rebind] = event.code;
    rebind = null;
    saveSettings();
    render();
  },
  true,
);
try {
  profile = repo.load();
  difficulty = profile.unlocked;
  save();
  render();
} catch (error) {
  app.innerHTML = `<main class="recovery"><h1>存檔需要檢查</h1><p>${esc(error instanceof Error ? error.message : error)}</p><p>為保護進度，遊戲沒有建立新存檔。請保留此瀏覽器資料，再進行修復。</p></main>`;
}
