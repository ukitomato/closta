# ux-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Reviewer**: ux-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-001 (LaunchDialog の選択肢)、FR-003 (US-1 AC6 の到達不可表示)、FR-004〜FR-007 (RuntimeListScreen のカードと LaunchDialog の案内)、FR-013 (監視ビューの行が WSL と同じに動く。H-001)、FR-009 (Provider の到達可能性と確認文言)、SC-002。
- touched files に該当する charter / Confirmation: session / runtime charter の UI 文言規約 (Principle XV)。担当は `LaunchDialog.tsx` / `RuntimeListScreen.tsx` / `labels.ts` (runtime-list / session) / `launch-runtime-options.ts` / `useRuntimes.ts`。消費側として変更外の `RunningSessionsProvider.tsx` も読んだ。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer が担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer が担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer が担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer が担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当。UX 完成度の指摘は G に集約した
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (UX): Critical:0 High:2 Medium:1 Low:4
- H. テスト / coverage / observability / regression: High:0 Medium:1 Low:0

## スコープ要約

X-8 は起動ダイアログの `Win32Runtime` の選択肢、ランタイム一覧カードの claude.exe 選択・解除と状態表示、Provider の既定ラベルのランタイム別の出し分けを足した。empty / error / loading の各状態は網羅されている。一方、Win32 を足したことで他の画面の文言が WSL 前提のまま残っている。

## Findings

### [High] Win32 セッションの行・ヘッダ・パレット・検索のランタイム名が「見つからないランタイム」になる (H-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/RunningSessionsProvider.tsx:57-64` の `runtimeName` は `runtimes.list.runtimes.find(...)?.distroName ?? SESSION_NAME_FALLBACKS.runtime` で名前を引く。`SESSION_NAME_FALLBACKS.runtime` は `session/labels.ts:244` の「見つからないランタイム」。Win32 の descriptor は `distroName: null` なので、一覧に存在するのに必ずフォールバック文言になる。消費側: `RunningSessionRow.tsx:86,260` / `CenterPane.tsx:85` / `palette-commands.ts:178` / `session-search.ts:154`。このファイルは本 feature で更新されていない。spec Edge Cases は「ランタイムの表示名で見分ける」とし、`analyze.md` E2 / `design-gate.md` M-013 が該当 task の欠落を指摘したまま実装に入った。
- **同種事象探索**: `\.distroName \?\?` (renderer 非テスト) で 1 件 (`RunningSessionsProvider.tsx:61`)。`RuntimeListScreen.tsx:186` は `?? 'Windows'` で処理済み。`launch-runtime-options.ts:48` は Win32 を先に分岐。
- **リスク/影響**: Win32 の行がすべて「見つからないランタイム」と出る。「Windows」で検索しても当たらない。FR-013 に反する。
- **推奨アクション**: `runtimeName` を `runtimeTitle(r.kind, r.distroName)` (`runtime-list/labels.ts:122`) 経由にする (影響が大きければ Win32 の分岐だけ足す)。Win32 のセッション行が「Windows (ホスト)」と出るテストを足す。
- **根拠**: spec FR-013 と Edge Cases、UX-9、UX-2。

### [High] 「既定 Provider で起動する」の確認文が Win32 でも「ディストロ内の claude の既定の資格情報と課金先」と言う (H-002) (scope: feature)

- **観察**: `session/labels.ts:529` (`PROVIDER_RESET_CONFIRMATION`) と `:536` (`PROVIDER_RESET_CONFIRMATION_UNVERIFIED`) は「既定 Provider ではディストロ内の claude の既定の資格情報と課金先が使われます。」と書き、`LaunchDialog.tsx:759-763` はランタイムの種類を見ずにこれを出す。同じ変更で `PROVIDER_DEFAULT_LABELS` (`labels.ts:400-403`) は Win32 用に分けたが確認文は分けていない。到達経路: WSL で Provider を選ぶ → Windows (ホスト) に切り替える → `provider-unreachable` で既定に落ち `requiresConfirmation` → 確認ダイアログ。
- **同種事象探索**: `ディストロ内` で 3 件 (`:401` はランタイム別で正しい。`:529` / `:536` が対象)。
- **リスク/影響**: 課金先と資格情報の同意文が Win32 の実態と食い違い、利用者は誤った情報で同意する。
- **推奨アクション**: `{ wsl, win32 }` の `Record` にし、`LaunchDialog.tsx:759` で `selectedRuntime?.kind` により選ぶ。テストを足す。
- **根拠**: UX-5、UX-9、data-model §10.1。

### [Medium] 起動ダイアログの Win32 の表示と監視行について、テストが無い (M-001) (scope: feature)

- **観察**: Win32 の確認文の文言、Win32 セッションの監視行・ヘッダの表示名を確かめるテストが無い (`Windows \(ホスト\)` を session / shell の test で 0 件)。
- **推奨アクション**: H-001 / H-002 の修正と同時に各 1 本ずつ足す。

### [Medium] WSL の所在 × Win32Runtime の到達不可の文言が「別のディストロの所在」を理由に挙げる (M-002) (scope: feature)

- **観察**: `session/labels.ts:504-505` の `CROSS_BOUNDARY_LABELS.unreachable` は「(別のディストロの所在、またはパスを変換できません)」。Win32 で WSL の作業フォルダを選んだ場合の原因は U-3。`LaunchDialog.tsx:728-736`。
- **推奨アクション**: `selectedRuntime.kind === 'win32'` のときは Win32 向けの文を出す。

### [Low] Win32 の claude.exe が使えない案内が、WSL だけを使う利用者の起動ダイアログに常時出る (L-001) (scope: feature)

- `LaunchDialog.tsx:538-547`。主語を明示するか対象を絞る。

### [Low] 使えない Win32 を指すプリセットの blocker が「見つかりません」と出る (L-002) (scope: feature)

- `session/labels.ts:463` の `runtime-missing`。案内と blocker が食い違う。

### [Low] 起動ダイアログの WSL の選択肢は「Ubuntu」、一覧・解決画面は「WSL: Ubuntu」と表記が揺れる (L-003) (scope: feature)

- `launch-runtime-options.ts:48`。

### [Low] 選択ダイアログの IPC 失敗が「指定を保存できませんでした」と出る (L-004) (scope: feature)

- `useRuntimes.ts:120,129`。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `\.distroName \?\?` (renderer 非テスト) | 1 | `RunningSessionsProvider.tsx:61` (消費側は `RunningSessionRow.tsx:86,260` / `CenterPane.tsx:85` / `palette-commands.ts:178` / `session-search.ts:154`) |
| H-002 | `ディストロ内` (renderer 非テスト) | 3 (うち修正対象 2) | `session/labels.ts:401`, `:529`, `:536` |
| M-001 | `Windows \(ホスト\)` (session / shell の test) | 0 | - |
| M-002 | `別のディストロ` (renderer 非テスト) | 3 (うち表示は 1) | `session/labels.ts:493`, `:505`, `workspace-folders/labels.ts:29` |

## Verdict

- Critical: 0
- High: 2
- Medium: 2
- Low: 4

Round inheritance: 初回 (Round 1)。
