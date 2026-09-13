#!/usr/bin/env bash
set -uo pipefail
SCRIPT="$(dirname "$0")/../gate-common.sh"

TMP=$(mktemp -d)
cd "$TMP"
mkdir specs

# 8 並列 allocator を起動
for i in 1 2 3 4 5 6 7 8; do
  bash "$SCRIPT" spec-id-allocate-seq "test" "feat-$i" > "out-$i.txt" 2>&1 &
done
wait

# 全 ID を集約
declare -a ids=()
for i in 1 2 3 4 5 6 7 8; do
  id=$(cat "out-$i.txt")
  ids+=("$id")
done

# unique 数を確認
unique=$(printf '%s\n' "${ids[@]}" | sort -u | wc -l | tr -d ' ')
if [ "$unique" -eq 8 ]; then
  echo "    OK: 8 parallel allocators produced 8 distinct IDs"
else
  echo "    FAIL: expected 8 distinct, got $unique"
  printf '      %s\n' "${ids[@]}"
  cd / && rm -rf "$TMP"
  exit 1
fi

# format 検証 (NNN-test-feat-N)
for id in "${ids[@]}"; do
  if ! echo "$id" | grep -qE '^[0-9]{3}-test-feat-[1-8]$'; then
    echo "    FAIL: bad format: $id"
    cd / && rm -rf "$TMP"
    exit 1
  fi
done
echo "    OK: all IDs follow NNN-test-feat-N format"

cd /
rm -rf "$TMP"
echo "  all spec-id-allocate assertions passed"
exit 0
