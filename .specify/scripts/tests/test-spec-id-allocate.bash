#!/usr/bin/env bash
set -uo pipefail
SCRIPT="$(dirname "$0")/../gate-common.sh"

TMP=$(mktemp -d)
cd "$TMP"
mkdir specs

# **slug は全並列で同一にする。** slug を `feat-$i` のように変えると ID 全体は
# 必ず異なるので、NNN が全部 001 でも「8 distinct」で通ってしまう。
# 検証したいのは **NNN の採番が直列化されているか**なので、NNN だけを見る。
for i in 1 2 3 4 5 6 7 8; do
  bash "$SCRIPT" spec-id-allocate-seq "test" "same-slug" > "out-$i.txt" 2>&1 &
done
wait

declare -a ids=()
for i in 1 2 3 4 5 6 7 8; do
  id=$(cat "out-$i.txt")
  ids+=("$id")
done

# NNN 部分の unique 数を確認 (これが lock の実効性そのもの)
declare -a nums=()
for id in "${ids[@]}"; do
  nums+=("$(echo "$id" | sed -E 's/^([0-9]{3}).*/\1/')")
done
unique=$(printf '%s\n' "${nums[@]}" | sort -u | wc -l | tr -d ' ')
if [ "$unique" -eq 8 ]; then
  echo "    OK: 8 parallel allocators produced 8 distinct NNN (採番が直列化されている)"
else
  echo "    FAIL: expected 8 distinct NNN, got $unique — 採番の排他が効いていない"
  printf '      %s\n' "${ids[@]}"
  cd / && rm -rf "$TMP"
  exit 1
fi

# format 検証 (NNN-test-same-slug)
for id in "${ids[@]}"; do
  if ! echo "$id" | grep -qE '^[0-9]{3}-test-same-slug$'; then
    echo "    FAIL: bad format: $id"
    cd / && rm -rf "$TMP"
    exit 1
  fi
done
echo "    OK: all IDs follow NNN-test-same-slug format"

cd /
rm -rf "$TMP"
echo "  all spec-id-allocate assertions passed"
exit 0
