/*
  UI - DOM screens on top of the 3D view: menus, HUD, floating texts,
  banners, toasts and tutorial hints.
*/

import { Icons } from './icons.js';
import { blockIcon, monsterIcon } from './block-icons.js';
import { B, GEM_VARIANTS, ORE_KEYS } from '../game/blocks.js';
import { UPGRADES, ACHIEVEMENTS, upgradeCost } from '../game/progression.js';
import { GameInfo } from '../config.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = n => Math.round(n).toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ORE_TYPES = { coal: B.COAL, iron: B.IRON, gold: B.GOLD, diamond: B.DIAMOND };

export const DEATH_TEXT = {
  tnt: 'Blown up by TNT!',
  monster: 'Caught by a cave monster!',
  crushed: 'Flattened by a boulder!',
  exhausted: 'Out of energy!',
  trapped: 'Trapped in the rock!',
  quit: 'Climbed back out'
};

function formatTime(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export class UI {
  constructor(app) {
    this.app = app;
    this.screens = {};
    for (const el of $$('.screen')) this.screens[el.id.replace('screen-', '')] = el;
    this.current = null;
    this.stack = [];
    this.recordsTab = 'scores';
    this.hintQueue = [];
    this.hintTimer = null;
    this.confirmReset = false;

    this.hud = {
      depth: $('#hud-depth'),
      score: $('#hud-score'),
      combo: $('#hud-combo'),
      energy: $('#hud-energy'),
      energyWrap: $('#hud-energy-wrap'),
      pick: $('#hud-pick'),
      shield: $('#hud-shield'),
      flare: $('#hud-flare'),
      touchFlares: $('#touch-flares'),
      flareBtn: $('.flare-btn')
    };
    this.floaters = $('#floaters');
    this.bannerEl = $('#banner');
    this.toastsEl = $('#toasts');
    this.hintEl = $('#hint');

    this.hydrateIcons(document);
    this.bind();
  }

  hydrateIcons(root) {
    for (const el of $$('[data-icon]', root)) {
      if (el.dataset.hydrated) continue;
      el.innerHTML = Icons[el.dataset.icon] || '';
      el.classList.add('icon');
      el.dataset.hydrated = '1';
    }
  }

  bind() {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      this.app.onUiAction(el.dataset.action, el);
    });
    for (const tab of $$('.tab')) {
      tab.addEventListener('click', () => {
        this.recordsTab = tab.dataset.tab;
        this.renderRecords(this.app.profile);
        this.app.audio.play('click');
      });
    }
    document.addEventListener('pointerover', e => {
      const btn = e.target.closest('.btn, .tab');
      if (btn && e.pointerType === 'mouse' && btn !== this.lastHover) {
        this.lastHover = btn;
        this.app.audio.play('hover', { minGap: 0.05 });
      }
    });
  }

  // ---------------------------------------------------------------- screens

  setScreen(name) {
    this.stack = [];
    this.activate(name);
  }

  push(name) {
    if (this.current) this.stack.push(this.current);
    this.activate(name);
  }

  back() {
    const prev = this.stack.pop();
    if (!prev) return false;
    this.activate(prev);
    return true;
  }

  activate(name) {
    this.current = name;
    for (const [key, el] of Object.entries(this.screens)) {
      el.classList.toggle('active', key === name);
      el.setAttribute('aria-hidden', key === name ? 'false' : 'true');
    }
    document.body.dataset.screen = name;
    this.focusFirst();
  }

  focusFirst() {
    const device = this.app.input ? this.app.input.lastDevice : 'pointer';
    if (device !== 'keyboard' && device !== 'gamepad') return;
    // The screen fades in (visibility is transitioned), so focus can fail on
    // the first frames - retry until it sticks.
    let tries = 0;
    const attempt = () => {
      const root = this.screens[this.current];
      if (!root || root.contains(document.activeElement)) return;
      const target = $('.btn.primary:not([disabled])', root) || $('button:not([disabled]), input, select', root);
      if (!target) return;
      target.focus({ preventScroll: true });
      if (document.activeElement !== target && ++tries < 20) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  }

  focusables() {
    const root = this.screens[this.current];
    if (!root) return [];
    return $$('button:not([disabled]), input, select', root).filter(el => el.offsetParent !== null);
  }

  // Spatial navigation for keyboard arrows and gamepads
  navigate(dir, active) {
    const items = this.focusables();
    if (!items.length) return false;
    if (!items.includes(active)) {
      ($('.btn.primary', this.screens[this.current]) || items[0]).focus();
      return true;
    }
    if (active.type === 'range' && (dir === 'left' || dir === 'right')) {
      const step = Number(active.step || 0.05);
      active.value = Math.max(Number(active.min), Math.min(Number(active.max), Number(active.value) + (dir === 'left' ? -step : step)));
      active.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    const a = active.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === active) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - ax;
      const dy = r.top + r.height / 2 - ay;
      const ok = dir === 'up' ? dy < -4 : dir === 'down' ? dy > 4 : dir === 'left' ? dx < -4 : dx > 4;
      if (!ok) continue;
      const vertical = dir === 'up' || dir === 'down';
      const score = (vertical ? Math.abs(dy) : Math.abs(dx)) + (vertical ? Math.abs(dx) : Math.abs(dy)) * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      best.focus();
      best.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      this.app.audio.play('hover', { minGap: 0.05 });
      return true;
    }
    return false;
  }

  confirm() {
    const el = document.activeElement;
    const root = this.screens[this.current];
    if (el && root && root.contains(el)) el.click();
    else this.focusFirst();
  }

  // ---------------------------------------------------------------- loading

  setLoading(p, text) {
    $('#loading-fill').style.width = `${Math.round(p * 100)}%`;
    if (text) $('#loading-text').textContent = text;
  }

  hideLoading() {
    const el = $('#loading');
    el.classList.add('done');
    setTimeout(() => el.remove(), 700);
  }

  fatal(message) {
    $('#fatal').hidden = false;
    if (message) $('#fatal-text').textContent = message;
    const loading = $('#loading');
    if (loading) loading.remove();
  }

  // -------------------------------------------------------------------- HUD

  setDepth(depth) {
    this.hud.depth.textContent = depth;
  }

  setScore(score, bump = false) {
    this.hud.score.textContent = fmt(score);
    if (bump) this.bump(this.hud.score);
  }

  setEnergy(value, delta = 0) {
    this.hud.energy.textContent = value;
    this.hud.energyWrap.classList.toggle('low', value <= 3);
    if (delta > 0) this.bump(this.hud.energyWrap, 'gain');
    else if (delta < 0 && value <= 3) this.bump(this.hud.energyWrap, 'drain');
  }

  setItems({ pickaxes, shield, flares }) {
    this.hud.pick.querySelector('.n').textContent = pickaxes;
    this.hud.pick.classList.toggle('empty', pickaxes <= 0);
    this.hud.shield.classList.toggle('empty', !shield);
    this.hud.flare.querySelector('.n').textContent = flares;
    this.hud.flare.classList.toggle('empty', flares <= 0);
    this.hud.touchFlares.textContent = flares;
    this.hud.flareBtn.classList.toggle('empty', flares <= 0);
  }

  setCombo(multiplier) {
    const el = this.hud.combo;
    if (multiplier > 1) {
      el.textContent = `COMBO ×${multiplier.toFixed(2).replace(/0$/, '')}`;
      el.classList.add('on');
      this.bump(el);
    } else {
      el.classList.remove('on');
    }
  }

  bump(el, cls = 'bump') {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  setTouchVisible(visible) {
    document.body.classList.toggle('touch-on', visible);
  }

  setKeyHints(visible) {
    document.body.classList.toggle('keys-on', visible);
  }

  // --------------------------------------------------------------- overlays

  float(text, x, y, style = 'info') {
    if (this.floaters.childElementCount > 24) this.floaters.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = `floater ${style}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.addEventListener('animationend', () => el.remove());
    this.floaters.appendChild(el);
  }

  setRevealBar(fraction) {
    if (!this.revealBar) this.revealBar = $('#reveal-bar');
    const on = fraction > 0;
    this.revealBar.classList.toggle('on', on);
    if (on) this.revealBar.firstElementChild.style.transform = `scaleX(${Math.min(1, fraction)})`;
  }

  banner(title, subtitle = '', style = '', duration = 2.4) {
    const el = this.bannerEl;
    el.className = `banner ${style}`;
    el.innerHTML = `<div class="banner-title">${esc(title)}</div>${subtitle ? `<div class="banner-sub">${esc(subtitle)}</div>` : ''}`;
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => el.classList.remove('show'), duration * 1000);
  }

  toast(title, desc = '', icon = 'star') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="icon">${Icons[icon] || ''}</span><div><strong>${esc(title)}</strong>${desc ? `<small>${esc(desc)}</small>` : ''}</div>`;
    this.toastsEl.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, 3800);
  }

  hint(text, duration = 4.5) {
    if (this.hintQueue.some(h => h.text === text)) return;
    this.hintQueue.push({ text, duration });
    if (!this.hintTimer) this.nextHint();
  }

  nextHint() {
    const h = this.hintQueue.shift();
    if (!h) {
      this.hintTimer = null;
      this.hintEl.classList.remove('show');
      return;
    }
    this.hintEl.innerHTML = `<span class="icon">${Icons.info}</span>${esc(h.text)}`;
    this.hintEl.classList.add('show');
    this.hintTimer = setTimeout(() => {
      this.hintEl.classList.remove('show');
      this.hintTimer = setTimeout(() => this.nextHint(), 350);
    }, h.duration * 1000);
  }

  clearHints() {
    this.hintQueue = [];
    clearTimeout(this.hintTimer);
    this.hintTimer = null;
    this.hintEl.classList.remove('show');
  }

  clearFloaters() {
    this.floaters.innerHTML = '';
  }

  setSkipHint(visible, text) {
    const el = $('#skip');
    if (text) el.textContent = text;
    el.classList.toggle('show', visible);
  }

  // ----------------------------------------------------------------- title

  coinPill(coins) {
    return `<span class="icon coin">${Icons.coin}</span>${fmt(coins)}`;
  }

  renderTitle(profile) {
    for (const el of $$('[data-bind="coins"]')) el.innerHTML = this.coinPill(profile.coins);
    const daily = profile.dailyInfo();
    $('[data-bind="daily"]').textContent = daily.best > 0 ? `Today's best ${fmt(daily.best)}` : 'Same mine for everyone today';
    const affordable = UPGRADES.some(u => {
      const cost = upgradeCost(u, profile.level(u.id));
      return cost != null && cost <= profile.coins;
    });
    const badge = $('[data-bind="shopBadge"]');
    badge.textContent = affordable ? 'NEW' : '';
    badge.classList.toggle('on', affordable);
    const st = profile.data.stats;
    $('[data-bind="best"]').textContent = st.runs > 0 ? `Best ${st.bestDepth} m · ${fmt(st.bestScore)} pts` : `v${GameInfo.VERSION}`;
  }

  // ------------------------------------------------------------------ shop

  renderShop(profile) {
    for (const el of $$('[data-bind="coins"]')) el.innerHTML = this.coinPill(profile.coins);
    const body = $('#shop-body');
    body.innerHTML = `<p class="page-intro">Coins come from ores, chests and depth. Upgrades last forever.</p>
      <div class="shop-grid">${UPGRADES.map(u => {
        const level = profile.level(u.id);
        const max = u.costs.length;
        const cost = upgradeCost(u, level);
        const pips = Array.from({ length: max }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
        const canBuy = cost != null && profile.coins >= cost;
        const button = cost == null
          ? '<button class="btn small" disabled>Maxed</button>'
          : `<button class="btn small ${canBuy ? 'primary' : ''}" data-action="buy" data-id="${u.id}" ${canBuy ? '' : 'aria-disabled="true"'}>
              <span class="icon coin">${Icons.coin}</span>${fmt(cost)}</button>`;
        return `<div class="card upgrade ${cost == null ? 'maxed' : ''}">
          <div class="card-icon">${Icons[u.icon] || ''}</div>
          <div class="card-main">
            <div class="card-title">${esc(u.name)}</div>
            <div class="pips">${pips}</div>
            <div class="card-desc">${cost == null ? '' : '<span class="next">Next:</span> '}${esc(u.desc(cost == null ? level : level + 1))}</div>
          </div>
          ${button}
        </div>`;
      }).join('')}</div>`;
  }

  // --------------------------------------------------------------- records

  renderRecords(profile) {
    for (const tab of $$('.tab')) {
      const on = tab.dataset.tab === this.recordsTab;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    const body = $('#records-body');
    const d = profile.data;
    if (this.recordsTab === 'scores') {
      body.innerHTML = d.scores.length === 0
        ? '<p class="empty-note">No scores yet. Go dig!</p>'
        : `<ol class="scores">${d.scores.map((s, i) => `
            <li class="${i < 3 ? `top top${i + 1}` : ''}">
              <span class="rank">${i + 1}</span>
              <span class="name">${esc(s.name)}${s.daily ? ' <em class="tag">daily</em>' : ''}${s.legacy ? ' <em class="tag">classic</em>' : ''}</span>
              <span class="depth">${s.depth} m</span>
              <span class="score">${fmt(s.score)}</span>
            </li>`).join('')}</ol>`;
    } else if (this.recordsTab === 'stats') {
      const st = d.stats;
      const deaths = Object.entries(st.deaths || {}).sort((a, b) => b[1] - a[1]);
      body.innerHTML = `
        <div class="stat-grid">
          ${this.statCard('Runs', fmt(st.runs))}
          ${this.statCard('Best depth', `${st.bestDepth} m`)}
          ${this.statCard('Best score', fmt(st.bestScore))}
          ${this.statCard('Total depth', `${fmt(st.totalDepth)} m`)}
          ${this.statCard('Blocks dug', fmt(st.blocksDug))}
          ${this.statCard('Time underground', formatTime(st.playTime))}
          ${this.statCard('Torches found', fmt(st.torches))}
          ${this.statCard('Monsters defeated', fmt(st.monstersKilled))}
        </div>
        <h3>Ores collected</h3>
        <div class="ore-row">${ORE_KEYS.map(k => this.oreChip(blockIcon(ORE_TYPES[k]), st.ores[k] || 0)).join('')}
          ${GEM_VARIANTS.map((g, i) => this.oreChip(blockIcon(B.GEM, i), st.gems[i] || 0, g.name)).join('')}</div>
        ${deaths.length ? `<h3>How runs ended</h3><ul class="deaths">${deaths.map(([cause, n]) => `<li><span>${esc(DEATH_TEXT[cause] || cause)}</span><b>${n}</b></li>`).join('')}</ul>` : ''}`;
    } else {
      const unlocked = ACHIEVEMENTS.filter(a => d.achievements[a.id]).length;
      body.innerHTML = `<p class="page-intro">${unlocked} / ${ACHIEVEMENTS.length} unlocked</p>
        <div class="ach-grid">${ACHIEVEMENTS.map(a => {
          const got = d.achievements[a.id];
          return `<div class="card ach ${got ? 'got' : 'locked'}">
            <div class="card-icon">${got ? Icons.star : Icons.lock}</div>
            <div class="card-main"><div class="card-title">${esc(a.name)}</div><div class="card-desc">${esc(a.desc)}</div></div>
            <div class="ach-reward"><span class="icon coin">${Icons.coin}</span>${a.coins}</div>
          </div>`;
        }).join('')}</div>`;
    }
  }

  statCard(label, value) {
    return `<div class="stat-card"><span class="label">${esc(label)}</span><span class="value">${value}</span></div>`;
  }

  oreChip(src, count, title = '') {
    return `<div class="ore-chip ${count ? '' : 'none'}" title="${esc(title)}"><img src="${src}" alt=""><span>${fmt(count)}</span></div>`;
  }

  // -------------------------------------------------------------- settings

  renderSettings(settings, caps) {
    const body = $('#settings-body');
    const slider = (key, label) => `
      <label class="setting">
        <span class="setting-label">${label}</span>
        <input type="range" min="0" max="1" step="0.05" value="${settings[key]}" data-setting="${key}" aria-label="${label}">
        <output>${Math.round(settings[key] * 100)}%</output>
      </label>`;
    const toggle = (key, label, desc = '') => `
      <div class="setting">
        <span class="setting-label">${label}${desc ? `<small>${desc}</small>` : ''}</span>
        <button class="switch ${settings[key] ? 'on' : ''}" data-action="toggle" data-key="${key}" role="switch" aria-checked="${settings[key] ? 'true' : 'false'}" aria-label="${label}"><i></i></button>
      </div>`;
    const choice = (key, label, options) => `
      <div class="setting">
        <span class="setting-label">${label}</span>
        <div class="segmented" role="radiogroup" aria-label="${label}">${options.map(([v, l]) => `
          <button class="seg ${settings[key] === v ? 'on' : ''}" data-action="choose" data-key="${key}" data-value="${v}" role="radio" aria-checked="${settings[key] === v}">${l}</button>`).join('')}
        </div>
      </div>`;

    body.innerHTML = `
      <h3>Sound</h3>
      ${slider('master', 'Master volume')}
      ${slider('music', 'Music')}
      ${slider('sfx', 'Effects')}
      ${toggle('muted', 'Mute everything', 'Shortcut: M')}
      <h3>Gameplay</h3>
      ${choice('touchControls', 'On-screen buttons', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']])}
      ${toggle('shake', 'Screen shake')}
      ${toggle('showHints', 'Tutorial hints')}
      ${caps.vibrate ? toggle('haptics', 'Vibration') : ''}
      <label class="setting">
        <span class="setting-label">Name on the scoreboard</span>
        <input type="text" class="name-input" maxlength="10" value="${esc(this.app.profile.data.name)}" data-setting="name" autocomplete="off" autocapitalize="characters" spellcheck="false">
      </label>
      <h3>Graphics</h3>
      ${choice('quality', 'Quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
      ${caps.fullscreen ? '<div class="setting"><span class="setting-label">Fullscreen</span><button class="btn small" data-action="fullscreen"><span class="icon">' + Icons.fullscreen + '</span>Toggle</button></div>' : ''}
      <h3>Progress</h3>
      <div class="setting">
        <span class="setting-label">Reset progress<small>Coins, upgrades, records and achievements</small></span>
        <button class="btn small danger" data-action="reset">${this.confirmReset ? 'Tap again to confirm' : 'Reset'}</button>
      </div>`;

    for (const input of $$('input[type="range"]', body)) {
      input.addEventListener('input', () => {
        input.nextElementSibling.textContent = `${Math.round(input.value * 100)}%`;
        this.app.onSettingChange(input.dataset.setting, Number(input.value));
      });
    }
    const name = $('.name-input', body);
    name.addEventListener('input', () => {
      const clean = name.value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 10);
      if (clean !== name.value) name.value = clean;
      this.app.onSettingChange('name', clean.trim() || 'MINER');
    });
  }

  // ---------------------------------------------------------------- how to

  renderHowTo(isTouch) {
    const img = (type, variant = 0) => `<img src="${blockIcon(type, variant)}" alt="">`;
    const controls = isTouch
      ? '<b>Swipe</b> or use the arrow buttons. You can also <b>tap a block</b> next to the miner. Hold to keep digging.'
      : '<kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to dig, <kbd>F</kbd>/<kbd>Space</kbd> for a flare, <kbd>Esc</kbd> to pause. Clicking a neighbouring block works too. Gamepads are supported.';
    $('#howto-body').innerHTML = `
      <div class="howto">
        <div class="card how"><div class="how-icons">${Icons.down}</div><div><h4>Dig down</h4>
          <p>You can dig left, right and down - never up. ${controls}</p></div></div>
        <div class="card how"><div class="how-icons"><span class="icon energy">${Icons.energy}</span></div><div><h4>Energy</h4>
          <p>Digging dirt costs 1 energy. Ores give energy back:</p>
          <div class="ore-legend">
            <span>${img(B.COAL)}+2</span><span>${img(B.IRON)}+3</span><span>${img(B.GOLD)}+4</span><span>${img(B.DIAMOND)}+6</span><span>${img(B.GEM, 0)}+10</span>
          </div></div></div>
        <div class="card how"><div class="how-icons">${img(B.TORCH)}</div><div><h4>Remember the dark</h4>
          <p>Underground your headlamp only lights the blocks around you. Grab the <b>torch</b> near the bottom of each section to light up the next one for a moment - memorize the way!</p></div></div>
        <div class="card how"><div class="how-icons">${img(B.TNT)}</div><div><h4>Dangers</h4>
          <p><b>TNT</b> explodes when you dig into it. <b>Stone</b> needs a pickaxe (reinforced stone and obsidian need several hits). <b>Boulders</b> fall when you dig beneath them. <b>Magma</b> glows but costs 3 energy.</p></div></div>
        <div class="card how"><div class="how-icons"><img src="${monsterIcon('crawler')}" alt=""></div><div><h4>Cave monsters</h4>
          <p>Below 30 m monsters sleep in hollow tunnels. Their glowing eyes give them away. Once awake they hunt you through every open space - keep moving, or drop a boulder on them.</p></div></div>
        <div class="card how"><div class="how-icons">${img(B.PICKAXE)}${img(B.SHIELD)}</div><div><h4>Helpers</h4>
          <p><b>Pickaxe</b> breaks stone. <b>Hard hat</b> saves you from one deadly hit. <b>Flares</b> light up the screen when you need it. <b>Chests</b> hold surprises.</p></div></div>
        <div class="card how"><div class="how-icons"><span class="icon combo">${Icons.star}</span></div><div><h4>Combos &amp; coins</h4>
          <p>Collect ores in quick succession to build a score multiplier up to ×3. Ores, chests and depth earn coins for permanent upgrades.</p></div></div>
      </div>`;
  }

  renderAbout() {
    $('#about-body').innerHTML = `
      <div class="about">
        <div class="logo logo-mid">MINERS</div>
        <p class="version">Version ${GameInfo.VERSION}</p>
        <p>Created by <b>${esc(GameInfo.DEVELOPER)}</b>.</p>
        <p>Originally made in ${GameInfo.ORIGINAL_YEAR} as a 2D canvas game and rebuilt in 3D in ${GameInfo.REMASTER_YEAR}.</p>
        <p>Rendered with <b>PlayCanvas</b>. Every model, texture and most sounds are generated in code.</p>
        <p class="muted">Works on desktop, tablets and phones, offline too once installed (Add to Home Screen / Install app).</p>
      </div>`;
  }

  // ---------------------------------------------------------------- pause

  renderPause(game) {
    const daily = game.mode === 'daily' ? '<span class="tag">Daily Dig</span>' : '';
    $('#pause-info').innerHTML = `${daily}<span>${game.maxDepth} m</span><span>${fmt(game.score)} pts</span>`;
  }

  // ------------------------------------------------------------ game over

  renderGameOver(results, summary, profile) {
    const st = results.stats;
    const badges = [];
    if (summary.newBestScore && profile.data.stats.runs > 1) badges.push('<span class="badge gold">New best score!</span>');
    if (summary.newBestDepth && profile.data.stats.runs > 1) badges.push('<span class="badge gold">New depth record!</span>');
    if (summary.dailyBest) badges.push('<span class="badge">Daily best!</span>');
    if (summary.rank && summary.rank <= 10) badges.push(`<span class="badge">#${summary.rank} on the scoreboard</span>`);

    const ores = [
      ...ORE_KEYS.filter(k => st.ores[k] > 0).map(k => this.oreChip(blockIcon(ORE_TYPES[k]), st.ores[k])),
      ...GEM_VARIANTS.map((g, i) => (st.gems[i] > 0 ? this.oreChip(blockIcon(B.GEM, i), st.gems[i], g.name) : '')).filter(Boolean)
    ];
    const extra = [
      st.torches ? `${st.torches} torch${st.torches === 1 ? '' : 'es'}` : '',
      st.monstersKilled ? `${st.monstersKilled} monster${st.monstersKilled === 1 ? '' : 's'} defeated` : '',
      st.chests ? `${st.chests} chest${st.chests === 1 ? '' : 's'}` : '',
      st.maxCombo >= 2 ? `best combo ×${Math.min(3, 1 + (st.maxCombo - 1) * 0.25).toFixed(2).replace(/0$/, '')}` : '',
      formatTime(st.time)
    ].filter(Boolean);

    const coins = results.coins;
    const parts = [];
    if (coins.ores) parts.push(`ores ${coins.ores}`);
    if (coins.depth) parts.push(`depth ${coins.depth}`);
    if (coins.bonus) parts.push(`chests ${coins.bonus}`);
    if (summary.achievementCoins) parts.push(`achievements ${summary.achievementCoins}`);
    const totalCoins = coins.total + summary.achievementCoins;

    $('#over-panel').innerHTML = `
      <h2 class="over-title">${results.mode === 'daily' ? 'Daily Dig over' : 'Game over'}</h2>
      <p class="over-cause"><span class="icon">${Icons.skull}</span>${esc(DEATH_TEXT[results.cause] || 'The mine got you!')}</p>
      <div class="over-stats">
        <div class="big-stat"><span class="label">Depth</span><span class="value" data-count="${results.depth}" data-suffix=" m">0 m</span></div>
        <div class="big-stat"><span class="label">Score</span><span class="value" data-count="${results.score}">0</span></div>
      </div>
      ${badges.length ? `<div class="badges">${badges.join('')}</div>` : ''}
      ${ores.length ? `<div class="ore-row">${ores.join('')}</div>` : ''}
      <p class="over-extra">${extra.map(esc).join(' · ')}</p>
      <div class="over-coins"><span class="icon coin">${Icons.coin}</span>+${fmt(totalCoins)} coins${parts.length ? `<small>${parts.join(' · ')}</small>` : ''}</div>
      ${summary.rank ? `<label class="over-name"><span>Name on the scoreboard</span>
        <input type="text" class="name-input" maxlength="10" value="${esc(profile.data.name)}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Name on the scoreboard"></label>` : ''}
      ${summary.unlocked.length ? `<div class="over-ach">${summary.unlocked.map(a => `<div class="ach-line"><span class="icon">${Icons.star}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`).join('')}</div>` : ''}
      <div class="row">
        <button class="btn" data-action="menu">Menu</button>
        <button class="btn" data-action="shop-from-over"><span data-icon="pickaxe"></span>Upgrades</button>
        <button class="btn primary" data-action="retry"><span data-icon="play"></span>Dig again</button>
      </div>`;
    this.hydrateIcons($('#over-panel'));
    const nameInput = $('#over-panel .name-input');
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        const clean = nameInput.value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 10);
        if (clean !== nameInput.value) nameInput.value = clean;
        this.app.renameScore(summary.rank, clean.trim() || 'MINER');
      });
      nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') nameInput.blur();
      });
    }

    // count-up animation
    const start = performance.now();
    const counters = $$('[data-count]', $('#over-panel'));
    const tick = now => {
      const k = Math.min(1, (now - start) / 1100);
      const e = 1 - Math.pow(1 - k, 3);
      for (const el of counters) el.textContent = `${fmt(Number(el.dataset.count) * e)}${el.dataset.suffix || ''}`;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
