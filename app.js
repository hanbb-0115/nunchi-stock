const WATCHLIST_KEY = 'nunchi_watchlist_v1';
const DOMESTIC_ORDER_KEY = 'nunchi_domestic_cards_v1';
const GLOBAL_ORDER_KEY = 'nunchi_global_cards_v1';

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

// ---------- 다크모드 / 라이트모드 ----------
const THEME_KEY = 'nunchi_theme_v1';
const SUN_ICON = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1zm0 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm8 4a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1zM6 12a1 1 0 0 1-1 1H4a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1zm11.657-6.657a1 1 0 0 1 0 1.414l-.707.707a1 1 0 1 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0zM7.05 16.95a1 1 0 0 1 0 1.414l-.707.707A1 1 0 1 1 4.93 17.657l.707-.707a1 1 0 0 1 1.414 0zM12 19a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zm5.657-2.05a1 1 0 0 1 1.414 0l.707.707a1 1 0 1 1-1.414 1.414l-.707-.707a1 1 0 0 1 0-1.414zM6.343 6.343a1 1 0 0 1 1.414 0l.707.707A1 1 0 1 1 7.05 8.464l-.707-.707a1 1 0 0 1 0-1.414z"/></svg>`;
const MOON_ICON = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M20.354 15.354A9 9 0 0 1 8.646 3.646a9.003 9.003 0 1 0 11.708 11.708z"/></svg>`;

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  document.getElementById('themeToggleBtn').innerHTML = theme === 'dark' ? SUN_ICON : MOON_ICON;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0d10' : '#f2f4f7');
}

applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

document.getElementById('themeToggleBtn').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
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

// ---------- 위장 테마 메뉴 ----------
const SKIN_KEY = 'nunchi_skin_v1';
// 새 테마를 추가할 땐 여기에 항목만 더하면 메뉴에 자동으로 나타남 (CSS 구현은 별도)
const SKIN_OPTIONS = [
  { id: 'none', label: '기본 화면' },
  { id: 'excel', label: '엑셀' },
  { id: 'word', label: '워드' },
  { id: 'ppt', label: '파워포인트' },
];
const BOSS_KEY_SKIN = 'excel'; // Esc 눌렀을 때 전환할 위장 테마

// 상단바(기본 화면)의 skinMenuBtn과, 각 위장 화면의 로고 버튼(xlLogoBtn 등) 모두
// 같은 드롭다운을 연다 — 어느 화면이 보이든 항상 테마를 바꿀 수 있게.
const skinTriggers = [
  document.getElementById('skinMenuBtn'),
  document.getElementById('xlLogoBtn'),
  document.getElementById('wdLogoBtn'),
  document.getElementById('ppLogoBtn'),
];
const skinDropdown = document.getElementById('skinDropdown');
let activeSkinTrigger = null;

function applySkin(skin) {
  document.documentElement.setAttribute('data-skin', skin);
  localStorage.setItem(SKIN_KEY, skin);
  const opt = SKIN_OPTIONS.find((o) => o.id === skin);
  const label = opt && skin !== 'none' ? `위장 중: ${opt.label} (클릭해서 변경)` : '화면 위장 테마 선택';
  skinTriggers.forEach((btn) => {
    if (btn.classList.contains('icon-btn')) btn.classList.toggle('skin-active', skin !== 'none');
    btn.title = label;
  });
  renderSkinMenu();
}

function renderSkinMenu() {
  const current = document.documentElement.getAttribute('data-skin') || 'none';
  skinDropdown.innerHTML = SKIN_OPTIONS.map((o) => `
    <button class="skin-option${o.id === current ? ' selected' : ''}" data-skin="${o.id}" ${o.comingSoon ? 'disabled' : ''}>
      <span>${o.label}</span>
      ${o.comingSoon ? '<span class="skin-badge">준비중</span>' : '<span class="skin-check">✓</span>'}
    </button>
  `).join('');

  skinDropdown.querySelectorAll('.skin-option:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      applySkin(btn.dataset.skin);
      track('skin_change', { skin: btn.dataset.skin, source: 'menu' });
      closeSkinMenu();
    });
  });
}

function openSkinMenu(triggerEl) {
  activeSkinTrigger = triggerEl;
  skinDropdown.hidden = false;
  triggerEl.setAttribute('aria-expanded', 'true');

  // 어느 버튼에서 열렸든 그 버튼 바로 아래에 붙게 위치 계산 (화면 밖으로 안 나가게 클램프)
  const rect = triggerEl.getBoundingClientRect();
  const dropdownWidth = 168;
  let left = rect.left;
  left = Math.min(left, window.innerWidth - dropdownWidth - 8);
  left = Math.max(left, 8);
  skinDropdown.style.top = `${rect.bottom + 6}px`;
  skinDropdown.style.left = `${left}px`;
}
function closeSkinMenu() {
  skinDropdown.hidden = true;
  if (activeSkinTrigger) activeSkinTrigger.setAttribute('aria-expanded', 'false');
  activeSkinTrigger = null;
}

applySkin(localStorage.getItem(SKIN_KEY) || 'none');

skinTriggers.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (skinDropdown.hidden) openSkinMenu(btn);
    else closeSkinMenu();
  });
});
document.addEventListener('click', (e) => {
  if (!skinDropdown.hidden && !e.target.closest('#skinDropdown')) closeSkinMenu();
});

// Esc 키 = 보스키: 누가 오는 게 보이면 즉시 위장 화면으로
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    applySkin(BOSS_KEY_SKIN);
    track('skin_change', { skin: BOSS_KEY_SKIN, source: 'boss_key' });
    closeSkinMenu();
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
        <div class="idx-price">${formatPrice(item.price)}<span class="idx-unit">${item.market === 'overseas' ? '달러' : '원'}</span></div>
        <div class="idx-change ${cls}">
          ${changeSign(item.change)}${formatPrice(item.change)} (${changeSign(item.changePct)}${item.changePct.toFixed(2)}%)
        </div>
      </div>
    </div>
  `;
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

    grid.innerHTML = cards.map(renderCard).join('');
    document.getElementById('domesticUpdated').textContent = nowLabel();
    grid.querySelectorAll('.card-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeDomesticCard(btn.dataset.symbol));
    });
    grid.querySelectorAll('.card-star').forEach((btn) => {
      btn.addEventListener('click', () => toggleStar(btn));
    });
  } catch (err) {
    showStatus('국내 지수를 불러오지 못했어요. 프록시 서버가 실행 중인지 확인해주세요.');
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

    grid.innerHTML = cards.map(renderCard).join('');
    document.getElementById('globalUpdated').textContent = nowLabel();
    grid.querySelectorAll('.card-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeGlobalCard(btn.dataset.symbol));
    });
    grid.querySelectorAll('.card-star').forEach((btn) => {
      btn.addEventListener('click', () => toggleStar(btn));
    });
  } catch (err) {
    showStatus('해외 지수를 불러오지 못했어요. 프록시 서버가 실행 중인지 확인해주세요.');
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

  wrap.innerHTML = quotes.map((q) => renderCard({ ...q, starrable: true, starred: true })).join('');

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

// 기본 화면 + 엑셀/워드/PPT 위장 모드 제목표시줄, 총 4곳에 같은 티커를 동시에
// 띄운다 — 어느 화면이 보이든(CSS가 나머지를 숨김) 항상 최신 상태로 맞춰져 있게.
const TICKER_INSTANCES = [
  { wrap: 'tickerWrap', ticker: 'popularTicker', slide: 'tickerSlide', panel: 'tickerPanel' },
  { wrap: 'xlTickerWrap', ticker: 'xlPopularTicker', slide: 'xlTickerSlide', panel: 'xlTickerPanel' },
  { wrap: 'wdTickerWrap', ticker: 'wdPopularTicker', slide: 'wdTickerSlide', panel: 'wdTickerPanel' },
  { wrap: 'ppTickerWrap', ticker: 'ppPopularTicker', slide: 'ppTickerSlide', panel: 'ppTickerPanel' },
].map((ids) => ({
  wrapEl: document.getElementById(ids.wrap),
  tickerEl: document.getElementById(ids.ticker),
  slideEl: document.getElementById(ids.slide),
  panelEl: document.getElementById(ids.panel),
}));

async function loadPopularTicker() {
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

  // 순위/이름만 있는 목록에 시세도 같이 보여주기 위해 종목별로 시세를 붙임
  // (클라이언트 캐시 덕분에 다른 화면에 이미 떠 있던 종목은 재요청 없이 즉시 붙음)
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
  paintTickerSlide();
  if (tickerItems.length > 1) {
    tickerTimer = setInterval(advanceTicker, TICKER_INTERVAL_MS);
  }
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
    panelEl.hidden = false;
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

// ---------- 서비스워커 등록 (PWA 설치 지원) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
