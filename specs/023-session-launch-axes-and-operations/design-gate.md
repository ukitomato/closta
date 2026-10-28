# Design Gate: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-27T21:58:40+09:00
**Spec**: specs/023-session-launch-axes-and-operations/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track                      | Critical | High  | Medium | Low    |
| -------------------------- | -------- | ----- | ------ | ------ |
| analyze                    | 0        | 0     | 8      | 11     |
| po-reviewer                | 0        | 2     | 5      | 2      |
| architecture-reviewer      | 0        | 2     | 6      | 4      |
| security-reviewer          | 0        | 1     | 2      | 3      |
| platform-boundary-reviewer | 0        | 0     | 2      | 1      |
| **Total (dedup)**          | **0**    | **5** | **20** | **19** |

Round 1 (no previous gate).

**Status**: PASS
**Next**: status: tasking → implementing に昇格。/cl-implement を起動できる。High 5 件はこの round の範囲で直すことが望ましい (AD-050)。Medium / Low は gate の出力に残し、マイルストーンの終わりの棚卸しで扱う。

## Critical (Total: 0)

なし。

## High (Total: 5)

### H-001 — quickstart V-4 が US-1 AC3 / data-model §5.1 と食い違う [origin: po] [new]

- **Where**: quickstart.md:39, spec.md:108, data-model.md:112, tasks.md:51
- **Issue**: V-4 は「ターンの実行中はヘッダの 3 つが押せない」と書く。設計では、ターンの実行中に押せないのは名前の変更だけである
- **Action**: V-4 を操作の種類ごとに分けて書く
- raw: po-reviewer H-001

### H-002 — Provider が既定 (null) のセッション、または起動の effort を満たすモデルが無いセッションでは US-2 を使えない。spec / plan に書かれていない [origin: po] [new]

- **Where**: spec.md:119-129, :150-159, :239-246, plan.md:18, research.md:28, data-model.md:120, :195
- **Action**: US-2 に AC を 1 つ足し、Out of Scope にも書く
- raw: po-reviewer H-002

### H-003 — 新しい 3 つの IPC で送り元を検査する場所が、既存の `handle()` wrapper と食い違う [origin: security] [new]

- **Where**: contracts/ipc-live-session-settings.md:28, tasks.md:50, :63, :86-87, plan.md:62, src/main/app/ipc.ts:197-205
- **Action**: 3 つの IPC を `ipc.ts` の `handle()` で登録し、送り元が信頼できない要求は既存どおり throw する。対象ファイルに `ipc.ts` を足す
- raw: security-reviewer H-001

### H-004 — 改名の短命の子が dispose / before-quit の後始末に入っていない。AD-034 決定 2 の形を満たさない [origin: architecture] [new]

- **Where**: docs/decisions/0062-…md:39, contracts C-5:72, data-model §6, tasks BE-033 / BE-034, src/main/app/composition-root.ts:504-509
- **Action**: 動いている子の集合と `dispose()` を持たせ、composition-root の後始末に結線する。同時に動かせる数の上限を強制する
- raw: architecture-reviewer H-001

### H-005 — 改名を受け付けてから子が終わるまでの間にターンが始まりうる (TOCTOU)。U-6 / FR-010 が破れる [origin: architecture, security] [new]

- **Where**: spec.md:86, :185, data-model.md:103-112, :107, :140, :197, tasks FE-030 / BE-034, plan.md:38
- **Action**: `changing === 'name'` の間は main で `send-prompt` を拒否する。そうしない場合は、この窓を残るリスクとして明記し、quickstart に手順を足す
- raw: architecture-reviewer H-002, security-reviewer M-002 (merged)

## Medium / Low

Medium は 20 件、Low は 19 件である (重複を除いた件数)。本文は下の raw output を見る。統合したもの:

- analyze U3 + po M-002: timeout の後に成功が届いたとき、モデルの表示が古いまま残る
- po M-004 + security M-001: 権限モード / モデルの変更が失敗しても main の log に残らない
- architecture M-006 + platform-boundary L-001: 改名が失敗した原因がログで区別できない (Medium に寄せた)
- analyze U1 + architecture L-002: `resolveLiveTranscriptTarget` の signature が実体と合わない (Medium に寄せた)

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
