#!/usr/bin/env bash
set -uo pipefail
SCRIPT="$(dirname "$0")/../gate-common.sh"

TMP=$(mktemp -d)
mkdir -p "$TMP/spec"

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

# 1. tasks.md 不在 → 3
expect_rc "tasks.md 不在" 3 bash "$SCRIPT" tasks-complete-check "$TMP/spec"

# 2. 全件チェック済 → 0
cat > "$TMP/spec/tasks.md" <<'EOF'
## US-1
- [x] T001 done
- [x] T002 done
EOF
expect_rc "全件 [x]" 0 bash "$SCRIPT" tasks-complete-check "$TMP/spec"

# 3. 未チェックあり → 1
cat > "$TMP/spec/tasks.md" <<'EOF'
## US-1
- [x] T001 done
- [ ] T002 not done
- [ ] T003 not done
EOF
expect_rc "未チェック 2 件" 1 bash "$SCRIPT" tasks-complete-check "$TMP/spec"

# 4. 未チェック件数を stdout で返す
count=$(bash "$SCRIPT" tasks-complete-check "$TMP/spec" 2>/dev/null)
if [ "$count" = "2" ]; then
  echo "    OK: 未チェック件数を stdout に返す (2)"
else
  echo "    FAIL: expected stdout '2', got '$count'"
  cd / && rm -rf "$TMP"
  exit 1
fi

# 5. インデントされた checkbox も数える
cat > "$TMP/spec/tasks.md" <<'EOF'
## US-1
  - [ ] nested unchecked
EOF
expect_rc "インデント付き未チェック" 1 bash "$SCRIPT" tasks-complete-check "$TMP/spec"

# 6. checkbox でない `[ ]` は数えない
cat > "$TMP/spec/tasks.md" <<'EOF'
## Notes
この行には [ ] があるが checkbox ではない
- [x] T001 done
EOF
expect_rc "本文中の [ ] は無視" 0 bash "$SCRIPT" tasks-complete-check "$TMP/spec"

cd /
rm -rf "$TMP"
echo "  all tasks-complete-check assertions passed"
exit 0
