/**
 * 한국투자증권 Open API 프록시 서버
 *
 * App Key/Secret은 브라우저에 노출하면 안 되므로, 이 서버가 대신 호출해서
 * 가공된 결과만 프론트(data.js)에 돌려준다.
 *
 * 준비물
 *  1) apiportal.koreainvestment.com 에서 App Key / App Secret 발급
 *  2) .env 파일 생성 (.env.example 참고)
 *  3) npm install
 *  4) npm start  (Node 18+ 필요 — 내장 fetch 사용)
 *
 * 레이트리밋 대응
 *  - 실전투자 키는 초당 호출 한도가 낮아서(테스트 중 "초당 거래건수를 초과하였습니다"
 *    에러 빈발), KIS 호출을 전역 큐로 직렬화 + 재시도한다(throttleKisCall/kisGet 참고).
 *  - 그것과 별개로, 동시 접속자가 늘면 방문자 수만큼 KIS 호출이 배로 늘어나는 걸 막기
 *    위해 응답을 짧게(CACHE_TTL_MS) 캐시한다 — 시세 훑어보기 용도라 몇 초 지연은
 *    문제없고, 캐시 덕분에 방문자 수와 무관하게 KIS 호출 빈도가 고정된다.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');

const app = express();
app.use(cors());
// Chrome Private Network Access: 다른 포트(예: 정적 서버 8090 → 이 프록시 3001)로의
// 요청이 "사설망 접근"으로 분류돼 프리플라이트에서 막히는 걸 막기 위해 명시적으로 허용
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Private-Network', 'true');
  next();
});

const PORT = process.env.PORT || 3001;
const KIS_ENV = process.env.KIS_ENV === 'virtual' ? 'virtual' : 'real';
const KIS_BASE_URL =
  KIS_ENV === 'virtual'
    ? 'https://openapivts.koreainvestment.com:29443' // 모의투자
    : 'https://openapi.koreainvestment.com:9443'; // 실전투자

const { KIS_APP_KEY, KIS_APP_SECRET } = process.env;
if (!KIS_APP_KEY || !KIS_APP_SECRET) {
  console.warn('[경고] .env에 KIS_APP_KEY / KIS_APP_SECRET이 없어요. server-example/.env.example 참고.');
}

// ---------- 1) 접근 토큰 발급 (메모리 + 파일 캐싱) ----------
// 토큰은 보통 24시간 유효한데 메모리에만 캐싱하면 서버를 재시작할 때마다(로컬 개발 중
// 재시작, Render 무료 티어의 슬립→재기동 등) 아직 안 만료된 토큰이 있어도 새로 발급받게
// 됨 — 발급될 때마다 KIS가 알림톡을 보내서 재시작이 잦으면 알림이 계속 옴. 파일에도
// 같이 저장해뒀다가, 재시작 후에도 파일의 토큰이 아직 유효하면 그대로 재사용해서
// 불필요한 재발급(and 알림톡)을 줄인다.
const TOKEN_CACHE_FILE = path.join(__dirname, '.token-cache.json');
let cachedToken = null;
let cachedTokenExpiry = 0;

function loadTokenCacheFromDisk() {
  try {
    const raw = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
    if (raw.token && raw.expiresAt > Date.now()) {
      cachedToken = raw.token;
      cachedTokenExpiry = raw.expiresAt;
    }
  } catch (err) {
    // 파일이 없거나 깨졌으면 그냥 새로 발급받음
  }
}
loadTokenCacheFromDisk();

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

  const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`토큰 발급 실패: ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + (data.expires_in - 300) * 1000; // 5분 여유
  try {
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({ token: cachedToken, expiresAt: cachedTokenExpiry }));
  } catch (err) {
    // 파일 저장 실패해도 이번 요청 자체는 계속 진행 (다음 재시작 때 다시 발급받을 뿐)
  }
  return cachedToken;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- 공통 호출 헬퍼 ----------
// KIS 실전투자 키는 초당 호출 건수 제한이 낮아서(테스트 중 "초당 거래건수를 초과하였습니다"
// 에러 확인), 앱 전체에서 KIS API 호출을 한 줄로 직렬화 + 최소 간격을 둔다.
let queueTail = Promise.resolve();
let lastCallAt = 0;
const MIN_CALL_INTERVAL_MS = 700; // 신규 발급 키는 한도가 더 낮은 편이라 여유 있게 잡음

function throttleKisCall() {
  const turn = queueTail.then(async () => {
    const wait = lastCallAt + MIN_CALL_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
  });
  queueTail = turn.catch(() => {}); // 에러가 나도 큐가 끊기지 않도록
  return turn;
}

async function kisGetOnce(path, trId, params) {
  const token = await getAccessToken();
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${KIS_BASE_URL}${path}?${qs}`, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
      tr_id: trId,
      custtype: 'P',
    },
  });
  const json = await res.json();
  if (json.rt_cd && json.rt_cd !== '0') {
    throw new Error(`KIS API 오류(${trId}): ${json.msg1 || JSON.stringify(json)}`);
  }
  return json;
}

async function kisGet(path, trId, params, retriesLeft = 2) {
  await throttleKisCall();
  try {
    return await kisGetOnce(path, trId, params);
  } catch (err) {
    if (retriesLeft > 0 && String(err.message).includes('초당 거래건수')) {
      await sleep(MIN_CALL_INTERVAL_MS);
      return kisGet(path, trId, params, retriesLeft - 1);
    }
    throw err;
  }
}

// ---------- 응답 캐시 (방문자 수와 무관하게 KIS 호출 빈도를 고정) ----------
// 시세 훑어보기 용도라 몇 초 지연은 문제없고, 대신 동시 접속자가 몇 명이든
// 캐시 주기당 KIS 호출은 한 번만 나가게 된다. in-flight 요청은 결과를 공유해서
// 캐시가 비어있는 순간 여러 요청이 동시에 들어와도 KIS를 중복 호출하지 않는다.
const CACHE_TTL_MS = 15000;
const cacheStore = new Map(); // key -> { expiresAt, data } | { expiresAt: Infinity, promise }

async function withCache(key, fn) {
  const cached = cacheStore.get(key);
  if (cached) {
    if (cached.promise) return cached.promise; // 이미 진행 중인 같은 요청에 편승
    if (cached.expiresAt > Date.now()) return cached.data;
  }
  const promise = fn();
  cacheStore.set(key, { expiresAt: Infinity, promise });
  try {
    const data = await promise;
    cacheStore.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data });
    return data;
  } catch (err) {
    cacheStore.delete(key); // 실패하면 캐시에 남기지 않고 다음 요청이 재시도하게 함
    throw err;
  }
}

// ---------- 2) 국내 지수 (코스피/코스닥) ----------
const DOMESTIC_INDEX_LIST = [
  { id: 'KOSPI', name: '코스피', sub: 'KOSPI', iscd: '0001' },
  { id: 'KOSDAQ', name: '코스닥', sub: 'KOSDAQ', iscd: '1001' },
];

app.get('/api/domestic-indices', async (req, res) => {
  try {
    const results = await withCache('domestic-indices', () =>
      Promise.all(
        DOMESTIC_INDEX_LIST.map(async (idx) => {
          const json = await kisGet(
            '/uapi/domestic-stock/v1/quotations/inquire-index-price',
            'FHPUP02100000',
            { FID_COND_MRKT_DIV_CODE: 'U', FID_INPUT_ISCD: idx.iscd }
          );
          const o = json.output || {};
          return {
            id: idx.id,
            name: idx.name,
            sub: idx.sub,
            price: Number(o.bstp_nmix_prpr ?? 0),
            change: Number(o.bstp_nmix_prdy_vrss ?? 0),
            changePct: Number(o.bstp_nmix_prdy_ctrt ?? 0),
          };
        })
      )
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'domestic index fetch failed', detail: String(err) });
  }
});

// ---------- 3) 해외 지수 (나스닥종합/다우존스/S&P500) ----------
// 개별종목 시세 API(HHDFS00000300)로는 지수가 조회되지 않아서(빈 값), 지수/환율 전용
// API(FHKST03030100, 해외주식 종목_지수_환율기간별시세)를 사용한다. 실제 키로 검증 완료:
// FID_COND_MRKT_DIV_CODE='N'(해외지수) + FID_INPUT_ISCD에 '.DJI'/'COMP'/'SPX' 그대로 넣으면 됨
// (EXCD/SYMB 조합이 아니라 이 API 전용 종목코드 체계를 씀).
const OVERSEAS_INDEX_LIST = [
  { id: 'IXIC', name: '나스닥', sub: 'NASDAQ Composite', iscd: 'COMP' },
  { id: 'DJI', name: '다우존스', sub: 'Dow Jones', iscd: '.DJI' },
  { id: 'SPX', name: 'S&P 500', sub: 'S&P 500', iscd: 'SPX' },
];

function yyyymmdd(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

app.get('/api/global-indices', async (req, res) => {
  try {
    const results = await withCache('global-indices', () => {
      const dateTo = yyyymmdd(new Date());
      const dateFrom = yyyymmdd(new Date(Date.now() - 10 * 86400000)); // 주말/휴장 대비 여유
      return Promise.all(
        OVERSEAS_INDEX_LIST.map(async (idx) => {
          const json = await kisGet(
            '/uapi/overseas-price/v1/quotations/inquire-daily-chartprice',
            'FHKST03030100',
            {
              FID_COND_MRKT_DIV_CODE: 'N',
              FID_INPUT_ISCD: idx.iscd,
              FID_INPUT_DATE_1: dateFrom,
              FID_INPUT_DATE_2: dateTo,
              FID_PERIOD_DIV_CODE: 'D',
            }
          );
          const o = json.output1 || {};
          return {
            id: idx.id,
            name: idx.name,
            sub: idx.sub,
            price: Number(o.ovrs_nmix_prpr ?? 0),
            change: Number(o.ovrs_nmix_prdy_vrss ?? 0),
            changePct: Number(o.prdy_ctrt ?? 0),
          };
        })
      );
    });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'global index fetch failed', detail: String(err) });
  }
});

// ---------- 4) 개별 종목 시세 (관심종목용) ----------
// market: 'domestic' | 'overseas'
// domestic: symbol=종목코드 (예: 005930)
// overseas: symbol=티커, excd=거래소코드 (NAS/NYS/AMS 등)
app.get('/api/quote', async (req, res) => {
  const { market, symbol, name, excd } = req.query;
  if (!symbol || !market) {
    return res.status(400).json({ error: 'market, symbol 파라미터가 필요해요' });
  }

  try {
    if (market === 'domestic') {
      const data = await withCache(`quote:domestic:${symbol}`, async () => {
        const json = await kisGet('/uapi/domestic-stock/v1/quotations/inquire-price', 'FHKST01010100', {
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: symbol,
        });
        const o = json.output || {};
        return {
          symbol,
          name: name || o.hts_kor_isnm || symbol,
          market: 'domestic',
          price: Number(o.stck_prpr ?? 0),
          change: Number(o.prdy_vrss ?? 0),
          changePct: Number(o.prdy_ctrt ?? 0),
        };
      });
      return res.json(data);
    }

    if (market === 'overseas') {
      if (!excd) return res.status(400).json({ error: '해외 종목은 excd 파라미터가 필요해요 (예: NAS)' });
      const data = await withCache(`quote:overseas:${excd}:${symbol}`, async () => {
        const json = await kisGet('/uapi/overseas-price/v1/quotations/price', 'HHDFS00000300', {
          AUTH: '',
          EXCD: excd,
          SYMB: symbol,
        });
        const o = json.output || {};
        return {
          symbol,
          name: name || symbol,
          market: 'overseas',
          price: Number(o.last ?? 0),
          change: Number(o.diff ?? 0),
          changePct: Number(o.rate ?? 0),
        };
      });
      return res.json(data);
    }

    res.status(400).json({ error: "market은 'domestic' 또는 'overseas'여야 해요" });
  } catch (err) {
    res.status(500).json({ error: 'quote fetch failed', detail: String(err) });
  }
});

// ---------- 5) 종목 검색 (LIKE 검색용 마스터 파일) ----------
// 한국투자증권이 공개 배포하는 종목 마스터 파일을 다운로드해서 로컬로 검색한다.
// (API 키 없이도 접근 가능한 공개 URL — 시세 조회와 무관하게 항상 동작함)
// 상장/폐지 반영을 위해 서버 시작 시 + 24시간마다 새로 받는다.
const MST_BASE = 'https://new.real.download.dws.co.kr/common/master';
let SEARCH_INDEX = { domestic: [], overseas: [] };
let SEARCH_BY_SYMBOL = { domestic: new Map(), overseas: new Map() }; // 인기 검색어 이름 조회용
let searchIndexReady = false;

async function downloadMst(filename) {
  const res = await fetch(`${MST_BASE}/${filename}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const entry = zip.getEntries()[0];
  return entry.getData(); // 디코딩 전 원본 바이트 그대로 반환 (CP949는 한글이 2바이트라 문자 단위로 자르면 자리가 밀림)
}

function splitBufferLines(buf) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      let end = i;
      if (end > start && buf[end - 1] === 0x0d) end--; // \r 제거
      if (end > start) lines.push(buf.slice(start, end));
      start = i + 1;
    }
  }
  if (start < buf.length) lines.push(buf.slice(start));
  return lines;
}

// 국내(코스피/코스닥) 마스터: 종목코드(9바이트) + 표준코드(12바이트) + 종목명(가변) + Part2(고정폭, 끝에서부터)
// Part2 길이가 코스피 228바이트/코스닥 222바이트로 서로 달라서, 종목명 폭은 "전체 길이 - Part2 길이"로 매 줄마다 계산해야 함
// (바이트 오프셋 21/43은 한국투자증권 공식 kis_kospi_code_mst.py 기준으로 실제 다운로드해 검증함)
function parseDomesticMst(buf, label, part2Width) {
  return splitBufferLines(buf)
    .map((lineBuf) => {
      if (lineBuf.length <= 21 + part2Width) return null;
      const symbol = iconv.decode(lineBuf.slice(0, 9), 'cp949').trim();
      const name = iconv.decode(lineBuf.slice(21, lineBuf.length - part2Width), 'cp949').trim();
      return { symbol, name, market: 'domestic', label };
    })
    .filter((r) => r && r.symbol && r.name);
}

// 해외 거래소 마스터: 탭 구분 텍스트라 디코딩 후 분리해도 자리가 안 밀림 (안전)
function parseOverseasMst(buf, excd, label) {
  const text = iconv.decode(buf, 'cp949');
  return text
    .split(/\r?\n/)
    .map((line) => {
      const cols = line.split('\t');
      const symbol = (cols[4] || '').trim();
      const korName = (cols[6] || '').trim();
      const engName = (cols[7] || '').trim();
      return { symbol, name: korName || engName, engName, market: 'overseas', excd, label };
    })
    .filter((r) => r.symbol && (r.name || r.engName));
}

async function loadSearchIndex() {
  try {
    const [kospi, kosdaq] = await Promise.all([
      downloadMst('kospi_code.mst.zip'),
      downloadMst('kosdaq_code.mst.zip'),
    ]);
    const domestic = [...parseDomesticMst(kospi, 'KOSPI', 228), ...parseDomesticMst(kosdaq, 'KOSDAQ', 222)];

    const [nas, nys, ams] = await Promise.all([
      downloadMst('nasmst.cod.zip'),
      downloadMst('nysmst.cod.zip'),
      downloadMst('amsmst.cod.zip'),
    ]);
    const overseas = [
      ...parseOverseasMst(nas, 'NAS', 'NASDAQ'),
      ...parseOverseasMst(nys, 'NYS', 'NYSE'),
      ...parseOverseasMst(ams, 'AMS', 'AMEX'),
    ];

    SEARCH_INDEX = { domestic, overseas };
    SEARCH_BY_SYMBOL = {
      domestic: new Map(domestic.map((it) => [it.symbol, it])),
      overseas: new Map(overseas.map((it) => [it.symbol, it])),
    };
    searchIndexReady = true;
    console.log(`검색 인덱스 로드 완료: 국내 ${domestic.length}종목, 해외 ${overseas.length}종목`);
  } catch (err) {
    console.error('검색 인덱스 로드 실패:', err.message);
  }
}

loadSearchIndex();
setInterval(loadSearchIndex, 24 * 60 * 60 * 1000);

app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const marketFilter = req.query.market; // 'domestic' | 'overseas' | 없으면 둘 다
  if (!q) return res.json([]);
  if (!searchIndexReady) {
    return res.status(503).json({ error: '검색 데이터를 아직 불러오는 중이에요. 잠시 후 다시 시도해주세요.' });
  }

  const pools = marketFilter === 'domestic' ? [SEARCH_INDEX.domestic]
    : marketFilter === 'overseas' ? [SEARCH_INDEX.overseas]
    : [SEARCH_INDEX.domestic, SEARCH_INDEX.overseas];

  const results = [];
  outer: for (const pool of pools) {
    for (const item of pool) {
      if (
        item.symbol.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.engName && item.engName.toLowerCase().includes(q))
      ) {
        results.push(item);
        if (results.length >= 30) break outer;
      }
    }
  }
  res.json(results);
});

// ---------- 6) 인기 검색어 (Upstash Redis) ----------
// 검색창에 타이핑할 때마다가 아니라, 검색 결과를 실제로 클릭해서 카드로 추가할 때만
// 집계한다 (타이핑 중간값까지 세면 부분 문자열이 순위를 오염시킴).
// Render 무료 티어는 재배포/슬립 때 디스크가 초기화될 수 있어서, 외부 Redis(Upstash)에
// 저장해 안정적으로 누적되게 함.
const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;

async function redis(...command) {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN이 설정되지 않았어요.');
  }
  const res = await fetch(UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Upstash 오류: ${json.error}`);
  return json.result;
}

app.post('/api/track-search', express.json(), async (req, res) => {
  const { market, symbol } = req.body || {};
  if (market !== 'domestic' && market !== 'overseas') {
    return res.status(400).json({ error: "market은 'domestic' 또는 'overseas'여야 해요" });
  }
  if (!symbol) return res.status(400).json({ error: 'symbol이 필요해요' });

  try {
    await redis('ZINCRBY', `popular:${market}`, '1', symbol);
    res.json({ ok: true });
  } catch (err) {
    // 인기 검색어 집계는 부가 기능이라, 실패해도 검색/카드 추가 자체는 막지 않음
    res.status(500).json({ error: 'track failed', detail: String(err) });
  }
});

app.get('/api/popular-searches', async (req, res) => {
  const market = req.query.market === 'overseas' ? 'overseas' : 'domestic';
  const limit = Math.min(Number(req.query.limit) || 10, 30);

  try {
    const flat = await redis('ZREVRANGE', `popular:${market}`, '0', String(limit - 1), 'WITHSCORES');
    const items = [];
    for (let i = 0; i < flat.length; i += 2) {
      const symbol = flat[i];
      const count = Number(flat[i + 1]);
      const info = SEARCH_BY_SYMBOL[market].get(symbol);
      items.push({
        symbol,
        name: info ? info.name : symbol,
        label: info ? info.label : '',
        excd: info ? info.excd : undefined,
        count,
      });
    }
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'popular searches fetch failed', detail: String(err) });
  }
});

app.listen(PORT, () => console.log(`KIS 프록시 서버 실행 중 (${KIS_ENV}) :${PORT}`));
