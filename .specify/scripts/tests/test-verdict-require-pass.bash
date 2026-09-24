#!/usr/bin/env bash
set -uo pipefail
SCRIPT="$(dirname "$0")/../gate-common.sh"

TMP=$(mktemp -d)

# verdict_validate と verdict_require_pass の役割分担を固定する。
#   verdict_validate     — schema 検査。FIX_REQUIRED は正当なので 0
#   verdict_require_pass — 次の段に進んでよいか。PASS 以外は 5
# この 2 つが同じ答えを返すようになったら、どちらかの意味が壊れている。

mk() {  # mk <file> <gate> <verdict> <critical> [extra_json]
  cat > "$TMP/$1" <<EOF
{
  "gate": "$2",
  "run": "2026-09-23T00:00:00Z",
  "spec_dir": "specs/001-x",
  "spec_id": "001-x",
  "severity_counts": {"critical": $4, "high": 0, "medium": 0, "low": 0${5:-}},
  "verdict": "$3"
}
EOF
}

expect_rc() {  # expect_rc <label> <expected_rc> <cmd...>
  local label="$1" want="$2"; shift 2
  "$@" >/dev/null 2>&1; local got=$?
  if [ "$got" -eq "$want" ]; then
    echo "    OK: $label (rc=$got)"
  else
    echo "    FAIL: $label — expected rc=$want, got $got"
    cd / && rm -rf "$TMP"
    exit 1
  fi
}

# 1. PASS / critical=0 → 両方 0
mk pass.json pr PASS 0
expect_rc "PASS: validate"     0 bash "$SCRIPT" verdict-validate     "$TMP/pass.json"
expect_rc "PASS: require-pass" 0 bash "$SCRIPT" verdict-require-pass "$TMP/pass.json"

# 2. FIX_REQUIRED / critical=3 → validate は 0、require-pass は 5
#    (ここが分岐点。validate が 5 を返すようになったら後方互換が壊れている)
mk fix.json pr FIX_REQUIRED 3
expect_rc "FIX_REQUIRED: validate は通す"      0 bash "$SCRIPT" verdict-validate     "$TMP/fix.json"
expect_rc "FIX_REQUIRED: require-pass は止める" 5 bash "$SCRIPT" verdict-require-pass "$TMP/fix.json"

# 3. FIX_REQUIRED / critical=0 でも PASS ではないので止める
mk fix0.json pr FIX_REQUIRED 0
expect_rc "FIX_REQUIRED critical=0 も止める" 5 bash "$SCRIPT" verdict-require-pass "$TMP/fix0.json"

# 4. PASS と自称しつつ critical>0 は両方 5 (自己矛盾)
mk bad.json pr PASS 2
expect_rc "PASS+critical>0: validate"     5 bash "$SCRIPT" verdict-validate     "$TMP/bad.json"
expect_rc "PASS+critical>0: require-pass" 5 bash "$SCRIPT" verdict-require-pass "$TMP/bad.json"

# 5. CONVERGENCE_FAILURE / ERROR も止める
mk conv.json pr CONVERGENCE_FAILURE 0
expect_rc "CONVERGENCE_FAILURE を止める" 5 bash "$SCRIPT" verdict-require-pass "$TMP/conv.json"
mk err.json design ERROR 0
expect_rc "ERROR を止める" 5 bash "$SCRIPT" verdict-require-pass "$TMP/err.json"

# 6. gate=code は must_fix > 0 でも止める (PASS / critical=0 でも)
mk codebad.json code PASS 0 ', "must_fix": 4'
expect_rc "code: PASS でも must_fix>0 は止める" 5 bash "$SCRIPT" verdict-require-pass "$TMP/codebad.json"
mk codeok.json code PASS 0 ', "must_fix": 0'
expect_rc "code: must_fix=0 は通す" 0 bash "$SCRIPT" verdict-require-pass "$TMP/codeok.json"

# 7. file 不在は 3
expect_rc "missing file" 3 bash "$SCRIPT" verdict-require-pass "$TMP/nope.json"

cd /
rm -rf "$TMP"
echo "  all verdict-require-pass assertions passed"
exit 0
