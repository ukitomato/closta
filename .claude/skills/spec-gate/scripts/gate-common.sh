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
#   5   = gate hard-stop (e.g., Critical > 0 on verdict_validate)
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

Source して使う関数 (代表):
  gate_common::phase0_check_repo
  gate_common::phase0_resolve_spec_dir <arg>
  gate_common::phase0_check_status <spec_dir> <expected_csv>
  gate_common::phase0_check_charter <spec_dir>
  gate_common::spec_id_allocate_seq <domain> <slug>
  gate_common::spec_id_allocate_ts <domain> <slug>
  gate_common::cascade_enforce <reviewer_md>
  gate_common::viewpoint_coverage_check <reviewer_md>
  gate_common::verdict_emit <spec_dir> <gate_name> <json_text>
  gate_common::verdict_validate <verdict_path>
  gate_common::registry_load
  gate_common::registry_assert_agent <name>
  gate_common::registry_filter_agents <name1> <name2> ...
  gate_common::run_with_timeout <sec> <out_file> -- <cmd...>
  gate_common::truncate_subject <text> [byte_cap=50]

Subcommand (exec):
  bash gate-common.sh version
  bash gate-common.sh verdict-validate <path>
  bash gate-common.sh truncate-subject <text> [cap]
  bash gate-common.sh registry-assert <name>
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
# § 1. Phase 0 共通 checks (resolves C-3-c: 9 wrapper の Phase 0 複写)
# ═════════════════════════════════════════════════════════════════════

gate_common::phase0_check_repo() {
  if [ ! -d ".specify" ]; then
    _gc::err ".specify/ not found. Run \`/spec-gate bootstrap\` first."
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
# § 2. atomic spec-id allocation (resolves C-3-d: NEXT_NUM race)
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
_gc::lock_acquire() {
  local lockfile="${1:?lockfile}"
  local timeout_sec="${2:-3}"
  local lockdir="${lockfile}.d"

  if _gc::has_cmd flock; then
    exec {_GC_LOCK_FD}>"$lockfile"
    if ! flock -w "$timeout_sec" "$_GC_LOCK_FD"; then
      _gc::err "lock timeout ($timeout_sec s) on $lockfile"
      return 75
    fi
    echo "flock"
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
  echo "mkdir"
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
  lock_kind=$(_gc::lock_acquire "$lockfile" 3) || return $?

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
  lock_kind=$(_gc::lock_acquire "$lockfile" 3) || return $?

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

  echo "$candidate"
  _gc::lock_release "$lockfile" "$lock_kind"
  return 0
}

# ═════════════════════════════════════════════════════════════════════
# § 3. cascade enforcement (resolves C-2-d: 機械的降格未実装)
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
# § 4. viewpoint 網羅性チェック (resolves C-2-a: quota 撤廃の代替)
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
# § 5. JSON verdict emit / validate (resolves C-4-c: machine-checkable)
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

print(f"verdict_validate: OK (gate={v['gate']}, verdict={v['verdict']}, critical={sc['critical']})")
sys.exit(0)
PYEOF
}

# ═════════════════════════════════════════════════════════════════════
# § 6. agents registry validation (resolves C-1-b)
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
# § 7. timeout-bounded subprocess (resolves D-11)
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
# § 8. UTF-8 grapheme-aware truncation (resolves C-3-f)
# ═════════════════════════════════════════════════════════════════════
#
# Conventional Commits subject の 50 byte 上限 (NOT char)、grapheme cluster 境界尊重、
# 末尾に "…" を付加 (truncate されたとき)。

gate_common::truncate_subject() {
  local text="${1:?text required}"
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
    help|-h|--help)        gate_common::usage ;;
    version)               gate_common::version ;;
    verdict-validate)      gate_common::verdict_validate "$@" ;;
    verdict-emit)          gate_common::verdict_emit "$@" ;;
    truncate-subject)      gate_common::truncate_subject "$@" ;;
    cascade-enforce)       gate_common::cascade_enforce "$@" ;;
    viewpoint-coverage)    gate_common::viewpoint_coverage_check "$@" ;;
    registry-assert)       gate_common::registry_assert_agent "$@" ;;
    registry-load)         gate_common::registry_load ;;
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
