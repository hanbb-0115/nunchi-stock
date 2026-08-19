/**
 * ============================================================
 * 데이터 레이어
 * ============================================================
 * USE_MOCK=true 면 API 키 없이도 화면을 바로 확인할 수 있어요.
 * 실제 시세를 보려면:
 *   1) server-example/ 폴더에서 npm install → .env 채우기 → npm start
 *   2) 아래 USE_MOCK을 false로 변경
 *
 * 실 연동은 한국투자증권 오픈API (https://apiportal.koreainvestment.com)
 * 프록시 서버(server-example/server.js)를 통해 이뤄져요.
 *
 * ⚠️ 주의: App Key/Secret은 브라우저 JS에 절대 직접 넣지 마세요.
 * 이 파일은 PROXY_BASE_URL(내 서버)만 호출하고, 실제 키는 서버 쪽
 * 환경변수로만 보관하세요.
 * ============================================================
 */

const USE_MOCK = true; // KIS App Key 발급받으면 false로 변경 (검색은 이미 실서버 연결되어 있음)
const PROXY_BASE_URL = 'https://nunchi-stock.onrender.com'; // 프록시 서버 (Render 배포)

const MOCK_DOMESTIC = [
  { id: 'KOSPI', name: '코스피', sub: 'KOSPI', price: 2634.15, change: 12.42, changePct: 0.47,
    trend: [2598, 2605, 2601, 2612, 2609, 2618, 2615, 2622, 2617, 2625, 2621, 2628, 2624, 2630, 2634.15] },
  { id: 'KOSDAQ', name: '코스닥', sub: 'KOSDAQ', price: 812.63, change: -3.28, changePct: -0.40,
    trend: [820, 822, 819, 823, 817, 819, 815, 816, 812, 814, 810, 813, 811, 809, 812.63] },
];

const MOCK_GLOBAL = [
  { id: 'IXIC', name: '나스닥', sub: 'NASDAQ Composite', price: 18342.11, change: 87.30, changePct: 0.48,
    trend: [18120, 18180, 18150, 18210, 18190, 18260, 18230, 18290, 18270, 18310, 18280, 18320, 18300, 18330, 18342.11] },
  { id: 'DJI', name: '다우존스', sub: 'Dow Jones', price: 41210.55, change: -55.12, changePct: -0.13,
    trend: [41400, 41380, 41420, 41350, 41390, 41320, 41360, 41300, 41330, 41270, 41290, 41240, 41260, 41220, 41210.55] },
  { id: 'SPX', name: 'S&P 500', sub: 'S&P 500', price: 5567.42, change: 21.05, changePct: 0.38,
    trend: [5510, 5518, 5514, 5525, 5520, 5532, 5528, 5540, 5535, 5548, 5542, 5555, 5550, 5560, 5567.42] },
];

// 종목 검색은 한국투자증권에 쓸만한 키워드 검색 API가 없어서 큐레이션 목록으로 대체.
// market: 'domestic'(국내) | 'overseas'(해외) — 시세 조회 시 서버에 그대로 전달돼요.
// excd: 해외 종목만 필요 (거래소코드: NAS=나스닥, NYS=뉴욕, AMS=아멕스)
const SEARCH_DB = [
  { symbol: '005930', name: '삼성전자', market: 'domestic', label: 'KOSPI' },
  { symbol: '000660', name: 'SK하이닉스', market: 'domestic', label: 'KOSPI' },
  { symbol: '035420', name: 'NAVER', market: 'domestic', label: 'KOSPI' },
  { symbol: '035720', name: '카카오', market: 'domestic', label: 'KOSPI' },
  { symbol: '005380', name: '현대차', market: 'domestic', label: 'KOSPI' },
  { symbol: '247540', name: '에코프로비엠', market: 'domestic', label: 'KOSDAQ' },
  { symbol: 'AAPL', name: 'Apple', market: 'overseas', excd: 'NAS', label: 'NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla', market: 'overseas', excd: 'NAS', label: 'NASDAQ' },
  { symbol: 'NVDA', name: 'NVIDIA', market: 'overseas', excd: 'NAS', label: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft', market: 'overseas', excd: 'NAS', label: 'NASDAQ' },
  { symbol: 'GOOGL', name: 'Alphabet', market: 'overseas', excd: 'NAS', label: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon', market: 'overseas', excd: 'NAS', label: 'NASDAQ' },
];

function mockQuoteFor(symbol, name, market) {
  // 데모용으로 그럴듯한 랜덤 시세를 만들어요
  const base = 10000 + (symbol.charCodeAt(0) * 137 % 90000);
  const changePct = (Math.random() * 6 - 3);
  const change = base * changePct / 100;
  const price = Math.round(base * 100) / 100;

  // 추세선용 mock: 현재가를 향해 걸어가는 랜덤워크
  const trend = [];
  let v = price - change;
  for (let i = 0; i < 14; i++) {
    v += (Math.random() - 0.45) * Math.abs(change || price * 0.01) * 0.3;
    trend.push(v);
  }
  trend.push(price);

  return {
    symbol, name, market,
    price,
    change: Math.round(change * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
    trend,
  };
}

const MarketData = {
  async getDomesticIndices() {
    if (USE_MOCK) return delay(MOCK_DOMESTIC);
    const res = await fetch(`${PROXY_BASE_URL}/api/domestic-indices`);
    if (!res.ok) throw new Error('국내 지수를 불러오지 못했어요');
    return await res.json();
  },

  async getGlobalIndices() {
    if (USE_MOCK) return delay(MOCK_GLOBAL);
    const res = await fetch(`${PROXY_BASE_URL}/api/global-indices`);
    if (!res.ok) throw new Error('해외 지수를 불러오지 못했어요');
    return await res.json();
  },

  async searchSymbol(query, marketFilter) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // 검색은 USE_MOCK과 무관하게 항상 실 서버(코스피/코스닥/나스닥/뉴욕/아멕스 전체
    // 종목 마스터 기반 LIKE 검색)를 먼저 시도함 — KIS App Key 없이도 동작하는
    // 기능이라 시세 연동 여부와 분리해뒀어요. server-example/server.js 참고.
    // 서버가 잠들어있거나(Render 무료 티어) 네트워크 문제가 있으면
    // 큐레이션 목록(SEARCH_DB)으로 대체해요.
    try {
      const params = new URLSearchParams({ q });
      if (marketFilter) params.set('market', marketFilter);
      const res = await fetch(`${PROXY_BASE_URL}/api/search?${params.toString()}`);
      if (res.ok) return await res.json();
    } catch (err) {
      // 네트워크 오류 등 — 아래 폴백으로 진행
    }

    const results = SEARCH_DB.filter((it) => {
      if (marketFilter && it.market !== marketFilter) return false;
      return it.name.toLowerCase().includes(q) || it.symbol.toLowerCase().includes(q);
    });
    return USE_MOCK ? delay(results) : results;
  },

  async getQuote(symbol, name, market, excd) {
    if (USE_MOCK) return delay(mockQuoteFor(symbol, name, market));
    const params = new URLSearchParams({ symbol, name, market });
    if (excd) params.set('excd', excd);
    const res = await fetch(`${PROXY_BASE_URL}/api/quote?${params.toString()}`);
    if (!res.ok) throw new Error(`${name} 시세를 불러오지 못했어요`);
    return await res.json();
  },
};

function delay(value, ms = 350) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
