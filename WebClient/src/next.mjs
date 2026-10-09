import { clientStorage, flushStorage, transport, lifecycle, native, storageError, resetStorage, markStorageError, minimizeApp } from "./platform.mjs";
import { Client } from "./client.mjs";
import { hasSymbol, symbolName, upgradeInfo, maxUpgrade } from "./upgrades.mjs";
import { CASES, casePrice } from "./cases.mjs";
import { FRAMES, activeFrame, unlockedFrames, framedAvatar } from "./frames.mjs";
import { AVATARS, avatar } from "./avatars.mjs";
import { money, parseMoney } from "./money.mjs";
import { rarityStrip } from "./rarity.mjs";
import { TYPES, DIRECTED, BOOSTERS } from "./engine.mjs";
import { BASE, PRICES, STORAGE_KEY, freshProgress } from "./economy.mjs";
import { skinIcon } from "./skin-icons.mjs";
import { SKINS, SKIN_SYMBOLS, ownsSkin, skinsFor } from "./skins.mjs";
import { rankBadge } from "./rank-art.mjs";
import { RANKS } from "./profile.mjs";
import { LEVEL_NAMES } from "./history.mjs";
import { NEW_QUESTS, levelInfo, THRESHOLDS, levelThreshold } from "./progression.mjs";
import { accounts } from "./accounts.mjs";
import { boostVisuals, lightning } from "./boost-visuals.mjs";
import { animateShots, soundEnabled, toggleSound } from "./effects.mjs";
import { tutorialAdvice } from "./tutorial.mjs";
const app = document.querySelector("#app"), manager = safeManager(), storage = manager.storage;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function safeManager(){try{return accounts(clientStorage);}catch{markStorageError();const m=new Map();return accounts({getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)});}}
function readJSON(key,fallback){try{return JSON.parse(storage.getItem(key)||'null')??fallback;}catch{if(key==='symbols-session')markStorageError();return fallback;}}
let session = readJSON('symbols-session',null), legacy = freshProgress();
const savedProgress=readJSON(STORAGE_KEY,{});
legacy={...legacy,...savedProgress,human:{...legacy.human,...savedProgress.human}};
let profile = null, game = null, revision = -1, page = "home", shopTab = "cases", skinSymbol = "arrow", busy = false, selected = null, source = null, zoom = false, small = true, desc = false, filter = null, listings = [], groups = [], nextOffset = null, notice = "", lastFx = -1, pollBusy = false;
function icon(type, dir = 0, skin = profile?.skins?.[type] ?? "classic") {
  return skinIcon(type, dir, skin);
}
const details = { arrowx2: "40 урона. Пробивает обычный смайлик, но не круг. До 30 установок за партию. Усилители повышают урон. Отражается от треугольника.", arrow: "20 урона. С усилением — 50. Круг не пробивает даже с усилителями. Пуля летит после ответа соперника.", smile: "Простой защитный блок.", point: "Усиливает символ по выбранному направлению. Сила: 1.", erase: "Убирает свой символ. Ход не тратится. Первый использованный экземпляр не возвращается.", circle: "Сильный блок. Лазер, танк и меч пробивают без усиления. Обычная стрелочка не пробивает.", electricity: "Красный щит X2. Танк, лазер и стрелочка не пробивают. Меч пробивает.", sword: "250 урона. Пробивает до двух кругов. Каждый уничтоженный блок или усилитель отнимает 50 урона. Пробивает обратную связь.", tank: "200 урона. Пробивает круг и усилители. Электричество не пробивает.", laser: "100 урона. Пробивает круг и обратную связь без усилителей. После обратной связи — 50 урона.", feedback: "Отражает стрелочку и стрелочку X2. Меч, танк и лазер пробивают без усилителей.", inspect: "Усилитель силой 3.", powerful: "Усилитель силой 6.", angry: "Даёт два действия подряд.", teleport: "Переносит свой символ в свободную клетку." };
async function api(route, body = {}) {
  if (route === "register") return client.authenticate(route, body.nick);
  if (route === "recover") {
    const recovered = await client.authenticate(route, body.code.trim());
    await client.useSession(recovered);
    const view = await client.bootstrap();
    return {...recovered, profile: {...freshProgress(), nick: view.profile.nick}};
  }
  if (route === "recovery-code") {
    const d = await request(route, {});
    if (!d.code) throw Error("Предыдущий код уже был показан. Запроси новый.");
    return d;
  }
  throw Error("Недоступная операция");
}
function cache() {
  if (!profile) return;
  legacy.nick = profile.nick;
  legacy.rank = profile.rank;
  legacy.human.balance = Math.floor(profile.balance);
  legacy.history = profile.history;
  
  
  
  legacy.tutorial = { status: profile.tutorialDone ? "done" : "new" };
  legacy.human.unlocked = [...BASE, ...Object.keys(profile.inventory).filter((t) => profile.inventory[t] > 0)];
  storage.setItem(STORAGE_KEY, JSON.stringify(legacy));
}
async function request(route, body = {}) {
  await client.useSession(session);
  await flushStorage();
  let d;
  if (route === "profile" || route === "poll") d = await client.bootstrap();
  else if (route === "market") {
    d = await client.market(body);
  } else d = await client.command(route, body);
  applyView(client.view());
  if (!["logout","delete-account"].includes(route)) client.start();
  return d;
}
async function act(fn) {
  if (busy) return;
  busy = true;
  app.dataset.busy = "true";
  notice = "";
  try {
    await fn();
  } catch (e) {
    notice = e.message;
    const d = document.querySelector("#next-dialog");
    if (d?.open) {
      let error = d.querySelector(".dialog-error");
      if (!error) {
        error = document.createElement("p");
        error.className = "dialog-error";
        error.setAttribute("role", "alert");
        d.append(error);
      }
      error.textContent = e.message;
    }
  } finally {
    busy = false;
    app.dataset.busy = "false";
    render();
  }
}
function modal(title, body) {
  let d = document.querySelector("#next-dialog");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "next-dialog";
    document.body.append(d);
  }
  d.innerHTML = `<div class="dialog-head"><h2>${title}</h2><button class="quiet" data-close aria-label="Закрыть">✕</button></div>${body}`;
  d.querySelector("[data-close]").onclick = () => d.close();
  if (!d.open) d.showModal();
  return d;
}
function levelBlock() {
  const l = levelInfo(profile.xp);
  const ratio = l.next ? (l.xp - l.start) / (l.next - l.start) * 100 : 100;
  return `<button class="level-info quiet" data-level-info><strong>Уровень ${l.level}</strong><span>${l.xp} / ${l.next ?? "MAX"} очков</span><span class="xp-track"><i style="width:${ratio}%"></i></span></button>`;
}
function top() {
  return `<header class="v2-top"><button class="rank-corner " data-rank><span>${esc(profile.rank?.name || "Без звания")}</span>${profile.rank ? rankBadge(profile.rank) : '<span class="empty-emblem">◇</span>'}<small>${esc(profile.nick)}</small></button>${levelBlock()}<button class="avatar-button" data-profile aria-label="Открыть профиль">${framedAvatar(profile.avatar, activeFrame(profile), levelInfo(profile.xp).level)}</button><div class="wallet">${money(profile.balanceCents)} <small>рубинов</small></div></header>`;
}
function home() {
  return `<section class="hub">${top()}<div class="hub-title"><div class="menu-art"><div class="symbol-tile">${icon("arrow")}</div><div class="symbol-tile">${icon("king")}</div><div class="symbol-tile">${icon("smile")}</div></div><h1>Символы</h1></div><div class="hub-main"><button class="primary" data-nav="modes">Играть</button><button class="choice" data-profile>Профиль</button><button class="choice" data-nav="inventory">Инвентарь</button></div><div class="upgrade-entry"><button class="primary" data-nav="upgrades">Улучшить</button></div><nav class="hub-bottom"><button class="quiet" data-nav="market">Рынок</button><button class="quiet" data-nav="shop">Магазин</button><button class="quiet" data-nav="quests">Задания</button><button class="quiet" data-accounts>Аккаунты</button><button class="quiet" data-rules>Правила</button></nav></section>`;
}
function modes() {
  return `<section class="v2-page">${back()}<h1>Играть</h1><div class="mode-list"><button class="choice" data-start="play"><strong>Играть</strong><small>Поиск соперника</small></button><button class="choice" data-start="duel"><strong>Дуэль</strong><small>Один на один</small></button><button class="choice" data-start="team"><strong>Дуэль 2 на 2</strong><small>Четыре короля · две команды</small></button><button class="choice" data-start="trial"><strong>Повысить звание</strong><small>Пять сложностей · партия ${(profile.trialRun?.length ?? 0) + 1} из 5</small></button></div><label class="size-picker">Размер поля <select id="board-size"><option value="small" ${small ? "selected" : ""}>10 × 14</option><option value="large" ${!small ? "selected" : ""}>28 × 20</option></select></label><div class="dialog-actions"><button class="quiet" data-room>С другом по коду</button><button class="quiet" data-start="local">Вдвоём на одном устройстве</button></div></section>`;
}
function back() {
  return '<button class="quiet" data-nav="home">На главную</button>';
}
function inventory() {
  const items = Object.entries(TYPES).filter(([t]) => BASE.includes(t) || (profile.inventory[t] ?? 0) > 0);
  return `<section class="v2-page compact-inventory">${back()}<h1>Инвентарь</h1><div class="inventory-grid">${CASES.filter((c) => (profile.cases?.[c.id] ?? 0) > 0).map((c) => `<button class="inventory-card inventory-case case-${c.tone}" data-case="${c.id}"><span class="inventory-count">×${profile.cases[c.id]}</span><span class="inventory-case-mark" aria-hidden="true">${c.mark}</span><strong>${c.name}</strong><span class="case-inventory-label">Кейс · открыть</span></button>`).join("")}${items.map(([t, v]) => `<button class="inventory-card" data-item="${t}"><span class="inventory-count">${BASE.includes(t) ? "∞" : "×" + profile.inventory[t]}</span>${icon(t)}<strong>${v.name}</strong>${rarityStrip(t)}</button>`).join("")}</div></section>`;
}
function market() {
  if (filter) return marketOffers();
  return `<section class="v2-page">${back()}<div class="market-heading"><h1>Рынок</h1><button class="quiet" data-nav="shop">Магазин</button><div class="wallet">${money(profile.balanceCents)} <small>рубинов</small></div></div><div class="market-controls"><label>Символ <select id="symbol-filter"><option value="">Все символы</option>${Object.keys(PRICES).map((t) => `<option value="${t}" ${filter === t ? "selected" : ""}>${TYPES[t].name}</option>`).join("")}</select></label><button class="choice" id="sort-price">Цена ${desc ? "↓" : "↑"}</button><button class="quiet" id="refresh-market">Обновить</button></div><div class="offer-count"><strong>${filter ? groups.find((g) => g.symbol === filter)?.count ?? 0 : groups.reduce((sum, g) => sum + g.count, 0)}</strong><span>предложений${filter ? " · " + TYPES[filter].name : " в загруженной части рынка"}</span></div><p>Предложения игроков · ${desc ? "сначала дорогие" : "сначала дешёвые"}. Каждый продавец задаёт свою цену.</p><div class="market-grid">${!filter ? groups.map((g) => `<button class="inventory-card" data-market-symbol="${g.symbol}">${icon(g.symbol, 0, "classic")}<strong>${TYPES[g.symbol].name}</strong><span>${g.count} предложений · от ${money(g.minPrice)}</span>${rarityStrip(g.symbol)}</button>`).join("") : listings.map((l) => `<article class="market-card">${icon(l.symbol, 0, "classic")}<h2>${TYPES[l.symbol].name}</h2>${rarityStrip(l.symbol)}<p>${esc(l.nick)}</p><strong>${money(l.priceCents)} рубинов</strong><button class="primary" ${l.seller !== session.id && Number(profile.balanceCents) < Number(l.priceCents) ? "disabled" : ""} data-${l.seller === session.id ? "cancel-listing" : "buy"}="${l.id}">${l.seller === session.id ? "Снять с продажи" : "Купить за " + money(l.priceCents)}</button></article>`).join("")}${(filter ? !listings.length : !groups.length) ? '<div class="market-empty"><h2>Предложений пока нет</h2><p>Выставь символ из инвентаря по своей цене.</p><button class="primary" data-nav="inventory">Открыть инвентарь</button></div>' : ""}</div>${nextOffset !== null ? '<button class="choice more-items" id="more-market">Показать ещё предложения</button>' : ""}</section>`;
}
function marketOffers() {
  const count = groups.find((g) => g.symbol === filter)?.count ?? 0;
  return `<section class="v2-page market-detail"><div class="offers-top"><button class="quiet market-back" id="market-back" aria-label="Назад ко всем символам">←</button><div class="wallet">${money(profile.balanceCents)} <small>рубинов</small></div></div><header class="offers-symbol">${icon(filter, 0, "classic")}<div><h1>${TYPES[filter].name}</h1>${rarityStrip(filter)}</div><div class="offers-total"><strong>${count}</strong><span>загруженных предложений</span></div></header><div class="offers-controls"><button class="choice" id="sort-price">Цена ${desc ? "↓" : "↑"}</button><button class="quiet" id="refresh-market">Обновить</button></div><div class="offers-scroll" tabindex="0" aria-label="Предложения продавцов"><div class="offers-list">${listings.map((l) => `<article class="offer-row"><span class="offer-skin" title="${SKINS.find((s) => s.id === l.skin)?.name ?? "Без скина"}">${icon(l.symbol, 0, l.skin ?? "classic")}<small>${SKINS.find((s) => s.id === l.skin)?.name ?? "Обычный"}</small></span><span class="offer-seller" title="${esc(l.nick)}">${esc(l.nick)}</span><strong class="offer-price">${money(l.priceCents)}</strong><button class="primary offer-buy" ${l.seller !== session.id && Number(profile.balanceCents) < Number(l.priceCents) ? "disabled" : ""} data-${l.seller === session.id ? "cancel-listing" : "buy"}="${l.id}" aria-label="${l.seller === session.id ? "Снять с продажи" : "Купить"} ${TYPES[filter].name} за ${money(l.priceCents)} рубинов">${l.seller === session.id ? "Снять с продажи" : "Купить"}</button></article>`).join("")}</div>${!listings.length ? '<div class="market-empty"><h2>Предложений пока нет</h2><button class="primary" data-nav="inventory">Открыть инвентарь</button></div>' : ""}${nextOffset !== null ? '<button class="choice more-items" id="more-market">Показать ещё предложения</button>' : ""}</div></section>`;
}
function shopNav() {
  return `<div class="shop-navigation">${back()}<nav aria-label="Раздел магазина"><button class="choice ${shopTab === "cases" ? "shop-tab-active" : ""}" data-shop-tab="cases">Кейсы</button><button class="choice ${shopTab === "goods" ? "shop-tab-active" : ""}" data-shop-tab="goods">Магазин</button><button class="choice ${shopTab === "skins" ? "shop-tab-active" : ""}" data-shop-tab="skins">Скины</button></nav></div>`;
}
function goods() {
  const owned = profile.ownedAvatars?.includes("thunderlion");
  return `<section class="v2-page">${shopNav()}<div class="market-heading"><h1>Магазин</h1><div class="wallet">${money(profile.balanceCents)} <small>рубинов</small></div></div><article class="avatar-bundle">${avatar("thunderlion")}<h2>Лев с молнией</h2><p>Аватарка и 5 стрелочек X2</p><div class="bundle-symbol">${icon("arrowx2", 0, "classic")}<strong>×5</strong></div><button class="primary" id="buy-avatar-bundle" ${owned || profile.balanceCents < 5e4 ? "disabled" : ""}>${owned ? "Куплено" : "Купить за 500 рубинов"}</button></article><article class="avatar-bundle">${avatar("firec")}<h2>Огненная C</h2><p>Аватарка и один «Осмотр»</p><div class="bundle-symbol">${icon("inspect", 0, "classic")}<strong>×1</strong></div><button class="primary" id="buy-fire-avatar" ${profile.ownedAvatars?.includes("firec") || profile.balanceCents < 1e5 ? "disabled" : ""}>${profile.ownedAvatars?.includes("firec") ? "Куплено" : "Купить за 1000 рубинов"}</button></article></section>`;
}
function shop() {
  if (shopTab === "skins") return skinShop();
  if (shopTab === "goods") return goods();
  return `<section class="v2-page">${shopNav()}<div class="market-heading"><h1>Магазин</h1><button class="quiet" data-nav="market">Рынок</button><div class="wallet">${money(profile.balanceCents)} <small>рубинов</small></div></div><p>Один кейс — один символ. Открытие купленного кейса бесплатно.</p><div class="case-grid">${CASES.map((c) => `<button class="case-card case-${c.tone}" data-case="${c.id}"><span class="case-mark" aria-hidden="true">${c.mark}</span><strong>${c.name}</strong><span>${money(casePrice(c))} рубинов</span><small>У тебя: ${profile.cases?.[c.id] ?? 0}</small><span class="case-symbols">${c.drops.map(([t]) => icon(t)).join("")}</span></button>`).join("")}</div>${profile.lastCaseDrop ? `<div class="last-drop"><span>Последний выигрыш</span>${icon(profile.lastCaseDrop.symbol)}<strong>${TYPES[profile.lastCaseDrop.symbol].name}</strong>${rarityStrip(profile.lastCaseDrop.symbol)}<button class="quiet" data-nav="inventory">В инвентарь</button></div>` : ""}</section>`;
}
function upgrades() {
  return `<section class="v2-page">${back()}<h1>Улучшить</h1><div class="wallet">${money(profile.balanceCents)} <small>рубинов</small></div><p>Постоянные улучшения действуют со следующей партии. Король: +10 жизней. Символы: +1 использование за партию.</p><div class="inventory-grid">${["king", ...Object.keys(TYPES)].map((t) => {
    const u = upgradeInfo(profile, t), available = hasSymbol(profile, t), bulk = maxUpgrade(profile, t);
    return `<article class="inventory-card upgrade-card"><button class="quiet upgrade-max" data-upgrade-max="${t}" data-level="${u.level}" ${!available || !bulk.count ? "disabled" : ""}>Улучшить на максимум${bulk.count ? " · +" + bulk.count + " · " + money(bulk.cost) + " руб." : ""}</button>${icon(t)}<strong>${symbolName(t)}</strong><span>${t === "king" ? u.value + " жизней" : u.unlimited ? "Без ограничений" : u.value + " использований"}</span><small>Улучшений: ${u.level}</small><button class="primary" data-upgrade="${t}" data-level="${u.level}" ${!available || u.price === null || profile.balanceCents < u.price * 100 ? "disabled" : ""}>${!available ? "Нет символа" : u.unlimited ? "Уже без лимита" : u.price === null ? "Максимум" : "Улучшить · " + u.price + " рубинов"}</button></article>`;
  }).join("")}</div></section>`;
}
function skinShop() {
  const available = SKIN_SYMBOLS.filter((t) => hasSymbol(profile, t));
  if (!available.includes(skinSymbol)) skinSymbol = available[0];
  return `<section class="v2-page">${shopNav()}<h1>Скины символов</h1><div class="wallet">${money(profile.balanceCents)} <small>рубинов</small></div><p>Покупка навсегда для выбранного символа. Сила и лимит не меняются.</p><div class="skin-symbol-tabs">${available.map((t) => `<button class="quiet" data-skin-symbol="${t}" aria-pressed="${t === skinSymbol}">${symbolName(t)}</button>`).join("")}</div><div class="skins-carousel">${skinsFor(skinSymbol).map((s) => {
    const owned = ownsSkin(profile, skinSymbol, s.id), selected2 = (profile.skins?.[skinSymbol] ?? "classic") === s.id;
    return `<article class="skin-card ${s.effect ? "skin-card-arcana" : ""}">${icon(skinSymbol, 0, s.id)}<h2>${s.name}</h2>${s.effect ? `<span class="rarity-strip rarity-arcana">${s.effect}</span>` : ""}<p>${symbolName(skinSymbol)}</p><p>${s.price === 0 ? "Бесплатно" : owned ? "Куплено" : s.price + " рубинов"}</p><button class="primary" data-equip-skin="${s.id}" ${selected2 ? "disabled" : ""}>${selected2 ? "Выбрано" : owned ? "Выбрать" : "Купить за " + s.price + " рубинов"}</button></article>`;
  }).join("")}</div></section>`;
}
function showFrames() {
  const count = unlockedFrames(profile.xp), current = activeFrame(profile);
  const d = modal("Рамки", `<p>Новая ступень каждые 10 уровней. Открыто ${count} из 30.</p><button class="choice" id="hide-frame">${current === null ? "Рамка скрыта" : "Скрыть рамку"}</button><div class="frames-grid">${FRAMES.map((f) => `<button class="frame-choice ${current === f.id ? "selected-frame" : ""}" data-frame="${f.id}" ${f.id > count ? "disabled" : ""}>${framedAvatar(profile.avatar, f.id)}<strong>${f.name}</strong><span>${f.level}-й уровень${f.id > count ? " · закрыто" : ""}</span></button>`).join("")}</div>`);
  const choose = (value) => act(async () => {
    await request("frame", { frame: value });
    showFrames();
  });
  d.querySelector("#hide-frame").onclick = () => choose(null);
  d.querySelectorAll("[data-frame]").forEach((b) => b.onclick = () => choose(Number(b.dataset.frame)));
}
function caseTile(t) {
  return `<div class="reel-item">${icon(t)}<strong>${TYPES[t].name}</strong>${rarityStrip(t)}</div>`;
}
function showCase(id) {
  const c = CASES.find((c2) => c2.id === id);
  if (!c) return;
  const owned = profile.cases?.[id] ?? 0, d = modal(c.name, `<p>У тебя кейсов: <strong id="case-owned">${owned}</strong> · Баланс: <span id="case-balance">${money(profile.balanceCents)}</span></p><p id="case-buy-status" role="status"></p><div class="case-reel-window"><div class="reel-pointer" aria-hidden="true">▼</div><div class="case-reel">${c.drops.map(([t]) => caseTile(t)).join("")}</div></div><div id="case-result" role="status"></div><div class="dialog-actions"><button class="primary" id="buy-case" ${profile.balanceCents < casePrice(c) ? "disabled" : ""}>${owned ? "Купить ещё" : "Купить"} за ${money(casePrice(c))}</button><button class="choice" id="open-case" ${owned ? "" : "disabled"}>Открыть</button></div><h3>Что может выпасть</h3><div class="case-odds">${c.drops.map(([t, weight]) => `<div>${icon(t)}<span>${TYPES[t].name}${rarityStrip(t)}</span><strong>${(weight / 100).toLocaleString("ru-RU")}%</strong></div>`).join("")}</div>`);
  let openKey = crypto.randomUUID(), buyQueue = [], buying = false, retryKey = null;
  const buyButton = d.querySelector("#buy-case"), openButton = d.querySelector("#open-case"), status2 = d.querySelector("#case-buy-status");
  const refreshBuy = () => {
    d.querySelector("#case-owned").textContent = profile.cases?.[id] ?? 0;
    d.querySelector("#case-balance").textContent = money(profile.balanceCents);
    buyButton.textContent = (retryKey ? "Повторить покупку" : "Купить ещё") + " за " + money(casePrice(c));
    buyButton.disabled = profile.balanceCents < (buyQueue.length + 1) * casePrice(c);
    openButton.disabled = buying || !(profile.cases?.[id] > 0);
  };
  async function drainBuys() {
    if (buying) return;
    buying = true;
    busy = true;
    refreshBuy();
    try {
      while (buyQueue.length) {
        const key = buyQueue[0];
        try {
          await request("buy-case", { case: id, key });
        } catch (e) {
          retryKey = key;
          buyQueue = [];
          status2.textContent = e.message;
          return;
        }
        buyQueue.shift();
        status2.textContent = buyQueue.length ? "Покупаем ещё: " + buyQueue.length : "Кейс добавлен в инвентарь";
        refreshBuy();
      }
    } finally {
      buying = false;
      busy = false;
      refreshBuy();
      render();
    }
  }
  buyButton.onclick = () => {
    if (busy || buying) return;
    if (profile.balanceCents < (buyQueue.length + 1) * casePrice(c)) return;
    buyQueue.push(retryKey ?? crypto.randomUUID());
    retryKey = null;
    status2.textContent = "Покупаем: " + buyQueue.length;
    refreshBuy();
    drainBuys();
  };
  d.querySelector("#open-case").onclick = () => act(async () => {
    d.querySelector("#open-case").disabled = true;
    d.querySelector("#buy-case").disabled = true;
    const result = await request("open-case", { case: id, key: openKey });
    const winner = result.drop, items = Array.from({ length: 40 }, () => c.drops[Math.floor(Math.random() * c.drops.length)][0]);
    items[34] = winner;
    const reel = d.querySelector(".case-reel");
    reel.innerHTML = items.map(caseTile).join("");
    const width = 126, viewport = d.querySelector(".case-reel-window").clientWidth;
    const target = viewport / 2 - (34 * width + width / 2);
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = reel.animate?.([{ transform: "translateX(0)" }, { transform: `translateX(${target}px)` }], { duration: reduced ? 150 : 4200, easing: "cubic-bezier(.12,.7,.15,1)", fill: "forwards" });
    if (animation) await animation.finished.catch(() => {
    });
    if (!d.open || !d.querySelector("#case-result")) return;
    d.querySelector("#case-result").innerHTML = `<div class="case-win">${icon(winner)}<strong>Твой символ: ${TYPES[winner].name}</strong>${rarityStrip(winner)}<p>Добавлен в инвентарь</p></div>`;
    d.querySelector(".dialog-actions").innerHTML = '<button class="primary" id="case-again">К кейсу</button><button class="choice" id="case-inventory">В инвентарь</button>';
    d.querySelector("#case-again").onclick = () => showCase(id);
    d.querySelector("#case-inventory").onclick = () => {
      d.close();
      page = "inventory";
      render();
    };
  });
}
function quests() {
  return `<section class="v2-page">${back()}<h1>Задания</h1><p>За задания — 1 или 2 рубина. Выполняй снова в следующих партиях.</p><div class="quest-list">${NEW_QUESTS.map((q) => `<article class="quest-card"><div class="quest-reward">+${q.reward}<small>${q.reward === 1 ? "рубин" : "рубина"}</small></div><div><h2>${q.title}</h2><p>${q.text}</p><small>Выполнено: ${profile.quests[q.id] ?? 0}</small></div></article>`).join("")}</div><p>Награды начисляются за обычную игру. </p></section>`;
}
function showItem(t) {
  const free = BASE.includes(t), d = modal(TYPES[t].name, `<div class="item-preview"><div class="item-art">${icon(t)}${rarityStrip(t)}</div><div><p>${details[t]}</p><p>${free ? "Стартовый · без ограничений" : "В инвентаре: " + profile.inventory[t] + " · максимум за партию: " + upgradeInfo(profile, t).value}</p></div></div>${free ? "" : `<div class="dialog-actions"><button class="primary" id="sell-item" ${profile.inventory[t] > 0 ? "" : "disabled"}>Продать</button><button class="choice" id="find-item">Найти на рынке</button></div>`}`);
  d.querySelector("#find-item")?.addEventListener("click", () => {
    d.close();
    filter = t;
    act(async () => {
      await loadMarket();
      page = "market";
    });
  });
  d.querySelector("#sell-item")?.addEventListener("click", () => showSell(t));
}
function showSell(t) {
  const owned = skinsFor(t).filter((s) => s.id !== "classic" && ownsSkin(profile, t, s.id));
  const form = modal("Продать " + TYPES[t].name, `<form id="sell-form"><div class="sale-skin-top"><button type="button" class="quiet" id="add-sale-skin" ${owned.length ? "" : "disabled"}>Добавить скин</button><label id="sale-skin-label" hidden>Скин<select id="sale-skin"><option value="">Без скина</option>${owned.map((s) => `<option value="${s.id}">${s.name} · +${money(s.price * 90)} руб.</option>`).join("")}</select></label></div><div id="sale-preview" class="item-preview">${icon(t, 0, "classic")}</div><label>Количество: <output id="sell-quantity-value">1</output><input name="quantity" type="range" min="1" max="${profile.inventory[t]}" value="1" step="1"></label><div class="quantity-ends"><span>1</span><span id="sale-max">${profile.inventory[t]}</span></div><p id="sell-remaining">Останется: ${profile.inventory[t] - 1}</p><label>Цена символа без скина<input name="price" type="text" inputmode="decimal" placeholder="4,25" required></label><p id="sale-total">Укажи цену символа.</p><p>Скин добавляется к одному экземпляру. Доплата — 90% его цены в магазине. Скин перейдёт покупателю; при отмене вернётся тебе.</p><button class="primary" type="submit">Выставить на рынок</button></form>`);
  const slider = form.querySelector("[name=quantity]"), priceInput = form.querySelector("[name=price]"), select = form.querySelector("#sale-skin");
  const refresh = () => {
    const skin = owned.find((s) => s.id === select.value), max = skin ? 1 : profile.inventory[t];
    slider.max = String(max);
    if (Number(slider.value) > max) slider.value = String(max);
    slider.disabled = max === 1;
    form.querySelector("#sale-max").textContent = max;
    form.querySelector("#sell-quantity-value").textContent = slider.value;
    form.querySelector("#sell-remaining").textContent = "Останется: " + (profile.inventory[t] - Number(slider.value));
    form.querySelector("#sale-preview").innerHTML = icon(t, 0, skin?.id ?? "classic");
    try {
      const base = parseMoney(priceInput.value), extra = skin ? skin.price * 90 : 0;
      form.querySelector("#sale-total").textContent = "За один: " + money(base) + " + " + money(extra) + " за скин = " + money(base + extra) + " рубинов.";
    } catch {
      form.querySelector("#sale-total").textContent = skin ? "Доплата за скин: " + money(skin.price * 90) + " рубинов. Укажи цену символа." : "Укажи цену символа.";
    }
  };
  form.querySelector("#add-sale-skin").onclick = () => {
    form.querySelector("#sale-skin-label").hidden = false;
    select.focus();
  };
  select.onchange = refresh;
  slider.oninput = refresh;
  priceInput.oninput = refresh;
  refresh();
  form.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    const price = priceInput.value, quantity = Number(slider.value), skin = select.value;
    act(async () => {
      await request("sell", { symbol: t, price, quantity, skin });
      form.close();
      page = "inventory";
      notice = "Выставлено на рынок: " + TYPES[t].name + " ×" + quantity + ".";
    });
  };
  priceInput.focus();
}
function showRank() {
  modal("Твоё звание", `<div class="rank-only">${profile.rank ? rankBadge(profile.rank, "large") : '<span class="empty-emblem">◇</span>'}<h3>${esc(profile.rank?.name || "Без звания")}</h3><div class="rank-meter"><i style="width:${profile.rankProgress ?? 0}%"></i></div><p>${profile.rankProgress ?? 0}% до следующего звания</p></div>`);
}
function showProfile() {
  const d = modal("Профиль", `<button class="avatar-button profile-avatar" data-avatar aria-label="Изменить аватарку">${framedAvatar(profile.avatar, activeFrame(profile), levelInfo(profile.xp).level)}</button><div class="profile-emblem ">${rankBadge(profile.rank, "large")}</div><h3>${esc(profile.nick)}</h3>${levelBlock()}<div class="rank-meter"><i style="width:${profile.rankProgress ?? 0}%"></i></div><div class="dialog-actions"><button class="choice" id="rename">Изменить ник</button><button class="choice" id="choose-frame">Рамки</button><button class="choice" id="recover">Восстановить аккаунт</button><button class="choice" id="safety">Игроки и безопасность</button><button class="choice" id="logout">Выйти из аккаунта</button><button class="quiet" id="delete-account">Удалить аккаунт</button><p><button class="quiet" id="privacy">Конфиденциальность</button> · <a href="mailto:votarumshee@gmail.com">Поддержка</a> · <a href="https://symbols-api.votarumshee.com/account-deletion" target="_blank" rel="noopener">Удаление данных</a></p></div><section class="match-history"><h3>История матчей</h3><ol>${profile.history.map((h) => `<li><div><strong>${h.outcome === "win" ? "Победа" : h.outcome === "loss" ? "Поражение" : "Выход"}</strong><span>${esc(h.opponent || "Бот")}${h.level !== void 0 && h.level !== null ? " · " + LEVEL_NAMES[h.level] : ""}</span><small>${h.xp ?? 0} очков</small></div><time>${new Date(h.at).toLocaleDateString("ru-RU")}</time></li>`).join("") || "<li>Здесь появятся результаты партий.</li>"}</ol></section>`);
  d.querySelector("[data-avatar]").onclick = showAvatars;
  d.querySelector("#choose-frame").onclick = showFrames;
  d.querySelector("#rename").onclick = () => showName();
  d.querySelector("#recover").onclick = showRecovery;
  d.querySelector("#safety").onclick = showSafety;
  d.querySelector("#privacy").onclick = () => modal("Конфиденциальность", "<p>Игра хранит аккаунт, ник, прогресс, инвентарь, историю матчей, предложения рынка, жалобы и блокировки. Эти данные нужны для игры и защиты участников.</p><p>Браузер использует защищённую HttpOnly cookie. Приложение хранит доступ в зашифрованном хранилище устройства. Не передавай код восстановления другим людям.</p><p>Удалить аккаунт можно в профиле. Вопросы о данных: <a href=\"mailto:votarumshee@gmail.com\">votarumshee@gmail.com</a>. Резервные копии сохраняются ограниченное время согласно политике сервера.</p>");
  d.querySelector("#logout").onclick = () => endAccount(false);
  d.querySelector("#delete-account").onclick = () => endAccount(true);
  d.querySelector("[data-level-info]").onclick = showLevels;
}

function endAccount(deleting) {
  const d=modal(deleting?"Удалить аккаунт?":"Выйти из аккаунта?", '<p>'+ (deleting?'Игровой прогресс, предметы и данные будут удалены без возможности восстановления.':'Перед выходом сохрани код восстановления: без него нельзя будет вернуться в аккаунт.')+'</p><button class="primary" id="confirm-account-end">'+(deleting?'Удалить навсегда':'Выйти')+'</button>');
  d.querySelector('#confirm-account-end').onclick=()=>act(async()=>{
    await request(deleting?'delete-account':'logout',deleting?{confirm:true}:{});
  });
}
async function showSafety() {
  try {
    const data=await client.request('moderation');
    const peers=(game?.players??[]).filter(p=>p.id!==session.id&&!p.bot);
    const d=modal('Игроки и безопасность', '<p>Блокировка скрывает предложения игрока на рынке и исключает совместный подбор. Жалоба передаётся на проверку.</p><form><label>Игрок<select id="peer"><option value="">Введи ID ниже</option>'+peers.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.nick)+'</option>').join('')+'</select></label><label>ID игрока<input id="target" required></label><label>Причина жалобы<textarea id="reason" minlength="3" maxlength="500"></textarea></label><button class="choice" type="button" id="block-player">Заблокировать</button><button class="primary" type="submit">Отправить жалобу</button></form><h3>Заблокированные</h3>'+data.blocked.map(p=>'<p>'+esc(p.nick)+' <button class="choice" data-unblock="'+esc(p.id)+'">Разблокировать</button></p>').join(''));
    d.querySelector('#peer').onchange=e=>d.querySelector('#target').value=e.target.value;
    d.querySelector('#block-player').onclick=()=>act(async()=>{await request('block',{target:d.querySelector('#target').value.trim()});await showSafety();});
    d.querySelector('form').onsubmit=e=>{e.preventDefault();act(async()=>{await request('report',{target:d.querySelector('#target').value.trim(),reason:d.querySelector('#reason').value.trim()});d.close();notice='Жалоба отправлена.';});};
    d.querySelectorAll('[data-unblock]').forEach(b=>b.onclick=()=>act(async()=>{await request('unblock',{target:b.dataset.unblock});await showSafety();}));
  }catch(e){notice=e.message;render();}
}

function showAvatars() {
  const options = AVATARS.filter(([id]) => ["lion", "eagle"].includes(id) || profile.ownedAvatars?.includes(id));
  const d = modal("Твоя аватарка", `<div class="avatar-picker">${options.map(([id, , name]) => `<button class="avatar-option ${profile.avatar === id ? "chosen" : ""}" data-avatar-id="${id}" aria-label="${name}">${avatar(id)}<span>${name}</span></button>`).join("")}</div>`);
  d.querySelectorAll("[data-avatar-id]").forEach((b) => b.onclick = () => act(async () => {
    await request("avatar", { avatar: b.dataset.avatarId });
    d.close();
    showProfile();
  }));
}
function showLevels() {
  const l = levelInfo(profile.xp), last = Math.max(300, Math.ceil((l.level + 10) / 10) * 10), rewards = profile.levelRewards ?? [];
  modal("Уровень " + l.level, `<p>Всего опыта: <strong>${profile.xp}</strong>. До следующего уровня: ${Math.max(0, l.next - profile.xp)} очков.</p><p>Уровни продолжаются после 300. Победа — 100 очков, завершённое поражение — 25. Каждое задание — ещё 50 очков. Чистая дуэль за 15 секунд или быстрее — 1200 очков всего.</p><h3>Награды за уровни</h3><p>Каждые 10 уровней — один случайный кейс. Он автоматически появится в инвентаре. Рамки: бронза 10–40, серебро 50–80, золото 90–120, изумруд 130–160, алмаз 170–200, чистое золото 210–240, фиолетовый алмаз 250–300. После 300 на рамке показывается твой уровень.</p><div class="level-rewards">${Array.from({ length: Math.min(last / 10, 1e3) }, (_, i) => {
    const level = (i + 1) * 10, f = FRAMES.find((f2) => f2.level === level), earned = rewards.find((r) => r.level === level), c = earned && CASES.find((c2) => c2.id === earned.case);
    return `<div class="level-reward ${earned ? "reward-earned" : ""}"><strong>${level}-й уровень</strong><span>${c ? "Получен кейс «" + c.name + "»" : "Случайный кейс"}${f ? " · " + f.name : ""}</span><small>${levelThreshold(level)} очков</small></div>`;
  }).join("")}</div><details><summary>Пороги первых 300 уровней</summary><ol>${THRESHOLDS.map((n, i) => `<li>Уровень ${i + 1}: ${n}</li>`).join("")}</ol></details>`);
}
function showName(first = false) {
  const d = modal(first ? "Твой ник" : "Изменить ник", `<form><label>Ник<input minlength="2" maxlength="20" value="${esc(profile?.nick || legacy.nick)}" required></label><button class="primary">Сохранить</button></form>`);
  d.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    act(async () => {
      const nick = d.querySelector("input").value;
      if (first) {
        legacy.nick = nick;
        const r = await api("register", { nick, progress: legacy });
        session = { id: r.id, token: r.token };
        storage.setItem("symbols-session", JSON.stringify(session));
        await request("profile", { progress: legacy });
        loadProgress(100, "Готово");
      } else await request("nickname", { nick });
      d.close();
    });
  };
}
function showRoom() {
  const d = modal("С другом по коду", '<button class="primary" id="create-friend">Создать комнату</button><form><label>Код комнаты<input maxlength="6" minlength="6" required autocapitalize="characters"></label><button class="choice">Войти</button></form>');
  d.querySelector("#create-friend").onclick = () => act(async () => {
    await request("start", { mode: "room", small });
    d.close();
    page = "game";
  });
  d.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    act(async () => {
      await request("start", { mode: "room", code: d.querySelector("input").value, small });
      d.close();
      page = "game";
    });
  };
}
async function showAccounts() {
  if(!native){try{const a=await client.request("account/sessions");const d=modal("Аккаунты",`<div class="account-list">${a.accounts.map(x=>`<button class="choice" data-cookie-account="${esc(x.id)}">${esc(x.nick)}${x.id===a.activeId?" · текущий":""}</button>`).join("")}</div><button class="primary" id="new-account">Создать новый аккаунт</button>`);d.querySelectorAll("[data-cookie-account]").forEach(b=>b.onclick=()=>act(async()=>{client.stop();await client.request("account/switch",{id:b.dataset.cookieAccount});location.reload();}));d.querySelector("#new-account").onclick=()=>act(async()=>{client.stop();await client.request("account/new",{});location.reload();});}catch(e){notice=e.message;render();}return;}
  const d = modal("Аккаунты", `<div class="account-list">${manager.list().map((a) => `<button class="choice" data-account="${a.id}">${esc(a.name)}${a.id === manager.active ? " · текущий" : ""}</button>`).join("")}</div><button class="primary" id="new-account">Создать новый аккаунт</button>`);
  d.querySelectorAll("[data-account]").forEach((b) => b.onclick = async () => {
    manager.select(b.dataset.account);
    await flushStorage();
    location.reload();
  });
  d.querySelector("#new-account").onclick = async () => {
    manager.select(manager.create());
    await flushStorage();
    location.reload();
  };
}
function showRecovery() {
  const d = modal("Восстановить аккаунт", '<p>Код даёт доступ к аккаунту. Не сообщай его другим.</p><button class="choice" id="show-code">Показать мой код</button><p id="recovery-code"></p><form><label>Код другого аккаунта<input inputmode="text" pattern="[a-fA-F0-9]{32}" maxlength="32" required></label><button class="primary">Войти по коду</button></form>');
  d.querySelector("#show-code").onclick = () => act(async () => {
    const r = await api("recovery-code", { nick: profile.nick, progress: legacy, code: storage.getItem("symbols-recovery-code") });
    
    d.querySelector("#recovery-code").textContent = r.code;
  });
  d.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    act(async () => {
      const code = d.querySelector("input").value, r = await api("recover", { code });
      if (native) manager.select(manager.restore(r, code));
      await flushStorage();
      location.reload();
    });
  };
}
function showRules() {
  modal("Правила", `<p>Поставь короля в крайнем ряду своей стороны. Защищай его и уничтожь королей другой команды.</p><p>Установи символ и выбери направление. Соперник получает ответный ход, затем летит твоя пуля.</p><p>Блоки останавливают атаки, точки усиливают символы. Один экземпляр списывается при первом использовании символа в партии и открывает весь его лимит на эту партию.</p><p>В 2×2 ходят по очереди четыре участника. Команда побеждает, когда уничтожены оба вражеских короля.</p>${Object.entries(TYPES).map(([t, v]) => `<div class="rule-row">${icon(t)}<div><strong>${v.name}</strong><p>${details[t]} ${Number.isFinite(v.stock) ? "Лимит за партию: " + v.stock + "." : ""}</p></div></div>`).join("")}`);
}
function currentSeat() {
  return game.mode === "local" ? game.actor : game.players.findIndex((p) => p.id === session.id);
}
function boardCells(p, own) {
  const g = game.g, energy = boostVisuals(g, p);
  const pending = new Set(g.pending.filter((a) => a.player === p).map((a) => a.index));
  return Array.from({ length: g.boards[p].length }, (_, n) => {
    const i = own ? n : (g.rows - 1 - Math.floor(n / g.width)) * g.width + n % g.width, t = g.boards[p][i], dir = own ? t?.dir : (4 - (t?.dir ?? 0) + 8) % 8;
    return `<button class="cell ${own ? "own" : "enemy"} ${own && i < g.width ? "frontier" : ""} ${i >= (g.rows - 1) * g.width ? "home-row" : ""} ${(i + 1) % g.width === 0 ? "last-column" : ""} ${t?.spent ? "spent" : ""} ${pending.has(i) ? "pending" : ""} ${energy.cells.has(i) ? "boost-path" : ""} ${energy.targets.has(i) ? "boost-target" : ""}" data-side="${p}" data-index="${i}" data-symbol="${t?.type || "empty"}" aria-label="${own ? "Твоя сторона" : "Соперник"}, ряд ${Math.floor(i / g.width) + 1}, клетка ${i % g.width + 1}${t ? ", " + (t.type === "king" ? "Король " + game.players[t.seat].nick : TYPES[t.type].name) : ""}">${energy.cells.has(i) ? lightning(own ? energy.cells.get(i).dir : (4 - energy.cells.get(i).dir + 8) % 8, !!t) : ""}${t ? icon(t.type, dir, game.players[t.seat]?.skins?.[t.type] ?? "classic") : ""}${t?.type === "king" ? `<small class="king-hp">${g.kingHp[t.seat]}</small>` : ""}</button>`;
  }).join("");
}
function teamHeader(team) {
  return `<div class="team-header">${game.players.map((p, i) => i % 2 !== team ? "" : `<div class="team-person ${game.actor === i ? "active-person" : ""} ${game.g.kingHp[i] === 0 ? "eliminated" : ""}">${framedAvatar(p.avatar, p.frame, p.level ?? 1)}<div class="team-person-info"><span>${esc(p.nick)}${p.bot ? " · бот" : ""}</span><strong>${game.g.kingHp[i]} HP</strong><small>Уровень ${p.level ?? 1}</small></div></div>`).join("")}</div>`;
}
function play() {
  if (!game) return '<section class="v2-page">' + back() + "<p>Партия завершена.</p></section>";
  if (game.status === "waiting") return `<section class="v2-page queue-page"><h1>${game.mode === "room" ? "Комната для друга" : "Ищем игру"}</h1>${game.code ? `<p class="room-code">${game.code}</p>` : ""}<p>${game.players.length} из ${game.capacity}</p><div class="queue-members">${game.players.map((p) => `<p>${esc(p.nick)}</p>`).join("")}</div>${game.mode === "room" ? "<p>Передай код другу. Он может войти через «С другом по коду».</p>" : ""}<button class="quiet" id="leave-game">Отменить поиск</button></section>`;
  const seat = currentSeat(), view = seat % 2, myTurn = game.actor === seat && !game.players[game.actor].bot, setup = game.status === "setup";
  const stock = game.g.playerStocks[seat];
  const remaining = (t) => game.sharedUses ? stock?.[t] ?? 0 : Math.min(stock?.[t] ?? Infinity, profile.inventory[t] ?? 0);

  const coach = game.advice;
  return `<section class="game v2-game"><header class="battle-top"><button class="quiet" id="leave-game">Меню</button><strong>${game.mode === "team" ? "Дуэль 2×2" : game.mode === "trial" ? "Испытание " + (game.level + 1) + "/5" : "Символы"}</strong><div><button class="quiet" id="sound-toggle">Звук: ${soundEnabled() ? "вкл" : "выкл"}</button><button class="quiet" id="zoom">${zoom ? "Уменьшить" : "Увеличить"}</button><button class="quiet" data-rules>Правила</button></div></header><div class="turnbar"><div><h1>${game.status === "done" ? "Партия завершена" : setup ? "Расставляем королей" : "Ходит " + esc(game.players[game.actor].nick)}</h1><div class="hint">${game.status === "done" ? "" : setup ? myTurn ? "Выбери клетку своего крайнего ряда." : "Короля ставит " + esc(game.players[game.actor].nick) : myTurn ? selected ? "Выбери клетку для " + TYPES[selected].name : "Выбери символ внизу." : "Сейчас ход другого участника."}</div></div><span id="battle-clock">${game.started ? ((Date.now() - game.started) / 1e3).toFixed(1) + " с" : ""}</span></div>${game.mode === "trial" ? `<p class="trial-clock">${LEVEL_NAMES[game.level]} · партия ${game.level + 1} из 5</p>` : ""}${game.tutorial ? `<aside class="coach-panel"><strong>Первая партия</strong><p>${setup ? "Поставь короля в нижнем ряду. Затем выбирай символ и клетку. После твоей атаки соперник получает ход для защиты. Уничтожь его короля, сохранив своего." : esc(coach?.text || "Наблюдай за ходом бота и защищай короля.")}</p>${coach?.move ? '<button class="choice" id="coach-select">Показать ход</button>' : ""}</aside>` : ""}<div class="arena">${teamHeader(1 - view)}<div class="board-scroll"><div class="board unified-board ${zoom ? "zoom" : ""}" style="grid-template-columns:repeat(${game.g.width},1fr)">${boardCells(1 - view, false)}${boardCells(view, true)}</div></div>${teamHeader(view)}</div>${game.status === "done" ? resultPanel() : ""}</section>${game.status !== "done" ? `<footer class="shelf">${setup ? "<p>Короли ставятся в крайних рядах, не в центре.</p>" : selected ? `<div class="selection">${icon(selected)}<strong>${TYPES[selected].name}</strong><button class="quiet" id="cancel-piece">Отмена</button></div>` : `<div class="pieces">${Object.entries(TYPES).filter(([t]) => BASE.includes(t) || (profile.inventory[t] ?? 0) > 0 || game.usedSymbols?.[seat]?.[t]).map(([t, v]) => `<button class="piece" data-piece="${t}" ${!myTurn || !BASE.includes(t) && remaining(t) <= 0 ? "disabled" : ""}>${icon(t)}<strong>${v.name}</strong><span>${BASE.includes(t) ? "∞" : remaining(t)}</span></button>`).join("")}</div>`}</footer>` : ""}`;
}
function resultPanel() {
  const r = game.results?.[session.id];
  if (!r) return `<button class="primary" data-nav="home">На главную</button>`;
  const rank = r.rank;
  return `<section class="battle-result"><h2>${game.mode === "local" ? "Победил " + esc(game.players[game.g.winner].nick) : r.won ? "Победа!" : "Поражение"}</h2>${game.tutorial ? '<p>Первая партия закончена. Если что-то осталось непонятно, открой правила.</p><button class="choice" data-rules>Правила игры</button>' : ""}<div class="winner-players">${game.players.filter((p, i) => i % 2 === game.g.winner).map((p) => `<div class="winner-player">${framedAvatar(p.avatar, p.frame, p.level ?? 1)}<strong>${esc(p.nick)}</strong></div>`).join("")}</div><p>+${r.xp} очков · +${r.bucks ?? r.quests.reduce((n, id) => n + (id === "clean" ? 2 : 1), 0)} рубинов</p>${rank ? `<div class="result-rank"><div id="animated-rank">${rankBadge(rank.before.rank, "large")}</div><div class="rank-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rank.after.progress}"><i style="--from:${rank.before.progress}%;--to:${(rank.after.rank?.index ?? -1) > (rank.before.rank?.index ?? -1) ? 100 : (rank.after.rank?.index ?? -1) < (rank.before.rank?.index ?? -1) ? 0 : rank.after.progress}%;width:${rank.after.progress}%"></i></div><p>${rank.qualifies ? "Испытание пройдено" : "Испытание не пройдено"} · ${esc(rank.before.rank?.name || "Без звания")} → ${esc(rank.after.rank?.name || "Без звания")}</p></div>` : ""}<div class="dialog-actions">${game.mode === "trial" ? '<button class="primary" data-start="trial">Продолжить испытания</button>' : '<button class="primary" data-nav="modes">Играть ещё</button>'}<button class="choice" data-nav="home">На главную</button></div></section>`;
}
let cancelQueue = [], cancelRunning = false;
function cancelOffer(id) {
  if (busy && !cancelRunning) return;
  const item = listings.find((l) => l.id === id);
  if (!item || cancelQueue.includes(id)) return;
  cancelQueue.push(id);
  const scroll = app.querySelector(".offers-scroll")?.scrollTop ?? 0;
  listings = listings.filter((l) => l.id !== id);
  const group = groups.find((g) => g.symbol === item.symbol);
  if (group) group.count = Math.max(0, group.count - 1);
  render();
  const el = app.querySelector(".offers-scroll");
  if (el) el.scrollTop = scroll;
  if (cancelRunning) return;
  cancelRunning = true;
  act(async () => {
    try {
      while (cancelQueue.length) {
        await request("cancel", { id: cancelQueue[0] });
        cancelQueue.shift();
      }
      notice = "Предметы возвращены в инвентарь.";
    } catch (e) {
      cancelQueue = [];
      await loadMarket();
      throw e;
    } finally {
      cancelRunning = false;
    }
  }).then(() => {
    const list = app.querySelector(".offers-scroll");
    if (list) list.scrollTop = scroll;
  });
}
async function loadMarket(append = false) {
  const d = await request("market", { symbol: filter, desc, offset: append ? nextOffset : 0 });
  listings = append ? [...listings, ...d.listings] : d.listings;
  const map = /* @__PURE__ */ new Map();
  for (const l of listings) {
    const g = map.get(l.symbol) ?? { symbol: l.symbol, count: 0, minPrice: Number(l.priceCents) };
    g.count++;
    g.minPrice = Math.min(g.minPrice, Number(l.priceCents));
    map.set(l.symbol, g);
  }
  groups = [...map.values()];
  nextOffset = d.nextOffset;
}
function render() {
  const skinScroll = app.querySelector(".skin-symbol-tabs")?.scrollLeft ?? 0, cardScroll = app.querySelector(".skins-carousel")?.scrollLeft ?? 0;
  if (!profile) {
    app.innerHTML = '<section class="v2-page"><h1>Символы</h1><p>' + esc(notice || "Загружаем профиль…") + '</p><button class="choice" id="retry">Повторить</button><button class="quiet" id="recovery-entry">Войти по коду</button></section>';
    if(storageError){app.querySelector("#retry").textContent="Восстановить доступ к хранилищу";app.querySelector("#retry").onclick=async()=>{if(!native||confirm("Старые данные останутся в резервном файле. Для входа понадобится код восстановления. Продолжить?")){await resetStorage();location.reload();}};}else app.querySelector("#retry").onclick = boot;
    const other=document.createElement("button");other.className="choice";other.textContent="Другие аккаунты";other.onclick=showAccounts;app.querySelector("section").append(other);
    app.querySelector("#recovery-entry").onclick = () => {
      const d = modal("Войти по коду", '<form><input inputmode="text" pattern="[a-fA-F0-9]{32}" required placeholder="Код восстановления: 32 символа"><button class="primary">Восстановить</button></form>');
      d.querySelector("form").onsubmit = (e) => {
        e.preventDefault();
        act(async () => {
          const code = d.querySelector("input").value, r = await api("recover", { code });
          if (native) manager.select(manager.restore(r, code));
          await flushStorage();
          location.reload();
        });
      };
    };
    return;
  }
  app.innerHTML = (notice ? `<div class="v2-notice" role="status">${esc(notice)}</div>` : "") + (page === "home" ? home() : page === "modes" ? modes() : page === "inventory" ? inventory() : page === "market" ? market() : page === "shop" ? shop() : page === "quests" ? quests() : page === "upgrades" ? upgrades() : play());
  const skinTabs = app.querySelector(".skin-symbol-tabs"), skinCards = app.querySelector(".skins-carousel");
  if (skinTabs) skinTabs.scrollLeft = skinScroll;
  if (skinCards) skinCards.scrollLeft = cardScroll;
  if (game?.status === "done" && page === "game" && game.results?.[session.id]?.rank) {
    const id = game.id;
    setTimeout(() => {
      if (page !== "game" || game?.id !== id) return;
      const r = game.results[session.id].rank, el = app.querySelector("#animated-rank");
      if (el) {
        el.innerHTML = rankBadge(r.after.rank, "large");
        const fill = app.querySelector(".result-rank .rank-meter i");
        fill.style.animation = "none";
        fill.style.width = r.after.progress + "%";
      }
    }, 1450);
  }
  app.querySelectorAll("[data-nav]").forEach((b) => b.onclick = () => act(async () => {
    page = b.dataset.nav;
    if (page === "market") {
      filter = null;
      await loadMarket();
    }
  }));
  app.querySelectorAll("[data-avatar]").forEach((b) => b.onclick = showAvatars);
  app.querySelectorAll("[data-rank]").forEach((b) => b.onclick = showRank);
  app.querySelectorAll("[data-profile]").forEach((b) => b.onclick = showProfile);
  app.querySelectorAll("[data-level-info]").forEach((b) => b.onclick = showLevels);
  app.querySelectorAll("[data-rules]").forEach((b) => b.onclick = showRules);
  app.querySelector("[data-room]")?.addEventListener("click", showRoom);

  app.querySelector("[data-accounts]")?.addEventListener("click", showAccounts);
  app.querySelectorAll("[data-upgrade-max]").forEach((b) => b.onclick = () => act(async () => {
    await request("upgrade", { symbol: b.dataset.upgradeMax, level: Number(b.dataset.level), max: true });
    notice = "Куплены все доступные по балансу улучшения.";
  }));
  app.querySelectorAll("[data-upgrade]").forEach((b) => b.onclick = () => act(async () => {
    await request("upgrade", { symbol: b.dataset.upgrade, level: Number(b.dataset.level) });
    notice = "Улучшение куплено. Действует со следующей партии.";
  }));
  app.querySelectorAll("[data-skin-symbol]").forEach((b) => b.onclick = () => {
    skinSymbol = b.dataset.skinSymbol;
    render();
  });
  app.querySelectorAll("[data-equip-skin]").forEach((b) => b.onclick = () => act(() => request(ownsSkin(profile, skinSymbol, b.dataset.equipSkin) ? "skin" : "buy-skin", { symbol: skinSymbol, skin: b.dataset.equipSkin })));
  app.querySelectorAll("[data-shop-tab]").forEach((b) => b.onclick = () => {
    shopTab = b.dataset.shopTab;
    render();
  });
  app.querySelector("#buy-fire-avatar")?.addEventListener("click", () => act(async () => {
    await request("buy-avatar", { avatar: "firec" });
    notice = "Огненная C получена и установлена. В инвентарь добавлен один «Осмотр».";
  }));
  app.querySelector("#buy-avatar-bundle")?.addEventListener("click", () => act(async () => {
    await request("buy-avatar", { avatar: "thunderlion" });
    notice = "Лев с молнией получен. В инвентарь добавлено 5 стрелочек X2.";
  }));
  app.querySelectorAll("[data-case]").forEach((b) => b.onclick = () => showCase(b.dataset.case));
  app.querySelectorAll("[data-start]").forEach((b) => b.onclick = () => act(async () => {
    await request("start", { mode: b.dataset.start, small });
    selected = null;
    source = null;
    page = "game";
    lastFx = revision;
  }));
  app.querySelector("#board-size")?.addEventListener("change", (e) => small = e.target.value === "small");
  app.querySelectorAll("[data-item]").forEach((b) => b.onclick = () => showItem(b.dataset.item));
  app.querySelector("#market-back")?.addEventListener("click", () => act(async () => {
    filter = null;
    await loadMarket();
  }));
  app.querySelector("#more-market")?.addEventListener("click", () => {
    const scroll = app.querySelector(".offers-scroll")?.scrollTop ?? 0;
    act(async () => {
      await loadMarket(true);
    }).then(() => {
      const list = app.querySelector(".offers-scroll");
      if (list) list.scrollTop = scroll;
    });
  });
  app.querySelectorAll("[data-market-symbol]").forEach((b) => b.onclick = () => act(async () => {
    filter = b.dataset.marketSymbol;
    await loadMarket();
  }));
  app.querySelector("#sort-price")?.addEventListener("click", () => act(async () => {
    desc = !desc;
    await loadMarket();
  }));
  app.querySelector("#refresh-market")?.addEventListener("click", () => act(loadMarket));
  app.querySelector("#symbol-filter")?.addEventListener("change", (e) => act(async () => {
    filter = e.target.value || null;
    await loadMarket();
  }));
  app.querySelectorAll("[data-buy]").forEach((b) => b.onclick = () => act(async () => {
    await request("buy", { id: b.dataset.buy });
    await loadMarket();
  }));
  app.querySelectorAll("[data-cancel-listing]").forEach((b) => b.onclick = () => cancelOffer(b.dataset.cancelListing));
  app.querySelector("#leave-game")?.addEventListener("click", () => {
    const matchId = game?.id;
    const goHome = () => {
      document.querySelector("#next-dialog")?.close();
      page = "home";
      selected = source = null;
      notice = "";
      showConnection();
      render();
    };
    if (!game || game.status === "done") {
      goHome();
      return;
    }
    const d = modal("Выйти из партии?", game.status === "waiting" ? '<p>Поиск будет отменён.</p><button class="primary" id="confirm-leave">Выйти</button>' : '<p>Это будет считаться поражением.</p><button class="primary" id="confirm-leave">Выйти</button>');
    d.querySelector("#confirm-leave").onclick = () => act(async () => {
      if (game && game.id !== matchId) throw Error("Партия изменилась. Закрой окно и проверь поле.");
      if (game && game.status !== "done") {
        try {
          await request("leave", { revision });
        } catch (error) {
          if (error.status !== 409) throw error;
          // The match may finish after confirmation but before the server locks it.
          // Refresh its authoritative result; never retry surrender or hide other conflicts.
          await request("profile");
          if (game && (game.id !== matchId || game.status !== "done")) throw error;
        }
      }
      goHome();
    });
  });
  app.querySelector("#coach-select")?.addEventListener("click", () => {
    const advice = game.advice;
    if (advice?.move) {
      selected = advice.move.type;
      render();
      app.querySelector(`[data-side="0"][data-index="${advice.move.index}"]`)?.classList.add("coach-target");
    }
  });
  app.querySelector("#zoom")?.addEventListener("click", () => {
    zoom = !zoom;
    render();
  });
  app.querySelector("#sound-toggle")?.addEventListener("click", () => {
    toggleSound();
    render();
  });

  app.querySelector("#cancel-piece")?.addEventListener("click", () => {
    selected = null;
    source = null;
    render();
  });
  app.querySelectorAll("[data-piece]").forEach((b) => b.onclick = () => {
    selected = b.dataset.piece;
    source = null;
    if (selected === "angry") sendAction({ type: selected });
    else render();
  });
  app.querySelectorAll("[data-index]").forEach((b) => b.onclick = () => chooseCell(+b.dataset.side, +b.dataset.index));
}
async function sendAction(a) {
  await act(async () => {
    const oldRevision = revision;
    await request("action", { action: a, revision });
    if (revision !== oldRevision) {
      selected = null;
      source = null;
    }
    render();
    if (game?.events?.length && revision !== lastFx) {
      lastFx = revision;
      await animateShots(app, game.events, () => page === "game");
    }
  });
}
function chooseCell(p, index) {
  if (busy || game.status === "done" || game.actor !== currentSeat() || p !== currentSeat() % 2) return;
  if (game.status === "setup") {
    sendAction({ type: "king", index });
    return;
  }
  if (!selected) {
    notice = "Выбери символ внизу.";
    render();
    return;
  }
  if (selected === "teleport" && source === null) {
    if (!game.g.boards[p][index] || game.g.boards[p][index].type === "king") return;
    source = index;
    notice = "Теперь выбери свободную клетку.";
    render();
    return;
  }
  const type = selected;
  if (DIRECTED.includes(type) || type === "teleport" && DIRECTED.includes(game.g.boards[p][source]?.type)) {
    const labels = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"], d = modal("Куда направить?", `<div class="direction-picker">${[7, 0, 1, 6, null, 2, 5, 4, 3].map((dir) => dir === null ? "<span></span>" : `<button class="choice" data-direction="${dir}">${labels[dir]}</button>`).join("")}</div>`);
    d.querySelectorAll("[data-direction]").forEach((b) => b.onclick = () => {
      const a = { type, index, dir: +b.dataset.direction, source };
      d.close();
      sendAction(a);
    });
  } else sendAction({ type, index, source });
}
let loadBar = null;
function loadProgress(value, label) {
  if (!loadBar) {
    loadBar = document.createElement("div");
    loadBar.className = "entry-loading";
    document.body.append(loadBar);
  }
  loadBar.innerHTML = `<div class="entry-loading-label"><span>${esc(label)}</span><strong>${value}% · осталось ${100 - value}%</strong></div><div class="entry-loading-track" role="progressbar" aria-label="Вход в игру" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100"><i style="width:${value}%"></i></div>`;
  if (value === 100) {
    const done = loadBar;
    loadBar = null;
    setTimeout(() => done.remove(), 300);
  }
}
async function boot() {
  notice = storageError || "";
  loadProgress(10, "Запуск игры");
  render();
  try {
    if(storageError) throw Error(storageError);
    if(!native){const a=await client.request("account/sessions");session=a.activeId?{id:a.activeId}:null;legacy=freshProgress();}
    if (!session) {
      if (!legacy.nick) {
        loadProgress(25, "Введи свой ник");
        showName(true);
        return;
      }
      loadProgress(30, "Создаём аккаунт");
      const r = await api("register", { nick: legacy.nick, progress: legacy });
      session = { id: r.id, token: r.token };
      storage.setItem("symbols-session", JSON.stringify(session));
    }
    loadProgress(50, "Загружаем профиль");
    await request("profile", { progress: legacy });
    loadProgress(80, "Подготавливаем игру");
    if (profile.game) {
      await request("poll");
      if (game && game.status !== "done") page = "game";
    }
    loadProgress(100, "Готово");
    render();
  } catch (e) {
    notice = e.message;
    if (loadBar) {
      loadBar.remove();
      loadBar = null;
    }
    render();
  }
}
setInterval(() => {
  const q = app.querySelector("#queue-seconds");
  if (q) q.textContent = Math.max(0, Math.ceil((game.deadline - Date.now()) / 1e3));
  const c = app.querySelector("#battle-clock");
  if (c && game.started && game.status !== "done") c.textContent = ((Date.now() - game.started) / 1e3).toFixed(1) + " с";
}, 100);
const status = document.createElement("div");
status.id = "connection-status";
status.setAttribute("role", "status");
document.body.append(status);
function showConnection(message = "") {
  status.replaceChildren();
  let pending;try{pending=client.pending;}catch{status.append(document.createTextNode(storageError||"Журнал операции повреждён. Восстанови хранилище."));return;}
  if (!message && !pending) return;
  status.append(document.createTextNode(message || (pending.kind === "action" || pending.kind === "leave" ? "Ответ на ход не получен. Обнови поле." : "Ответ на операцию не получен. Проверь результат.")));
  const button = document.createElement("button");
  button.textContent = pending ? "Проверить" : "Обновить";
  button.id = "resolve-operation";
  button.onclick = () => act(async () => {
    const result = await client.reconcile();
    if (result?.code) modal("Код восстановления", "<p>" + esc(result.code) + "</p>");
    showConnection();
  });
  status.append(button);
}
function applyView(d) {
  if (d.profile) {
    profile = d.profile;
    cache();
  }
  if ("game" in d) {
    game = d.game;
    revision = d.revision;
  }
}
const client = new Client({ transport, storage: clientStorage, flush: flushStorage, onStatus: showConnection, async onTerminal(kind,id){clientStorage.removeItem('pending:'+id);storage.setItem('symbols-session','null');storage.setItem(STORAGE_KEY,JSON.stringify(freshProgress()));await flushStorage();await client.useSession(null);session=null;profile=null;game=null;location.reload();}, onStorageError: markStorageError, onUnauthorized(){profile=null;game=null;session=null;storage.setItem("symbols-session","null");storage.setItem(STORAGE_KEY,JSON.stringify(freshProgress()));client.useSession(null);notice="Сессия истекла. Войди по коду восстановления или выбери другой аккаунт.";render();}, onChange(d) {
  const old = revision;
  applyView(d);
  if (!busy && profile) {
    render();
    if (page === "game" && old !== revision && game?.events?.length && lastFx !== revision) {
      lastFx = revision;
      animateShots(app, game.events, () => page === "game").catch(() => {
      });
    }
  }
} });
client.contentVersion = __CONTENT_VERSION__;
lifecycle((active) => client.setActive(active), () => {
  const d = document.querySelector("#next-dialog");
  if (d?.open) d.close();
  else if (page === "game") app.querySelector("#leave-game")?.click();
  else if(page === "home") minimizeApp();
  else {
    page = "home";
    render();
  }
});
addEventListener("online", () => {
  client.stop();
  client.start();
});
addEventListener("symbols-storage-error",()=>{client.stop();profile=null;game=null;notice=storageError;render();});
boot();
