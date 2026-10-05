# TradingView CLI 2.3.1

OHLCV 수집 개수 제한을 확장하는 핫픽스입니다.

- `tv ohlcv` 기본 요청 개수: 100 → 500.
- `tv ohlcv --count N` / `-n N`: 최대 500 → 20,000. 정수 1~20,000만 허용합니다.
- 요청보다 로드된 이력이 적으면 가능한 봉만 반환하며 `insufficient_history: true`로 표시합니다.
- `requested`, `applied`, `bar_count`, `total_available`, `truncated`로 요청과 실제 수집 범위를 구분합니다. `limit`은 CLI 상한 20,000이며 계정 플랜의 한도가 아닙니다.
- 현재 차트에 로드된 최신 이력만 읽습니다. 추가 이력 다운로드·화면 이동·플랜 제한 우회는 하지 않으며, 부족 원인을 플랜 제한으로 단정하지 않습니다.
- `--summary`에도 동일한 범위를 적용합니다. 다른 명령의 페이지 크기 제한은 유지합니다.

```powershell
tv --workspace research-a ohlcv
tv --workspace research-a ohlcv --count 20000
tv --workspace research-a ohlcv -n 20000 --summary
```
