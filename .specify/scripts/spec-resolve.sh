#!/usr/bin/env bash
# spec-resolve.sh — Spec-Driven Gating Workflow 共通の spec ディレクトリ推論 helper
#
# 用途:
#   全 wrapper (/spec-gate.spec, /spec-gate.plan, /spec-gate.tasks,
#   /spec-gate.design-gate, /spec-gate.implement, /spec-gate.code-gate,
#   /spec-gate.pr-gate, /spec-gate.done) が <spec_dir> 引数を省略可能とするため、
#   git branch から specs/<spec_id>/ を一意に解決する。
#
# サポート形式:
#   - 連番: specs/NNN-<domain>-<slug>/   (例: specs/001-auth-login)
#   - 時刻: specs/YYYY-MM-DD-HHMM-<DOMSHORT>-<slug>/  (例: specs/2026-05-17-1030-AUT-login)
#   - reverse: specs/rev-<NNN>-<DOMSHORT>-<slug>/      (Brownfield migrate Phase 3)
#
# 解決順序:
#   1. $1 が完全な dir 名 → specs/$1/
#   2. $1 が NNN (3 桁) → specs/NNN-* を 1 件 glob
#   3. $1 が YYYY-MM-DD-HHMM → specs/<TS>-* を 1 件 glob
#   4. $1 省略 + .specify/feature.json の feature_directory が SSoT として存在
#   5. $1 省略 → git branch から推論:
#      - feature/<id>, fix/<id>, chore/<id> 等の gitflow prefix を 1 段剥がす
#      - <id> が NNN → specs/NNN-*
#      - <id> が <ticket>-<NN> (lib-101, jira-123 等) → 末尾 NN を 3 桁化して specs/
#      - <id> が YYYY-MM-DD-HHMM → そのまま
#   6. 0 件 → mtime 最新の specs/ を fallback
#   7. 複数マッチ → exit 2
#
# 出力 (stdout): 解決された ディレクトリパス
# 出力 (stderr): 警告 / 候補列挙
# Exit: 0=成功, 2=曖昧/解決不能

set -uo pipefail

input="${1:-}"

# ─── 1. 完全な dir 名 ─────────────────────────────────────────────────
if [ -n "$input" ] && [ -d "specs/$input" ]; then
  echo "specs/$input"
  exit 0
fi

# ─── 2. NNN 3 桁 ────────────────────────────────────────────────────
if [ -n "$input" ] && echo "$input" | grep -qE '^[0-9]{3}$'; then
  matches=(specs/${input}-*)
  count=${#matches[@]}
  if [ "$count" -eq 1 ] && [ -d "${matches[0]}" ]; then
    echo "${matches[0]}"
    exit 0
  elif [ "$count" -gt 1 ]; then
    echo "spec-resolve: ambiguous match for '$input':" >&2
    printf '  %s\n' "${matches[@]}" >&2
    exit 2
  fi
fi

# ─── 3. YYYY-MM-DD-HHMM ──────────────────────────────────────────────
if [ -n "$input" ] && echo "$input" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}$'; then
  matches=(specs/${input}-*)
  count=${#matches[@]}
  if [ "$count" -eq 1 ] && [ -d "${matches[0]}" ]; then
    echo "${matches[0]}"
    exit 0
  elif [ "$count" -gt 1 ]; then
    echo "spec-resolve: ambiguous timestamp match for '$input':" >&2
    printf '  %s\n' "${matches[@]}" >&2
    exit 2
  fi
fi

# ─── 4. feature.json (SSoT) ─────────────────────────────────────────
if [ -z "$input" ] && [ -f .specify/feature.json ]; then
  fd=""
  if command -v jq >/dev/null 2>&1; then
    fd=$(jq -r '.feature_directory // empty' .specify/feature.json 2>/dev/null || true)
  elif command -v python3 >/dev/null 2>&1; then
    fd=$(python3 -c "import json,sys; d=json.load(open('.specify/feature.json')); v=d.get('feature_directory'); print(v if v else '')" 2>/dev/null || true)
  else
    fd=$(grep -E '"feature_directory"' .specify/feature.json 2>/dev/null \
      | head -n 1 \
      | sed -E 's/^[^:]*:[[:space:]]*"([^"]*)".*$/\1/')
  fi
  if [ -n "$fd" ] && [ -d "$fd" ]; then
    echo "$fd"
    exit 0
  fi
fi

# ─── 5. branch から推論 ──────────────────────────────────────────────
if [ -z "$input" ]; then
  branch=$(git branch --show-current 2>/dev/null || true)
  if [ -z "$branch" ]; then
    echo "spec-resolve: cannot detect git branch (detached HEAD?)" >&2
    exit 2
  fi

  # gitflow prefix を 1 段剥がす
  if [[ "$branch" == */* && "$branch" != */*/* ]]; then
    stripped="${branch#*/}"
  else
    stripped="$branch"
  fi

  resolved_id=""

  # 5a. <id>-NN (ticket-NN, lib-101, jira-123 等)
  if echo "$stripped" | grep -qE '^[a-z]+-[0-9]+(-.*)?$'; then
    ticket_num=$(echo "$stripped" | sed -E 's/^[a-z]+-([0-9]+).*/\1/')
    resolved_id=$(printf '%03d' "$ticket_num")
  # 5b. NNN-<rest>
  elif echo "$stripped" | grep -qE '^[0-9]{3}-'; then
    resolved_id=$(echo "$stripped" | sed -E 's/^([0-9]{3})-.*/\1/')
  # 5c. YYYY-MM-DD-HHMM-<rest>
  elif echo "$stripped" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}-'; then
    resolved_id=$(echo "$stripped" | sed -E 's/^([0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4})-.*/\1/')
  fi

  if [ -n "$resolved_id" ]; then
    matches=(specs/${resolved_id}-*)
    count=${#matches[@]}
    if [ "$count" -eq 1 ] && [ -d "${matches[0]}" ]; then
      echo "${matches[0]}"
      exit 0
    elif [ "$count" -gt 1 ]; then
      echo "spec-resolve: branch '$branch' → '$resolved_id' matches multiple specs:" >&2
      printf '  %s\n' "${matches[@]}" >&2
      exit 2
    fi
  fi

  # ─── 6. fallback: mtime 最新 ─────────────────────────────────────
  if [ -d specs ]; then
    latest=$(ls -1dt specs/*/ 2>/dev/null | head -n 1 | sed 's:/*$::')
    if [ -n "$latest" ] && [ -d "$latest" ]; then
      echo "spec-resolve: branch '$branch' did not resolve uniquely; using mtime fallback: $latest" >&2
      echo "$latest"
      exit 0
    fi
  fi

  echo "spec-resolve: cannot resolve spec dir from branch '$branch'" >&2
  exit 2
fi

# ─── 引数があったがどれにも match しなかった ─────────────────────────
echo "spec-resolve: '$input' is not a valid NNN, YYYY-MM-DD-HHMM, or full dir name" >&2
echo "  Expected:" >&2
echo "    - '001' (3-digit NNN)" >&2
echo "    - '2026-05-17-1030' (timestamp)" >&2
echo "    - '001-auth-login' (full dir name)" >&2
echo "    - 'rev-001-AUT-login' (reverse spec from /spec-gate.migrate)" >&2
echo "    - omit to infer from branch / .specify/feature.json" >&2
exit 2
