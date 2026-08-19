# 프로젝트 컨텍스트 — 눈치주식 (전 마켓 나우)

Claude(채팅)에서 기획·프로토타입 작업을 마치고 Claude Code로 이어서 개발 중인 프로젝트예요.
다른 PC/세션에서 이어서 작업할 때 아래 내용을 참고해주세요. (최종 업데이트: 2026-08-19, KIS 실연동 완료 후)

## 프로젝트 개요

- **이름**: 눈치주식 (원래 "마켓 나우"였다가 컨셉이 명확해지면서 개명)
- **목적**: 직장인이 일하면서 "눈치 안 보고" 빠르게 관심종목/지수 시세를 확인하는 앱.
  매수·매도 기능은 없음 — 순수 조회용.
- **재밌는 기능**: 화면 위장 모드 — 상사가 지나갈 때 화면을 엑셀(예정: 워드/파워포인트도)처럼 보이게
  바꿀 수 있음. `Esc` 키가 보스키(즉시 위장 전환).

## 코드 위치 / 배포 상태

- **GitHub**: https://github.com/hanbb-0115/nunchi-stock (저장소 루트 = 이 폴더 안의
  `marketnow-stock-widget/` — 그 폴더 자체가 별도 git 저장소예요, 상위 `stock-widget/`은 git 아님)
- **프론트엔드 배포**: https://nunchi-stock.vercel.app (Vercel, GitHub main 브랜치 push하면 자동 배포)
- **프록시 서버 배포**: https://nunchi-stock.onrender.com (Render 무료 티어, 마찬가지로 자동 배포.
  단 무료 티어라 15분 유휴 시 슬립 → 첫 요청 응답이 몇 초 걸릴 수 있음)
- 로컬 개발 시 정적 파일을 띄우려면 `.claude/launch.json`에 `marketnow-static` 설정이 있고,
  PowerShell 기반 간이 서버(`.claude/static-server.ps1`)로 8080 포트에서 서빙함 — **이 PC엔 Node.js가
  안 깔려있어서** 이 방식을 씀. 다른 PC에 Node가 있으면 그냥 아무 정적 서버(`npx serve` 등)나
  `server-example/`처럼 `npm install && npm start` 써도 됨.

## 폴더 구조 (marketnow-stock-widget/ 안)

```
index.html / style.css / app.js / data.js   메인 앱 (바닐라 JS, 빌드 도구 없음)
manifest.json / sw.js / icons/               PWA 설치 지원
server-example/                              KIS 프록시 + 검색 서버 (Node/Express, Render에 배포됨)
  server.js                                  실제 배포되는 서버 코드
  .env.example                               KIS_APP_KEY/SECRET 채우는 템플릿 (.env는 gitignore됨)
```

## 지금 상태 — 뭐가 되고 뭐가 안 되는지

### 되는 것
- UI 전부 완성: 국내지수/해외지수/관심종목 탭, 드래그로 카드 순서 변경, 검색해서 카드로 고정,
  별(★) 눌러서 관심종목 추가/삭제, 다크·라이트 모드, PWA 설치 버튼
- **종목 검색(LIKE 검색, 실시간 미리보기)이 실제로 동작함** — 코스피·코스닥·나스닥·뉴욕·아멕스
  전체 종목 대상. 한국투자증권이 배포하는 공개 종목 마스터 파일(`kospi_code.mst`,
  `nasmst.cod` 등, **API 키 불필요**)을 서버가 시작할 때 다운로드해서 메모리에 올려두고 로컬
  LIKE 검색을 해줌 (`server-example/server.js`의 `/api/search`). 검색 결과 미리보기에
  상위 8개까지는 실시간 시세도 같이 보여줌.
- 화면 위장 모드(엑셀): 진짜 엑셀처럼 보이는 가짜 리본 메뉴/수식 입력줄/열머리글(A~E)/행번호/
  시트탭(하단)/상태표시줄 구현. `data-skin="excel"`로 토글. 워드/파워포인트는 메뉴에 "준비중"
  배지만 있고 아직 미구현 (app.js의 `SKIN_OPTIONS` 배열에 항목만 있음).

### 안 되는 것 / 막힌 것
- 앱인토스 미니앱 포팅은 아직 시작 안 함 (계획만 있음, README 참고).
- Render(`nunchi-stock.onrender.com`)에는 아직 실제 KIS App Key/Secret 환경변수가 설정
  안 되어 있음 — 로컬(`localhost:3001`)에서만 실연동 검증 완료. 배포본을 실제로 쓰려면
  Render 대시보드에서 `KIS_APP_KEY`/`KIS_APP_SECRET`/`KIS_ENV=real` 환경변수를 설정해야 함
  (사용자가 직접 Render 로그인해서 해야 하는 작업).

### 2026-08-19 — KIS 실전투자 API 실연동 완료
- App Key/Secret 발급받아 `server-example/.env`에 설정, `data.js`의 `USE_MOCK`을 `false`로
  전환. 국내지수/해외지수/개별종목 시세 전부 실제 KIS API로 확인 완료 (브라우저 E2E 테스트로
  삼성전자 카드 추가까지 검증함).
- **해외지수 API를 통째로 교체함**: 기존에 쓰려던 개별종목 시세 API(`HHDFS00000300` +
  `EXCD`/`SYMB`)는 지수 조회 시 빈 값만 돌아옴. 대신 KIS 공식 GitHub 샘플
  (`examples_user/overseas_stock/overseas_stock_functions.py`)에서 찾은 지수 전용 API를
  씀: `tr_id=FHKST03030100`, 엔드포인트
  `/uapi/overseas-price/v1/quotations/inquire-daily-chartprice`,
  `FID_COND_MRKT_DIV_CODE=N`(해외지수), `FID_INPUT_ISCD`에 `.DJI`/`COMP`/`SPX` 그대로
  입력 (EXCD 조합 아님). 응답은 `output1.ovrs_nmix_prpr`(현재가)/`ovrs_nmix_prdy_vrss`(전일대비)
  /`prdy_ctrt`(등락률). `server.js`의 `OVERSEAS_INDEX_LIST`/`/api/global-indices` 참고.
- **실전투자 키의 초당 호출 한도가 낮음** — 여러 지수를 `Promise.all`로 동시 호출하면
  "초당 거래건수를 초과하였습니다" 에러가 자주 남. `server.js`에 전역 직렬화 큐
  (`throttleKisCall`, 호출 간 700ms 간격) + 레이트리밋 에러 시 자동 재시도(최대 2회)를
  추가해서 해결함 (`kisGet`/`kisGetOnce` 참고).
- **로컬 프록시 서버를 편하게 테스트하려고 `data.js`에 환경 분기 추가**: `location.hostname`이
  `localhost`/`127.0.0.1`이면 `PROXY_BASE_URL`을 `http://localhost:3001`로, 아니면 기존
  Render 주소로 자동 전환.
- **미리보기 브라우저(Claude Code의 in-app Browser 패널)에서 다른 로컬 포트(3001)로의
  fetch가 막히는 현상 발견** — 직접 URL 접속은 되는데 JS `fetch()`만 `ERR_FAILED`로 실패함.
  이건 그 프리뷰 패널 자체의 샌드박스 제약으로 보이고, 실제 사용자 Chrome에서는 정상 동작함
  (Claude in Chrome으로 재검증해서 확인함). 로컬 프록시 연동 디버깅할 땐 in-app 프리뷰 패널
  말고 실제 브라우저로 확인할 것.
- 이 작업 중 Node.js가 이 PC에 새로 설치됨 (winget으로, LTS 24.19.0) — 위 22번째 줄의
  "이 PC엔 Node.js가 안 깔려있어서" 문구는 이제 사실이 아님. 다만 새 터미널 세션에서
  PATH가 바로 안 잡힐 수 있어서 `C:\Program Files\nodejs`를 PATH에 명시적으로 추가해야
  할 수도 있음.

## 알아두면 좋은 실수/교훈

- **국내 종목 마스터 파일(CP949) 파싱 버그**: 처음에 파일 전체를 문자열로 디코딩한 뒤 문자 단위로
  고정폭 슬라이싱했더니, 한글이 2바이트라 종목명 뒤에 다음 필드 값이 섞여 나왔음. 원본
  **바이트 버퍼**에서 줄 단위로 나눈 뒤 그 바이트 슬라이스만 디코딩하는 방식으로 고침
  (`server.js`의 `splitBufferLines`/`parseDomesticMst` 참고). 코스피 Part2는 228바이트,
  코스�드 Part2는 222바이트로 서로 다름 — 종목명 폭은 "줄 전체 길이 - Part2 길이"로 매번
  동적 계산해야 함.
- **curl로 한글 쿼리 테스트할 때 주의**: 이 PC(Windows 한글 로케일)의 git bash에서
  `curl --data-urlencode`로 한글을 보내면 CP949로 잘못 인코딩되어 서버에 깨진 값이 도착함.
  브라우저로 테스트하면 정상. 검색 API 디버깅할 땐 curl 말고 브라우저에서 직접 확인할 것.
- **엑셀 위장 모드 디자인 방향**: "진짜 엑셀 UI처럼 구조를 흉내" ↔ "레이아웃은 그대로 두고
  색상만 엑셀로" 사이를 몇 번 왔다갔다함. **지금은 전자(진짜 위장 모드, 리본/수식줄 등 구조
  흉내)로 확정**된 상태. 색상만 바꾸는 버전은 라이트모드랑 구분이 잘 안 된다는 피드백으로
  되돌아감.
- **로컬 정적 서버는 세션마다 수동으로 켜야 함** — Claude Code가 테스트 끝나고 꺼두면 사용자가
  `localhost:8080` 접속 시 안 열림. 작업 끝날 때까지 계속 켜두는 게 나음.
- Vercel 배포 직후엔 CDN 엣지 노드마다 캐시 반영 시점이 달라서, 같은 URL인데 요청마다 새/구
  버전이 섞여 나올 수 있음 (몇 분 내 자동 해소됨, 코드 문제 아님).

## 다음에 할 일 (우선순위 순)

1. **Render 환경변수 설정** — Render 대시보드(사용자가 직접 로그인)에서
   `nunchi-stock-kis-proxy` 서비스에 `KIS_APP_KEY`/`KIS_APP_SECRET`/`KIS_ENV=real` 환경변수
   설정해서 배포본(`nunchi-stock.onrender.com`)도 실제 시세가 나오게 하기. 로컬은 이미 됨.
2. 워드/파워포인트 위장 테마 구현 (엑셀 테마와 같은 패턴: `app.js`의 `SKIN_OPTIONS`에 이미
   자리 있음, `style.css`에 `[data-skin="word"]`/`[data-skin="ppt"]` 섹션 추가 + 필요하면
   `index.html`에 각 테마용 가짜 UI 마크업 추가)
3. 앱인토스 미니앱 포팅 (`@apps-in-toss/web-framework` 기반, 로그인/결제 SDK 불필요)

## 그동안의 기획 결정 (배경 참고용)

- 처음엔 "고정지출 관리 캘린더" 아이디어였으나, 이미 토스 본체에 유사 기능이 있어 다른 아이템으로 전환
- 윈도우 네이티브 위젯(Widget Board)은 한때 복잡도가 높아 보류했었으나, 최근 마이크로소프트가
  PWA 매니페스트만으로 위젯보드에 등록하는 방식을 지원하기 시작해서 재검토 여지 있음 (다만
  위젯 화면은 HTML이 아니라 Adaptive Cards로 별도 디자인해야 하고, 다른 사람도 설치 가능하게
  하려면 Microsoft Store 등록까지 필요 — 사용자가 "일단 보류, 설치 버튼까지만" 결정함)
- "설치형 + 누구나 사용 가능"이라는 목표에 맞춰 PWA와 앱인토스 두 트랙을 동시에 노리는 구조로 설계
