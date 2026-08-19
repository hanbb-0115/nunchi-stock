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

app.listen(PORT, () => console.log(`KIS 프록시 서버 실행 중 (${KIS_ENV}) :${PORT}`));
