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
 * 검증 필요 항목
 *  - 해외지수(나스닥/다우/S&P500) 조회 시 EXCD 값은 공식 문서로 100% 확정하지
 *    못했다. 아래 OVERSEAS_INDEX_LIST의 excd를 실제 키로 첫 호출해보고,
 *    응답이 빈 값이거나 에러면 'NAS'/'NYS'/'AMS' 조합을 바꿔가며 확인할 것.
 *    (심볼 자체는 한국투자증권이 배포하는 frgn_code.mst 마스터 파일에서
 *     직접 확인함: 나스닥종합=COMP, 다우존스=.DJI, S&P500=SPX — 파일에는
 *     맨 앞에 지수 구분자 'P'가 붙어있는데 실제 조회 시엔 뗀다.)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');

const app = express();
app.use(cors());

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

// ---------- 1) 접근 토큰 발급 (캐싱) ----------
let cachedToken = null;
let cachedTokenExpiry = 0;

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
  return cachedToken;
}

// ---------- 공통 호출 헬퍼 ----------
async function kisGet(path, trId, params) {
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

// ---------- 2) 국내 지수 (코스피/코스닥) ----------
const DOMESTIC_INDEX_LIST = [
  { id: 'KOSPI', name: '코스피', sub: 'KOSPI', iscd: '0001' },
  { id: 'KOSDAQ', name: '코스닥', sub: 'KOSDAQ', iscd: '1001' },
];

app.get('/api/domestic-indices', async (req, res) => {
  try {
    const results = await Promise.all(
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
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'domestic index fetch failed', detail: String(err) });
  }
});

// ---------- 3) 해외 지수 (나스닥종합/다우존스/S&P500) ----------
// ⚠️ excd는 검증 필요 항목 (파일 상단 주석 참고)
const OVERSEAS_INDEX_LIST = [
  { id: 'IXIC', name: '나스닥', sub: 'NASDAQ Composite', excd: 'NAS', symb: 'COMP' },
  { id: 'DJI', name: '다우존스', sub: 'Dow Jones', excd: 'NYS', symb: '.DJI' },
  { id: 'SPX', name: 'S&P 500', sub: 'S&P 500', excd: 'NYS', symb: 'SPX' },
];

app.get('/api/global-indices', async (req, res) => {
  try {
    const results = await Promise.all(
      OVERSEAS_INDEX_LIST.map(async (idx) => {
        const json = await kisGet('/uapi/overseas-price/v1/quotations/price', 'HHDFS00000300', {
          AUTH: '',
          EXCD: idx.excd,
          SYMB: idx.symb,
        });
        const o = json.output || {};
        return {
          id: idx.id,
          name: idx.name,
          sub: idx.sub,
          price: Number(o.last ?? 0),
          change: Number(o.diff ?? 0),
          changePct: Number(o.rate ?? 0),
        };
      })
    );
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
      const json = await kisGet('/uapi/domestic-stock/v1/quotations/inquire-price', 'FHKST01010100', {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: symbol,
      });
      const o = json.output || {};
      return res.json({
        symbol,
        name: name || o.hts_kor_isnm || symbol,
        market: 'domestic',
        price: Number(o.stck_prpr ?? 0),
        change: Number(o.prdy_vrss ?? 0),
        changePct: Number(o.prdy_ctrt ?? 0),
      });
    }

    if (market === 'overseas') {
      if (!excd) return res.status(400).json({ error: '해외 종목은 excd 파라미터가 필요해요 (예: NAS)' });
      const json = await kisGet('/uapi/overseas-price/v1/quotations/price', 'HHDFS00000300', {
        AUTH: '',
        EXCD: excd,
        SYMB: symbol,
      });
      const o = json.output || {};
      return res.json({
        symbol,
        name: name || symbol,
        market: 'overseas',
        price: Number(o.last ?? 0),
        change: Number(o.diff ?? 0),
        changePct: Number(o.rate ?? 0),
      });
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

app.listen(PORT, () => console.log(`KIS 프록시 서버 실행 중 (${KIS_ENV}) :${PORT}`));
