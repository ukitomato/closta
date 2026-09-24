#!/usr/bin/env bash
# gate-common.sh — Spec-Driven Gating Workflow 共通 helper (Wave 0 foundation)
#
# 用途:
#   全 wrapper (spec / plan / tasks / design-gate / implement / code-gate /
#   pr-gate / done) と一部 subagent (cascade enforcement 用) が source して使う
#   共通 helper の集合体。
#
#   主機能:
#     - Phase 0 共通 logic (repo / spec_dir / status / charter check)
#     - spec_id atomic 割当 (flock or mkdir-lock fallback)
#     - cascade enforcement (0 件確認なし Critical → High 機械的降格)
#     - viewpoint 網羅性チェック (reviewer-base.md の A-H 必須カテゴリ)
#     - JSON verdict emit / validate (machine-checkable gate verdict)
#     - agents registry (.specify/.agents-registry.yaml) validation
#     - timeout-bounded subprocess (run_with_timeout)
#     - UTF-8 grapheme-aware subject truncation
#
# 使い方 (source):
#   source .specify/scripts/gate-common.sh
#   gate_common::phase0_check_repo || exit 1
#   spec_dir=$(gate_common::phase0_resolve_spec_dir "${1:-}")
#
# 使い方 (exec subcommand):
#   bash .specify/scripts/gate-common.sh verdict-validate <path>
#   bash .specify/scripts/gate-common.sh truncate-subject "<text>" 50
#
# Exit codes:
#   0   = success
#   1   = generic failure / precondition not met
#   2   = invalid input (schema fail / unknown command)
#   3   = file not found
#   5   = gate hard-stop (verdict_require_pass。verdict_validate は「PASS と
#         自称しつつ critical>0」の矛盾に限り 5 を返す)
#   75  = EX_TEMPFAIL (lock contention, retry recommended)
#
# Compatibility:
#   - bash >= 3.2 (macOS default)。associative array に依存しない POSIX fallback
#   - flock(1) 非依存 (mkdir-lock fallback あり)
#   - jq / python3 / perl のいずれかが利用可能なら高機能、なくても最小機能で動作

# ─── 多重 source ガード ────────────────────────────────────────────────
if [ "${_GATE_COMMON_SOURCED:-0}" = "1" ] && [ "${BASH_SOURCE[0]:-}" != "${0}" ]; then
  return 0
fi
_GATE_COMMON_SOURCED=1

# 直接実行時は strict mode、source 時は呼び出し側に委ねる
if [ "${BASH_SOURCE[0]:-}" = "${0}" ]; then
  set -euo pipefail
fi

# ─── meta ─────────────────────────────────────────────────────────────
gate_common::version() { echo "1"; }

gate_common::usage() {
  cat <<'EOF'
gate-common.sh — Spec-Driven Gating Workflow 共通 helper

Source して使う関数 (全件。exec 用 subcommand と 1:1 で対応する):
  gate_common::phase0_check_repo
  gate_common::phase0_resolve_spec_dir <arg>
  gate_common::phase0_check_status <spec_dir> <expected_csv>
  gate_common::phase0_check_charter <spec_dir>
  gate_common::tasks_complete_check <spec_dir>
  gate_common::slugify <text>
  gate_common::spec_id_allocate_seq <domain> <slug>
  gate_common::spec_id_allocate_ts <domain> <slug>
  gate_common::cascade_enforce <reviewer_md>
  gate_common::viewpoint_coverage_check <reviewer_md>
  gate_common::verdict_emit <spec_dir> <gate_name> <json_text>
  gate_common::verdict_validate <verdict_path>       # schema 検査のみ
  gate_common::verdict_require_pass <verdict_path>   # PASS を要求する hard gate
  gate_common::registry_load
  gate_common::registry_assert_agent <name>
  gate_common::registry_filter_agents <name1> <name2> ...
  gate_common::reviewers_filter <gate> <changed_files_path> <name1> <name2> ...
  gate_common::run_with_timeout <sec> <out_file> -- <cmd...>
  gate_common::truncate_subject <text> [byte_cap=50]

**verdict_validate と verdict_require_pass は別物である。**
  verdict_validate     — schema + 「PASS と自称しつつ critical>0」の矛盾のみを弾く。
                         FIX_REQUIRED / ERROR は正当な verdict として exit 0 を返す
  verdict_require_pass — 次の段に進んでよいかを判定する。verdict != PASS、
                         critical > 0、gate=code で must_fix > 0 のいずれかで exit 5
gate を通す/通さないの判定には **必ず verdict_require_pass を使う**。

Subcommand (exec):
  bash gate-common.sh help
  bash gate-common.sh version
  bash gate-common.sh verdict-validate <path>
  bash gate-common.sh verdict-require-pass <path>
  bash gate-common.sh verdict-emit <spec_dir> <gate_name> <json_text>
  bash gate-common.sh truncate-subject <text> [cap]
  bash gate-common.sh cascade-enforce <reviewer_md>
  bash gate-common.sh viewpoint-coverage <reviewer_md>
  bash gate-common.sh registry-assert <name>
  bash gate-common.sh registry-load
  bash gate-common.sh reviewers-filter <gate> <changed_files_path> <name...>
  bash gate-common.sh spec-id-allocate-seq <domain> <slug>
  bash gate-common.sh spec-id-allocate-ts <domain> <slug>
  bash gate-common.sh run-with-timeout <sec> <out_file> -- <cmd...>
  bash gate-common.sh slugify <text>
  bash gate-common.sh tasks-complete-check <spec_dir>
  bash gate-common.sh phase0-check-repo
  bash gate-common.sh phase0-resolve-spec-dir <arg>
  bash gate-common.sh phase0-check-status <spec_dir> <expected_csv>
  bash gate-common.sh phase0-check-charter <spec_dir>
EOF
}

# ─── 内部 util ─────────────────────────────────────────────────────────
_gc::log() { echo "gate-common: $*" >&2; }
_gc::err() { echo "gate-common[err]: $*" >&2; }

_gc::has_cmd() { command -v "$1" >/dev/null 2>&1; }

# JSON シリアライズ (python3 優先、なければ jq 等)
_gc::json_escape() {
  local s="$1"
  if _gc::has_cmd python3; then
    python3 -c 'import json, sys; print(json.dumps(sys.argv[1]))' "$s"
  elif _gc::has_cmd jq; then
    printf '%s' "$s" | jq -Rs .
  else
    local escaped="${s//\\/\\\\}"
    escaped="${escaped//\"/\\\"}"
    escaped="${escaped//$'\n'/\\n}"
    escaped="${escaped//$'\t'/\\t}"
    printf '"%s"' "$escaped"
  fi
}

# Get repo root (git or .specify ancestor)
_gc::repo_root() {
  if _gc::has_cmd git && git rev-parse --show-toplevel >/dev/null 2>&1; then
    git rev-parse --show-toplevel
    return 0
  fi
  local d
  d=$(pwd)
  while [ "$d" != "/" ]; do
    if [ -d "$d/.specify" ]; then
      echo "$d"
      return 0
    fi
    d=$(dirname "$d")
  done
  return 1
}

# ═════════════════════════════════════════════════════════════════════
# § 1. Phase 0 共通 checks
# ═════════════════════════════════════════════════════════════════════

gate_common::phase0_check_repo() {
  if [ ! -d ".specify" ]; then
    _gc::err ".specify/ not found. Run from the repository root."
    return 1
  fi
  if ! _gc::has_cmd git || ! git rev-parse --show-toplevel >/dev/null 2>&1; then
    _gc::err "not a git repository. Run \`git init\` first."
    return 1
  fi
  return 0
}

gate_common::phase0_resolve_spec_dir() {
  local input="${1:-}"
  local script
  script=".specify/scripts/spec-resolve.sh"
  if [ ! -x "$script" ] && [ ! -f "$script" ]; then
    _gc::err "spec-resolve.sh not found at $script"
    return 3
  fi
  bash "$script" "$input"
}

# <spec_dir> <expected_csv>  例: "drafting,planning"
gate_common::phase0_check_status() {
  local spec_dir="${1:?spec_dir required}"
  local expected_csv="${2:?expected status CSV required}"
  local spec_file="${spec_dir}/spec.md"

  if [ ! -f "$spec_file" ]; then
    _gc::err "spec.md not found at $spec_file"
    return 3
  fi

  local current
  current=$(awk '/^---$/{c++} c==1 && /^status:[[:space:]]*/{
    sub(/^status:[[:space:]]*/, ""); gsub(/^["'\'']|["'\'']$/, "")
    gsub(/[[:space:]]+$/, ""); print; exit
  }' "$spec_file")

  if [ -z "$current" ]; then
    _gc::err "no 'status:' in frontmatter of $spec_file"
    return 2
  fi

  local ok=0
  IFS=',' read -ra expected_arr <<< "$expected_csv"
  for e in "${expected_arr[@]}"; do
    e_trimmed=$(echo "$e" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
    if [ "$current" = "$e_trimmed" ]; then
      ok=1
      break
    fi
  done

  if [ "$ok" -ne 1 ]; then
    _gc::err "status mismatch: $spec_file is '$current', expected one of [$expected_csv]"
    return 1
  fi
  echo "$current"
  return 0
}

# <spec_dir> → tasks.md の未チェック項目が 0 件なら 0、残っていれば 1
# 未チェック行は stderr に列挙する (どれが残っているかを呼び出し側が出せるように)
gate_common::tasks_complete_check() {
  local spec_dir="${1:?spec_dir required}"
  local tasks_file="${spec_dir}/tasks.md"

  if [ ! -f "$tasks_file" ]; then
    _gc::err "tasks.md not found at $tasks_file"
    return 3
  fi

  local unchecked
  unchecked=$(grep -nE '^[[:space:]]*-[[:space:]]*\[[[:space:]]\]' "$tasks_file" || true)

  if [ -n "$unchecked" ]; then
    _gc::err "unchecked tasks remain in $tasks_file:"
    echo "$unchecked" >&2
    echo "$unchecked" | wc -l | tr -d ' '
    return 1
  fi
  echo "0"
  return 0
}

gate_common::phase0_check_charter() {
  local spec_dir="${1:?spec_dir required}"
  local spec_file="${spec_dir}/spec.md"

  if [ ! -f "$spec_file" ]; then
    _gc::err "spec.md not found at $spec_file"
    return 3
  fi

  local domain
  domain=$(awk '/^---$/{c++} c==1 && /^domain:[[:space:]]*/{
    sub(/^domain:[[:space:]]*/, ""); gsub(/^["'\'']|["'\'']$/, "")
    gsub(/[[:space:]]+$/, ""); print; exit
  }' "$spec_file")

  if [ -z "$domain" ]; then
    _gc::log "no 'domain:' in frontmatter of $spec_file (skipping charter check)"
    return 0
  fi

  local charter="docs/domains/${domain}/charter.md"
  if [ ! -f "$charter" ]; then
    _gc::err "charter missing: $charter (domain: $domain)"
    return 1
  fi
  echo "$charter"
  return 0
}

# ═════════════════════════════════════════════════════════════════════
# § 2. atomic spec-id allocation
# ═════════════════════════════════════════════════════════════════════

# slug 生成: 任意の自然文 → kebab-case
gate_common::slugify() {
  local text="${1:-}"
  if _gc::has_cmd python3; then
    python3 -c '
import re, sys, unicodedata
s = unicodedata.normalize("NFKD", sys.argv[1]).encode("ascii", "ignore").decode("ascii")
s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
print(s[:50])
' "$text"
  else
    echo "$text" \
      | tr '[:upper:]' '[:lower:]' \
      | tr -c 'a-z0-9' '-' \
      | sed -E 's/-+/-/g; s/^-|-$//g' \
      | cut -c1-50
  fi
}

# 内部: lock 取得 (flock or mkdir fallback)
#
# **結果を stdout に echo してはならない。** 呼び出し側が `$(...)` で受けると
# コマンド置換のサブシェル内で `exec {fd}>` が走り、サブシェル終了時に fd が
# 閉じて **lock がクリティカルセクションに入る前に解放される**。親側の
# `_GC_LOCK_FD` も未設定のまま残り、release の flock 分岐が no-op になる。
# したがって種別はグローバル `_GC_LOCK_KIND` で返し、呼び出し側は
# `_gc::lock_acquire "$lockfile" 3 || return $?` の形で使う。
_gc::lock_acquire() {
  local lockfile="${1:?lockfile}"
  local timeout_sec="${2:-3}"
  local lockdir="${lockfile}.d"

  _GC_LOCK_KIND=""

  if _gc::has_cmd flock; then
    exec {_GC_LOCK_FD}>"$lockfile"
    if ! flock -w "$timeout_sec" "$_GC_LOCK_FD"; then
      _gc::err "lock timeout ($timeout_sec s) on $lockfile"
      eval "exec ${_GC_LOCK_FD}>&-" 2>/dev/null || true
      unset _GC_LOCK_FD
      return 75
    fi
    _GC_LOCK_KIND="flock"
    return 0
  fi

  local elapsed=0
  while ! mkdir "$lockdir" 2>/dev/null; do
    sleep 0.1
    elapsed=$(awk "BEGIN {print $elapsed + 0.1}")
    if awk "BEGIN {exit !($elapsed >= $timeout_sec)}"; then
      _gc::err "mkdir-lock timeout ($timeout_sec s) on $lockdir"
      return 75
    fi
  done
  echo "$lockdir" > "${lockfile}.lockmeta"
  _GC_LOCK_KIND="mkdir"
  return 0
}

_gc::lock_release() {
  local lockfile="${1:?lockfile}"
  local kind="${2:?lock kind}"
  if [ "$kind" = "flock" ]; then
    if [ -n "${_GC_LOCK_FD:-}" ]; then
      eval "exec ${_GC_LOCK_FD}>&-"
      unset _GC_LOCK_FD
    fi
  elif [ "$kind" = "mkdir" ]; then
    rm -rf "${lockfile}.d" "${lockfile}.lockmeta" 2>/dev/null || true
  fi
}

# <domain> <slug> → "NNN-<domain>-<slug>"
gate_common::spec_id_allocate_seq() {
  local domain="${1:?domain required}"
  local slug="${2:?slug required}"
  local specs_dir="specs"
  local lockfile="${specs_dir}/.spec-id.lock"

  mkdir -p "$specs_dir"

  local lock_kind
  _gc::lock_acquire "$lockfile" 3 || return $?; lock_kind="$_GC_LOCK_KIND"

  local next
  next=$(ls "$specs_dir" 2>/dev/null | { grep -E '^[0-9]{3}-' || true; } | sort -u | tail -n 1 | sed -E 's/^([0-9]{3}).*/\1/' || true)
  if [ -z "$next" ]; then
    next=1
  else
    next=$((10#$next + 1))
  fi
  local nnn
  nnn=$(printf '%03d' "$next")

  while compgen -G "${specs_dir}/${nnn}-*" >/dev/null 2>&1; do
    next=$((next + 1))
    nnn=$(printf '%03d' "$next")
  done

  # **critical section 内で ID を予約する。**
  # `next` は `ls "$specs_dir"` から導出されるので、ディレクトリを作らずに
  # 番号を返すだけでは lock が何も守らない — 並列 allocator が全員同じ空の
  # specs/ を見て全員 001 を返す (lock は「同じ答えを順番に出す」だけになる)。
  # ここで作っておけば後続の allocator がこの番号を使用済みとして見る。
  if ! mkdir "${specs_dir}/${nnn}-${domain}-${slug}" 2>/dev/null; then
    _gc::err "spec_id_allocate_seq: 予約に失敗しました: ${specs_dir}/${nnn}-${domain}-${slug}"
    _gc::lock_release "$lockfile" "$lock_kind"
    return 1
  fi

  echo "${nnn}-${domain}-${slug}"
  _gc::lock_release "$lockfile" "$lock_kind"
  return 0
}

# <domain> <slug> → "YYYY-MM-DD-HHMM-<DOMSHORT>-<slug>"
gate_common::spec_id_allocate_ts() {
  local domain="${1:?domain required}"
  local slug="${2:?slug required}"
  local specs_dir="specs"
  local lockfile="${specs_dir}/.spec-id.lock"

  mkdir -p "$specs_dir"

  local lock_kind
  _gc::lock_acquire "$lockfile" 3 || return $?; lock_kind="$_GC_LOCK_KIND"

  local ts
  ts=$(date +%Y-%m-%d-%H%M)
  local domshort
  domshort=$(echo "$domain" | tr '[:lower:]' '[:upper:]' | cut -c1-3)
  local candidate="${ts}-${domshort}-${slug}"
  local offset=0

  while compgen -G "${specs_dir}/${candidate}-*" >/dev/null 2>&1 || compgen -G "${specs_dir}/${candidate}" >/dev/null 2>&1; do
    offset=$((offset + 1))
    if [ "$offset" -gt 60 ]; then
      _gc::lock_release "$lockfile" "$lock_kind"
      _gc::err "spec_id_allocate_ts: cannot find unique slot within 60 minutes"
      return 75
    fi
    if _gc::has_cmd python3; then
      ts=$(python3 -c "
import datetime
dt = datetime.datetime.strptime('${ts}', '%Y-%m-%d-%H%M') + datetime.timedelta(minutes=${offset})
print(dt.strftime('%Y-%m-%d-%H%M'))
")
    else
      ts=$(date -d "+${offset} minutes" +%Y-%m-%d-%H%M 2>/dev/null || date +%Y-%m-%d-%H%M)
    fi
    candidate="${ts}-${domshort}-${slug}"
  done

  # seq と同じ理由で critical section 内で予約する (上の while が
  # `compgen -G "${specs_dir}/${candidate}"` を見ているので、作れば衝突検知が効く)。
  if ! mkdir "${specs_dir}/${candidate}" 2>/dev/null; then
    _gc::err "spec_id_allocate_ts: 予約に失敗しました: ${specs_dir}/${candidate}"
    _gc::lock_release "$lockfile" "$lock_kind"
    return 1
  fi

  echo "$candidate"
  _gc::lock_release "$lockfile" "$lock_kind"
  return 0
}

# ═════════════════════════════════════════════════════════════════════
# § 3. cascade enforcement
# ═════════════════════════════════════════════════════════════════════
#
# Critical 申告に "## 同種事象探索" の row + 件数 > 0 確認 or "0 件" 明記
# が伴わないものを self-evidence 不足として High に降格、marker line を追加。
#
# 入力: reviewer 出力 markdown
# 出力 (stdout 最終行): demoted count
# 副作用: 入力 file を in-place 書き換え

gate_common::cascade_enforce() {
  local md="${1:?reviewer md path required}"

  if [ ! -f "$md" ]; then
    _gc::err "cascade_enforce: $md not found"
    return 3
  fi

  if ! _gc::has_cmd python3; then
    _gc::err "cascade_enforce requires python3"
    return 2
  fi

  python3 - "$md" <<'PYEOF'
import re, sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
    text = fh.read()

# Critical 申告ブロックを抽出 (### [Critical] ... 次の "### " or "## " 直前まで)
critical_re = re.compile(
    r"(### \[Critical\][^\n]*\n)(.*?)(?=\n### |\n## |\Z)",
    re.DOTALL
)

# cascade summary table から 件数 0 確認 (Critical の指摘 ID 列を見る)
# table 行: "| C-001 | grep ... | 0 | path:line |"
cascade_section_re = re.compile(
    r"## 同種事象探索 cascade summary.*?(?=\n## |\Z)",
    re.DOTALL
)
cascade_section_m = cascade_section_re.search(text)
verified_ids = set()
if cascade_section_m:
    for line in cascade_section_m.group(0).splitlines():
        # | C-001 | ... | <n> | ... | は 4+ cells
        cells = [c.strip() for c in line.split("|")[1:-1]] if line.strip().startswith("|") else []
        if len(cells) >= 3 and re.match(r"^[A-Z]+-\d+$", cells[0]):
            # 件数 cell が "0" or 数値 → 確認済
            if re.match(r"^\d+$", cells[2]):
                verified_ids.add(cells[0])

demoted = 0
def process(m):
    global demoted
    header = m.group(1)
    body = m.group(2)
    # 観察 / 同種事象探索 / リスク / 推奨アクション / 根拠 が揃っているか
    has_cascade_inline = "**同種事象探索**" in body and re.search(
        r"\*\*同種事象探索\*\*[^\n]*?(?:\d+\s*件|0\s*件|0件|該当なし)", body
    )
    # finding ID をヘッダから抽出 (### [Critical] <ID-or-summary>)
    id_m = re.search(r"\(([A-Z]+-\d+)\)", body) or re.search(r"([A-Z]+-\d+)", header)
    finding_id = id_m.group(1) if id_m else None
    verified_in_table = finding_id and finding_id in verified_ids

    if has_cascade_inline or verified_in_table:
        return header + body
    demoted += 1
    new_header = header.replace("[Critical]", "[High]", 1)
    marker = f"\n<!-- gate-common: demoted Critical → High (no cascade evidence) finding={finding_id or 'unknown'} -->\n"
    return new_header + body + marker

text2 = critical_re.sub(process, text)

if demoted > 0:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text2)

print(demoted)
PYEOF
}

# ═════════════════════════════════════════════════════════════════════
# § 4. viewpoint 網羅性チェック
# ═════════════════════════════════════════════════════════════════════
#
# reviewer-base.md の A-H 8 カテゴリ (Owner Matrix viewpoint group) で
# Critical:N / High:N / Medium:N / Low:N / 該当なし:<reason> が明示されているか確認。
#
# 入力: reviewer 出力 markdown
# 出力 (stdout JSON): {"missing":[...], "present":[...]}
# Exit: 0 = 全カテゴリ present, 1 = missing あり

gate_common::viewpoint_coverage_check() {
  local md="${1:?reviewer md path required}"

  if [ ! -f "$md" ]; then
    _gc::err "viewpoint_coverage_check: $md not found"
    return 3
  fi

  if ! _gc::has_cmd python3; then
    _gc::err "viewpoint_coverage_check requires python3"
    return 2
  fi

  python3 - "$md" <<'PYEOF'
import json, re, sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
    text = fh.read()

vp_section = re.search(
    r"## 初回読了 viewpoint(.*?)(?=\n## |\Z)", text, re.DOTALL
)
required = list("ABCDEFGH")
present = []
missing = []
section_text = vp_section.group(1) if vp_section else ""

for cat in required:
    pat = re.compile(
        rf"^[\s\-*]*{cat}[.\):\s]+.*?(Critical:\s*\d+|High:\s*\d+|Medium:\s*\d+|Low:\s*\d+|該当なし)",
        re.MULTILINE
    )
    if pat.search(section_text):
        present.append(cat)
    else:
        missing.append(cat)

print(json.dumps({"present": present, "missing": missing}, ensure_ascii=False))
sys.exit(0 if not missing else 1)
PYEOF
}

# ═════════════════════════════════════════════════════════════════════
# § 5. JSON verdict emit / validate
# ═════════════════════════════════════════════════════════════════════

# <spec_dir> <gate_name (design|code|pr)> <json_text>
gate_common::verdict_emit() {
  local spec_dir="${1:?spec_dir required}"
  local gate_name="${2:?gate_name required}"
  local json_text="${3:?json_text required}"

  case "$gate_name" in
    design|code|pr) : ;;
    *) _gc::err "verdict_emit: unknown gate '$gate_name'"; return 2 ;;
  esac

  if [ ! -d "$spec_dir" ]; then
    _gc::err "verdict_emit: spec_dir not found: $spec_dir"
    return 3
  fi

  local target="${spec_dir}/.gate-verdict-${gate_name}.json"
  local backup="${target}.bak"
  local tmp
  tmp=$(mktemp "${target}.tmp.XXXXXX")
  trap 'rm -f "$tmp"' EXIT

  if _gc::has_cmd python3; then
    if ! printf '%s' "$json_text" | python3 -m json.tool > "$tmp" 2>/dev/null; then
      _gc::err "verdict_emit: invalid JSON (python3 json.tool rejected)"
      rm -f "$tmp"
      return 2
    fi
  elif _gc::has_cmd jq; then
    if ! printf '%s' "$json_text" | jq '.' > "$tmp" 2>/dev/null; then
      _gc::err "verdict_emit: invalid JSON (jq rejected)"
      rm -f "$tmp"
      return 2
    fi
  else
    printf '%s' "$json_text" > "$tmp"
  fi

  if [ -f "$target" ]; then
    cp "$target" "$backup"
  fi
  mv "$tmp" "$target"
  trap - EXIT
  echo "$target"
  return 0
}

# <verdict_path>
gate_common::verdict_validate() {
  local verdict_path="${1:?verdict_path required}"

  if [ ! -f "$verdict_path" ]; then
    _gc::err "verdict_validate: $verdict_path not found"
    return 3
  fi

  if ! _gc::has_cmd python3; then
    _gc::err "verdict_validate requires python3"
    return 2
  fi

  python3 - "$verdict_path" <<'PYEOF'
import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as fh:
        v = json.load(fh)
except Exception as e:
    print(f"verdict_validate: parse error: {e}", file=sys.stderr)
    sys.exit(2)

required_top = {"gate", "run", "spec_dir", "spec_id", "severity_counts", "verdict"}
missing = required_top - set(v.keys())
if missing:
    print(f"verdict_validate: missing keys: {sorted(missing)}", file=sys.stderr)
    sys.exit(2)

if v["gate"] not in ("design", "code", "pr"):
    print(f"verdict_validate: invalid gate '{v['gate']}'", file=sys.stderr); sys.exit(2)

sc = v["severity_counts"]
for k in ("critical", "high", "medium", "low"):
    if k not in sc or not isinstance(sc[k], int) or sc[k] < 0:
        print(f"verdict_validate: severity_counts.{k} invalid", file=sys.stderr); sys.exit(2)

allowed_verdict = {"PASS", "FIX_REQUIRED", "CONVERGENCE_FAILURE", "ERROR"}
if v["verdict"] not in allowed_verdict:
    print(f"verdict_validate: verdict must be one of {allowed_verdict}", file=sys.stderr); sys.exit(2)

if v["verdict"] == "PASS" and sc["critical"] > 0:
    print(f"verdict_validate: PASS verdict with critical={sc['critical']} (hard gate violation)", file=sys.stderr)
    sys.exit(5)

# gate=code 固有の形の警告 (exit code は変えない)。
# code-gate の auto-fix loop は must_fix を break 条件に使うため、
# これが無い / iter_history の形が崩れていると収束判定が沈黙して壊れる。
if v["gate"] == "code":
    if "must_fix" not in sc:
        print("verdict_validate: warn: gate=code だが severity_counts.must_fix が無い "
              "(auto-fix loop の break 条件が評価できない)", file=sys.stderr)
    ih = v.get("iter_history")
    if not isinstance(ih, list) or not ih:
        print("verdict_validate: warn: gate=code だが iter_history が空 / 配列でない", file=sys.stderr)
    else:
        bad = [i for i, e in enumerate(ih)
               if not isinstance(e, dict)
               or not isinstance(e.get("iter"), int)
               or not isinstance(e.get("must_fix"), int)]
        if bad:
            print(f"verdict_validate: warn: iter_history[{bad}] が {{iter:int, must_fix:int}} の形でない",
                  file=sys.stderr)

print(f"verdict_validate: OK (gate={v['gate']}, verdict={v['verdict']}, critical={sc['critical']})")
sys.exit(0)
PYEOF
}

# <verdict_path> → 次の段に進んでよいかの判定 (hard gate)
#
# **verdict_validate とは役割が違う。** あちらは schema 検査であり、
# FIX_REQUIRED を正当な verdict として exit 0 で通す。
# 「gate を通ったか」を判定するのは常に本関数である。
#
# exit: 0 = 進んでよい / 5 = gate hard-stop / 2,3 = schema・file の問題
gate_common::verdict_require_pass() {
  local verdict_path="${1:?verdict_path required}"

  gate_common::verdict_validate "$verdict_path" >/dev/null || return $?

  python3 - "$verdict_path" <<'PYEOF'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    v = json.load(fh)
sc = v["severity_counts"]
problems = []
if v["verdict"] != "PASS":
    problems.append(f"verdict={v['verdict']} (PASS ではない)")
if sc["critical"] > 0:
    problems.append(f"critical={sc['critical']}")
if v["gate"] == "code" and isinstance(sc.get("must_fix"), int) and sc["must_fix"] > 0:
    problems.append(f"must_fix={sc['must_fix']}")
if problems:
    print("verdict_require_pass: gate hard-stop — " + " / ".join(problems), file=sys.stderr)
    sys.exit(5)
print(f"verdict_require_pass: OK (gate={v['gate']}, verdict=PASS, critical=0)")
sys.exit(0)
PYEOF
}

# ═════════════════════════════════════════════════════════════════════
# § 6. agents registry validation
# ═════════════════════════════════════════════════════════════════════

_GC_REGISTRY_PATH=".specify/.agents-registry.yaml"

# stdout: agent name 1行ずつ
gate_common::registry_load() {
  if [ ! -f "$_GC_REGISTRY_PATH" ]; then
    _gc::log "registry not found at $_GC_REGISTRY_PATH; falling back to .claude/agents/*.md scan"
    if [ -d ".claude/agents" ]; then
      ls .claude/agents/*.md 2>/dev/null | sed -E 's|.*/||; s|\.md$||'
    fi
    return 0
  fi

  if _gc::has_cmd python3; then
    python3 - "$_GC_REGISTRY_PATH" <<'PYEOF'
import sys, re
# Windows: text mode translates LF to CRLF on write. registry_assert_agent reads
# line by line with `read -r`, so a trailing CR makes every comparison fail.
sys.stdout.reconfigure(newline="")
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
    text = fh.read()
for line in text.splitlines():
    m = re.match(r'^\s*-\s+name:\s*["\']?([A-Za-z0-9_\-]+)["\']?\s*$', line)
    if m:
        print(m.group(1))
PYEOF
  else
    grep -E '^\s*-\s+name:\s*' "$_GC_REGISTRY_PATH" \
      | sed -E 's/^\s*-\s+name:\s*["'\'']?([A-Za-z0-9_\-]+)["'\'']?\s*$/\1/'
  fi
}

# <name> → 0 if registered AND .claude/agents/<name>.md exists, else 2
gate_common::registry_assert_agent() {
  local name="${1:?agent name required}"
  local found=0
  while IFS= read -r registered; do
    [ -z "$registered" ] && continue
    if [ "$registered" = "$name" ]; then
      found=1
      break
    fi
  done < <(gate_common::registry_load)

  if [ "$found" -ne 1 ]; then
    _gc::err "agent '$name' not in registry ($_GC_REGISTRY_PATH)"
    return 2
  fi

  if [ ! -f ".claude/agents/${name}.md" ]; then
    _gc::err "agent '$name' registered but .claude/agents/${name}.md missing"
    return 2
  fi
  return 0
}

# 引数: 候補 agent 名のリスト
# 出力 (stdout): 実在する agent のみを 1 行ずつ
gate_common::registry_filter_agents() {
  local registered_list
  registered_list=$(gate_common::registry_load)
  local name
  for name in "$@"; do
    if echo "$registered_list" | grep -Fxq "$name" \
       && [ -f ".claude/agents/${name}.md" ]; then
      echo "$name"
    fi
  done
}

# ═════════════════════════════════════════════════════════════════════
# § 6b. reviewers.yml gating (enabled / gates / auto_invoke_patterns)
# ═════════════════════════════════════════════════════════════════════
#
# **`registry_filter_agents` は agent ファイルの存在しか見ない。**
# `.specify/spec-gate/reviewers.yml` には `enabled` / `gates` /
# `auto_invoke_patterns` の仕組みが最初からあるのに、どのコードも読んでいなかった。
# そのため a11y / ux は UI を 1 行も触らない diff でも毎 iteration 起動していた。
#
# 本関数が reviewers.yml を正として候補を絞る。判断は 4 段:
#   1. registry + agent ファイルの存在 (registry_filter_agents に委譲)
#   2. `enabled: false` なら起動しない
#   3. `gates` に対象 gate が無ければ起動しない
#   4. `auto_invoke_patterns` があるとき、変更ファイルに 1 件も一致しなければ起動しない
#      (`exclude_patterns` に一致したファイルは 4 の判定材料から除く)
#
# **reviewers.yml に載っていない候補は素通しする。** lint-agent / test-agent /
# convention-reviewer / security-reviewer 等の常駐は yml の管理対象外であり、
# ここで落とすと gate が空振りする。
#
# 判断理由は **1 行ずつ stderr に出す**。黙って絞ると「起動しなかった」と
# 「起動して 0 件だった」を区別できない。

_GC_REVIEWERS_PATH=".specify/spec-gate/reviewers.yml"

# 引数: <gate-name> <changed-files-path> <candidate…>
#   gate-name         : design-gate | code-gate | pr-gate
#   changed-files-path: 変更ファイルを 1 行 1 パスで列挙したファイル
#                       (code-gate は `<spec_dir>/.code-gate-scope.txt`、
#                        pr-gate は `git diff --name-only <base>...HEAD` の出力)
# 出力 (stdout): 起動すべき agent 名を 1 行ずつ
gate_common::reviewers_filter() {
  local gate="${1:?gate name required}"; shift
  local files_path="${1:?changed files list required}"; shift

  local survivors
  survivors=$(gate_common::registry_filter_agents "$@")
  [ -z "$survivors" ] && return 0

  # **落とせない条件が揃わないときは絞らない。**
  # 起動しすぎは遅いだけだが、起動しなさすぎは検査漏れになる。
  if [ ! -f "$_GC_REVIEWERS_PATH" ]; then
    _gc::log "reviewers.yml not found at $_GC_REVIEWERS_PATH; registry filter only"
    echo "$survivors"; return 0
  fi
  if ! _gc::has_cmd python3; then
    _gc::err "python3 not available; reviewers.yml gating skipped (全候補を起動する)"
    echo "$survivors"; return 0
  fi
  if [ ! -f "$files_path" ]; then
    _gc::err "changed files list not found: $files_path; reviewers.yml gating skipped"
    echo "$survivors"; return 0
  fi

  # agent 名は [A-Za-z0-9_-]+ に限られる (registry_load の正規表現) ため
  # 意図した word-splitting で argv に渡す。
  # shellcheck disable=SC2086
  python3 - "$_GC_REVIEWERS_PATH" "$gate" "$files_path" $survivors <<'PYEOF'
import re
import sys

# Windows: text mode が LF を CRLF に変換する。呼び出し側は `read -r` で
# 1 行ずつ読むため、末尾 CR が付くと比較が必ず外れる (registry_load と同じ理由)。
sys.stdout.reconfigure(newline="")

yml_path, gate, files_path = sys.argv[1], sys.argv[2], sys.argv[3]
candidates = sys.argv[4:]


def log(msg):
    print(f"gate-common: reviewers_filter: {msg}", file=sys.stderr)


def strip_comment(line):
    """引用符の外にある `#` 以降を落とす。glob の中の `#` は残す。"""
    out = []
    quote = None
    for ch in line:
        if quote:
            out.append(ch)
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            out.append(ch)
        elif ch == "#":
            break
        else:
            out.append(ch)
    return "".join(out).rstrip()


def unquote(s):
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        return s[1:-1]
    return s


def split_flow(v):
    """`[a, b]` 形式のインライン list を分解する。"""
    return [unquote(x) for x in v.strip().strip("[]").split(",") if x.strip()]


LIST_KEYS = ("auto_invoke_patterns", "exclude_patterns")


def parse(path):
    """reviewers.yml の既知の形だけを読む最小 parser (PyYAML に依存しない)。"""
    reviewers = []
    cur = None
    list_key = None
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = strip_comment(raw)
            body = line.strip()
            if not body:
                continue
            m = re.match(r"^-\s+name:\s*(.+)$", body)
            if m:
                cur = {
                    "name": unquote(m.group(1)),
                    "enabled": True,
                    "gates": None,
                    "auto_invoke_patterns": [],
                    "exclude_patterns": [],
                }
                reviewers.append(cur)
                list_key = None
                continue
            if cur is None:
                continue
            if body.startswith("- "):
                if list_key:
                    cur[list_key].append(unquote(body[2:]))
                continue
            m = re.match(r"^([A-Za-z0-9_]+):\s*(.*)$", body)
            if not m:
                continue
            key, value = m.group(1), m.group(2).strip()
            if key in LIST_KEYS:
                if value:
                    cur[key] = split_flow(value)
                    list_key = None
                else:
                    list_key = key
                continue
            list_key = None
            if key == "enabled":
                cur["enabled"] = value.lower() in ("true", "yes", "on", "1")
            elif key == "gates":
                cur["gates"] = split_flow(value)
    return reviewers


def glob_to_re(pat):
    """glob → 正規表現。`**` は階層を跨ぎ、`*` は跨がない。

    `fnmatch` は使えない — `*` が `/` を跨ぐため
    `features/x/**/*.tsx` が `features/x/A.tsx` に一致しなくなる。
    """
    out = []
    i, n = 0, len(pat)
    while i < n:
        if pat.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif pat.startswith("**", i):
            out.append(".*")
            i += 2
        elif pat[i] == "*":
            out.append("[^/]*")
            i += 1
        elif pat[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(pat[i]))
            i += 1
    return re.compile("^" + "".join(out) + "$")


def matches(patterns, path):
    """一致した pattern を返す。無ければ None。"""
    for pat in patterns:
        rx = glob_to_re(pat)
        if rx.match(path):
            return pat
        # `*.sql` のように `/` を含まない pattern は basename にも当てる
        # (`**/migrations/**` と並記されており階層を問わない意図のため)。
        if "/" not in pat and rx.match(path.rsplit("/", 1)[-1]):
            return pat
    return None


with open(files_path, "r", encoding="utf-8") as fh:
    changed = [ln.strip().replace("\\", "/") for ln in fh if ln.strip()]

by_name = {r["name"]: r for r in parse(yml_path)}

for name in candidates:
    spec = by_name.get(name)
    if spec is None:
        # yml の管理対象外 = 常駐。ここで落とすと gate が空振りする。
        print(name)
        continue
    if not spec["enabled"]:
        log(f"{name}: skip — enabled: false")
        continue
    if spec["gates"] is not None and gate not in spec["gates"]:
        log(f"{name}: skip — gates={spec['gates']} に {gate} が無い")
        continue
    patterns = spec["auto_invoke_patterns"]
    if not patterns:
        print(name)
        continue
    hit = None
    for path in changed:
        excluded = matches(spec["exclude_patterns"], path)
        if excluded:
            continue
        matched = matches(patterns, path)
        if matched:
            hit = (path, matched)
            break
    if hit is None:
        log(f"{name}: skip — auto_invoke_patterns に一致する変更ファイルが無い "
            f"(変更 {len(changed)} 件 / pattern {len(patterns)} 件)")
        continue
    log(f"{name}: start — {hit[0]} が {hit[1]} に一致")
    print(name)
PYEOF
}

# ═════════════════════════════════════════════════════════════════════
# § 7. timeout-bounded subprocess
# ═════════════════════════════════════════════════════════════════════
#
# 使い方:
#   gate_common::run_with_timeout 600 "$spec_dir/.out" -- \
#     claude --slash speckit.analyze "$spec_dir"
#
# 終了 stdout:
#   "ok"        — 正常終了 (out_file が非空)
#   "timeout"   — timeout 発火、SIGTERM → SIGKILL 送出後 abandon
#   "crashed"   — 終了 code != 0 かつ out_file 空 or 不在

gate_common::run_with_timeout() {
  local timeout_sec="${1:?timeout_sec required}"
  local out_file="${2:?out_file required}"
  shift 2
  if [ "${1:-}" = "--" ]; then
    shift
  fi
  if [ "$#" -lt 1 ]; then
    _gc::err "run_with_timeout: command required"
    return 2
  fi

  mkdir -p "$(dirname "$out_file")"
  : > "$out_file"

  "$@" > "$out_file" 2>&1 &
  local pid=$!
  local elapsed=0
  local interval=2

  while kill -0 "$pid" 2>/dev/null; do
    sleep "$interval"
    elapsed=$((elapsed + interval))
    if [ "$elapsed" -ge "$timeout_sec" ]; then
      _gc::err "run_with_timeout: timeout after ${timeout_sec}s, killing pid $pid"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 5
      if kill -0 "$pid" 2>/dev/null; then
        kill -KILL "$pid" 2>/dev/null || true
      fi
      wait "$pid" 2>/dev/null || true
      echo "timeout"
      return 1
    fi
  done

  wait "$pid"
  local rc=$?
  if [ "$rc" -ne 0 ] && [ ! -s "$out_file" ]; then
    echo "crashed"
    return "$rc"
  fi
  echo "ok"
  return 0
}

# ═════════════════════════════════════════════════════════════════════
# § 8. UTF-8 grapheme-aware truncation
# ═════════════════════════════════════════════════════════════════════
#
# Conventional Commits subject の 50 byte 上限 (NOT char)、grapheme cluster 境界尊重、
# 末尾に "…" を付加 (truncate されたとき)。

gate_common::truncate_subject() {
  # **`${1:?}` を使ってはならない。** あれは空文字も "unset" として扱い、
  # 呼び出し元の非対話シェルを落とす。空 title は正当な入力として空を返す。
  if [ "$#" -lt 1 ]; then
    _gc::err "truncate_subject: text argument required"
    return 2
  fi
  local text="$1"
  local cap="${2:-50}"

  if [ -z "$text" ]; then
    echo ""
    return 0
  fi

  local byte_len
  byte_len=$(printf '%s' "$text" | wc -c | tr -d ' ')

  if [ "$byte_len" -le "$cap" ]; then
    printf '%s\n' "$text"
    return 0
  fi

  if _gc::has_cmd python3; then
    python3 - "$text" "$cap" <<'PYEOF'
import sys
text, cap = sys.argv[1], int(sys.argv[2])
ELLIPSIS = "…"
e_bytes = len(ELLIPSIS.encode("utf-8"))
budget = cap - e_bytes
if budget < 0:
    print(text[:1] if text else "")
    sys.exit(0)

try:
    import regex
    clusters = regex.findall(r"\X", text)
except ImportError:
    clusters = list(text)

acc, used = "", 0
for cl in clusters:
    b = len(cl.encode("utf-8"))
    if used + b > budget:
        break
    acc += cl
    used += b

acc = acc.rstrip(" ,.;:、。 ")
print(acc + ELLIPSIS)
PYEOF
    return 0
  fi

  if _gc::has_cmd perl; then
    perl -CSDA -e '
my ($text, $cap) = @ARGV;
my $ellipsis = "…";
my $e_bytes = do { use bytes; length($ellipsis) };
my $budget = $cap - $e_bytes;
my @clusters = $text =~ /(\X)/g;
my ($acc, $used) = ("", 0);
for my $cl (@clusters) {
    my $b = do { use bytes; length($cl) };
    last if ($used + $b) > $budget;
    $acc .= $cl; $used += $b;
}
$acc =~ s/[ ,.;:\x{3001}\x{3002}\x{3000}]+$//;
print $acc, $ellipsis, "\n";
' "$text" "$cap"
    return 0
  fi

  # 最終 fallback: byte-cut + iconv 検証
  local cut=$((cap - 3))
  local truncated
  truncated=$(printf '%s' "$text" | dd bs=1 count="$cut" 2>/dev/null || true)
  if _gc::has_cmd iconv; then
    truncated=$(printf '%s' "$truncated" | iconv -f UTF-8 -t UTF-8//IGNORE 2>/dev/null || printf '%s' "$truncated")
  fi
  printf '%s…\n' "$truncated"
}

# ═════════════════════════════════════════════════════════════════════
# § 9. CLI dispatch (exec mode)
# ═════════════════════════════════════════════════════════════════════

if [ "${BASH_SOURCE[0]:-}" = "${0}" ]; then
  cmd="${1:-help}"
  shift || true
  case "$cmd" in
    help|-h|--help|usage)  gate_common::usage ;;
    version)               gate_common::version ;;
    verdict-validate)      gate_common::verdict_validate "$@" ;;
    verdict-require-pass)  gate_common::verdict_require_pass "$@" ;;
    verdict-emit)          gate_common::verdict_emit "$@" ;;
    tasks-complete-check)  gate_common::tasks_complete_check "$@" ;;
    truncate-subject)      gate_common::truncate_subject "$@" ;;
    cascade-enforce)       gate_common::cascade_enforce "$@" ;;
    viewpoint-coverage)    gate_common::viewpoint_coverage_check "$@" ;;
    registry-assert)       gate_common::registry_assert_agent "$@" ;;
    registry-load)         gate_common::registry_load ;;
    reviewers-filter)      gate_common::reviewers_filter "$@" ;;
    spec-id-allocate-seq)  gate_common::spec_id_allocate_seq "$@" ;;
    spec-id-allocate-ts)   gate_common::spec_id_allocate_ts "$@" ;;
    run-with-timeout)      gate_common::run_with_timeout "$@" ;;
    slugify)               gate_common::slugify "$@" ;;
    phase0-check-repo)     gate_common::phase0_check_repo ;;
    phase0-resolve-spec-dir) gate_common::phase0_resolve_spec_dir "$@" ;;
    phase0-check-status)   gate_common::phase0_check_status "$@" ;;
    phase0-check-charter)  gate_common::phase0_check_charter "$@" ;;
    *)
      _gc::err "unknown subcommand: $cmd"
      gate_common::usage
      exit 2 ;;
  esac
fi
