# Joins PDF to Email Converter

PDF 보고서를 이메일 친화적인 HTML로 자동 변환하는 Windows 데스크톱 앱입니다.

PDF의 각 페이지를 최적화된 PNG 이미지로 렌더링하고, 하이퍼링크를 보존한 채 이메일 본문에 바로 붙여넣을 수 있는 HTML을 생성합니다.

## 주요 기능

- **PDF → 이메일 HTML 변환** — Base64 이미지 임베딩으로 외부 파일 의존 없음
- **하이퍼링크 보존** — PDF 내 링크를 HTML 이미지 맵으로 변환하여 클릭 가능
- **이메일 용량 모니터링** — 25MB 제한 기준 실시간 게이지 표시
- **스마트 여백 제거** — 상하단 공백 트림 + 내부 큰 공백 영역 축소
- **변환 설정** — DPI, 이미지 폭, 여백 제거 세부 조정 가능
- **드래그 앤 드롭** — PDF 파일을 끌어다 놓아 바로 변환
- **최근 파일 관리** — 최근 변환한 파일 5개까지 빠른 재접근
- **이메일 호환성** — Outlook 조건부 주석, 다크모드 대응 HTML 생성

## 기술 스택

| 기술 | 용도 |
|------|------|
| Electron 28 | 데스크톱 앱 프레임워크 |
| Electron Forge | 빌드/패키징/배포 |
| Webpack | 모듈 번들링 (main + renderer) |
| PDF.js | PDF 파싱 및 페이지 렌더링 |
| Sharp | 이미지 리사이즈, 트림, 스티칭, PNG 최적화 |

## 프로젝트 구조

```
src/
├── main/                  # Electron 메인 프로세스
│   ├── main.js            # 앱 진입점, BrowserWindow 생성
│   ├── ipc-handlers.js    # IPC 통신 핸들러 (파일 선택, 변환 등)
│   ├── pdf-pipeline.js    # PDF 변환 파이프라인 (핵심 오케스트레이션)
│   ├── image-processor.js # 이미지 최적화/트림/스티칭 (Sharp)
│   ├── html-generator.js  # 이메일/미리보기 HTML 생성
│   ├── file-manager.js    # 출력 폴더 생성 및 파일 저장
│   └── size-monitor.js    # 이메일 용량 추적
├── renderer/              # UI (렌더러 프로세스)
│   ├── index.html         # 앱 화면 레이아웃
│   ├── renderer.js        # UI 로직, 상태 관리, IPC 호출
│   └── styles.css         # 스타일시트
├── preload/
│   └── preload.js         # contextBridge 기반 IPC 보안 브릿지
├── shared/
│   └── constants.js       # DPI, 크기 제한, 트림 파라미터 등 공유 상수
└── assets/
    ├── icon.ico           # 앱 아이콘
    └── ic_logo.png        # Joins 로고
```

## 시작하기

### 필수 조건

- Node.js 18 이상
- npm

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

1. **PDF 파일 선택** — 드래그 앤 드롭 또는 "파일 선택" 버튼 클릭
2. **변환 설정 조정** — DPI, 이미지 폭, 여백 제거 옵션 설정
3. **"변환 시작" 클릭** — 진행률과 이메일 용량이 실시간 표시됨
4. **결과 확인** — "브라우저에서 미리보기" 또는 "출력 폴더 열기"

## 출력 파일

변환 결과는 `문서/pdf2email/` 폴더에 저장됩니다.

```
{파일명}_{타임스탬프}/
├── preview.html      # 브라우저 미리보기용 HTML
├── email.html        # 이메일 본문에 붙여넣을 HTML
├── metadata.json     # 변환 메타데이터 (페이지 수, 크기 등)
└── images/
    └── stitched_*.png  # 페이지를 세로로 이어붙인 이미지
```

- **preview.html** — 브라우저에서 결과물을 확인하는 용도
- **email.html** — 이메일 클라이언트에 HTML 소스로 삽입하는 용도
- 페이지는 최대 30장씩 하나의 이미지로 스티칭됩니다

## 설정 옵션

| 설정 | 범위 | 기본값 | 설명 |
|------|------|--------|------|
| DPI | 100 ~ 400 | 200 | PDF 렌더링 해상도. 높을수록 선명하지만 용량 증가 |
| 이미지 폭 | 10 ~ 100% | 45% | 렌더링된 이미지의 축소 비율 |
| 여백 제거 | ON / OFF | OFF | 페이지 상하단 및 내부 공백 영역 축소 |
| 트림 감지 크기 | 1 ~ 100px | — | 공백으로 판단할 최소 연속 행 수 |
| 트림 유지 비율 | 0 ~ 100% | — | 제거된 공백 중 유지할 비율 |

## 변환 처리 흐름

```
PDF 파일 선택
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
    페이지 스티칭 (최대 30장씩 합본)
    ↓
    HTML 이미지 맵 생성 (링크 영역 매핑)
    ↓
    이메일 HTML + 미리보기 HTML 출력
    ↓
    파일 저장 (HTML, PNG, 메타데이터)
```

## 라이선스

MIT
