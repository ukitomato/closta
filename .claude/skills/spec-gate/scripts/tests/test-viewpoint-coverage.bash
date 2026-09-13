#!/usr/bin/env bash
set -uo pipefail
SCRIPT="$(dirname "$0")/../gate-common.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 全 A-H が present
cat > "$TMP/full.md" <<'EOF'
# x

## 初回読了 viewpoint

- A. 認可: Critical:0
- B. 入力検証: High:2
- C. injection: Medium:1
- D. 依存ライブラリ: 該当なし: TS only
- E. 暗号: Low:3
- F. ログ漏洩: Critical:1
- G. session: 該当なし: stateless
- H. CSRF: High:1

## Findings
EOF
out=$(bash "$SCRIPT" viewpoint-coverage "$TMP/full.md")
echo "    coverage: $out"
case "$out" in
  *'"missing": []'*) echo "    OK: all A-H present" ;;
  *) echo "    FAIL: expected missing=[], got $out"; exit 1 ;;
esac

# C と F が欠落
cat > "$TMP/partial.md" <<'EOF'
# x

## 初回読了 viewpoint

- A. 認可: Critical:0
- B. 入力検証: High:2
- D. 依存ライブラリ: 該当なし
- E. 暗号: Low:3
- G. session: 該当なし
- H. CSRF: High:1

## Findings
EOF
set +e
out=$(bash "$SCRIPT" viewpoint-coverage "$TMP/partial.md")
rc=$?
set -e
echo "    coverage: $out (exit=$rc)"
case "$out" in
  *'"missing": ['*'"C"'*'"F"'*) echo "    OK: C, F detected missing" ;;
  *) echo "    FAIL: expected missing C, F"; exit 1 ;;
esac
if [ "$rc" -ne 1 ]; then
  echo "    FAIL: expected exit 1 on missing, got $rc"
  exit 1
fi

echo "  all viewpoint-coverage assertions passed"
exit 0
