# 눈치주식 — 관심종목 시세 위젯 (PWA)

코스피·코스닥·나스닥·다우·S&P500과 관심종목을 한눈에 보여주는 설치형 웹앱이에요.

## 지금 상태

- 목(mock) 데이터로 동작해서 **API 키 없이 바로 열어봐도** 화면이 잘 나와요.
- `index.html`을 브라우저로 더블클릭하면 바로 확인 가능해요.

## 폴더 구조

```
stock-widget/
├── index.html        메인 화면
├── style.css          다크 테마 스타일 (상승=빨강, 하락=파랑 — 국내 증시 관례)
├── app.js             화면 로직 (탭 전환, 검색, 관심종목)
├── data.js            데이터 레이어 (지금은 mock, 실 API 연동 지점 표시됨)
├── manifest.json       PWA 설치 설정
├── sw.js              오프라인 캐싱 / 설치 지원
├── icons/             앱 아이콘
└── server-example/     실 시세 연동용 프록시 서버 예시 (Node/Express)
```

## 1단계 — 실제 시세 연동하기

1. [한국투자증권 Open API 포탈](https://apiportal.koreainvestment.com)에서 계좌 연동 후 App Key/Secret 발급 (무료, 실전투자·모의투자 둘 다 가능)
2. `server-example/` 폴더에서:
   ```
   npm install
   ```
   (Node 18 이상 필요 — 내장 `fetch`를 사용해요)
3. `.env.example`을 복사해 `.env`로 만들고 값 채우기:
   ```
   KIS_APP_KEY=발급받은키
   KIS_APP_SECRET=발급받은시크릿
   KIS_ENV=real   # 모의투자 계좌면 virtual
   ```
4. `npm start`로 프록시 서버 실행 (기본 포트 3001)
5. `data.js` 상단의 `USE_MOCK`을 `false`로 변경

구현된 엔드포인트 (한국투자증권 공식 GitHub 샘플코드 기준으로 확인함):

| 용도 | tr_id / 방식 | 엔드포인트 |
|---|---|---|
| 국내 지수 (코스피/코스닥) | `FHPUP02100000` | `/uapi/domestic-stock/v1/quotations/inquire-index-price` |
| 국내 개별종목 시세 | `FHKST01010100` | `/uapi/domestic-stock/v1/quotations/inquire-price` |
| 해외 지수·개별종목 시세 | `HHDFS00000300` | `/uapi/overseas-price/v1/quotations/price` |
| 종목 검색 (LIKE 검색) | 마스터 파일 다운로드 | `new.real.download.dws.co.kr` (공개 URL, **API 키 불필요**) |

> ⚠️ **검증 필요**: 해외지수(나스닥/다우/S&P500) 조회용 `EXCD` 값은 공식 문서로 100% 확정하지 못했어요.
> 심볼(`COMP`/`.DJI`/`SPX`)은 한국투자증권이 배포하는 `frgn_code.mst` 마스터 파일에서 직접 확인했지만,
> 조회 시 붙이는 거래소코드(`EXCD`)는 `server.js`에 `NAS`/`NYS`로 넣어둔 추정값이에요.
> 실제 키로 첫 호출해서 빈 값·에러가 나오면 `EXCD`를 바꿔가며 확인해주세요.

> App Key/Secret은 절대 `app.js`(브라우저 코드)에 직접 넣지 마세요. 반드시 서버를 거쳐야 안전해요.

### 종목 검색 (LIKE 검색 / 실시간 미리보기)

`GET /api/search?q=삼성&market=domestic` — 입력한 단어가 종목코드/한글명/영문명 어디든 포함되면 찾아줘요.

- 코스피·코스닥 전체 종목 + 나스닥·뉴욕·아멕스 전체 종목을 한국투자증권이 공개 배포하는
  종목 마스터 파일(`kospi_code.mst`, `kosdaq_code.mst`, `nasmst.cod` 등)로 서버 시작 시 한 번
  받아서 메모리에 올려두고, 이후 검색은 전부 로컬에서 처리해요 (매 검색마다 KIS API를 호출하지
  않음 — 빠르고, App Key 없이도 동작해요).
- 24시간마다 자동으로 마스터 파일을 다시 받아서 상장/폐지를 반영해요.
- 프론트(`app.js`)는 입력할 때마다 250ms 디바운스 후 자동으로 미리보기를 띄워요 (검색 버튼 없이도 동작).

## 2단계 — PWA로 배포하기

정적 파일이라 아래 같은 곳에 그대로 올리면 끝이에요:
- Vercel, Netlify, Cloudflare Pages 등에 `stock-widget/` 폴더 업로드
- 배포되면 크롬/엣지에서 주소창 옆 "설치" 아이콘으로 데스크톱에 설치 가능
- 아이폰 사파리는 공유 버튼 → "홈 화면에 추가"로 설치 가능

프록시 서버(`server-example/`)는 별도로 배포해야 해요 (예: Vercel Serverless Function, Railway, Render 등). 배포 후 `data.js`의 fetch 경로를 배포된 서버 주소로 바꿔주세요.

## 3단계 — 앱인토스 미니앱으로 포팅하기 (선택)

핵심 UI/데이터 로직(`data.js`, 화면 렌더링 로직)은 그대로 재사용 가능해요.
- `@apps-in-toss/web-framework` 기반 프로젝트를 새로 만들고
- 이 프로젝트의 컴포넌트/로직을 React 컴포넌트 형태로 옮겨 담으면 돼요
- 로그인·결제 SDK는 안 써도 되는 구조라 그대로 등록 가능해요 (전에 확인한 내용 그대로예요)

## 커스터마이징 포인트

- `data.js`의 `MOCK_DOMESTIC`, `MOCK_GLOBAL`, `MOCK_SEARCH_DB`를 수정해서 원하는 종목/지수로 바로 테스트 가능
- `style.css` 상단 `:root` 변수에서 색상 테마 전체 변경 가능
