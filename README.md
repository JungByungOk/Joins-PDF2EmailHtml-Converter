# Joins PDF to Email Converter

PDF 보고서를 이메일 친화적인 HTML로 자동 변환하는 Windows 데스크톱 앱입니다.

PDF의 각 페이지를 최적화된 PNG 이미지로 렌더링하고, 하이퍼링크를 보존한 채 이메일 본문에 바로 붙여넣을 수 있는 HTML을 생성합니다. Cloudflare R2에 이미지를 호스팅하여 Outlook, Teams, 웹메일, iPhone 등 모든 이메일 클라이언트에서 정상 동작합니다.

## 스크린샷

![screenshot1](https://github.com/user-attachments/assets/d581a81d-c012-4257-894a-20a6cec7e29f)

![screenshot2](https://github.com/user-attachments/assets/68df03c2-5f63-44a0-bad0-c0f4f1c1f457)

![screenshot3](https://github.com/user-attachments/assets/019dc21f-d71c-4093-96ce-00ff7e5fb12c)

![screenshot4](https://github.com/user-attachments/assets/5e39c6c2-5af6-4beb-b448-007786ad9a9d)

## 주요 기능

- **PDF → 이메일 HTML 변환** — Cloudflare R2 이미지 호스팅으로 경량 HTML 생성 (~3KB)
- **Outlook 완벽 호환** — 이미지 슬라이싱 + `<a><img></a>` 패턴으로 Outlook/Teams에서 링크 정상 동작
- **하이퍼링크 보존** — PDF 내 링크를 링크 영역별 이미지 슬라이스로 분할하여 클릭 가능
- **클립보드 복사** — 변환된 HTML을 클립보드에 복사하여 Outlook 본문에 바로 붙여넣기
- **이메일 용량 모니터링** — 25MB 제한 기준 실시간 게이지 표시
- **스마트 여백 제거** — 상하단 공백 트림 + 내부 큰 공백 영역 축소
- **변환 설정** — DPI, 이미지 배율, 여백 제거, 페이지 구분선 세부 조정
- **드래그 앤 드롭** — PDF 파일을 끌어다 놓아 바로 변환
- **최근 파일 관리** — 최근 변환한 파일 5개까지 빠른 재접근
- **크로스 클라이언트 호환** — Outlook, Teams, Gmail, iPhone Safari 등에서 테스트 완료

## 기술 스택

| 기술 | 용도 |
|------|------|
| Electron 28 | 데스크톱 앱 프레임워크 |
| Electron Forge | 빌드/패키징/배포 |
| Webpack | 모듈 번들링 (main + renderer) |
| PDF.js | PDF 파싱 및 페이지 렌더링 |
| Sharp | 이미지 리사이즈, 트림, 스티칭, 슬라이싱, PNG 최적화 |
| AWS SDK (S3) | Cloudflare R2 이미지 업로드 (S3 호환 API) |

## 프로젝트 구조

```
src/
├── main/                    # Electron 메인 프로세스
│   ├── main.js              # 앱 진입점, BrowserWindow 생성
│   ├── ipc-handlers.js      # IPC 통신 핸들러 (파일 선택, 변환, R2, 클립보드)
│   ├── pdf-pipeline.js      # PDF 변환 파이프라인 (이미지 슬라이싱 + R2 업로드)
│   ├── image-processor.js   # 이미지 최적화/트림/스티칭 (Sharp)
│   ├── html-generator.js    # 이메일/미리보기 HTML 생성 (Outlook 호환)
│   ├── r2-uploader.js       # Cloudflare R2 업로드 모듈
│   ├── settings-manager.js  # R2 설정 저장/로드 (safeStorage 암호화)
│   ├── file-manager.js      # 출력 폴더 생성 및 파일 저장
│   └── size-monitor.js      # 이메일 용량 추적
├── renderer/                # UI (렌더러 프로세스)
│   ├── index.html           # 앱 화면 레이아웃 (R2 설정 모달 포함)
│   ├── renderer.js          # UI 로직, 상태 관리, IPC 호출
│   ├── pdf-renderer.js      # PDF.js 페이지 렌더링
│   └── styles.css           # 스타일시트
├── preload/
│   └── preload.js           # contextBridge 기반 IPC 보안 브릿지
├── shared/
│   └── constants.js         # DPI, 크기 제한, 트림 파라미터 등 공유 상수
└── assets/
    ├── icon.ico             # 앱 아이콘
    └── ic_logo.png          # Joins 로고
```

## 시작하기

### 필수 조건

- Node.js 18 이상
- npm
- Cloudflare R2 버킷 (이미지 호스팅용)

### Cloudflare R2 설정

이미지를 외부 호스팅하여 경량 이메일 HTML을 생성하기 위해 Cloudflare R2 설정이 필요합니다.

1. [Cloudflare 대시보드](https://dash.cloudflare.com)에서 R2 버킷 생성
2. 버킷 설정 → **공개 액세스 활성화** (Public URL 획득)
3. **API 토큰 생성** (R2 읽기/쓰기 권한)
4. 앱 실행 후 우측 상단 톱니바퀴 아이콘 → R2 설정에 입력
   - Account ID
   - Access Key ID
   - Secret Access Key (로컬에 암호화 저장)
   - Bucket Name
   - Public URL (`https://pub-xxx.r2.dev` 또는 커스텀 도메인)
5. "연결 테스트" 버튼으로 정상 연결 확인

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm start
```

### 빌드

```bash
# Windows 빌드 스크립트 실행
build.bat

# 또는 직접 실행
npx electron-forge make --platform win32 --arch x64
```

빌드 결과물:
- `out/make/squirrel.windows/` — Windows 설치 파일 (.exe)
- `out/make/zip/win32/x64/` — 포터블 ZIP

## 사용법

1. **R2 설정** — 첫 실행 시 자동으로 R2 설정 모달이 열림 (설정 완료 전 변환 불가)
2. **PDF 파일 선택** — 드래그 앤 드롭 또는 "파일 선택" 버튼 클릭
3. **변환 설정 조정** — DPI, 이미지 배율, 여백 제거 옵션 설정
4. **"변환 시작" 클릭** — 진행률과 이메일 용량이 실시간 표시됨
5. **결과 확인**
   - **"이메일 본문에 붙여넣기용 복사"** → Outlook/Teams에 Ctrl+V로 바로 붙여넣기
   - **"브라우저에서 미리보기"** → 브라우저에서 결과물 확인
   - **"출력 폴더 열기"** → 생성된 파일 확인

## 출력 파일

변환 결과는 `문서/pdf2email/` 폴더에 저장됩니다.

```
{파일명}_{타임스탬프}/
├── preview.html      # 브라우저 미리보기용 HTML (스티칭 이미지 + 이미지맵)
├── email.html        # 이메일용 HTML (R2 URL + <a><img> 패턴)
├── metadata.json     # 변환 메타데이터 (페이지 수, 크기 등)
└── images/
    └── stitched_*.png  # 페이지를 세로로 이어붙인 이미지
```

- **preview.html** — 브라우저에서 결과물을 확인하는 용도 (이미지맵 링크)
- **email.html** — Outlook 등 이메일 클라이언트에 붙여넣는 용도 (R2 URL 이미지)
- 이미지는 R2에 업로드되어 URL로 참조 → HTML 파일은 약 3KB로 경량

## 설정 옵션

| 설정 | 범위 | 기본값 | 설명 |
|------|------|--------|------|
| 렌더링 DPI | 100 ~ 400 | 250 | PDF 렌더링 해상도. 높을수록 선명하지만 용량 증가 |
| 이미지 배율 | 50 ~ 150% | 135% | 원본 이미지 대비 출력 이미지 크기 비율 |
| 여백 줄이기 | ON / OFF | OFF | 페이지 상하단 및 내부 공백 영역 축소 |
| 여백 탐지 | 1 ~ 100px | 65px | 여백으로 인식할 최소 연속 빈 행 크기 |
| 남길 여백 | 0 ~ 100% | 30% | 탐지된 여백에서 유지할 비율 |
| 페이지 구분선 | ON / OFF | OFF | 페이지 사이 연한 회색 구분선 삽입 (여백 줄이기와 상호 배타) |

## 변환 처리 흐름

```
PDF 파일 선택
    ↓
R2 설정 확인 (미설정 시 설정 모달 자동 표시)
    ↓
페이지별 반복 처리:
    PDF 페이지 → Canvas 렌더링 → PNG 추출
    ↓
    이미지 최적화 (트림, 리사이즈, 압축)
    ↓
    링크 좌표 변환 (트림/리사이즈 반영)
    ↓
    용량 누적 추적
    ↓
출력 생성:
    [브라우저 미리보기용]
    페이지 스티칭 (최대 30장씩 합본) → R2 업로드
    HTML 이미지 맵 생성 (링크 영역 매핑)
    ↓
    [Outlook 이메일용]
    링크 Y좌표 기준 이미지 슬라이싱 → R2 업로드
    슬라이스별 <a><img></a> 또는 <img> HTML 생성
    ↓
    파일 저장 (HTML, PNG, 메타데이터)
```

### Outlook 호환 이미지 슬라이싱

Outlook은 Word 렌더링 엔진을 사용하여 HTML `<map>`/`<area>`/`usemap` 태그를 제거합니다.
이를 우회하기 위해 페이지 이미지를 링크 영역 경계에서 가로로 슬라이싱합니다:

```
┌─────────────────────┐
│  비링크 영역 → <img> │  ← 단순 이미지
├─────────────────────┤
│  링크 A 영역         │  ← <a href="A"><img></a>
├─────────────────────┤
│  비링크 영역 → <img> │  ← 단순 이미지
├─────────────────────┤
│  링크 B 영역         │  ← <a href="B"><img></a>
├─────────────────────┤
│  비링크 영역 → <img> │  ← 단순 이미지
└─────────────────────┘
```

각 슬라이스는 독립적인 PNG로 R2에 업로드되며, 링크 영역은 `<a>` 태그로 감싸져 Outlook에서도 클릭 가능합니다.

## 이메일 클라이언트 호환성

| 클라이언트 | 이미지 | 링크 | 비고 |
|-----------|--------|------|------|
| Outlook (데스크톱) | ✅ | ✅ | Word 렌더링 엔진 대응 |
| Microsoft Teams | ✅ | ✅ | Outlook과 동일 엔진 |
| Gmail (웹) | ✅ | ✅ | |
| iPhone Mail / Safari | ✅ | ✅ | |
| 네이버 메일 | ✅ | ✅ | |

## 보안

- R2 Secret Access Key는 Electron `safeStorage` API로 OS 수준 암호화 후 저장
- 소스 코드에 민감 정보 미포함
- `contextIsolation` + `contextBridge` 기반 IPC 보안 브릿지

## 라이선스

MIT
