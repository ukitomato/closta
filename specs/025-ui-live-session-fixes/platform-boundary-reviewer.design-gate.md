# platform-boundary-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-29T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md

## 初回読了 viewpoint

- **この PR が影響する FR/SC**:
  - FR-001〜FR-004 (選択を composer へ移す)
  - FR-005〜FR-007 (`supportedModels` の一覧と main の照合)
  - FR-008〜FR-010 (権限モードの名前)
  - FR-011〜FR-013 (停止と Esc)
  - FR-014〜FR-015 (右のパネル)
  - FR-016〜FR-018 (`/resume`)
  - SC-001〜SC-007
- **自分の担当スライスで実質的に当たるもの**:
  - Principle III: 選べる権限モードの値は変わらない。変わるのは名前の表記と置き場所だけ
  - Principle VII: `src/agents/sdk-agent-session.ts` が新しく足される `normalizeLiveModels` (`@domain/provider/model-catalog`) を使う
  - AD-003 の複数インスタンス: `/resume` の選ぶ画面が、再開の 3 軸 (`fixed`) をどこから取るか
- **当たらないもの**:
  - AD-004 と AD-012: パスも docker endpoint も扱わない
  - runtime / isolation の charter: どちらの Out of scope にも触れていない
- **AD-065 の Confirmation**:
  - `sdk-agent-session.test.ts` / `session-launch-service` の単体
  - `query-mutation-methods.test.ts` が 20 のまま
  - `queryMethodsAreClassified` の型検査
- **カテゴリ別の件数**:
  - A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
  - B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
  - C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:0
  - D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
  - E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
  - F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
  - G. optional reviewer 範囲: 該当なし: optional reviewer の担当
  - H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (担当範囲のテスト不足は M-001 の推奨アクションにまとめた。Principle VII の回帰は SH-012 の依存グラフ検証が、Principle III の回帰は main の `checkSetPermissionModeArgs` → `isSafePermissionMode` (`src/main/app/validate.ts:437-441`) が UI と無関係に守る。一覧の取得の観測点は `[session] live-models count=N dropped=M` で、値はログに出さない)

## スコープ要約

今回の設計は ui domain の手直しで、次の 3 つに分けられる。

- **renderer**:
  - composer の周りの選択
  - 権限モードの名前の表
  - 停止ボタンと Esc
  - 右のパネル
  - `/resume` の選ぶ画面
- **既定の Provider のモデルの一覧**: `Query.supportedModels()` を、IPC → `SessionControl` の `list-models` → `models-result` → `Entry.liveModels` の経路で足す
- **Constitution の改定**: Principle XV の Exceptions に 1 項を足す

ランタイムの抽象、パス型、隔離、docker endpoint、永続環境はどれも変えていない。プラットフォーム境界で見るべき点は次の 4 つで、このうち (3) に 1 件あった。

1. 一覧のキャッシュがセッション単位か
   - main の `Entry` と renderer のセッションごとの状態に持つので、単一インスタンスを仮定していない
2. 権限モードのゲートを迂回できないか
   - 選べる値は安全 3 値のままで、main の述語も変わらない
3. `/resume` の再開の軸の出どころ
   - 選ぶ画面が `fixed` をどこから取るかが文面上あいまい (M-001)
4. Query のメソッドの呼び出し制限が、機械検査でどこまで守られるか (L-001)

**PB-1 〜 PB-7 の判定**:

- **PB-1** — 該当なし。境界を越えるのは次のものだけで、パスはない:
  - sessionId (UUID)
  - モデルの id の文字列
  - 不透明な `targetKey`
  - folderId

  選ぶ画面は `SessionSummaryDTO.cwd` を読まない (data-model §7.3)
- **PB-2** — M-001。それ以外の点は複数インスタンスを前提にしている:
  - 一覧は `Entry` ごと (data-model §2)
  - 待ちは sessionId と世代で照合する (§2.1)
  - renderer はセッションごとに `liveModels` を持つ (§6.3)
- **PB-3** — 該当なし。`capabilities` の計算と表明には触れない。`ModelInfo.supportsAutoMode` も写さない (data-model §1.1)
- **PB-4** — 該当なし。迂回の経路がない:
  - 選べる値は安全 3 値のまま (spec 本 feature の位置づけ)
  - main の `checkSetPermissionModeArgs` が `isSafePermissionMode` で拒否する
  - `/resume` の先の起動ダイアログは `initial: null` で、前の権限モードを運ばない (data-model §7.4)
  - main の `resolveResumeSource` が 3 軸を照合し直す (`src/main/app/resume-service.ts:88-94`)
  - `isAutoModeAllowed` は変えない (plan Constitution Check III)
- **PB-5** — 該当なし。パスの変換も docker endpoint もない
- **PB-6** — 該当なし。一覧はメモリにだけ持つ。ボリューム、コンテナ、利用者の環境への書き込みはない
- **PB-7** — L-001

## Findings

### [Medium] `/resume` の選ぶ画面の `fixed` (3 軸) の出どころが data-model に書かれておらず、実装者が今のセッションの `live.config` で埋めかねない (M-001) (scope: feature)

- **観察**:
  - `specs/025-ui-live-session-fixes/data-model.md:236` は `store.openResume({ ..., fixed: { folderId, runtimeId, providerId }, ... })` とだけ書いており、値の出どころがない
  - 選ぶ画面は `live.config.folderId` で候補を絞る (`data-model.md:225`)。そのため手元には `live.config` の `runtimeId` / `providerId` がすぐ使える形である
  - 既存の `PastResumeBar` は、`resolvePastResume` の答えの `result.folderId` / `result.runtimeId` / `result.providerId` を使っている (`src/renderer/src/features/session/PastResumeBar.tsx:73-77`)
  - main はこの 3 軸を `pastResumeSource` の列挙対象 (どのランタイムの transcript か) から決める (`src/main/app/resume-service.ts:70-80`)
  - FE-052 のテスト (`tasks.md:113`) は「openResume の引数が上の形」としか書いておらず、`fixed` が答えの値であることを固定していない
- **同種事象探索**: `fixed:` を `specs/025-ui-live-session-fixes/` で探すと 3 件 (data-model.md:236 / research.md:184 / tasks.md:112)。research.md:184 と tasks.md:112 は `fixed` を省略形で引いているだけで、出どころはどこにも書かれていない
- **リスク/影響**:
  - 同じ folderId のグループには、別のランタイムの列挙対象から対応づいた過去のセッションや、別の Provider で動いた過去のセッションが入りうる (`boundary` は行単位。`src/domain/session/dto.ts:56-66`)
  - そこに今のセッションの `runtimeId` / `providerId` を入れると、main の照合 (`resume-service.ts:88-94`) で `invalid-config` として拒否される
  - 間違ったランタイムで起動することはない (main の照合が防ぐ)。ただし、サイドバーからは再開できる行が選ぶ画面からだけ再開できなくなり、FR-018 の「サイドバーの過去の行と同じ判定」が崩れる
  - これは AD-003 の「ランタイムは複数ある」に対して、「同じフォルダなら同じランタイム・Provider」と暗黙に仮定する形である
- **推奨アクション**:
  - data-model §7.4 の 2 に「`fixed` は `resolvePastResume` の答え (`result.folderId` / `result.runtimeId` / `result.providerId`) から取る。今のセッションの `config` を使わない」と書く
  - FE-052 の `startPastResume` の単体に次の 1 項を足す: `live.config` と違う `runtimeId` / `providerId` を返す偽の答えで、`openResume` の `fixed` が答えの値になる
  - `startPastResume` のシグネチャは、答え (`PastResumeDTO` の ok の側) を受け取って `fixed` を組む形にする。呼び出し側が `fixed` を渡せない形にすれば、型で取り違えを防げる
- **根拠**: AD-003 (ランタイムは複数インスタンスを持ちうる) / spec FR-018 / 021 (X-9) の `resolvePastResume` の契約
- **scope 根拠**: feature の data-model §7.4 と tasks の FE-052 / FE-053 の範囲で直せる

### [Low] `supportedModels` を「既定の Provider の一覧の取得に限って呼ぶ」制限は型の `Pick` と review だけが守る。expected.mjs の記述が機械検査の射程を正しく言い直すようにする (L-001) (scope: feature)

- **観察**:
  - AD-065 Decision 1 は「呼べるのは `queryHandle` だけ」としている (`docs/decisions/0065-…md:37`)
  - 一方、`supportedModels` を移す先の `QueryLiveReadMethod` は項目 16 の denylist (`QUERY_MUTATION_METHODS`) に入らない (plan.md:272)
  - そのため SDK を持つファイルで生の `Query` に対して直接 `.supportedModels(` を書いても、機械検査には掛からない
  - 今の `mitigatedBy` (`tests/rule-fixtures/expected.mjs:949-956`) は「間接の呼び出しは platform-boundary-reviewer が確認する」と書いている
  - BE-021 の書き換え案 (`tasks.md:63`) は、呼ぶメソッドの列挙を直すだけである
- **同種事象探索**: `supportedModels` を `src/` で探すと 1 件 (`src/agents/sdk-agent-session.ts:181`。分類の union だけ)。呼び出しはまだ 0 件
- **リスク/影響**:
  - 今は実害がない (`Query` を持つのは 1 箇所)
  - ただし fixture の記述を読んだ人が、新しい読み取りメソッドも項目 16 や tsc が守ると誤読しうる
- **推奨アクション**: BE-021 で `mitigatedBy` を直すときに、「`QueryLiveReadMethod` (`supportedModels`) も項目 16 の対象外で、`queryHandle` の `Pick` の外で呼ぶ直接の呼び出しも code-gate の platform-boundary-reviewer が agents の差分で確認する」と 1 文足す
- **根拠**: AD-065 Decision 1 / Constitution Principle VII の Verification (Manual: platform-boundary-reviewer) / PB-7
- **scope 根拠**: feature の BE-021 が同じ行を直す

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `fixed:` in `specs/025-ui-live-session-fixes/` | 3 | data-model.md:236, research.md:184, tasks.md:112 |
| L-001 | `supportedModels` in `src/` | 1 | src/agents/sdk-agent-session.ts:181 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 1
