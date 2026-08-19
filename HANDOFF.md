# 프로젝트 컨텍스트 — 눈치주식 (전 마켓 나우)

Claude(채팅)에서 기획·프로토타입 작업을 마치고 Claude Code로 이어서 개발 중인 프로젝트예요.
다른 PC/세션에서 이어서 작업할 때 아래 내용을 참고해주세요. (최종 업데이트: 2026-08-20)

## 프로젝트 개요

- **이름**: 눈치주식 (원래 "마켓 나우"였다가 컨셉이 명확해지면서 개명)
- **목적**: 직장인이 일하면서 "눈치 안 보고" 빠르게 관심종목/지수 시세를 확인하는 앱.
  매수·매도 기능은 없음 — 순수 조회용.
- **재밌는 기능**: 화면 위장 모드 — 상사가 지나갈 때 화면을 엑셀/워드/파워포인트처럼 보이게
  바꿀 수 있음. `Esc` 키가 보스키(즉시 위장 전환).

## 코드 위치 / 배포 상태

- **GitHub**: https://github.com/hanbb-0115/nunchi-stock — 이 폴더 자체가 저장소 루트예요
  (하위 폴더 구조 아님, `index.html`/`app.js` 등이 바로 루트에 있음).
- **프론트엔드 배포**: https://nunchi-stock.vercel.app (Vercel, GitHub main 브랜치 push하면 자동 배포)
- **프록시 서버 배포**: https://nunchi-stock.onrender.com (Render 무료 티어, 마찬가지로 자동 배포.
  단 무료 티어라 15분 유휴 시 슬립 → 첫 요청 응답이 몇십 초 걸릴 수 있음, 콜드스타트라 정상임)
  - Render 대시보드에 `KIS_APP_KEY`/`KIS_APP_SECRET`/`KIS_ENV=real` 환경변수 설정 완료됨
    (2026-08-19) — 배포본에서도 실제 시세 나옴.
- **로컬 개발**: Node.js 설치돼 있으면(권장) `server-example/`에서 `npm install && npm start`로
  프록시 서버(3001 포트) 띄우고, 정적 파일은 `.claude/launch.json`의 `nunchi-stock` 설정으로
  Claude Code 프리뷰가 자동으로 띄워줌(8090 포트) — 또는 `npx serve` 등 아무 정적 서버나 사용.

## 폴더 구조

```
index.html / style.css / app.js / data.js   메인 앱 (바닐라 JS, 빌드 도구 없음)
manifest.json / sw.js / icons/               PWA 설치 지원
server-example/                              KIS 프록시 + 검색 서버 (Node/Express, Render에 배포됨)
  server.js                                  실제 배포되는 서버 코드
  .env.example                               KIS_APP_KEY/SECRET 채우는 템플릿 (.env는 gitignore됨)
  .env                                       실제 키 (git에 안 올라감 — 아래 "다른 PC 체크리스트" 참고)
```

## 지금 상태 — 뭐가 되고 뭐가 안 되는지

### 되는 것 (2026-08-20 기준 전부 실제 서비스 중)
- UI 전부 완성: 국내지수/해외지수/관심종목 탭, 드래그로 카드 순서 변경, 검색해서 카드로 고정,
  별(★) 눌러서 관심종목 추가/삭제, 다크·라이트 모드, PWA 설치 버튼
- **종목 검색(LIKE 검색, 실시간 미리보기)** — 코스피·코스닥·나스닥·뉴욕·아멕스 전체 종목 대상.
  KIS가 배포하는 공개 종목 마스터 파일(API 키 불필요)을 서버가 시작할 때 받아서 메모리에 올려두고
  로컬 LIKE 검색 (`server-example/server.js`의 `/api/search`).
- **화면 위장 모드 3종 완성**: 엑셀/워드/파워포인트 전부 리본 메뉴·제목표시줄·상태바 등 구조를
  흉내낸 진짜 위장 버전. `data-skin="excel"/"word"/"ppt"`로 토글, `app.js`의 `SKIN_OPTIONS`.
- **한국투자증권 Open API 실전투자 연동 완료** — 국내지수/해외지수/개별종목 시세 전부 실제
  데이터 (`data.js`의 `USE_MOCK = false`). 로컬·Render 배포본 둘 다 동작 확인함.
- **가격 단위 표시** — 국내는 "원", 해외는 "달러"를 가격 끝에 작은 회색 글씨로 표시.
- **GA4(Google Analytics) 연동** — 측정 ID `G-LG2FL8KJ6B`. 탭 전환/검색/관심종목 추가·삭제/
  위장모드 전환(보스키 포함)/PWA 설치에 커스텀 이벤트 추적. analytics.google.com에서 확인.
- **KIS 접근토큰 파일 캐싱** — 재발급될 때마다 KIS가 카카오 알림톡을 보내는데, 서버 재시작마다
  토큰을 새로 받아서 재시작할 때마다 알림이 오던 문제를 `server-example/.token-cache.json`
  (gitignore됨)에 토큰을 저장해뒀다가 아직 유효하면 재사용하도록 고쳐서 해결.
- **인기 검색어 기능** — 검색 결과를 클릭해서 카드로 추가할 때(타이핑 중간값은 제외) Upstash
  Redis(REST API, `server.js`의 `redis()` 헬퍼)에 `ZINCRBY`로 집계. 엔드포인트:
  `POST /api/track-search`, `GET /api/popular-searches?market=`.
  `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` 환경변수 필요 (무료 Upstash 계정).
  - `/api/track-search`는 KIS 마스터에 실제 있는 종목코드인지 검증 후에만 집계함
    (검증 없이 저장하면 임의 문자열이 popular-searches 응답의 name으로 그대로 돌아가서
    저장형 XSS로 이어질 수 있었던 취약점을 2026-08-20에 발견해서 막음).
  - **UI는 검색창 아래 칩이 아니라 타이틀바 세로 슬라이딩 티커**로 최종 확정됨
    (토스증권 스타일). 국내+해외 인기 검색어를 합쳐서 순위순으로 3초마다 자동 슬라이드,
    호버하면 1~10위 전체 목록이 드롭다운으로 펼쳐짐 (`app.js`의 `loadPopularTicker`/
    `renderTickerPanel`). 검색창 아래 칩 버전(`renderPopularSearches`)은 초안이었고
    2026-08-20에 제거됨.
- **카드 종목명 잘림 수정** — `.idx-info`가 고정 64px 폭이라 "SK하이..."처럼 잘렸었음.
  실제 KIS 응답엔 트렌드 데이터가 없어서 스파크라인 영역(`.idx-spark`)이 항상 비어있는
  채로 공간만 차지하고 있던 걸 발견하고, 비어있으면 폭 0이 되게 해서 그 공간을 이름에 씀.
- **즐겨찾기/카드 추가 렌더링 속도 개선** — 별 하나 누를 때마다 국내+해외 리스트 전체를
  서버에서 다시 불러오던 버그를 고쳐서 이제 별 아이콘만 DOM에서 즉시 갱신(네트워크 요청
  없음). `data.js`에 8초 TTL 클라이언트 캐시도 추가해서, 카드 추가 시 이미 떠 있던 다른
  카드들 시세를 매번 재요청하지 않게 함. 새로고침 버튼은 `MarketData.clearCache()`로
  캐시를 비우고 강제로 최신값을 받아옴.

### 안 되는 것 / 아직 안 한 것
- 앱인토스 미니앱 포팅은 아직 시작 안 함 (계획만 있음, README 참고) — 유일하게 남은 큰 작업.

## 다른 PC에서 이어서 작업할 때 체크리스트

`git pull`로 코드는 그대로 받아지지만, **PC마다 다시 설정해야 하는 것들**이 있어요:

1. **Node.js 설치 확인** — `node --version`으로 확인. 없으면 `winget install --id OpenJS.NodeJS.LTS -e`
   (관리자 권한 필요할 수 있음). 설치 직후엔 새 터미널에서도 PATH가 안 잡힐 수 있어서
   `C:\Program Files\nodejs`를 PATH에 수동으로 추가해야 할 수도 있음.
2. **git 사용자 정보 설정** — 새 PC면 `git config --global user.name`/`user.email`이 비어있어서
   커밋이 안 됨. `git config --global user.name "hanbb-0115"` /
   `git config --global user.email "w961205@gmail.com"`로 설정.
   **주의: Claude가 git config를 대신 실행하면 안 되는 정책이라, 이건 사용자가 직접 해야 함.**
3. **`server-example/.env` 파일 재생성** — `.env`는 gitignore라 git에 안 올라감(의도적 —
   키를 git에 커밋하면 안 됨). 새 PC에서 로컬 프록시 서버(`npm start`)를 테스트하려면
   `server-example/.env.example`을 복사해서 App Key/Secret을 채워야 함. 값은 이 문서에
   적어두지 않았으니 **Render 대시보드(Environment 탭)에서 기존 값을 확인**하거나,
   apiportal.koreainvestment.com에서 재확인. 형식:
   ```
   KIS_APP_KEY=(Render 대시보드에서 확인)
   KIS_APP_SECRET=(Render 대시보드에서 확인)
   KIS_ENV=real
   PORT=3001
   UPSTASH_REDIS_REST_URL=(Render 대시보드 또는 upstash.com 콘솔에서 확인)
   UPSTASH_REDIS_REST_TOKEN=(Render 대시보드 또는 upstash.com 콘솔에서 확인)
   ```
   로컬 테스트 없이 배포본(Vercel+Render)만 확인할 거면 이 단계는 건너뛰어도 됨.
4. **GA4 대시보드 접근** — analytics.google.com은 사용자 구글 계정 로그인만 하면 PC 상관없이
   바로 보임, 별도 설정 불필요.
5. **npm install** — `server-example/`에서 로컬 프록시 서버 처음 띄울 때 1회.

## 알아두면 좋은 실수/교훈

- **국내 종목 마스터 파일(CP949) 파싱 버그**: 파일 전체를 문자열로 디코딩한 뒤 문자 단위로
  고정폭 슬라이싱하면 한글이 2바이트라 종목명 뒤 필드가 밀림. 원본 **바이트 버퍼**에서 줄 단위로
  나눈 뒤 그 바이트 슬라이스만 디코딩해야 함 (`server.js`의 `splitBufferLines`/`parseDomesticMst`).
  코스피 Part2는 228바이트, 코스닥 Part2는 222바이트로 달라서 종목명 폭은 "줄 전체 길이 - Part2
  길이"로 매번 동적 계산.
- **curl로 한글 쿼리 테스트할 때 주의**: Windows 한글 로케일 git bash에서 `curl --data-urlencode`로
  한글을 보내면 CP949로 잘못 인코딩됨. 브라우저로 테스트하면 정상.
- **해외지수는 개별종목 시세 API(`HHDFS00000300`+EXCD/SYMB)로 조회 안 됨** — 빈 값만 돌아옴.
  지수 전용 API(`tr_id=FHKST03030100`, `/uapi/overseas-price/v1/quotations/inquire-daily-chartprice`,
  `FID_COND_MRKT_DIV_CODE=N`, `FID_INPUT_ISCD`에 `.DJI`/`COMP`/`SPX` 그대로) 사용해야 함.
- **KIS 실전투자 키는 초당 호출 한도가 낮음** — 여러 지수를 동시 호출하면 "초당 거래건수를
  초과하였습니다" 에러가 자주 남. `server.js`에 전역 요청 큐(700ms 간격) + 재시도 +
  **15초 TTL 응답 캐시**(방문자 수와 무관하게 KIS 호출 빈도 고정, `withCache` 참고)로 해결함.
- **Claude Code의 in-app 프리뷰 브라우저 패널은 로컬의 다른 포트(예: 8090 → 3001)로의 JS
  `fetch()`를 막음** — 직접 URL 접속은 되는데 fetch만 `ERR_FAILED`. 프리뷰 패널 자체의 샌드박스
  제약이고 실제 사용자 브라우저에서는 정상 동작함. 로컬 프록시 연동 디버깅할 땐 실제 브라우저
  (Claude in Chrome 등)로 확인할 것.
- **엑셀 위장 모드 디자인 방향**: "진짜 UI 구조 흉내" ↔ "레이아웃 그대로 색상만 변경" 사이를
  왔다갔다하다가 **전자(구조 흉내)로 확정**. 색상만 바꾸는 버전은 라이트모드랑 구분이 안 된다는
  피드백 때문.
- **로컬 정적 서버는 세션마다 수동으로 켜야 함** — 작업 끝날 때까지 계속 켜두는 게 나음.
- Vercel 배포 직후엔 CDN 엣지 노드마다 캐시 반영 시점이 달라서 몇 분간 새/구 버전이 섞여 나올
  수 있음 (자동 해소됨, 코드 문제 아님).

## 다음에 할 일

1. **앱인토스 미니앱 포팅** (`@apps-in-toss/web-framework` 기반, 로그인/결제 SDK 불필요) — 유일하게
   남은 큰 작업. 핵심 UI/데이터 로직(`data.js`, 화면 렌더링)은 그대로 재사용 가능.
2. (선택) Render 무료 티어의 콜드스타트가 거슬리면 유료 플랜 고려, 또는 UptimeRobot 같은 걸로
   주기적 핑 (다만 무료 티어 남용으로 보일 수 있어 권장하진 않음).

## 그동안의 기획 결정 (배경 참고용)

- 처음엔 "고정지출 관리 캘린더" 아이디어였으나, 이미 토스 본체에 유사 기능이 있어 다른 아이템으로 전환
- 윈도우 네이티브 위젯(Widget Board)은 한때 복잡도가 높아 보류했었으나, 최근 마이크로소프트가
  PWA 매니페스트만으로 위젯보드에 등록하는 방식을 지원하기 시작해서 재검토 여지 있음 (다만
  위젯 화면은 HTML이 아니라 Adaptive Cards로 별도 디자인해야 하고, 다른 사람도 설치 가능하게
  하려면 Microsoft Store 등록까지 필요 — 사용자가 "일단 보류, 설치 버튼까지만" 결정함)
- "설치형 + 누구나 사용 가능"이라는 목표에 맞춰 PWA와 앱인토스 두 트랙을 동시에 노리는 구조로 설계
