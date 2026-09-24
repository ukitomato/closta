#!/usr/bin/env bash
# status-transition.sh — spec.md frontmatter の `status:` を遷移させる helper
#
# 用途:
#   gate skill (design-gate / code-gate / pr-gate / done) と producer skill
#   (spec / plan / tasks / implement) が status lifecycle を進めるために使う。
#   遷移の正当性 (from が現状値と一致するか) を検証してから書き換える。
#
#   Mode:
#     - --validate-verdict <path>           : JSON verdict 単体 validation
#     - --gate-transition <spec_dir> <gate> <from> <to>  : verdict PASS 必須の前進
#     - --downgrade <spec_dir> <from> <to>  : gate 失敗時の後戻り (verdict 不要)
#     - --legacy <spec_dir> <from> <to>     : verdict なしで遷移
#
# Status lifecycle:
#   drafting → planning → tasking → implementing → reviewing → completed
#
#   `migrated` も VALID_STATUSES に含むが、どの cl-* skill も生成・受理しない。
#   外部から持ち込まれた spec を手で lifecycle に載せ直すときの入口としてのみ残す。
#
# 使い方:
#   # 旧形式 (互換性のため残置、内部で --legacy にリダイレクト)
#   bash .specify/scripts/status-transition.sh <spec_dir> <from> <to>
#
#   # JSON verdict 検証付き遷移
#   bash .specify/scripts/status-transition.sh --gate-transition <spec_dir> <gate> <from> <to>
#     - <gate> ∈ {design, code, pr}
#     - <spec_dir>/.gate-verdict-<gate>.json が必須。
#       `gate_common::verdict_require_pass` を通すので verdict != PASS / critical > 0 /
#       (gate=code で) must_fix > 0 はいずれも exit 5 で reject される
#
#   # gate 失敗時の後戻り (verdict を見ない)
#   bash .specify/scripts/status-transition.sh --downgrade <spec_dir> <from> <to>
#
#   # JSON verdict 単体検証
#   bash .specify/scripts/status-transition.sh --validate-verdict <verdict_path>
#
# Exit:
#   0 → 遷移成功 / 検証成功
#   1 → 現状値が <from> と不一致 (遷移を中止)
#   2 → 引数不足 / spec.md 不存在 / parse 失敗
#   3 → verdict file 不存在
#   5 → verdict gate violation (verdict != PASS / critical > 0 / must_fix > 0)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE_COMMON="${SCRIPT_DIR}/gate-common.sh"

# Valid statuses
VALID_STATUSES=("drafting" "planning" "tasking" "implementing" "reviewing" "completed" "migrated")

is_valid_status() {
  local s="$1"
  for v in "${VALID_STATUSES[@]}"; do
    [ "$s" = "$v" ] && return 0
  done
  return 1
}

# Internal: get current status from spec.md frontmatter
read_current_status() {
  local spec_file="$1"
  awk '/^---$/{c++} c==1 && /^status:[[:space:]]*/{
    sub(/^status:[[:space:]]*/, "")
    gsub(/^["'\'']|["'\'']$/, "")
    gsub(/[[:space:]]+$/, "")
    print
    exit
  }' "$spec_file"
}

# Internal: rewrite frontmatter status
rewrite_status() {
  local spec_file="$1" new_to="$2"
  local tmpfile
  tmpfile=$(mktemp)
  awk -v new_status="$new_to" '
    BEGIN { in_fm = 0; replaced = 0 }
    /^---$/ {
      in_fm++
      print
      next
    }
    in_fm == 1 && !replaced && /^status:[[:space:]]*/ {
      print "status: " new_status
      replaced = 1
      next
    }
    { print }
  ' "$spec_file" > "$tmpfile"
  mv "$tmpfile" "$spec_file"
}

# Core: legacy transition (no verdict)
do_legacy_transition() {
  local spec_dir="$1" expected_from="$2" new_to="$3"
  local spec_file="${spec_dir}/spec.md"

  if [ ! -f "$spec_file" ]; then
    echo "status-transition: spec.md not found at $spec_file" >&2
    exit 2
  fi

  for s in "$expected_from" "$new_to"; do
    if ! is_valid_status "$s"; then
      echo "status-transition: invalid status '$s'" >&2
      echo "  Valid: ${VALID_STATUSES[*]}" >&2
      exit 2
    fi
  done

  local current
  current=$(read_current_status "$spec_file")
  if [ -z "$current" ]; then
    echo "status-transition: cannot find 'status:' in frontmatter of $spec_file" >&2
    exit 2
  fi

  if [ "$current" != "$expected_from" ]; then
    echo "status-transition: refusing to transition." >&2
    echo "  spec_file: $spec_file" >&2
    echo "  expected from: $expected_from" >&2
    echo "  actual current: $current" >&2
    echo "  to: $new_to" >&2
    exit 1
  fi

  rewrite_status "$spec_file" "$new_to"
  echo "status-transition: $spec_file: $current → $new_to"
  return 0
}

# --validate-verdict: schema 検査のみ (gate 判定ではない)
do_validate_verdict() {
  local verdict_path="$1"
  if [ ! -f "$GATE_COMMON" ]; then
    echo "status-transition: gate-common.sh not found at $GATE_COMMON" >&2
    exit 2
  fi
  bash "$GATE_COMMON" verdict-validate "$verdict_path"
}

# --gate-transition: verdict が PASS のときだけ前進させる
do_gate_transition() {
  local spec_dir="$1" gate="$2" expected_from="$3" new_to="$4"

  if [ ! -f "$GATE_COMMON" ]; then
    echo "status-transition: gate-common.sh not found at $GATE_COMMON" >&2
    exit 2
  fi

  case "$gate" in
    design|code|pr) : ;;
    *)
      echo "status-transition: invalid gate '$gate' (must be design|code|pr)" >&2
      exit 2 ;;
  esac

  local verdict_path="${spec_dir}/.gate-verdict-${gate}.json"
  if [ ! -f "$verdict_path" ]; then
    echo "status-transition: verdict not found at $verdict_path" >&2
    echo "  /cl-${gate}-gate を先に実行して verdict JSON を生成してください" >&2
    exit 3
  fi

  # **verdict-validate ではなく verdict-require-pass を使う。**
  # 前者は FIX_REQUIRED を正当な verdict として exit 0 で通すため、
  # gate を通っていない spec が前進してしまう。
  bash "$GATE_COMMON" verdict-require-pass "$verdict_path"
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "status-transition: gate を通っていないため遷移しません (exit=$rc) — $verdict_path" >&2
    echo "  Critical / MUST_FIX を解消して /cl-${gate}-gate を再実行してください。" >&2
    echo "  gate 失敗を受けて後戻りさせたい場合は --downgrade を使います。" >&2
    exit "$rc"
  fi

  # OK → proceed with legacy transition logic
  do_legacy_transition "$spec_dir" "$expected_from" "$new_to"
}

# ─── main dispatch ────────────────────────────────────────────────────
case "${1:-}" in
  --validate-verdict)
    [ -n "${2:-}" ] || { echo "usage: --validate-verdict <verdict_path>" >&2; exit 2; }
    do_validate_verdict "$2"
    ;;
  --gate-transition)
    [ -n "${5:-}" ] || { echo "usage: --gate-transition <spec_dir> <gate> <from> <to>" >&2; exit 2; }
    do_gate_transition "$2" "$3" "$4" "$5"
    ;;
  --downgrade)
    # gate 失敗時の後戻り。verdict は見ない (FIX_REQUIRED だから降格するので、
    # verdict PASS を要求したら降格そのものが不可能になる)。
    [ -n "${4:-}" ] || { echo "usage: --downgrade <spec_dir> <from> <to>" >&2; exit 2; }
    do_legacy_transition "$2" "$3" "$4"
    ;;
  --legacy)
    [ -n "${4:-}" ] || { echo "usage: --legacy <spec_dir> <from> <to>" >&2; exit 2; }
    do_legacy_transition "$2" "$3" "$4"
    ;;
  -h|--help|help)
    cat <<EOF
status-transition.sh — spec.md frontmatter status 遷移

Modes:
  (default)            Legacy: bash status-transition.sh <spec_dir> <from> <to>
  --legacy             Explicit legacy: bash ... --legacy <spec_dir> <from> <to>
  --gate-transition    Verdict-gated 前進: bash ... --gate-transition <spec_dir> <gate> <from> <to>
                       <gate> ∈ {design, code, pr}
                       <spec_dir>/.gate-verdict-<gate>.json 必須。
                       verdict_require_pass を通るまで遷移しない
  --downgrade          gate 失敗時の後戻り: bash ... --downgrade <spec_dir> <from> <to>
                       verdict は見ない (降格は FIX_REQUIRED のときに行うため)
  --validate-verdict   Validate JSON only: bash ... --validate-verdict <path>

Exit codes:
  0 = success, 1 = transition refused, 2 = bad args, 3 = verdict missing,
  5 = verdict hard-gate violation (verdict!=PASS / critical>0 / must_fix>0)
EOF
    ;;
  "")
    echo "usage: status-transition.sh <spec_dir> <from> <to>" >&2
    echo "       status-transition.sh --gate-transition <spec_dir> <gate> <from> <to>" >&2
    echo "       status-transition.sh --validate-verdict <verdict_path>" >&2
    exit 2
    ;;
  *)
    # 3-arg positional → legacy mode
    if [ "$#" -eq 3 ]; then
      do_legacy_transition "$1" "$2" "$3"
    else
      echo "status-transition: unknown invocation: $*" >&2
      echo "  Run with --help for usage." >&2
      exit 2
    fi
    ;;
esac
