const WATCHLIST_KEY = 'nunchi_watchlist_v1';
const DOMESTIC_ORDER_KEY = 'nunchi_domestic_cards_v1';
const GLOBAL_ORDER_KEY = 'nunchi_global_cards_v1';
const DOMESTIC_CARDS_CACHE_KEY = 'nunchi_cache_domestic_v1';
const GLOBAL_CARDS_CACHE_KEY = 'nunchi_cache_global_v1';
const WATCH_CARDS_CACHE_KEY = 'nunchi_cache_watch_v1';

// 마지막으로 성공했던 카드 목록을 localStorage에 남겨뒀다가, 앱을 다시 열었을 때
// 실전투자 키 레이트리밋 때문에 몇 초씩 걸리는 실제 시세를 기다리는 동안 화면이
// 비어있지 않게 바로 보여줌(stale-while-revalidate) — 최신 값이 오면 바로 교체됨.
function readCardsCache(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key));
    return Array.isArray(raw) ? raw : null;
  } catch {
    return null;
  }
}
function writeCardsCache(key, cards) {
  try {
    localStorage.setItem(key, JSON.stringify(cards));
  } catch {
    // 저장 실패해도(용량 초과 등) 화면 표시엔 지장 없음 — 다음엔 그냥 캐시 없이 시작
  }
}

const DEFAULT_DOMESTIC_ORDER = [
  { kind: 'index', id: 'KOSPI' },
  { kind: 'index', id: 'KOSDAQ' },
];
const DEFAULT_GLOBAL_ORDER = [
  { kind: 'index', id: 'IXIC' },
  { kind: 'index', id: 'DJI' },
  { kind: 'index', id: 'SPX' },
];

// ---------- GA4 이벤트 추적 ----------
function track(name, params) {
  if (typeof gtag === 'function') gtag('event', name, params || {});
}

// ---------- 유틸 ----------
// 종목명 등은 KIS 마스터 데이터에서 오지만, 만에 하나 이상한 값이 섞여도
// innerHTML에 그대로 꽂히지 않도록 항상 이스케이프해서 씀 (방어적 조치)
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatPrice(n) {
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}
function changeClass(change) {
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}
function changeSign(change) {
  if (change > 0) return '+';
  return ''; // 음수는 이미 '-' 포함
}
function nowLabel() {
  const d = new Date();
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function readList(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key));
    return Array.isArray(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}
function writeList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

// 카드 안에 들어가는 작은 추세선 (축/라벨 없음)
function sparklineSvg(trend, cls) {
  if (!trend || trend.length < 2) return '';
  const w = 96, h = 28, pad = 3;
  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const range = max - min || 1;
  const points = trend
    .map((v, i) => {
      const x = (i / (trend.length - 1)) * (w - pad * 2) + pad;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" class="spark-line ${cls}" />
    </svg>
  `;
}

// ---------- 다크모드 / 라이트모드 (설정 패널 안의 라이트/다크 선택 버튼) ----------
const THEME_KEY = 'nunchi_theme_v1';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0d10' : '#f2f4f7');
  document.querySelectorAll('.settings-theme-option').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

document.querySelectorAll('.settings-theme-option').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyTheme(btn.dataset.theme);
    track('theme_change', { theme: btn.dataset.theme });
  });
});

// ---------- 설치 (PWA) ----------
// 크로미움 계열(엣지/크롬)에서만 지원. 설치 가능한 상태일 때만 버튼이 나타남.
let deferredInstallPrompt = null;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  installBtn.hidden = true;
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  track('pwa_install_prompt', { outcome: choice.outcome });
  if (choice.outcome !== 'accepted') installBtn.hidden = false;
});

window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  deferredInstallPrompt = null;
});

// ---------- 설정 패널 (위장 테마 + 다크모드를 한 곳에 모음) ----------
const SKIN_KEY = 'nunchi_skin_v1';
// 새 테마를 추가할 땐 여기에 항목만 더하면 설정 목록에 자동으로 나타남 (CSS 구현은 별도)
const SKIN_OPTIONS = [
  { id: 'none', label: '기본 화면' },
  { id: 'excel', label: '엑셀' },
  { id: 'word', label: '워드' },
  { id: 'ppt', label: '파워포인트' },
  { id: 'kakao', label: '카카오톡' },
  { id: 'outlook', label: '아웃룩' },
  { id: 'chrome', label: '크롬(뉴스)' },
];
const BOSS_KEY_SKIN = 'excel'; // Esc 눌렀을 때 전환할 위장 테마

// 상단바(기본 화면)의 settingsBtn과, 각 위장 화면의 로고 버튼(xlLogoBtn 등) 모두
// 같은 설정 패널을 연다 — 어느 화면이 보이든 항상 위장 테마/다크모드를 바꿀 수 있게.
const skinTriggers = [
  document.getElementById('settingsBtn'),
  document.getElementById('xlLogoBtn'),
  document.getElementById('wdLogoBtn'),
  document.getElementById('ppLogoBtn'),
  document.getElementById('kkLogoBtn'),
  document.getElementById('olLogoBtn'),
  document.getElementById('crLogoBtn'),
];
const settingsModal = document.getElementById('settingsModal');
const settingsSkinList = document.getElementById('settingsSkinList');
let activeSkinTrigger = null;

function applySkin(skin) {
  document.documentElement.setAttribute('data-skin', skin);
  localStorage.setItem(SKIN_KEY, skin);
  const opt = SKIN_OPTIONS.find((o) => o.id === skin);
  const label = opt && skin !== 'none' ? `위장 중: ${opt.label} (클릭해서 설정 열기)` : '설정';
  skinTriggers.forEach((btn) => {
    if (btn.classList.contains('icon-btn')) btn.classList.toggle('skin-active', skin !== 'none');
    btn.title = label;
  });
  renderSkinList();
}

function renderSkinList() {
  const current = document.documentElement.getAttribute('data-skin') || 'none';
  settingsSkinList.innerHTML = SKIN_OPTIONS.map((o) => `
    <button class="skin-option${o.id === current ? ' selected' : ''}" data-skin="${o.id}" ${o.comingSoon ? 'disabled' : ''}>
      <span>${o.label}</span>
      ${o.comingSoon ? '<span class="skin-badge">준비중</span>' : '<span class="skin-check">✓</span>'}
    </button>
  `).join('');

  settingsSkinList.querySelectorAll('.skin-option:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      applySkin(btn.dataset.skin);
      track('skin_change', { skin: btn.dataset.skin, source: 'settings' });
    });
  });
}

function openSettings(triggerEl) {
  activeSkinTrigger = triggerEl;
  settingsModal.hidden = false;
  if (triggerEl) triggerEl.setAttribute('aria-expanded', 'true');
}
function closeSettings() {
  settingsModal.hidden = true;
  if (activeSkinTrigger) activeSkinTrigger.setAttribute('aria-expanded', 'false');
  activeSkinTrigger = null;
}

applySkin(localStorage.getItem(SKIN_KEY) || 'none');

skinTriggers.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (settingsModal.hidden) openSettings(btn);
    else closeSettings();
  });
});
document.getElementById('settingsCloseBtn').addEventListener('click', closeSettings);
document.getElementById('settingsBackdrop').addEventListener('click', closeSettings);

// Esc 키 = 보스키: 누가 오는 게 보이면 즉시 위장 화면으로 (설정 패널이 열려 있었다면 같이 닫음)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    applySkin(BOSS_KEY_SKIN);
    track('skin_change', { skin: BOSS_KEY_SKIN, source: 'boss_key' });
    closeSettings();
  }
});

// ---------- 탭 전환 ----------
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    track('tab_switch', { tab: btn.dataset.tab });
  });
});

// ---------- 카드 렌더 (지수/개별종목 공통) ----------
function renderCard(item) {
  const cls = changeClass(item.change);
  return `
    <div class="idx-card${item.removable ? ' has-remove' : ''}">
      <span class="drag-handle" aria-label="순서 변경">⠿</span>
      ${
        item.starrable
          ? `<button class="card-star${item.starred ? ' starred' : ''}"
              data-symbol="${escapeHtml(item.symbol)}" data-name="${escapeHtml(item.name)}"
              data-market="${escapeHtml(item.market || '')}" data-excd="${escapeHtml(item.excd || '')}" data-label="${escapeHtml(item.label || '')}"
              aria-label="관심종목 ${item.starred ? '삭제' : '추가'}">${item.starred ? '★' : '☆'}</button>`
          : ''
      }
      ${item.removable ? `<button class="card-remove" data-symbol="${escapeHtml(item.symbol)}" aria-label="삭제">✕</button>` : ''}
      <div class="idx-info">
        <span class="idx-name">${escapeHtml(item.name)}</span>
        <span class="idx-sub">${escapeHtml(item.sub || '')}${item.failed ? ' · 조회 실패' : ''}</span>
      </div>
      <div class="idx-spark">${sparklineSvg(item.trend, cls)}</div>
      <div class="idx-numbers">
        <div class="idx-price"><span class="idx-price-value" data-anim-key="${escapeHtml(String(item.id || item.symbol || ''))}" data-raw-price="${item.price}">${formatPrice(item.price)}</span><span class="idx-unit">${item.market === 'overseas' ? '달러' : '원'}</span></div>
        <div class="idx-change ${cls}">
          ${changeSign(item.change)}${formatPrice(item.change)} (${changeSign(item.changePct)}${item.changePct.toFixed(2)}%)
        </div>
      </div>
    </div>
  `;
}

// ---------- 가격 변동 시 숫자 롤링 애니메이션 (토스증권 스타일) ----------
function animateNumber(el, from, to, duration = 500) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic — 빠르게 시작해서 서서히 멈춤
    el.textContent = formatPrice(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatPrice(to); // 반올림 오차 없이 정확한 최종값으로 마무리
  }
  requestAnimationFrame(tick);
}

// grid.innerHTML을 통째로 교체하기 전에 기존 가격을 기억해뒀다가, 교체 후 값이
// 바뀐 카드만 이전 값에서 새 값으로 숫자가 굴러가듯 애니메이션하고 카드에 짧게
// 상승/하락 색이 비침 — grid.innerHTML = cards.map(renderCard).join('') 대신 이걸 씀
function renderCardsWithAnimation(grid, cards) {
  const prevPrices = {};
  grid.querySelectorAll('.idx-price-value[data-anim-key]').forEach((el) => {
    prevPrices[el.dataset.animKey] = Number(el.dataset.rawPrice);
  });

  grid.innerHTML = cards.map(renderCard).join('');

  grid.querySelectorAll('.idx-price-value[data-anim-key]').forEach((el) => {
    const key = el.dataset.animKey;
    const to = Number(el.dataset.rawPrice);
    const from = prevPrices[key];
    if (from === undefined || Number.isNaN(from) || from === to) return;
    animateNumber(el, from, to);
    const card = el.closest('.idx-card');
    if (!card) return;
    const flashClass = to > from ? 'price-flash-up' : 'price-flash-down';
    card.classList.add(flashClass);
    setTimeout(() => card.classList.remove(flashClass), 700);
  });
}

function isInWatchlist(symbol) {
  return getWatchlist().some((w) => w.symbol === symbol);
}

function toggleStar(btn) {
  const symbol = btn.dataset.symbol;
  let nowStarred;
  if (isInWatchlist(symbol)) {
    removeFromWatchlist(symbol); // 관심종목 탭 리스트는 이 안에서 알아서 다시 그려짐
    track('watchlist_remove', { market: btn.dataset.market });
    nowStarred = false;
  } else {
    addToWatchlist({
      symbol,
      name: btn.dataset.name,
      market: btn.dataset.market,
      excd: btn.dataset.excd || undefined,
      label: btn.dataset.label,
    });
    track('watchlist_add', { market: btn.dataset.market });
    nowStarred = true;
  }
  // 시세가 바뀐 게 아니라 관심종목 여부만 바뀐 거라, 국내/해외 리스트 전체를 다시 불러올
  // 필요 없음 — 같은 종목이 보이는 별 아이콘만 즉시 갱신 (네트워크 요청 없이 즉각 반영)
  document.querySelectorAll(`.card-star[data-symbol="${symbol}"]`).forEach((b) => {
    b.classList.toggle('starred', nowStarred);
    b.textContent = nowStarred ? '★' : '☆';
    b.setAttribute('aria-label', nowStarred ? '관심종목 삭제' : '관심종목 추가');
  });
}

function showStatus(message) {
  const bar = document.getElementById('statusBar');
  document.getElementById('statusText').textContent = message;
  bar.hidden = false;
}

// ---------- 드래그 정렬 (포인터 이벤트 기반, 마우스/터치 공용) ----------
// container: 카드가 들어있는 grid 엘리먼트 (한 번만 연결, innerHTML이 바뀌어도 유지됨)
// getItems: 현재 순서 배열을 반환하는 함수 (드래그 시작 시점에 호출)
// onReorder: 새 순서 배열을 받아서 저장 + 재렌더링하는 함수
function enableDragReorder(container, getItems, onReorder) {
  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    const card = handle.closest('.idx-card');
    if (!card) return;

    const siblings = Array.from(container.children);
    const startIndex = siblings.indexOf(card);
    if (startIndex === -1) return;
    const rects = siblings.map((el) => el.getBoundingClientRect());
    const startRect = rects[startIndex];
    const startY = e.clientY;

    let targetIndex = startIndex;
    card.setPointerCapture(e.pointerId);
    card.classList.add('card-dragging');
    document.body.classList.add('no-select');

    function onMove(ev) {
      const dy = ev.clientY - startY;
      card.style.transform = `translateY(${dy}px)`;
      const centerY = startRect.top + startRect.height / 2 + dy;
      let closest = 0;
      let closestDist = Infinity;
      rects.forEach((r, i) => {
        const c = r.top + r.height / 2;
        const d = Math.abs(centerY - c);
        if (d < closestDist) {
          closestDist = d;
          closest = i;
        }
      });
      targetIndex = closest;
    }
    function onUp(ev) {
      card.releasePointerCapture(ev.pointerId);
      card.style.transform = '';
      card.classList.remove('card-dragging');
      document.body.classList.remove('no-select');
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);

      if (targetIndex !== startIndex) {
        const items = getItems();
        const [moved] = items.splice(startIndex, 1);
        items.splice(targetIndex, 0, moved);
        onReorder(items);
      }
    }
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onUp);
  });
}

// ---------- 국내지수 ----------
function getDomesticOrder() {
  return readList(DOMESTIC_ORDER_KEY, DEFAULT_DOMESTIC_ORDER.slice());
}
function saveDomesticOrder(order) {
  writeList(DOMESTIC_ORDER_KEY, order);
}
function addDomesticCard(item) {
  const order = getDomesticOrder();
  if (order.some((o) => o.kind === 'stock' && o.symbol === item.symbol)) return;
  order.push({ kind: 'stock', symbol: item.symbol, name: item.name, label: item.label });
  saveDomesticOrder(order);
  loadDomestic();
}
function removeDomesticCard(symbol) {
  saveDomesticOrder(getDomesticOrder().filter((o) => !(o.kind === 'stock' && o.symbol === symbol)));
  loadDomestic();
}

async function loadDomestic() {
  const grid = document.getElementById('domesticGrid');
  const order = getDomesticOrder();

  const cached = readCardsCache(DOMESTIC_CARDS_CACHE_KEY);
  if (cached) {
    grid.innerHTML = cached.map(renderCard).join('');
    grid.querySelectorAll('.card-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeDomesticCard(btn.dataset.symbol));
    });
    grid.querySelectorAll('.card-star').forEach((btn) => {
      btn.addEventListener('click', () => toggleStar(btn));
    });
  }

  try {
    const indices = await MarketData.getDomesticIndices();
    const indexMap = Object.fromEntries(indices.map((i) => [i.id, i]));
    const stockOrder = order.filter((o) => o.kind === 'stock');
    const quotes = await Promise.all(
      stockOrder.map(async (o) => {
        try {
          return await MarketData.getQuote(o.symbol, o.name, 'domestic');
        } catch {
          return { symbol: o.symbol, name: o.name, price: 0, change: 0, changePct: 0, failed: true };
        }
      })
    );
    const quoteMap = Object.fromEntries(quotes.map((q) => [q.symbol, q]));

    const cards = order
      .map((o) => {
        if (o.kind === 'index') {
          const idx = indexMap[o.id];
          return idx ? { ...idx, removable: false, market: 'domestic' } : null;
        }
        const q = quoteMap[o.symbol];
        return q
          ? {
              ...q,
              sub: `${q.symbol} · ${o.label || ''}`,
              removable: true,
              starrable: true,
              starred: isInWatchlist(o.symbol),
              market: 'domestic',
              label: o.label,
            }
          : null;
      })
      .filter(Boolean);

    renderCardsWithAnimation(grid, cards);
    writeCardsCache(DOMESTIC_CARDS_CACHE_KEY, cards);
    document.getElementById('domesticUpdated').textContent = nowLabel();
    grid.querySelectorAll('.card-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeDomesticCard(btn.dataset.symbol));
    });
    grid.querySelectorAll('.card-star').forEach((btn) => {
      btn.addEventListener('click', () => toggleStar(btn));
    });
  } catch (err) {
    if (!cached) showStatus('국내 지수를 불러오지 못했어요. 프록시 서버가 실행 중인지 확인해주세요.');
  }
}

// ---------- 해외지수 ----------
function getGlobalOrder() {
  return readList(GLOBAL_ORDER_KEY, DEFAULT_GLOBAL_ORDER.slice());
}
function saveGlobalOrder(order) {
  writeList(GLOBAL_ORDER_KEY, order);
}
function addGlobalCard(item) {
  const order = getGlobalOrder();
  if (order.some((o) => o.kind === 'stock' && o.symbol === item.symbol)) return;
  order.push({ kind: 'stock', symbol: item.symbol, name: item.name, excd: item.excd, label: item.label });
  saveGlobalOrder(order);
  loadGlobal();
}
function removeGlobalCard(symbol) {
  saveGlobalOrder(getGlobalOrder().filter((o) => !(o.kind === 'stock' && o.symbol === symbol)));
  loadGlobal();
}

async function loadGlobal() {
  const grid = document.getElementById('globalGrid');
  const order = getGlobalOrder();

  const cached = readCardsCache(GLOBAL_CARDS_CACHE_KEY);
  if (cached) {
    grid.innerHTML = cached.map(renderCard).join('');
    grid.querySelectorAll('.card-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeGlobalCard(btn.dataset.symbol));
    });
    grid.querySelectorAll('.card-star').forEach((btn) => {
      btn.addEventListener('click', () => toggleStar(btn));
    });
  }

  try {
    const indices = await MarketData.getGlobalIndices();
    const indexMap = Object.fromEntries(indices.map((i) => [i.id, i]));
    const stockOrder = order.filter((o) => o.kind === 'stock');
    const quotes = await Promise.all(
      stockOrder.map(async (o) => {
        try {
          return await MarketData.getQuote(o.symbol, o.name, 'overseas', o.excd);
        } catch {
          return { symbol: o.symbol, name: o.name, price: 0, change: 0, changePct: 0, failed: true };
        }
      })
    );
    const quoteMap = Object.fromEntries(quotes.map((q) => [q.symbol, q]));

    const cards = order
      .map((o) => {
        if (o.kind === 'index') {
          const idx = indexMap[o.id];
          return idx ? { ...idx, removable: false, market: 'overseas' } : null;
        }
        const q = quoteMap[o.symbol];
        return q
          ? {
              ...q,
              sub: `${q.symbol} · ${o.label || ''}`,
              removable: true,
              starrable: true,
              starred: isInWatchlist(o.symbol),
              market: 'overseas',
              excd: o.excd,
              label: o.label,
            }
          : null;
      })
      .filter(Boolean);

    renderCardsWithAnimation(grid, cards);
    writeCardsCache(GLOBAL_CARDS_CACHE_KEY, cards);
    document.getElementById('globalUpdated').textContent = nowLabel();
    grid.querySelectorAll('.card-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeGlobalCard(btn.dataset.symbol));
    });
    grid.querySelectorAll('.card-star').forEach((btn) => {
      btn.addEventListener('click', () => toggleStar(btn));
    });
  } catch (err) {
    if (!cached) showStatus('해외 지수를 불러오지 못했어요. 프록시 서버가 실행 중인지 확인해주세요.');
  }
}

// ---------- 관심종목 ----------
function getWatchlist() {
  return readList(WATCHLIST_KEY, []);
}
function saveWatchlist(list) {
  writeList(WATCHLIST_KEY, list);
}

function addToWatchlist(item) {
  const list = getWatchlist();
  if (list.find((it) => it.symbol === item.symbol)) return;
  list.push(item);
  saveWatchlist(list);
  renderWatchlist();
}
function removeFromWatchlist(symbol) {
  saveWatchlist(getWatchlist().filter((it) => it.symbol !== symbol));
  renderWatchlist();
}

async function renderWatchlist() {
  const wrap = document.getElementById('watchList');
  const empty = document.getElementById('watchEmpty');
  const list = getWatchlist();

  if (list.length === 0) {
    wrap.innerHTML = '';
    empty.classList.add('show');
    return;
  }
  empty.classList.remove('show');

  const cached = readCardsCache(WATCH_CARDS_CACHE_KEY);
  if (cached) {
    wrap.innerHTML = cached.map((q) => renderCard({ ...q, starrable: true, starred: true })).join('');
    wrap.querySelectorAll('.card-star').forEach((btn) => {
      btn.addEventListener('click', () => toggleStar(btn));
    });
  }

  const quotes = await Promise.all(
    list.map(async (it) => {
      try {
        const q = await MarketData.getQuote(it.symbol, it.name, it.market, it.excd);
        return { ...q, sub: `${q.symbol} · ${it.label || ''}`, market: it.market, excd: it.excd, label: it.label };
      } catch (err) {
        return {
          symbol: it.symbol, name: it.name, sub: `${it.symbol} · ${it.label || ''}`,
          market: it.market, excd: it.excd, label: it.label,
          price: 0, change: 0, changePct: 0, failed: true,
        };
      }
    })
  );

  renderCardsWithAnimation(wrap, quotes.map((q) => ({ ...q, starrable: true, starred: true })));
  writeCardsCache(WATCH_CARDS_CACHE_KEY, quotes);

  wrap.querySelectorAll('.card-star').forEach((btn) => {
    btn.addEventListener('click', () => toggleStar(btn));
  });
}

// ---------- 검색 (공통 헬퍼) ----------
function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

const SEARCH_QUOTE_PREVIEW_LIMIT = 8; // 미리보기 시세는 상위 N개까지만 (API 호출량 제어)

function setupSearch({ formEl, inputEl, resultsEl, marketFilter, onAdd }) {
  let requestId = 0;

  // mode: 'loading'(불러오는 중) | 'unfetched'(미리보기 범위 밖이라 시세 조회 안 함) | 'ready'(시세 있음)
  function rowHtml(r, mode) {
    const quoteHtml =
      mode === 'loading'
        ? `<span class="sr-quote sr-quote-empty">···</span>`
        : mode === 'unfetched' || r.failed
        ? `<span class="sr-quote sr-quote-empty">-</span>`
        : `<span class="sr-quote">
          <span class="sr-price">${formatPrice(r.price)}</span>
          <span class="sr-change ${changeClass(r.change)}">${changeSign(r.change)}${formatPrice(r.change)} (${changeSign(r.changePct)}${r.changePct.toFixed(2)}%)</span>
        </span>`;
    return `
      <div class="search-result-row" data-symbol="${escapeHtml(r.symbol)}" data-name="${escapeHtml(r.name)}" data-market="${escapeHtml(r.market)}" data-excd="${escapeHtml(r.excd || '')}" data-label="${escapeHtml(r.label)}">
        <span class="sr-info"><span class="sr-name">${escapeHtml(r.name)}</span><span class="sr-code">${escapeHtml(r.symbol)} · ${escapeHtml(r.label)}</span></span>
        ${quoteHtml}
      </div>
    `;
  }

  function bindRowClicks() {
    resultsEl.querySelectorAll('.search-result-row[data-symbol]').forEach((row) => {
      row.addEventListener('click', () => {
        onAdd({
          symbol: row.dataset.symbol,
          name: row.dataset.name,
          market: row.dataset.market,
          excd: row.dataset.excd || undefined,
          label: row.dataset.label,
        });
        track('card_add', { market: row.dataset.market });
        MarketData.trackSearch(row.dataset.market, row.dataset.symbol);
        resultsEl.hidden = true;
        inputEl.value = '';
      });
    });
  }

  async function runSearch(q) {
    const myRequestId = ++requestId; // 검색어가 비어도 증가시켜서, 이전에 날아간 요청을 무효화함

    if (!q) {
      resultsEl.hidden = true;
      return;
    }

    const results = await MarketData.searchSymbol(q, marketFilter);
    if (myRequestId !== requestId) return; // 늦게 도착한 이전 요청 결과는 버림
    track('search', { market: marketFilter, has_results: results && results.length > 0 });

    if (!results || results.length === 0) {
      resultsEl.innerHTML = `<div class="search-result-row"><span class="sr-name">검색 결과가 없어요</span></div>`;
      resultsEl.hidden = false;
      return;
    }

    const preview = results.slice(0, SEARCH_QUOTE_PREVIEW_LIMIT);
    const rest = results.slice(SEARCH_QUOTE_PREVIEW_LIMIT);

    // 1단계: 이름부터 바로 보여주고("···" 로딩 표시), 시세는 뒤이어 채워넣음
    resultsEl.innerHTML =
      preview.map((r) => rowHtml(r, 'loading')).join('') +
      rest.map((r) => rowHtml(r, 'unfetched')).join('');
    resultsEl.hidden = false;
    bindRowClicks();

    const quotes = await Promise.all(
      preview.map((r) =>
        MarketData.getQuote(r.symbol, r.name, r.market, r.excd).catch(() => ({ ...r, failed: true }))
      )
    );
    if (myRequestId !== requestId) return; // 그 사이 검색어가 또 바뀌었으면 폐기

    // 2단계: 미리보기 대상 행만 시세로 교체
    resultsEl.innerHTML =
      preview.map((r, i) => rowHtml({ ...r, ...quotes[i] }, 'ready')).join('') +
      rest.map((r) => rowHtml(r, 'unfetched')).join('');
    bindRowClicks();
  }

  const debouncedSearch = debounce((q) => runSearch(q), 250);

  // 타이핑하는 대로 미리보기 (일부 단어만 입력해도 바로 결과가 뜸)
  inputEl.addEventListener('input', () => {
    debouncedSearch(inputEl.value.trim());
  });

  // 엔터/검색 버튼은 디바운스 없이 즉시 실행
  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch(inputEl.value.trim());
  });
}

// ---------- 인기 검색 티커 (타이틀바, 세로 슬라이딩) ----------
const TICKER_INTERVAL_MS = 3000;
const TICKER_SLIDE_MS = 320;
let tickerItems = [];
let tickerIndex = 0;
let tickerTimer = null;

// 기본 화면 + 6개 위장 모드(엑셀/워드/PPT/카카오톡/아웃룩/크롬) 제목표시줄,
// 총 7곳에 같은 티커를 동시에 띄운다 — 어느 화면이 보이든(CSS가 나머지를
// 숨김) 항상 최신 상태로 맞춰져 있게.
const TICKER_INSTANCES = [
  { wrap: 'tickerWrap', ticker: 'popularTicker', slide: 'tickerSlide', panel: 'tickerPanel' },
  { wrap: 'xlTickerWrap', ticker: 'xlPopularTicker', slide: 'xlTickerSlide', panel: 'xlTickerPanel' },
  { wrap: 'wdTickerWrap', ticker: 'wdPopularTicker', slide: 'wdTickerSlide', panel: 'wdTickerPanel' },
  { wrap: 'ppTickerWrap', ticker: 'ppPopularTicker', slide: 'ppTickerSlide', panel: 'ppTickerPanel' },
  { wrap: 'kkTickerWrap', ticker: 'kkPopularTicker', slide: 'kkTickerSlide', panel: 'kkTickerPanel' },
  { wrap: 'olTickerWrap', ticker: 'olPopularTicker', slide: 'olTickerSlide', panel: 'olTickerPanel' },
  { wrap: 'crTickerWrap', ticker: 'crPopularTicker', slide: 'crTickerSlide', panel: 'crTickerPanel' },
].map((ids) => ({
  wrapEl: document.getElementById(ids.wrap),
  tickerEl: document.getElementById(ids.ticker),
  slideEl: document.getElementById(ids.slide),
  panelEl: document.getElementById(ids.panel),
}));

const TICKER_CACHE_KEY = 'nunchi_cache_ticker_v1';

async function loadPopularTicker() {
  // 인기 검색어 API(Upstash+KIS 마스터 검증) 응답도 기다리는 동안 티커가 비어있지
  // 않게, 지난번에 성공했던 순위를 먼저 보여줌
  const cachedRanked = readCardsCache(TICKER_CACHE_KEY);
  if (cachedRanked && cachedRanked.length > 0) {
    tickerItems = cachedRanked;
    tickerIndex = 0;
    TICKER_INSTANCES.forEach(({ tickerEl }) => { tickerEl.hidden = false; });
    paintTickerSlide();
    if (tickerItems.length > 1) {
      tickerTimer = setInterval(advanceTicker, TICKER_INTERVAL_MS);
    }
  }

  const [domestic, overseas] = await Promise.all([
    MarketData.getPopularSearches('domestic'),
    MarketData.getPopularSearches('overseas'),
  ]);
  const ranked = [...domestic.map((it) => ({ ...it, market: 'domestic' })), ...overseas.map((it) => ({ ...it, market: 'overseas' }))]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  tickerIndex = 0;

  clearInterval(tickerTimer);
  const hasItems = ranked.length > 0;
  TICKER_INSTANCES.forEach(({ tickerEl }) => { tickerEl.hidden = !hasItems; });
  if (!hasItems) {
    tickerItems = [];
    return;
  }
  writeCardsCache(TICKER_CACHE_KEY, ranked);

  // 순위/이름은 시세 없이 바로 보여줌 — 실전투자 키는 초당 호출 제한 때문에
  // 종목 10개 시세를 다 받으려면(캐시 없으면) 최대 몇 초 걸릴 수 있어서, 그동안
  // 티커가 빈 채로 떠 있지 않게 먼저 그리고 시세는 뒤이어 채워 넣음
  tickerItems = ranked;
  paintTickerSlide();
  if (tickerItems.length > 1) {
    tickerTimer = setInterval(advanceTicker, TICKER_INTERVAL_MS);
  }

  // 클라이언트 캐시 덕분에 다른 화면에 이미 떠 있던 종목은 재요청 없이 즉시 붙음
  tickerItems = await Promise.all(
    ranked.map(async (it) => {
      try {
        const q = await MarketData.getQuote(it.symbol, it.name, it.market, it.excd);
        return { ...it, price: q.price, change: q.change, changePct: q.changePct };
      } catch {
        return it; // 시세 조회 실패해도 순위/이름은 그대로 보여줌
      }
    })
  );
  paintTickerSlide(); // 현재 보이는 항목 기준으로 다시 그려서 시세 반영
}

function tickerQuoteHtml(it, priceClass, changeClassPrefix) {
  if (typeof it.price !== 'number') return '';
  const unit = it.market === 'overseas' ? '달러' : '원';
  return (
    `<span class="${priceClass}">${formatPrice(it.price)}${unit}</span>` +
    `<span class="${changeClassPrefix} ${changeClass(it.change)}">${changeSign(it.changePct)}${it.changePct.toFixed(2)}%</span>`
  );
}

function paintTickerSlide() {
  const item = tickerItems[tickerIndex];
  // 슬라이딩 한 줄짜리 티커는 폭이 좁아서(특히 위장 모드 제목표시줄) 가격까지
  // 넣으면 종목명이 밀려서 안 보임 — 등락률만 넣고, 가격은 호버 패널에서 보여줌
  const changeHtml =
    typeof item.changePct === 'number'
      ? `<span class="ticker-change ${changeClass(item.change)}">${changeSign(item.changePct)}${item.changePct.toFixed(2)}%</span>`
      : '';
  const html =
    `<span class="ticker-rank">${tickerIndex + 1}</span><span class="ticker-name">${escapeHtml(item.name)}</span>` + changeHtml;
  TICKER_INSTANCES.forEach(({ slideEl }) => { slideEl.innerHTML = html; });
}

function advanceTicker() {
  TICKER_INSTANCES.forEach(({ slideEl }) => slideEl.classList.add('out')); // 위로 슬라이드 아웃
  setTimeout(() => {
    tickerIndex = (tickerIndex + 1) % tickerItems.length;
    TICKER_INSTANCES.forEach(({ slideEl }) => slideEl.classList.add('enter')); // 트랜지션 끄고 아래쪽 대기 위치로 순간이동
    paintTickerSlide();
    TICKER_INSTANCES.forEach(({ slideEl }) => void slideEl.offsetWidth); // 강제 리플로우
    TICKER_INSTANCES.forEach(({ slideEl }) => slideEl.classList.remove('out', 'enter')); // 트랜지션 다시 켜고 제자리로 슬라이드 인
  }, TICKER_SLIDE_MS);
}

function selectTickerItem(item) {
  if (!item) return;
  document.querySelector(`.tab[data-tab="${item.market === 'domestic' ? 'domestic' : 'global'}"]`)?.click();
  if (item.market === 'domestic') addDomesticCard(item);
  else addGlobalCard(item);
  track('card_add', { market: item.market, source: 'ticker' });
  MarketData.trackSearch(item.market, item.symbol);
}

// ---------- 티커 호버 시 1~10위 전체 목록 ----------
function renderTickerPanel(panelEl) {
  panelEl.innerHTML = tickerItems
    .map(
      (it, i) => `
        <button class="ticker-panel-row" data-index="${i}">
          <span class="tp-rank">${i + 1}</span>
          <span class="tp-name">${escapeHtml(it.name)}</span>
          <span class="tp-quote">${tickerQuoteHtml(it, 'tp-price', 'tp-change') || '<span class="tp-price tp-price-empty">-</span>'}</span>
        </button>
      `
    )
    .join('');
  panelEl.querySelectorAll('.ticker-panel-row').forEach((btn) => {
    btn.addEventListener('click', () => selectTickerItem(tickerItems[Number(btn.dataset.index)]));
  });
}

TICKER_INSTANCES.forEach(({ wrapEl, tickerEl, panelEl }) => {
  tickerEl.addEventListener('click', () => selectTickerItem(tickerItems[tickerIndex]));
  tickerEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tickerEl.click();
    }
  });
  wrapEl.addEventListener('mouseenter', () => {
    if (tickerItems.length === 0) return;
    clearInterval(tickerTimer);
    renderTickerPanel(panelEl);
    panelEl.style.left = '0';
    panelEl.hidden = false;
    // 위장 모드는 제목(파일명)이 길어서 티커가 오른쪽으로 많이 밀려있을 수 있음 —
    // 패널을 항상 티커 왼쪽 끝(left:0)에서 펼치면 화면 오른쪽 밖으로 넘어갈 수 있어서,
    // 실제로 넘치는 만큼 왼쪽으로 당겨서 화면 안에 들어오게 보정함
    const rect = panelEl.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth; // window.innerWidth는 환경에 따라 부정확할 수 있어서 이걸 씀
    const overflowRight = rect.right - (viewportWidth - 8);
    if (overflowRight > 0) {
      panelEl.style.left = `${-overflowRight}px`;
    }
  });
  wrapEl.addEventListener('mouseleave', () => {
    panelEl.hidden = true;
    if (tickerItems.length > 1) tickerTimer = setInterval(advanceTicker, TICKER_INTERVAL_MS);
  });
});

setupSearch({
  formEl: document.getElementById('domesticSearchForm'),
  inputEl: document.getElementById('domesticSearchInput'),
  resultsEl: document.getElementById('domesticSearchResults'),
  marketFilter: 'domestic',
  onAdd: addDomesticCard,
});
setupSearch({
  formEl: document.getElementById('globalSearchForm'),
  inputEl: document.getElementById('globalSearchInput'),
  resultsEl: document.getElementById('globalSearchResults'),
  marketFilter: 'overseas',
  onAdd: addGlobalCard,
});
setupSearch({
  formEl: document.getElementById('watchSearchForm'),
  inputEl: document.getElementById('watchSearchInput'),
  resultsEl: document.getElementById('watchSearchResults'),
  marketFilter: undefined,
  onAdd: addToWatchlist,
});

// ---------- 드래그 정렬 연결 ----------
enableDragReorder(document.getElementById('domesticGrid'), getDomesticOrder, (items) => {
  saveDomesticOrder(items);
  loadDomestic();
});
enableDragReorder(document.getElementById('globalGrid'), getGlobalOrder, (items) => {
  saveGlobalOrder(items);
  loadGlobal();
});
enableDragReorder(document.getElementById('watchList'), getWatchlist, (items) => {
  saveWatchlist(items);
  renderWatchlist();
});

// ---------- 새로고침 ----------
document.getElementById('refreshBtn').addEventListener('click', async (e) => {
  e.currentTarget.classList.add('spin');
  MarketData.clearCache();
  await Promise.all([loadDomestic(), loadGlobal(), renderWatchlist()]);
  setTimeout(() => e.currentTarget.classList.remove('spin'), 700);
});

// ---------- 초기 로드 ----------
loadDomestic();
loadGlobal();
renderWatchlist();
loadPopularTicker();

// ---------- 자동 갱신 ----------
// 원래는 새로고침 버튼을 눌러야만 최신 시세가 반영됐음 — 서버 캐시 주기(15초)에
// 맞춰서 화면을 켜둔 채로 있으면 알아서 갱신되게 함. 탭이 안 보일 땐(다른 탭/창으로
// 전환) 건너뛰어서 불필요한 요청을 안 만들고, 다시 돌아오면 바로 한 번 갱신해서
// 오래 떠나있던 사이의 변동도 즉시 반영함.
const AUTO_REFRESH_INTERVAL_MS = 15000;
setInterval(() => {
  if (document.hidden) return;
  loadDomestic();
  loadGlobal();
  renderWatchlist();
  loadPopularTicker();
}, AUTO_REFRESH_INTERVAL_MS);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    loadDomestic();
    loadGlobal();
    renderWatchlist();
    loadPopularTicker();
  }
});

// ---------- 서비스워커 등록 (PWA 설치 지원) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
