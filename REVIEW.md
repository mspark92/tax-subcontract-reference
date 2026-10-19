# 평일 09:00 자동 검토 절차 (Claude 예약 작업용)

이 문서는 매일 실행되는 Claude 예약 작업이 따르는 절차입니다. 사람이 직접 따라 해도 됩니다.

## 0. 준비
1. 저장소를 최신으로 받습니다. `git pull origin main`
2. 오늘(한국시간) 수집이 끝났는지 `data/runs.json`의 첫 항목 `completedAt`으로 확인합니다.
   - 오늘 기록이 없으면 GitHub Actions의 `site.yml`을 `collect=true`로 실행하고, 끝날 때까지 기다린 뒤 다시 `git pull` 합니다.
   - 수집이 `blocked`(접속 실패)이면 원인(OC 인증키, IP 등록, 사이트 장애)을 기록하고 사용자에게 알립니다.

## 1. 변경 여부 판단
- `data/pending.json`이 빈 배열이면 **변경 없음**입니다. 아무것도 커밋하지 않고, 알림도 보내지 않고 끝냅니다.
- 항목이 있으면 아래 2~4단계를 진행합니다.

## 2. 개정 요약 작성 (`type: law` 또는 `rule`)
각 항목마다 `data/<domain>/updates.json` 맨 앞에 다음 형식으로 추가합니다.

```json
{"id":"<domain>-upd-<recordId>-<새 버전>","domain":"tax","recordId":"<id>","title":"법령명","lawLevel":"시행령",
 "effectiveDate":"YYYY-MM-DD","promulgationDate":"YYYY-MM-DD",
 "headline":"한 문장 요약",
 "points":["주요 개정 내용 1 (제00조)","..."],
 "practice":["실무에서 달라지는 점 1","..."],
 "changedArticles":["제00조(제목)","..."],
 "author":"Claude 자동 정리","writtenAt":"<ISO 시각>",
 "sourceUrl":"https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=<새 버전>"}
```

작성 규칙
- 근거는 `data/<domain>/bodies/<id>.json`의 `revisionReason`(제·개정 이유), `revisionText`(개정문), 그리고 `pending` 항목의 `diff`(추가·변경·삭제 조문)뿐입니다. 이 자료에 없는 내용은 쓰지 않습니다.
- 모든 `points`에 조문 번호를 붙입니다. 시행일이 조문별로 다르면(부칙) 그 사실을 적습니다.
- 숫자(세율, 기한, 금액)는 원문에서 그대로 옮기고, 바뀐 조문 본문을 직접 확인합니다.
- `practice`에는 신고·계약·서식 등 실무 절차에서 확인할 점을 씁니다. 추측이면 쓰지 않습니다.
- 개정 이유가 비어 있고 변경 조문만 있으면, 바뀐 조문만 사실대로 나열하고 `headline`에 "개정 이유 미제공"을 밝힙니다.

## 3. 새 해석례·결정례 (`type: source`)
- 별도 요약은 필요 없습니다. 실무 해설과 관련된 새 자료가 있으면 해당 해설의 `basis`에 추가할지 검토합니다.

## 4. 실무 해설 점검
- 개정된 법령을 근거로 쓴 `data/<domain>/guides.json`의 해설이 있으면(`basis[].recordId`로 확인), 개정 조문과 대조해 내용을 고치고 `writtenAt`과 `reviewedAgainst`(예: "시행 2026-01-01 법령")를 갱신합니다.

## 5. 마무리
1. `data/pending.json`을 `[]`로 비웁니다.
2. `npm ci && npm run check && node build.mjs`로 빌드가 되는지 확인합니다.
3. 커밋 메시지 `개정 요약 반영 YYYY-MM-DD` 로 커밋하고 `main`에 푸시합니다(푸시하면 사이트가 자동 배포됩니다).
4. 사용자에게 이메일로 알립니다: 바뀐 법령 목록, 각 headline, 사이트 주소. 변경이 없던 날은 알리지 않습니다.
