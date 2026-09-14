# 캡처 참석 명단 OCR 파일

이 폴더 전체를 `index.html`과 같은 사이트의 `assets/ocr/` 경로에 게시한다. 브라우저에서 Tesseract OCR을 실행하기 위한 원본 배포 파일이며, npm 설치나 별도 API 키는 필요 없다. 파일을 수정하거나 이름을 바꾸지 않는다.

## 구성과 출처

| 파일 | 원본 / 버전 | 역할 |
| --- | --- | --- |
| `worker.min.js` | [Tesseract.js 7.0.0](https://github.com/naptha/tesseract.js/tree/v7.0.0) | 전용 Worker에서 OCR 실행 |
| `tesseract-core-*.wasm.js`, `tesseract-core-*.wasm` | [Tesseract.js-core 7.0.0](https://www.npmjs.com/package/tesseract.js-core/v/7.0.0) | 일반·SIMD·Relaxed SIMD LSTM 엔진 |
| `kor.traineddata.gz`, `eng.traineddata.gz` | `@tesseract.js-data/kor@1.0.0`, `@tesseract.js-data/eng@1.0.0`, `4.0.0_best_int` | 한국어·영어 인식 데이터 |
| `manifest.json` | 각 원본 URL, 바이트 수, SHA-256 | 파일 누락·손상 검증 |
| `LICENSE-*.txt`, `worker.min.js.LICENSE.txt` | 원본 라이선스와 번들 고지 | 배포 시 함께 보관 |

Tesseract.js 7은 브라우저가 지원하는 명령어에 따라 세 가지 LSTM 코어 중 하나를 고른다. 특정 기기에서 동작했다는 이유로 다른 코어를 삭제하지 않는다. 언어 파일의 `4.0.0_best_int`는 [공식 언어 데이터 저장소](https://github.com/naptha/tessdata)의 정수형 LSTM 배포판이다.

Tesseract.js·코어·언어 데이터는 Apache-2.0이다. Worker에 포함된 buffer, ieee754, base64-js, regenerator-runtime, zlibjs, bmp-js, idb-keyval, is-url, wasm-feature-detect의 라이선스도 함께 보관한다. 각 파일의 다운로드 출처는 manifest에 기록되어 있다.

## 실행과 개인정보

- `attendance-import.js`가 동일 사이트의 이 폴더만 참조한다. 실행 중 CDN이나 외부 AI API에 사진을 전송하지 않는다.
- 사진은 메모리에서 디코딩하고 OCR Worker로 전달한다. 미리보기 URL은 사진 삭제·화면 종료 시 해제하며, OCR Worker는 완료·취소·실패 시 종료한다.
- 브라우저는 인식용 언어 데이터를 캐시할 수 있다. 사진과 인식한 참석 명단은 저장하지 않는다. 사용자가 직접 연결한 별명은 확인란이 켜진 상태로 적용할 때만 해당 기기의 localStorage에 저장한다.
- Tesseract는 학습된 문자 인식 모델을 사용한다. 따라서 외부 AI 서비스·유료 API를 사용하지 않는 구현이며, 학습 모델 자체를 사용하지 않는 방식은 아니다.
- GitHub Pages 등 HTTP(S) 주소에서 실행한다. `file://`로 직접 열면 사진 인식 대신 게시된 사이트 주소를 사용하라는 안내를 보여준다.

## 다시 받기와 검증

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/helpers/fetch-ocr-assets.ps1
npm.cmd test
npm.cmd run test:attendance-browser
```

기존 파일을 유지하고 누락된 파일만 받을 때는 스크립트에 `-SkipExisting`을 붙인다. 버전을 올릴 때는 다운로드 경로, Worker 메시지 규약, 캐시 경로를 함께 검토하고 Chromium/WebKit에서 실제 OCR 테스트를 다시 실행한다. 원본 프로젝트의 [로컬 설치 설명](https://github.com/naptha/tesseract.js/blob/v7.0.0/docs/local-installation.md)과 [API 설명](https://github.com/naptha/tesseract.js/blob/v7.0.0/docs/api.md)을 참고한다.
