# platform-boundary-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md
**Gate**: code-gate iter 1

## 初回読了 viewpoint

- FR/SC that touch my slice:
  - FR-005〜FR-007 / SC-002: `supportedModels()` 経路 (agents → supervisor → main → renderer) と、main で「最後に受け取った一覧」と照合する処理
  - FR-008〜FR-009 / SC-003: 権限モードの名前の表だけが変わる。選べる値は安全 3 値のまま (Principle III)
  - FR-016〜FR-018 / SC-006: `/resume` → `resolvePastResume` → `startPastResume` → 再開ダイアログ (AD-003 の複数ランタイム)
  - FR-001〜FR-004 / FR-011〜FR-015: renderer の配置と見た目だけ。プラットフォーム境界の外
- Charter / Confirmation that apply to the touched files:
  - Principle VII: `src/agents/sdk-agent-session.ts` / `src/agents/supervisor-protocol.ts` が新しく `@domain/provider/model-catalog` を import する。import 先は `@domain/validation` と `./types` だけで、electron への依存はない
  - Principle III / AD-062: `src/renderer/src/features/session/LiveSettingsControls.tsx:276` は今も `SAFE_PERMISSION_MODES` から選択肢を作る
  - AD-065 Confirmation: `queryMethodsAreClassified` / `queryHandle` の `Pick` (`src/agents/sdk-agent-session.ts:183,464`) と `tests/rule-fixtures/expected.mjs:996-1006`
  - AD-004 / AD-012 と runtime / isolation の charter: パスも docker endpoint も触っておらず、Out of scope の侵犯もない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 — 担当範囲にはテストがある:
  - 層をまたぐ形の取り違え: `src/agents/live-models-path.test.ts`
  - main が一覧の外・effort の外の値を拒否し、一覧が未受信なら制御を送らない: `src/main/app/session-launch-service.test.ts:1279,1289`
  - `fixed` を答えから取る: `src/renderer/src/features/session/past-resume.test.ts:7-24`
  - 終了処理中に SDK を呼ばない: `src/agents/sdk-agent-session.test.ts:2213-2220`
  - 観測点は `[session] live-models count=N dropped=M` (`src/main/app/session-launch-service.ts`) で、値はログに出さない

## スコープ要約

差分は ui domain の手直しで、プラットフォーム境界に当たるのは次の 3 点だけ。

1. 既定の Provider のモデルの一覧
   - 新しい経路: IPC `listSessionModels` → `SessionControl` の `list-models` → `queryHandle.supportedModels()` → `models-result` → main の `Entry.liveModels`
2. 権限モードの名前の表記
3. `/resume` の再開
   - `PastResumeBar` と `ResumePickerDialog` が共有する `startPastResume` を通す

ランタイムの抽象、`capabilities` の計算、パス型、docker endpoint、永続化には触れていない。

PB-1〜PB-7 の判定:

- **PB-1 (パス型の消失)**: 該当なし。境界を越える値にパスはない。越えるのは sessionId / requestId (UUID)、モデルの id の文字列、不透明な `targetKey`、folderId だけ。`resume-picker-rows.ts` は `cwd` を読まない (`src/renderer/src/features/session/resume-picker-rows.ts:7-12,15-29`)。
- **PB-2 (単一インスタンス仮定)**: 該当なし。
  - main の一覧は `Entry` ごとに持つ (`liveModels`)。待ちは `pendingModels` に requestId をキーにして入れ、sessionId と generation で照合する。相乗りも同じ sessionId と世代のときだけ。supervisor が終わったときは世代単位で解決する
  - renderer の一覧は `sessions[sessionId].liveModels` (`src/renderer/src/features/session/running-session-store.ts:803,1054-1060`)
  - design-gate の M-001 は解消済み。`startPastResume` は `fixed` を `resolvePastResume` の答え (`result.folderId/runtimeId/providerId`) から組む (`src/renderer/src/features/session/past-resume.ts:21-28`)。`ResumePickerDialog.tsx:118-124` と `PastResumeBar.tsx` の両方がこの関数を通る
- **PB-3 (capabilities の虚偽表明)**: 該当なし。`capabilities` に触れていない。`normalizeLiveModels` は `supports*` を写さない (`src/domain/provider/model-catalog.ts`。テストは `model-catalog.live.test.ts:51-56`)。
- **PB-4 (権限ゲートの迂回)**: 該当なし。
  - 選択肢は `SAFE_PERMISSION_MODES` だけ。安全 3 値の外の今の値は `disabled` の option として出るだけ (`LiveSettingsControls.tsx:271-280`)
  - `LaunchDialog.tsx` は説明文を消しただけ
  - `/resume` の先は `initial: null` で、前の権限モードを運ばない (`past-resume.ts:29`)
  - main の `checkSetPermissionModeArgs` と `isAutoModeAllowed` は差分に無く、変わっていない
- **PB-5 (多段パス変換)**: 該当なし。パスの変換も docker endpoint もない。
- **PB-6 (永続環境の構築)**: 該当なし。一覧はメモリにだけ持つ。コメントは「永続化しない」(`session-launch-service.ts` の `Entry.liveModels`)。ボリューム、コンテナ、ディストロ、ホームディレクトリへの書き込みはない。
- **PB-7 (lint ルールの網羅性)**: L-001 の 1 件。
  - `supportedModels` の呼び出しは機械検査 (項目 16 の denylist) の対象外で、型の `Pick` と review だけが守る
  - 今の呼び出しは `src/agents/sdk-agent-session.ts:792` の 1 か所だけ

## Findings

### [Low] `expected.mjs` の `mitigatedBy` が、`QueryLiveReadMethod` (`supportedModels`) も項目 16 の対象外であることを書いていない (L-001) (scope: feature)

- **観察**: `tests/rule-fixtures/expected.mjs:999-1003` は 2 点を書いている。
  - `supportedModels` を「呼ぶメソッド」に足した
  - `QueryUnusedReadMethod` の 5 個は項目 16 の対象外 (件数は実際の union `src/agents/sdk-agent-session.ts:184-185` の 5 個と一致する)

  一方で、新設の `QueryLiveReadMethod` (`src/agents/sdk-agent-session.ts:183`) が `QUERY_MUTATION_METHODS` の denylist に入らないことは書いていない。生の `Query` に対する直接の `.supportedModels(` も機械検査には掛からないが、それも書いていない。design-gate の L-001 で推奨した 1 文が入っていない。
- **同種事象探索**: `src/` で `supportedModels` を探して、呼び出しは 1 件 (`src/agents/sdk-agent-session.ts:792`)。ほかは型 (`:183`, `:464`)、テスト、コメントだけ。
- **リスク/影響**: 今は実害がない。`Query` を持つのは `queryHandle` の 1 か所だけだから。ただし fixture を読んだ人が、読み取りのメソッドも項目 16 か tsc が守ると誤読しうる。
- **推奨アクション**: `mitigatedBy` に 1 文足す: 「`QueryLiveReadMethod` (`supportedModels`) も項目 16 の対象外で、`queryHandle` の `Pick` の外で直接呼ぶ形は code-gate の platform-boundary-reviewer が agents の差分で確かめる」。
- **根拠**: AD-065 Decision 1 / Constitution Principle VII Verification / PB-7
- **scope 根拠**: feature の touched file (`tests/rule-fixtures/expected.mjs`) の同じ行で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `supportedModels` in `src/` (呼び出し) | 1 | src/agents/sdk-agent-session.ts:792 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
