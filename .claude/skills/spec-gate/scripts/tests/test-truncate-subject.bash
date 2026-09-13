#!/usr/bin/env bash
set -uo pipefail
SCRIPT="$(dirname "$0")/../gate-common.sh"

# helper
assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "    OK: $label"
  else
    echo "    FAIL: $label"
    echo "      expected: <$expected>"
    echo "      actual:   <$actual>"
    exit 1
  fi
}

assert_byte_le() {
  local label="$1" cap="$2" value="$3"
  local n
  n=$(printf '%s' "$value" | wc -c | tr -d ' ')
  if [ "$n" -le "$cap" ]; then
    echo "    OK: $label (bytes=$n <= $cap)"
  else
    echo "    FAIL: $label (bytes=$n > $cap, value=<$value>)"
    exit 1
  fi
}

# 1. ASCII 49 chars → unchanged (49 bytes <= 50)
input="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVW"
actual=$(bash "$SCRIPT" truncate-subject "$input" 50)
assert_eq "ASCII 49 → unchanged" "$input" "$actual"

# 2. ASCII 51 chars → truncated (with ellipsis)
input="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY"
actual=$(bash "$SCRIPT" truncate-subject "$input" 50)
assert_byte_le "ASCII 51 → bytes <= 50" 50 "$actual"
case "$actual" in
  *…) echo "    OK: ASCII 51 → ends with ellipsis" ;;
  *) echo "    FAIL: ASCII 51 → expected trailing …, got <$actual>"; exit 1 ;;
esac

# 3. Japanese 17 chars (51 bytes) → truncated
input="日本語の長いサブジェクト五十一バイトです"
actual=$(bash "$SCRIPT" truncate-subject "$input" 50)
assert_byte_le "Japanese 51b → bytes <= 50" 50 "$actual"

# 4. Mixed feat(payment): タイトル
input="feat(payment): mentor の payout 確定処理を新規追加"
actual=$(bash "$SCRIPT" truncate-subject "$input" 50)
assert_byte_le "Mixed jp/en → bytes <= 50" 50 "$actual"

# 5. Short input → unchanged
input="feat: short"
actual=$(bash "$SCRIPT" truncate-subject "$input" 50)
assert_eq "short → unchanged" "$input" "$actual"

# 6. Empty → empty
actual=$(bash "$SCRIPT" truncate-subject "" 50)
assert_eq "empty → empty" "" "$actual"

echo "  all truncate-subject assertions passed"
exit 0
