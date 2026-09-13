#!/usr/bin/env bash
# run-all.bash — gate-common.sh の unit test runner (V-1)
set -uo pipefail

cd "$(dirname "$0")"
TESTS_DIR=$(pwd)
SCRIPT="${TESTS_DIR}/../gate-common.sh"

if [ ! -f "$SCRIPT" ]; then
  echo "ERROR: gate-common.sh not found at $SCRIPT" >&2
  exit 1
fi

declare -i PASS=0 FAIL=0
declare -a FAILED_TESTS=()

run_test() {
  local name="$1"
  local script_path="$2"
  echo -n "  [$name] ... "
  if bash "$script_path" >/tmp/gc-test.out 2>&1; then
    echo "PASS"
    PASS+=1
  else
    echo "FAIL"
    FAIL+=1
    FAILED_TESTS+=("$name")
    echo "    output:" >&2
    sed 's/^/      /' /tmp/gc-test.out >&2
  fi
}

echo "Running gate-common.sh unit tests..."
echo

for t in "$TESTS_DIR"/test-*.bash; do
  [ -f "$t" ] || continue
  base=$(basename "$t" .bash)
  run_test "$base" "$t"
done

echo
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  printf '  - %s\n' "${FAILED_TESTS[@]}"
  exit 1
fi
exit 0
