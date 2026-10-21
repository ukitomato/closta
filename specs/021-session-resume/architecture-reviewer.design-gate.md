# architecture-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-21T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/021-session-resume/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 と SC-001〜SC-008 はすべて設計段階の対象。今回の指摘が直接当たるのは FR-005 / SC-003 (過去の行の軸の解決)、FR-012 / FR-013 / SC-007 (それまでの会話の読み取り)、FR-015 / FR-016 (記録と glossary)、FR-003 / FR-004 (会話の id の運び方)
- touched files に該当する charter / Confirmation:
  - session charter: Journey 4、業務ルール「再開時の軸の引き継ぎ」(`:182`)、Key concepts の `conversation_reset` (`:167`)、KPI「再利用率」の計測の注記 (`:211-221`)、Scope / Journey 1 の「各 Provider の config ディレクトリから列挙」
  - ADR の Confirmation: AD-041 (g) と AD-054 の `QUERY_OPTION_KEYS` pin、AD-047 Decision 1 の `LAUNCH_FAILURE_REASONS` pin、AD-043 Decision 4 (状態通知だけが main を経由し、100ms 窓でまとめる)、AD-034 の読み取り経路、AD-058 の「WSL の所在 × Win32Runtime は到達不可」、`.dependency-cruiser.js` の `ui-not-to-core` と状態を持つ service → I/O の規則
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲 (UUID の検査の置き場は設計上 5 境界ある)
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:3 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲 (module の置き場が layering に効く件は D に入れた)
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (テストの穴は各指摘の推奨アクションに含めた。H-001 は BE-001 の表に行が無く、M-004 は FE-030 に起動元のケースが無く、M-005 は FE-040 のテストが Provider 付きの稼働中の行を想定していない。regression の根拠として plan は `launch` の既存テストを書き換えずに通すことを BE-006 / BE-013 / FE-011 で要求しており、観測点として `[session] conversation-id-changed` (値を出さない) と `resume-failed` がある)

## スコープ要約

X-9 は、終わった会話・失敗した会話を Agent SDK の `resume` で再開する機能。変更範囲は 5 つ。(1) `QUERY_OPTION_KEYS` を 11 → 12 キーにする。(2) セッションスレッド → 調停役スレッド → main に `conversation` message を足し、main の registry と退避の表 (上限 256) に会話の id を持つ。(3) domain の純関数 `resolvePastResumeAxes` で過去の行の 3 軸を解く。(4) IPC を 4 つ足す (`resolvePastResume` / `resumeSession` / `getResumedTranscript` / `sessionResumable`)。(5) renderer の再開の形のダイアログ、行の入れ替え (`replace`)、それまでの会話の先頭への挿入を足す。決定は AD-059 (proposed) にまとめ、AD-041 (g)/(h)、AD-036 §4 P1、AD-043 の message の種類、AD-047 Decision 1、X-5 FR-013 を読み替える。tasks は AD-059 の accepted を着手の条件にしている。

## Findings

### [High] 過去の行の軸の解決が「cwd の所在」と「列挙対象の所在」の一致を見ておらず、存在しない組み合わせを ok と返す (H-001) (scope: feature)

- **観察**: data-model `specs/021-session-resume/data-model.md:147` の段 1 は、ランタイムを**列挙対象の所在**から決める (`windows` → `host`、`wsl` D → `wsl:D`)。段 2 (`:148-152`) は `matchFolder` に任せる。ところが `matchFolder` は**cwd の出自の所在** (`originLocation(input.origin)`) の名前空間でランタイムを引き、フォルダを照合する (`src/domain/session/match.ts:108-118`, `:121-141`)。そして `classifyCwd` は、UNC 形の cwd を列挙対象の所在によらず `wsl-from-unc` (cwd に書かれたディストロ) に分類する (`src/domain/session/cwd-origin.ts:93-150`)。例えば、ホストの `~/.claude` (列挙対象 `windows`) にあり、`claude.exe` を `\\wsl.localhost\Ubuntu\home\y\p` で動かした会話を考える。段 2 は WSL の登録フォルダに一致し、`matchedPrefix` も cwd と一致する。段 1 は `host` を返す。結果は `ok: true` で、組は (WSL のフォルダ, Win32Runtime) になる。WSL のディストロ D の列挙対象にある、`\\wsl$\D2\...` の cwd の会話でも同じことが起きる
- **同種事象探索**: Grep `originLocation|locationNamespace|wsl-from-unc|origin の所在` を `specs/021-session-resume` に対して実行し、0 件。設計のどこにも 2 つの所在の照合が無い。BE-001 のテスト表 (`tasks.md:24`) が見るのは「WSL の所在 × Win32 のランタイムが段 1 で決まらない」(列挙対象の側) だけ
- **リスク/影響**: AD-058 の「所在 WSL × `Win32Runtime` は到達不可」の組を「再開」できる行として出してしまう。押すと起動ゲートが §10 の説明を出さずに拒否する。U-3 が退けた「会話が見つからない組み合わせを作れる」(spec `:77`) を、別の経路で作っている。SC-003 は「全組み合わせで FR-005 のとおり」と主張しているが、この組み合わせが表に無い
- **推奨アクション**: §3.1 の段 1 と段 2 の間に、`originLocation(origin)` の名前空間 (`locationNamespace`) が段 1 のランタイムの id と一致することを条件として足す。外れたら既存の理由 (`location-unknown`) にするか、新しい理由を 1 つ足す。足す場合は `ResumeUnavailableReason` の pin と §10 の文言も直す。BE-001 のテスト表に 2 行足す (ホストの列挙対象 × UNC の cwd、WSL D の列挙対象 × D2 の UNC の cwd)
- **根拠**: session charter `:182` (再開時はフォルダ / ランタイム / Provider を引き継ぐ)、AD-058「読み替える箇所」の AD-025 行、spec U-3
- **scope 根拠**: 本 feature の data-model §3.1 / BE-001 で直せる

### [Medium] renderer が import する型を、パス API に到達するモジュール (`resume.ts`) に置いている (M-001) (scope: feature)

- **観察**: data-model §2 (`:86-98`) と §3 は `ResumeSource` / `SessionResumeRequest` / `ResumeUnavailableReason` と `resolvePastResumeAxes` を同じ `src/domain/session/resume.ts` に置く。`resolvePastResumeAxes` は `match.ts` と `@domain/provider/helper-path` を使い、後者は `@domain/runtime/path-api` を import する (`src/domain/provider/helper-path.ts:3`)。一方で contracts C-1 の `PastResumeDTO` (`capability.ts` に置く。BE-014) と renderer の `ResumeDialogState` (§9.3) は、これらの型を参照する。`.dependency-cruiser.js:343` は `tsPreCompilationDeps: true` で型 import も辿り、`ui-not-to-core` (`:302-309`) は renderer から Node 標準モジュールへの推移的な到達を error にする。`match.ts:20-28` はまさにこの理由で、理由キーを `keys.ts` に分けている
- **リスク/影響**: 書いたとおりに実装すると、code-gate の依存グラフ検査で落ち、型の置き場を作り直すことになる
- **推奨アクション**: renderer と `capability.ts` が使う型と定数 (`ResumeSource` / `SessionResumeRequest` / `ResumeUnavailableReason` / `RESUME_UNAVAILABLE_REASONS`) は、依存の軽いモジュール (例: `src/domain/session/resume-dto.ts`) に置く。`resume.ts` には純関数だけを残す。data-model §2 の「置き場」と BE-001 / BE-014 を直す
- **根拠**: AD-023 §7 / FR-035 (`ui-not-to-core`)、`match.ts` の先例
- **scope 根拠**: 本 feature の data-model と tasks で直せる

### [Medium] session charter の「アプリは SDK の会話の id を追っていない」が X-9 で事実でなくなるのに、記録の対象から外している (M-002) (scope: feature)

- **観察**: `docs/domains/session/charter.md:167` に「`new_conversation_id` は読まない (アプリは SDK の会話の id を追っていない。…)」とある。X-9 はまさに会話の id を追う (FR-003)。ところが plan の申し送り #28 (`plan.md:199`) はこれを「当たらない」とし、SH-010 (`tasks.md:95`) も `:167` を直す対象に入れていない。AD-059 の Context (`0059-…md:20`) は同じ文を現状として引いている
- **リスク/影響**: 完了の後に charter が事実と食い違い、次の X-6 (/clear の後の id) の設計者が前提を取り違える
- **推奨アクション**: SH-010 に `:167` の括弧書きを直す項を足す。例:「アプリは最初の `init` の会話の id だけを追う (X-9 / AD-059)。`new_conversation_id` は読まず、/clear の後は X-6」。plan #28 を「受ける」に改める
- **根拠**: Principle XIV、session charter の Key concepts
- **scope 根拠**: 本 feature の SH-010 で直せる

### [Medium] AD-059 の「読み替える箇所」が、AD-043 Decision 4 (main を経由するのは状態通知だけ・100ms 窓でまとめる) を名指していない (M-003) (scope: feature)

- **観察**: AD-043 Decision 4 は「状態通知 (…) だけを supervisor→main→renderer で運び、supervisor の 100ms 窓でまとめる」と定める (`0043-…md:63-67`)。AD-059 は `conversation` を「窓で束ねずに」main へ送り (Decision 2)、さらに main→renderer に supervisor 由来の情報 (`sessionResumable`) の 2 本目のチャネルを足す。それなのに読み替えの表 (`0059-…md:29`) は「AD-043 の … message の種類」の行だけで、Decision 4 とバッチ化の例外を名指していない
- **リスク/影響**: accepted の決定の例外が、Decision の番号で引けない。後続の feature が「main 経由は状態通知だけ」を根拠に設計すると食い違う
- **推奨アクション**: AD-059 の読み替えの表の AD-043 行を「Decision 2 (message の種類)・Decision 4 (main 経由は状態通知だけ・100ms 窓) — `conversation` は窓の外で即時に送り、main で止める。renderer へは真偽だけを `sessionResumable` で送る」と書く。AD-059 は proposed なので、in-place で直してよい
- **根拠**: AD-043 Decision 4、AD-031 (決定の変更は後続 ADR の読み替えとして明示する)
- **scope 根拠**: 本 feature の AD-059 (proposed) で直せる

### [Medium] 再開の起動の起動元 (`origin`) が KPI「再利用率」の計測の規則とずれている (M-004) (scope: feature)

- **観察**: data-model §9.3 (`:346`) と research R-12 (`:139`) は「プリセットを適用したら `preset`、それ以外は `manual`」とし、R-12 は「定義を変えない」としている。一方、session charter の KPI の注記 (`charter.md:216-218`) は「前回の設定を変えずに起動し直した起動は、前回の起動元に数える」と定める。稼働中の行からの再開は元の起動設定を初期値に出す経路 (FR-007) なので、この規則に当たる。po-reviewer の指摘 (`po-reviewer.design-gate.md:37`) と同じ事実を、charter の KPI の計測経路の側から見たもの
- **リスク/影響**: プリセットで起動したセッションを初期値のまま再開すると `manual` に数えられ、KPI が `manual` 側に偏る
- **推奨アクション**: §9.3 の起動元を、012 data-model §4 の 3 段の規則に揃える。稼働中の行からの再開はその行の `launchOrigin` を初期値の組の起動元にする。FE-030 のテストに「`launchOrigin: preset` の行から初期値のまま → `preset`」の行を足す
- **根拠**: session charter の KPI「再利用率」の計測経路の注記
- **scope 根拠**: 本 feature の data-model §9.3 / FE-030 で直せる

### [Medium] Provider の config ディレクトリは列挙されないので、§8.1 (2) の Provider の分岐は実際には動かない。これを spec に書いていない (M-005) (scope: feature)

- **観察**: research R-05 (`research.md:55`) によると、列挙対象は常に `origin: 'default'` で、「Provider の config ディレクトリは列挙しない」。data-model §8.1 の稼働中の行 (`:278`) は、(1) キャッシュの行、(2) Provider の `configDir` と一致する列挙対象、の順で探す。しかし config-dir の Provider で起動したセッションは、どちらの列挙対象にも当たらない。したがって (3) の読み取りの失敗に必ず落ちる。charter の Scope (`charter.md:55`) と Journey 1 の手順 2 (`:92`) は「各 Provider の config ディレクトリから列挙」と書いており、R-05 の事実と食い違う (既存の charter drift)。spec の Assumptions / Out of Scope / RK はこの帰結 (US-4 AC1 が config-dir の Provider では成り立たない) を書いておらず、RK-03 は `provider-missing` にしか触れていない
- **リスク/影響**: config-dir の Provider の利用者は、稼働中の行から再開するたびに「それまでの会話を読み込めませんでした」を見る。仕様上の限界なのか不具合なのかを区別できない
- **推奨アクション**: spec の Assumptions か Edge Cases に「config-dir の Provider で起動した会話は、Provider の config ディレクトリが列挙対象に入るまで、それまでの会話を読めない (FR-013 の経路)。過去の区画にも出ない」と書き、plan に RK を 1 つ足す。FE-040 / BE-020 のテストに、この行 (決まらず `transcript-read-failed`) を明示して足す。charter の Scope / Journey 1 と R-05 の食い違いは system follow-up として roadmap に残す
- **根拠**: session charter の Scope / Journey 1、Principle X
- **scope 根拠**: 帰結を書くのは本 feature の spec / plan。charter 側の食い違いは別の feature の扱い

### [Low] 段 1 の所在 → ランタイムの id の対応を、既存の `locationNamespace` と別の表として書いている (L-001) (scope: feature)

- **観察**: data-model §3.1 段 1 (`:147`) は `windows` → `host`、`wsl` D → `wsl:D` を新たに書いている。同じ対応は `locationNamespace` (`@domain/workspace/folder`) にあり、`match.ts:116` が使っている。`match.ts:17` は「同じ表を 2 つ持たない」と明記している
- **推奨アクション**: 段 1 は `locationNamespace(target.location)` で引くと data-model に書く
- **根拠**: AD-023 (domain の単一の公開面)、`match.ts` の不変条件
- **scope 根拠**: 本 feature の data-model で直せる

### [Low] 「状態を持たない」`resume-service` を「状態を持つ調停」の規則の実名リストに足しているが、規則の説明を直す手順が無い (L-002) (scope: feature)

- **観察**: `.dependency-cruiser.js:225-236` の規則の説明は、対象を「状態を持ち I/O をインタフェース経由で扱うクラス」とし、追加の履歴 (R-2〜O-3) も書いている。plan `:220` と data-model §5 は `resume-service` を「状態を持たない調停」と呼びつつ、実名を `:254` に足す (BE-012)
- **推奨アクション**: BE-012 で実名と一緒に、説明の履歴に「X-9 で `resume-service` (状態は持たないが I/O を注入で受ける調停) を追加」と足す
- **根拠**: AD-027 Consequences、AD-025 §9
- **scope 根拠**: 本 feature の BE-012 で直せる

### [Low] 同じ UUID に `sessionId` (`SessionSummaryDTO`) と `conversationId` の 2 つの名前が並ぶ。glossary の追記にその対応が無い (L-003) (scope: feature)

- **観察**: glossary の Session (`glossary.md:932-941`) は Claude Code の UUID を指す。過去の行では同じ値が `SessionSummaryDTO.sessionId`、`ResumeSource.past.conversationId` (data-model `:89`) と 2 つの名前で現れる。稼働中の行の `sessionId` は別の値。SH-001 (`tasks.md:15`) の Counterexample は稼働中の行の `sessionId` だけを挙げている
- **推奨アクション**: SH-001 の「Conversation id」の項に「`SessionSummaryDTO.sessionId` と同じ値 (列挙の DTO の歴史的な名前)」を書く。新しいコードでは Claude Code の UUID を `conversationId` に統一することを Definition に書く
- **根拠**: Principle XIV (同義異語の禁止)
- **scope 根拠**: 本 feature の SH-001 で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `originLocation\|locationNamespace\|wsl-from-unc\|origin の所在` in `specs/021-session-resume` | 0 | 設計に所在の照合が無い。根拠のコードは `src/domain/session/match.ts:108-141`、`src/domain/session/cwd-origin.ts:93-150` |
| M-001 | `^import` in `src/domain/provider/helper-path.ts` / `src/domain/capability.ts` | 2 系統 | `helper-path.ts:3` (path-api)、`capability.ts:12-18` (軽い DTO モジュールだけを import している先例) |
| M-002 | `会話の id を追\|new_conversation_id` in docs / src | 1 (charter) | `docs/domains/session/charter.md:167` (他の hit は「読まない」の記述で、事実のまま) |

## Verdict

- Critical: 0
- High: 1
- Medium: 5
- Low: 3
