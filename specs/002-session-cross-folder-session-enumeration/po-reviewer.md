# po-reviewer Review: セッション列挙 (R-2)

**Run**: 2026-09-17
**Reviewer**: po-reviewer
**Spec**: specs/002-session-cross-folder-session-enumeration/spec.md
**Round**: 1

## 初回読了 viewpoint

読了済み: `.claude/agents/reviewer-base.md` / spec.md 全文 (FR-001〜048 / SC-001〜014 / Edge Cases / Assumptions / Out of Scope) / plan.md (Domain Context・上流申し送り・上流 SSoT の追随) / tasks.md (US-1〜US-4 全 section) / research.md (R-01〜R-10) / data-model.md (§1〜§10) / quickstart.md (V-1〜V-8) / contracts/session-enumeration.md / contracts/ipc-session-list.md / checklists/requirements.md / `docs/domains/session/charter.md` 全段落 / `docs/domains/_overview.md` / `docs/glossary.md` / `docs/roadmap.md` / 水準比較として `specs/001-.../spec.md` の SC 節。

**本 PR で実装/影響される FR / SC (PO 観点で追跡したもの)**

- FR-004 / FR-025 / FR-026 / FR-027 / FR-028 — 未登録フォルダと作業フォルダ不明 (US-2 の中核)
- FR-007 / FR-030 / FR-031 / FR-032 — 所在ごとの失敗封じ込めと空状態 (US-3 の中核)
- FR-022 / FR-023 / FR-029 — 保留 / 越境 / worktree・programmatic の「区別可能な提示」
- FR-033 / FR-034 / FR-035 / FR-036 — キャッシュ・取得時刻・置き換え・非永続化 (鮮度の UX)
- FR-037 / FR-038 / FR-039 / FR-040 — 段階的提示・追加取得・並び順・絞り込み (US-4)
- FR-046 / FR-047 — 日本語ラベルと要約の代替表示
- SC-001 〜 SC-014 — 全 SC を計測可能性の観点で検査

**touched files に該当する charter / Confirmation**

- `docs/domains/session/charter.md` Mission / Journey 1 / KPI「列挙の網羅」 — US-1 が Journey 1 に 1:1 対応。US-2 は Journey 1 に存在せず plan.md:19-22 / 318-330 が charter 追記を宣言 (人間承認待ち、plan.md:361)
- 同 KPI「計測経路: E2E」 — `[USER]` 判断で本 feature では満たさない (spec.md:440-446 / plan.md:301-316)
- `docs/domains/_overview.md:50` R-2 行 / `:91` M1 完了判定 — 「全件列挙 + 未登録フォルダ」の追記が SH-088 に割当済み
- Charter / Glossary drift そのものの採否判定は `architecture-reviewer` の Owner Matrix (cat C/D) に委ねる

**viewpoint 集計**

- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の Owner 範囲。本 bundle は読み取り専用で資格情報も認可境界も扱わない
- B. 入力検証 / injection / 暗号: 該当なし: `security-reviewer` の Owner 範囲 (IPC 検証表は contracts/ipc-session-list.md:141-166 に存在)
- C. 業務不変条件 / Charter drift: 該当なし: `architecture-reviewer` の Owner 範囲。charter 追記 2 点は plan.md が自己申告済みで人間承認に載っている
- D. Constitution / ADR drift: 該当なし: `architecture-reviewer` の Owner 範囲
- E. User Story / SC / AC / UX: Critical:1 High:7 Medium:6 Low:3
- F. 命名 / module / lint hookup: 該当なし: `convention-reviewer` の Owner 範囲
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: 空状態・エラー状態の**見た目と element 選定**は採用済み `ux-reviewer` / `a11y-reviewer` の範囲。本 reviewer は SC / AC / 価値の側面に限定した
- H. テスト / coverage / observability / regression: Critical:0 High:2 Medium:2 Low:0

## スコープ要約

R-2 は `session` domain の最初の feature で、R-1 の `RuntimeDescriptor` / 実行中確認済みの値 / 登録フォルダ / パス API を入力に、Windows 側の短命 `utilityProcess` から UNC 経路で WSL 内 config ディレクトリを含む全セッションを**読み取り専用**で列挙する。US-1 (横断一覧 / P1)・US-2 (未登録フォルダ / P1)・US-3 (列挙できない所在 / P1)・US-4 (件数 / P2) の 4 ストーリー、FR 48 件、SC 14 件、AC 35 シナリオ。bundle の完成度は R-1 と同水準に高く、実測 (research R-01〜R-09) に裏打ちされた設計判断・「保留と未登録を潰さない」「所在を推測しない」といった 3 値/4 値の分け方・上流申し送り 4 件の明示的処理は design-gate 通過水準を大きく上回る部分がある。一方で **利用者から見える振る舞いの一部が FR / SC / data-model のどこにも落ちていない**箇所が残っており、特に「登録フォルダが一覧から消える」経路と、安全性 SC の計測経路の実行不能性、後続 R-3 への受け渡し不足を以下に挙げる。

## Findings

### [Critical] セッション 0 件の登録フォルダが一覧から消える — US-1 AC-9 が data-model 上で表現できない (C-001) (scope: feature)

- **観察**: spec.md:78-79 の US-1 AC-9 は「セッションが 0 件の登録フォルダ → 『このフォルダにはまだ履歴がない』ことと次の操作への導線が示され、**空白の行にならない**」を要求する。しかし data-model.md:196-216 の `SessionGroup` は 4 種すべてが `sessions: SessionSummary[]` を持つ**セッションから導出される**構造であり、`FolderMatch` (data-model.md:127-168) もセッション 1 件ごとの判定である。tasks.md:56-57 の BE-015 も「4 種のグループへのまとめ + `Σ グループ件数 = 総数`」であり、**入力はセッション集合のみ**。登録フォルダ一覧 (R-1 の `WorkspaceFolder`) からグループを seed する記述は plan / data-model / contracts / tasks のどこにも無い。結果、履歴 0 件の登録フォルダは `SessionGroup` を 1 件も生成せず、US-1 冒頭 (spec.md:44-45)「登録済みの作業フォルダごとに…並ぶ」に反して**画面から完全に消える**。
- **同種事象探索**:
  - `履歴がない|0 件の登録フォルダ|登録フォルダ 0 件|まだ履歴` → **7 件**。うち AC-9 の「フォルダ単位の 0 件」を扱うのは spec.md:78-79 の **1 件のみ**。他 6 件は所在単位 (spec.md:150) か全体単位 (spec.md:213 / :315 FR-032 / :422 SC-013 / quickstart.md:169) であり、**フォルダ単位の空状態を扱う記述は spec.md 以外に 0 件**
  - `WorkspaceFolder|folderId|登録フォルダの一覧` → **6 件**。**登録フォルダ一覧を group の生成源として扱う記述は 0 件**
  - FR-032 (spec.md:315-316) の空状態 4 条件に「フォルダ単位の 0 件」は含まれず、SC-013 (spec.md:422-424) にも無い。**AC-9 に対応する FR も SC も 0 件**
- **リスク/影響**: 利用者が R-1 で登録したばかりのフォルダ (履歴なし) がセッション一覧に一切現れない。利用者から見ると「登録したはずのフォルダが無い = 登録が失敗した / セッションが消えた」であり、US-3 の Why (spec.md:132-135)「黙って 0 件にすると『セッションが消えた』に見え…信頼を直接損なう」が**所在単位では解決され、フォルダ単位では放置されている**。R-1 → R-2 の導線は新規利用者が必ず通る最初の経路。
- **推奨アクション**:
  1. FR を 1 件追加 — 「**登録フォルダは、対応するセッションが 0 件であっても `folder` グループとして一覧に現れなければならない**。グループの生成源は (登録フォルダ一覧 ∪ セッションから導出したグループ) である」
  2. data-model §5 に不変条件を追加 — 「`folder` グループは登録フォルダ一覧から seed し、セッションを後から流し込む。`sessions` が空でもグループを落とさない」
  3. FR-032 / SC-013 の空状態条件を **4 → 5 条件**に増やす。quickstart V-8 の表にも行を追加
  4. BE-015 の入力に登録フォルダ一覧を加え、`group.test.ts` に「登録フォルダ 3 件 / セッション 0 件 → `folder` グループ 3 件」を追加。SC-006 の総数保存とは衝突しない
  5. FE-064 のテスト条件を 4 → 5 条件に更新
- **根拠**: spec.md:44-45 / :78-79 / :132-135 / `docs/domains/session/charter.md:57-62` (Journey 1 step 1)
- **scope 根拠**: feature

---

### [High] SC-002 の計測経路が実行不能 — 所在を受け取る IPC が存在せず、`wsl -l -v` 比較では「発行 0 件」を反証できない (H-001) (scope: feature)

- **観察**: spec.md:383-386 の SC-002 は計測経路を「`wsl -l -v` の比較 **+ 停止中の所在の識別子で IPC を直接呼んで拒否されること**」と定め、US-3 AC-2 (spec.md:146) も同じ。しかし contracts/ipc-session-list.md:13-17 の追加メソッドは `listSessions()` / `refreshSessions()` / `fetchMoreSessions(targetKey, offset)` の 3 つで、**所在を引数に取るメソッドが 1 つも無い**。quickstart V-4 は `fetchMoreSessions('<停止中ディストロの targetKey>', 0)` で代替するが、(a) data-model.md:32-33 により `wsl:<D>` の `EnumerationTarget` は実行中確認済みの値がある場合しか作られず停止中所在の `targetKey` は通常存在しない、(b) contracts/ipc-session-list.md:34-37 は「既知の列挙対象に一致しない場合は**現在のキャッシュをそのまま返す**」= 「拒否」ではない、(c) `fetchMoreSessions` は `truncated: true` の対象限定であり実測 269 件では構成できない。この文言は R-1 の SC-005 (所在を引数に取る IPC が実在した) からの**引き写し**である。加えて `wsl -l -v` 比較は**効果**の観測であり、SC-002 が自ら宣言した**発行**を観測しない (research R-08 が「停止中への UNC アクセスが起動を引き起こすかは測定しない」と決めている以上、不変でも発行 0 件は導けない)。
- **同種事象探索**: `targetKey` → **7 件**。`targetKey` が DTO に載るのは `EnumerationOutcomeDTO` のみ。**停止中所在に対する拒否を renderer 入力として定義した行は 0 件** (contracts/ipc-session-list.md:152 の「所在」行は列挙対象の決定時 = 内部経路)
- **リスク/影響**: 本 feature で最も重い安全要件の受け入れ基準が、**gate で実行できない手順として書かれている**。SC-002 が実質チェックされないまま PASS しうる。
- **推奨アクション**:
  1. SC-002 の後半を実行可能な形に — 「プロセス起動レイヤとファイルアクセスレイヤを差し替えた Vitest で、`running` でない所在に対する UNC アクセス発行・`utilityProcess` 起動が **0 回**であることを assert する」(BE-061 / C-5 が既に振る舞いを定義済み)
  2. US-3 AC-2 を API 面に合わせて書き直し、contracts/ipc-session-list.md:34-37 に**停止中 target の戻り値**を明記する (現状「キャッシュをそのまま返す」と衝突)
  3. quickstart V-4 を、停止前に一度列挙してキャッシュを作る前提を含む形に書き直す
  4. `wsl -l -v` 比較は補助的な回帰確認として残し、主たる判定根拠から外す
- **根拠**: spec.md:383-386 / :146 / contracts/ipc-session-list.md:13-17,34-37,152 / data-model.md:32-33 / research.md:219-235 / specs/001-.../spec.md:477-479
- **scope 根拠**: feature

---

### [High] SC-004 の書き込み系 API 列挙が contracts C-4 より 2 件少なく、spec 自身が SC-010 で禁じた「一部列挙」を犯している (H-002) (scope: feature)

- **観察**: spec.md:389-392 SC-004 は走査対象を 5 件 (`renameSession` / `tagSession` / `deleteSession` / `importSessionToStore` / `query`) と列挙する。contracts/session-enumeration.md:105-108 C-4 は 7 件 (+ `forkSession()` / `startup()`)、tasks.md:197-200 SH-081 も 7 件。SC のみが 2 件少ない。同じ spec の SC-010 (spec.md:412-417) は「**行を 3 つだけ列挙する形にしない — 列挙すると同じ構造の残りが拘束を外れる**」とこのアンチパターンを禁じている。
- **同種事象探索**: `forkSession|startup\(\)|renameSession|importSessionToStore` → **7 件**。5 件列挙は spec.md:391 と research.md:209、7 件列挙は contracts C-4 と tasks SH-081。spec.md:476 は Out of Scope で `forkSession` を名指ししており**同一 spec 内で自己矛盾**。
- **リスク/影響**: SC-004 は FR-003 (読み取り専用) を測る唯一の SC。5 件走査で PASS すれば `forkSession` / `startup` は検証を素通りする。3 層で禁止されているため実装が破れる確率は低く Critical ではないが、検証の網羅性が要件より狭い。
- **推奨アクション**: SC-004 の列挙を C-4 と同一の 7 件に揃え、さらに「**contracts C-4 の表の各行**について呼び出し形が 0 件であること」と参照形に変える。research.md:209 も揃える。
- **根拠**: spec.md:389-392 vs contracts/session-enumeration.md:105-108 / tasks.md:197-200 / spec.md:412-417
- **scope 根拠**: feature

---

### [High] 「区別可能に示される」系の AC / FR に観測条件が無く、対応する SC も無い — R-1 の SC-006 から水準が後退 (H-003) (scope: feature)

- **観察**: `区別可能|区別して|区別され|旨が示される` → **13 件** (spec.md:67,75,77,88,119,148,150,303,305 ほか)。**いずれも「何が観測できれば合格か」を定義していない** (別ラベル/別グループ/別アイコン/別セクションのどれか)。quickstart も同語をチェックボックスで再掲するだけ。SC-001〜014 に**これらの提示を測る SC が無い** (SC-005 は `domain` 純粋関数の正しさ、SC-009 は文字化けと空要約、SC-013 は空状態)。R-1 は同じ問題に対し SC-006 で「越境と判定された組み合わせについて**例外なく**影響・推奨配置先・手順が提示される。計測経路: 解決関数のユニットテスト + preload をスタブした renderer 単体テスト」と**提示側の SC を持っていた**。R-2 の FR-023 は「越境である旨を**保持**」と保持どまり。
- **リスク/影響**: 本 feature の価値の中核は「4 種のグループと 3 値以上の状態を潰さずに見せる」ことであり、**区別が UI に届いたかが検証されない**なら `domain` で正しく分けても利用者には 1 つに見えうる。gate の判断が主観になる。
- **推奨アクション**:
  1. 観測条件を spec に定義 — 「各参照キー (`FailureReason` / `PendingReason` / `UnknownReason` / `CwdOriginKind` / `Boundary` / `SessionSource`) に対し、UI 上で互いに異なる日本語文言が 1 対 1 に存在すること」(FE-044 が既に「全値を網羅」と書いており追加コストなし)
  2. SC を 1 件追加 (R-1 SC-006 相当) — 「6 種の参照キーの**全値**について renderer 単体テストで互いに異なる文言が描画される。重複文言・未訳出の値が **0 件**」
  3. FR-023 を「保持」から「保持し、越境であることを一覧上で提示する」に強化
- **根拠**: spec.md:67,75,77,88,119,148,150,303,305 / quickstart.md:43,71,107 / specs/001-.../spec.md:484-485 / tasks.md:127-129
- **scope 根拠**: feature

---

### [High] US-2 の中核価値 (登録導線による循環の解消) に対応する SC が無い (H-004) (scope: feature)

- **観察**: US-2 の Why (spec.md:100-103) は「探す手段がないから登録できず、登録していないから見つからない、という**循環に落ちる**」を価値の根拠に置く。循環を断つのは FR-026 と US-2 AC-2 / AC-6。しかし SC-001〜014 に**登録導線の成立を測る SC が無い**。検証は quickstart V-2 の手動チェックと FE-053 のみ。
- **同種事象探索**: SC 本文で FR-026 / FR-027 / US-2 AC-2 / AC-6 を参照する行 → **0 件**。「対応する SC を持たない利用者可視 FR」を全 FR に照合 → **7 件** (FR-023 提示側 / FR-026 / FR-029 / FR-038 / FR-039 / FR-040 / FR-046)。
- **リスク/影響**: US-2 は **charter Journey 1 に存在しない範囲拡大**であり、拡大を正当化する唯一の根拠が「循環を断つ」という価値主張。その達成を測る基準が無いと、charter を書き換える判断の裏付けが「実装した」以上にならない。US-2 が P1 である根拠も測定不能。
- **推奨アクション**: SC を 1 件追加 — 「未登録の作業ディレクトリから登録に到達できる。導線を選ぶと当該作業ディレクトリと所在が初期値として入った R-1 の登録操作が開き、**導線を選ぶまでの登録件数の増加が 0 件**。登録後の再取得で当該グループが `folder` グループへ移る件数が **100%**。計測経路: renderer 単体テスト + quickstart V-2」
- **根拠**: spec.md:100-103,112-113,122-123,297-298 / plan.md:19-22,318-330 / charter.md:57-62
- **scope 根拠**: feature

---

### [High] US-4 が P2 でありながら、必須 SC-008 と `listSessions` の契約が US-4 のタスクに依存している (H-005) (scope: feature)

- **観察**: spec.md:162-168 は US-4 を P2 とする。しかし (a) SC-008「先頭 50 件 2 秒以内」は US 非依存の必須 SC で、その実現手段の 2 段取得は **BE-070 (US-4)** にしかない。(b) contracts/ipc-session-list.md:22-26 の `listSessions()` 契約 (「先頭ページを待って返す」「全件が揃った時点で通知」) は BE-070 の振る舞いそのもの。(c) data-model.md:265-294 の `partial → complete` 遷移と FE-071 (US-4) が正しさの条件。(d) SC-008 の計測タスク SH-074 も US-4 配下。**US-4 を落とすと P1 の US-1 が契約どおりに動かず、必須 SC-008 が未達になる**。
- **リスク/影響**: 優先度は「どこまでで出荷できるか」を表す情報。US-1〜US-3 完了でも gate を通らない構造で、P2 ラベルが意思決定に使えない。
- **推奨アクション**: (a) BE-070 / FE-071 を US-1 に移し、US-4 には並び順・絞り込み・追加取得 UI だけを残す。または (b) US-4 を P1 に引き上げ Why を「US-1 の契約を成立させる」に書き換える。あわせて US-4 の Why を charter KPI か SC-008 に接続する。
- **根拠**: spec.md:162-168,406-408 / contracts/ipc-session-list.md:22-26 / data-model.md:265-294 / tasks.md:180-188,237-245 / _overview.md:91
- **scope 根拠**: feature

---

### [High] SC-008 の性能予算が research 内部の測定値と矛盾し、700 件を測る経路が存在しない (H-006) (scope: feature)

- **観察**: SC-008 の根拠は research R-06 の「約 300 + 384 = 約 700 ms」。ところが同じ research の R-04 (research.md:135) は「**冷えた状態の子 Node プロセスで import + listSessions を 1 回通して 2,171 ms**」を実測。R-06 の内訳合計 1,200ms に対し実測 2,171ms で、差分約 1,000ms が「計測の外殻」としてのみ言及され、**production の `utilityProcess` 経路で消える根拠が示されていない**。素直に当てはめると先頭ページ約 1,600ms で 2 秒に対する余裕は約 0.4 秒。さらに (a) **700 件を実測する経路が bundle に無い** (開発ホストは 269 件、FE-073 の 700 件はスタブで I/O なし)、(b) 「先頭 50 件 2 秒」が**所在ごとか一覧全体か**未定義 (plan は所在 2〜5 / 列挙対象 2〜8 を想定し対象ごとにプロセスを起こす)。
- **リスク/影響**: 予算の根拠が 3 倍ぶれていると、gate で落ちたとき「環境のせい」と解釈されて骨抜きになる。測定単位が未定義だと同じ実装が測り方次第で合否両方になる。
- **推奨アクション**: (1) R-04 の 2,171ms と R-06 の 700ms の差分の内訳を明示するか R-04 ベースに置き換える。(2) SC-008 第 1 項に測定単位を書く (全所在合計を推奨)。(3) 第 2 項を「実測可能な最大件数 (現在 269 件) で全件 10 秒以内、かつ 50 / 100 / 269 件の 3 点で線形性を確認」に書き換える。(4) 「700 件は外挿値であり実測していない」を `[ASSUMED]` に明記。
- **根拠**: spec.md:406-408,463-466 / research.md:26-31,135,186-199 / quickstart.md:136-143 / tasks.md:186-188 / plan.md:93-100
- **scope 根拠**: feature

---

### [High] 再取得での「置き換え」規則が、所在の失敗時に直前まで見えていたセッションを消す (H-007) (scope: feature)

- **観察**: FR-035「再取得の結果はキャッシュを**置き換え**る」と FR-030「失敗は所在ごとに閉じ、成功した所在の結果を失わせない」は、**同一所在が成功→失敗に転じた場合**を規定していない。経路: 269 件表示 → ディストロ終了 (WSL の idle shutdown 含む) → 再取得 → その所在は 0 件 → 置き換え規則により **269 件が消える**。data-model.md:265-294 の遷移図は「`complete` かつ失敗つき」を持つだけで、**失敗した所在の前回結果の扱いを定めていない**。
- **同種事象探索**: 「置き換え|マージ」相当 → **4 件** (spec.md:321 / research.md:259 / data-model.md:291 / contracts/ipc-session-list.md:31)。いずれも成功時の置き換えを述べ、**失敗所在の前回結果に言及した記述は 0 件**。
- **リスク/影響**: まさに US-3 の Why が防ごうとした「セッションが消えた」体験。WSL は既定で約 8 分のアイドルで停止するため、**一覧を開いたまま放置 → 再取得**は日常的に踏まれる。
- **推奨アクション**: FR-035 に但し書きか FR 追加 — 「**再取得で失敗した所在については前回の取得結果と取得時刻を保持し、『この所在は再取得できなかった。表示は <時刻> 時点のもの』として提示する**。置き換えは成功した所在に限る」。FR-034 と整合し FR-002 にも反しない。data-model §7 に「所在単位の stale」を追加、US-3 に AC 1 件、SC-012 に追記。
- **根拠**: spec.md:311,321-322,132-135 / data-model.md:265-294 / Principle X / charter.md:98-99
- **scope 根拠**: feature

---

### [High] R-3 が着手するための入力が R-2 から出ていない — `SessionSummaryDTO` に由来列挙対象の参照キーが無い (H-008) (scope: feature)

- **観察**: spec.md:490-491 は「選択状態の配線まで」を持つとし、contracts C-8 は「R-3 は同じ列挙プロセス方式に載る (config ディレクトリの指定が同じ問題を持つ)」と申し送る。つまり R-3 は選択セッションが**どの `EnumerationTarget` に属するか**を知る必要がある。ところが `SessionSummaryDTO` が持つのは `targetLabel` だけで **`targetKey` を持たない**。同 contracts は `targetLabel` を「表示用の短い識別 (ユーザ名など)」と明記しており**一意性を保証しない** (2 ディストロに同名ユーザがいれば衝突)。`targetKey` が載るのは `EnumerationOutcomeDTO` のみでセッション行から辿れない。
- **同種事象探索**: `targetKey|targetLabel` → **12 件**。`SessionSummary(DTO)` 側に列挙対象への参照キーを持たせる記述は **0 件**。
- **リスク/影響**: R-3 着手時に IPC DTO の変更が必要になり、「選択状態の配線まで持つ」約束が機能しない。main 側で `sessionId → target` の対応表を持つ回避も、spec.md:206 の Edge Case「同一 UUID が 2 つの config ディレクトリに現れる」で一意に定まらない (H-009 と連鎖)。
- **推奨アクション**: `SessionSummaryDTO` / `SessionSummary` に `targetKey: string` を追加する。既に `EnumerationOutcomeDTO` で renderer に渡っている不透明な参照キーなので FR-042 にも「実体パスを渡さない」方針にも抵触しない。BE-018 と contracts を同時更新し、C-8 の R-3 行に「選択されたセッションの `targetKey` から列挙対象を引ける」を明記。
- **根拠**: spec.md:490-491,206 / contracts/ipc-session-list.md:84-90,93,132-137 / contracts/session-enumeration.md:169-176 / data-model.md:103
- **scope 根拠**: feature

---

### [High] 「同一 UUID が 2 つの config ディレクトリに現れる」Edge Case が全成果物で未処理 (H-009) (scope: feature)

- **観察**: spec.md:206 が Edge Case として挙げるが、FR / SC / data-model / contracts / tasks / quickstart のいずれにも扱いが無い。plan.md:255-257 / FE-041 は `ExternalStoreThreadListAdapter` を採り `threadId` は `sessionId` になる。**同一 `threadId` が 2 件並ぶと選択が一意に決まらず React の key も衝突する**。SC-001 は「識別子**集合**が一致」で測るため重複は集合演算で吸収され検知されない。SC-006 の総数一致も 2 件のまま通る。
- **同種事象探索**: `同一の識別子|重複|UUID` → **4 件**。**Edge Case の解決を述べた記述は 0 件**。
- **リスク/影響**: 見た目が同一の 2 行が並び、片方を選ぶと意図しない方が選ばれる。R-3 で別の会話が表示される (H-008 と連鎖)。
- **推奨アクション**: (a) 行の同一性を `(targetKey, sessionId)` の組で定義する (`cwdKey` が既に組キーを採っており規則が揃う)。または (b) 非目標として Out of Scope に移し理由を書く。(a) なら H-008 の `targetKey` 追加で同時に解決。SC-006 に「行の同一性キーの重複が 0 件」を追記するか SC-001 を「多重集合一致」に改める。
- **根拠**: spec.md:206,380-382,400-401 / plan.md:255-257 / tasks.md:116-119 / data-model.md:210
- **scope 根拠**: feature

---

### [Medium] SC-014 の観測対象が未定義で、FR-036 より狭く、C-5 の stderr ログと未調停 (M-001) (scope: feature)

- **観察**: FR-036 は「ディスクに永続化してはならない」。SC-014 は「**アプリの設定ディレクトリに**セッション由来のデータが残る件数が 0 件」で測る。(a) 具体パスが spec にも quickstart にも無く再現できない。(b) `os.tmpdir()` / ログ / `userData` 配下のキャッシュは観測範囲外で FR-036 より狭い。(c) contracts C-5 の「stderr は開発ビルドのログにのみ残す」と未調停 (stderr にはセッション由来の値が載りうる)。
- **推奨アクション**: SC-014 の観測対象を「`userData` 配下と OS の一時ディレクトリ」に広げ具体パスを quickstart V-5 に書く。C-5 に「stderr にセッションの要約・本文を含めない (パスと理由キーに限る)」を明記。
- **根拠**: spec.md:324-326,425-426,450-451 / contracts/session-enumeration.md:136 / quickstart.md:119-133
- **scope 根拠**: feature

---

### [Medium] `truncated` の利用者への提示要件が無く、打ち切りが「無い」に見える (M-002) (scope: feature)

- **観察**: contracts C-3 は「件数上限に達したら `truncated: true` を返す。黙って切らない」と定めるが、これは**プロセス間の返り値**の規定。spec 側で利用者にどう見えるかを要求する FR / AC / SC が無い。FR-038 は「追加取得の**手段**を持つ」だけで、打ち切られている旨の提示を求めていない。US-4 AC-2 は利用者が続きの存在を知っている前提に立つ。
- **推奨アクション**: FR-038 に「打ち切られていることと未取得の存在を一覧上で提示する」を追記し、SC に「`truncated: true` の対象について打ち切りの提示が描画される件数が 100%」を足す。BE-070 / FE-071 に対応 UI タスクを 1 件追加。
- **根拠**: spec.md:176,330 / contracts/session-enumeration.md:99 / data-model.md:233
- **scope 根拠**: feature

---

### [Medium] 絞り込み (FR-040) と所在ごとの失敗行の関係が未定義 (M-003) (scope: feature)

- **観察**: plan.md:246-253 の UI 構成は失敗行を「thread ではない。element の外側に置く」とするが、**絞り込み適用時に失敗行がどうなるか**の規定が無い。隠れるとその所在のセッションが「無い」ように見え (H-007 と同種)、常に出すと絞り込みの意味が薄れる。SC-013 は「絞り込み結果 0 件」のみを見て相互作用を見ていない。
- **推奨アクション**: FR-040 に「絞り込みは `SessionGroup` に適用し、所在ごとの状態の提示は隠すのではなく『絞り込みにより N 所在を非表示』として件数を残す」等の規則を加え、US-4 に AC を 1 件追加。
- **根拠**: spec.md:332,311-314,422-424 / plan.md:246-253
- **scope 根拠**: feature

---

### [Medium] US-2 の Why が「並行して走らせたセッション」を主張するが、本 feature は過去セッションの静的一覧である (M-004) (scope: feature)

- **観察**: US-2 の Why は「『並行して走らせたセッションの所在が分からない』課題に**直接答える**」とするが、Out of Scope は「実行中セッションの状態管理と監視ビュー → O-1。**本 feature は過去セッションの静的な一覧**」と明記し、FR-033 は自動更新を禁じる。charter Mission の課題文は**並行して走らせている最中**の所在把握を指す。
- **リスク/影響**: Why の主張が deliverable より広い。US-2 は charter 追記の人間承認にかかる範囲拡大であり、過大な主張のまま charter を書き換えると O-1 との責務境界が曖昧になる。
- **推奨アクション**: Why を「**過去に走らせたセッションのうち、登録していないフォルダのものがアプリから見えない**状態を解消する。循環を断つ」に言い換え、charter 追記文も同じ表現に揃え、実行中の俯瞰は O-1 の責務であることを 1 行添える。
- **根拠**: spec.md:35-36,100-103,317-318,479-480 / charter.md:22-23,73-77 / plan.md:19-22,318-330
- **scope 根拠**: feature

---

### [Medium] 利用者が区別すべき状態ラベルが最大 16 種に達するが、理解可能性の要件も検証も無い (M-005) (scope: feature)

- **観察**: グループ 4 種 + `FailureReason` 6 値 + `PendingReason` 3 値 + `UnknownReason` 3 値 + `CwdOriginKind` 6 値 + `Boundary` 3 値。「未列挙」「履歴なし」「失敗」「所在不明」「未検出の所在」「対応づけ保留」「未登録」「作業フォルダ不明」など**近接した語が 8 種以上**並ぶ。FE-044 は全値の訳出を求めるが、**読み分けられるかを測る要件が無い**。
- **推奨アクション**: (a) glossary 追加時に**近接 3 語 (所在不明 / 未検出の所在 / 対応づけ保留) の Counterexamples 欄**を必ず書く (既存 `Reachability` / `Browse session` が前例)。(b) 既定表示は 4 グループ見出しと 1 行サマリに留め、6 種の理由キーは詳細表示に送る (progressive disclosure) ことを plan の UI 構成に明記。(c) 見た目と文言の妥当性は `ux-reviewer` の範囲。
- **根拠**: data-model.md:136-137,198-204,235-242,341-353 / tasks.md:127-129 / spec.md:349-352 / glossary.md:196-206
- **scope 根拠**: feature

---

### [Medium] charter KPI「列挙の網羅」を測る SC-001 が 1 台の手動 quickstart のみに依存し、SH-089 が未実施行を無条件に許す (M-006) (scope: feature)

- **観察**: SC-001 は「Vitest + quickstart」で測るが、Vitest では実データを扱えないため実質 quickstart V-1 の手動突き合わせ 1 本。quickstart.md:17-19 と SH-089 は「踏めなかった行を記録する」のみで、**最低限踏むべき行の下限が定義されていない**。`[USER]` 判断で E2E を M4 後に送った結果、charter KPI の計測経路の代替が作者 1 人の環境でしか実行できない手動手順になっている。
- **リスク/影響**: KPI の達成判定が再現不能。`quickstart-results.md` に「踏めなかった」と書くだけで Critical 項目を回避できる。E2E 延期自体は `[USER]` 確定で妥当だが、**代替手段の下限が無い**点が残余リスク。
- **推奨アクション**: SH-089 に受け入れ条件 — 「**両所在にそれぞれ履歴があるホストで実施すること**を SC-001 の前提とし、満たせない場合は人間判断で明示的に免除する。V-3 の #5 (`unknown-location` が推測で埋められていない) は**免除不可**」。quickstart V-3 に「必須行 / 免除可の行」の区別を書く。
- **根拠**: spec.md:380-382,440-446 / quickstart.md:17-19,75-91 / tasks.md:221-222 / charter.md:110-114 / plan.md:301-316
- **scope 根拠**: feature

---

### [Medium] `[USER]` の thread-list element 前提が、剥がしたあとに何が残るか不明で価値を測れない (M-007) (scope: feature)

- **観察**: `[USER]` は「thread-list 系 element を**土台**にする」とし、grouping / search を使わず、plan はさらに rename / archive / delete / New conversation を外す。残るのは `ThreadListPrimitive` の描画骨格のみ。**何の価値が element 由来で保たれるのか**が spec にも plan にも書かれていない。
- **リスク/影響**: `[USER]` 確定事項は以後の gate で争えない拘束になる。便益が言語化されていないと、実装中に「element を使うコストのほうが高い」と分かっても撤回判断ができない。
- **推奨アクション**: `[USER]` の記述に**残す価値**を 1 行足す (例: 「選択状態の管理と `ExternalStoreThreadListAdapter` の契約を R-3 / X-1 と共有するため」)。plan の「理由を PR に記載する」に**撤回条件**を書き添える。
- **根拠**: spec.md:436-439 / plan.md:148-153,243-264 / Principle XIII
- **scope 根拠**: feature

---

### [Medium] FR-039 / FR-040 / FR-046 に対応する SC が無い (M-008) (scope: feature)

- **観察**: FR-039 (並び順の既定) / FR-040 (絞り込み) / FR-046 (日本語第一言語・内部識別子をそのまま提示しない) に対応する SC が無い。検証は FE-072 / FE-073 / FE-044 のみ。特に FR-046 は**禁止**であり SC-009 では測れない。
- **推奨アクション**: H-003 で提案する SC に FR-046 の禁止側 (「参照キーの生値が描画される件数が 0 件」) を統合する。FR-039 / FR-040 は SC-013 に 1 文追記すれば足りる。
- **根拠**: spec.md:331,332,351-352 / tasks.md:127-129,184-186
- **scope 根拠**: feature

---

### [Low] 再取得の導線 (UI アフォーダンス) を要求する FR が無い (L-001) (scope: feature)

- **観察**: FR-033 は自動更新を禁じるが、明示操作の**手段**を提供せよという FR が無い。US-1 AC-10 は手段の存在を前提にし、contracts は `refreshSessions()` を定義するが、UI 側の導線を求める記述が tasks にも無い。
- **推奨アクション**: FR-034 に「取得時刻の近傍に再取得の導線を置く」を追記し FE-043 に含める。
- **根拠**: spec.md:80-81,317-320 / contracts/ipc-session-list.md:28-32
- **scope 根拠**: feature

---

### [Low] US-4 の Why が charter KPI に接続していない唯一のストーリーである (L-002) (scope: feature)

- **観察**: US-1 / US-3 は KPI「列挙の網羅」に、US-2 は課題文に接続する。US-4 のみ接続が無い。charter には「並列時の滑らかさ」という性能系 KPI がある。
- **推奨アクション**: US-4 の Why に SC-008 または KPI「並列時の滑らかさ」への接続を 1 行足す (H-005 と同時に)。
- **根拠**: spec.md:167-168 / charter.md:109
- **scope 根拠**: feature

---

### [Low] US-1 の Independent Test が特定ホストの実データに依存し、他者が再現できない (L-003) (scope: feature)

- **観察**: US-2 / US-3 / US-4 の Independent Test はスタブ / 差し替えで閉じているのに対し、US-1 だけがホスト依存。M-006 と同根。
- **推奨アクション**: US-1 の Independent Test に「スタブによる検証を第一とし、実データ突き合わせは quickstart の補強とする」を明記する。
- **根拠**: spec.md:53-55,105-107,136-140,170-172
- **scope 根拠**: feature

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | `履歴がない\|0 件の登録フォルダ\|登録フォルダ 0 件\|まだ履歴` | 7 件 (フォルダ単位を扱うのは 1 件、spec.md 以外では **0 件**) | spec.md:78,79 / :150 / :213 / :315 / :422 / quickstart.md:169 |
| C-001 | `WorkspaceFolder\|folderId\|登録フォルダ(の)?一覧` | 6 件 (group 生成源とする記述は **0 件**) | data-model.md:9,131,200,329 / contracts/ipc-session-list.md:78 / spec.md:121 |
| C-001 | FR-032 / SC-013 に「フォルダ単位 0 件」が含まれるか | **0 件** | spec.md:315-316, :422-424 |
| H-001 | `targetKey` | 7 件 (停止中所在を renderer 入力として拒否する定義は **0 件**) | contracts/ipc-session-list.md:17,36,93,149,160 / quickstart.md:112 / tasks.md:103 |
| H-002 | `forkSession\|startup\(\)\|renameSession\|importSessionToStore` | 7 件 (5 件列挙 2 箇所 / 7 件列挙 2 箇所の不一致) | spec.md:391 / research.md:209 / contracts/session-enumeration.md:107-108 / tasks.md:198-199 / spec.md:476 |
| H-003 | `区別可能\|区別して\|区別され\|旨が示される` | 13 件 (観測条件の定義・対応 SC はいずれも **0 件**) | spec.md:67,75,77,88,119,148,150,303,305 / quickstart.md:43,71,107 / tasks.md:148 |
| H-004 | SC 本文で FR-026 / FR-027 / US-2 AC-2・AC-6 を参照する行 | **0 件** | spec.md:380-426 |
| H-007 | 「置き換え」規則で失敗所在の前回結果に言及する記述 | 4 件中 **0 件** | spec.md:321 / research.md:259 / data-model.md:291 / contracts/ipc-session-list.md:31 |
| H-008 | `targetKey\|targetLabel` | 12 件 (`SessionSummary(DTO)` 側に参照キーを持つ記述は **0 件**) | contracts/ipc-session-list.md:17,36,89,93,132,135,149,160 / data-model.md:103 / quickstart.md:112 / plan.md:212 / tasks.md:103 |
| H-009 | `同一の識別子\|重複\|UUID` | 4 件 (Edge Case の解決を述べた記述は **0 件**) | spec.md:206,468 / data-model.md:92,210 |

## Verdict

- Critical: 1
- High: 9
- Medium: 8
- Low: 3

**PO 観点の総括**: bundle の水準は R-1 と同等かそれ以上で、「3 値・4 値を潰さない」設計判断とその根拠の言語化、実測の spec への反映、上流申し送り 4 件の明示処理、`[USER]` / `[ASSUMED]` の分離は模範的である。指摘の大半は「**設計上正しく分けたものが、利用者に届いたことを測る基準が無い**」という一点に収斂する — 区別の提示 (H-003)、登録導線 (H-004)、打ち切りの提示 (M-002)、日本語ラベル (M-008) はいずれもこの型。C-001 (履歴 0 件の登録フォルダが消える) と H-007 (失敗所在の前回結果が消える) は、spec 自身が US-3 の Why で宣言した「セッションが消えたに見せない」原則が**所在単位では守られ、フォルダ単位と再取得時には守られていない**という同じ穴の 2 つの現れであり、併せて修正することを勧める。H-005 (US-4 の P2 が実態と食い違う) と H-008 (R-3 への入力不足) は範囲の線引きに直接関わるため design-gate での判断が要る。charter Journey 1 への US-2 追記は妥当だが、H-004 の SC を追加してから人間承認にかけるべきである。
