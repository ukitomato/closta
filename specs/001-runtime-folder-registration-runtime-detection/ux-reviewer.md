# ux-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Round**: 2 (pr-gate)

> **本ファイルの保存経緯**: `ux-reviewer` は `reviewer-base.md` §Adversary 共通 5 により
> `Read` / `Glob` / `Grep` のみを持ち `Write` を持たない。reviewer の最終報告を pr-gate が保存した。

---

## 0. 前提確認 — 直近 3 コミットは `src/renderer/` を触っていない

`Bash` を持たないため `git diff` を直接実行できない。代わりに**前回指摘した行番号が 1 つもずれていないこと**を全件照合して裏を取った。

| 前回の参照 | 現在の実体 | 一致 |
|---|---|---|
| `useFolders.ts:95` `:104` `:128` `:151` `:174` `:197` | `beginBrowse` の `await capability().beginBrowse` / `browseDirectory` / `move` の `await` / `registerFolder` / `unregisterFolder` / `pickHostFolder` | **6/6 完全一致** |
| `useFolders.ts:82` が唯一の `catch` | 同じ (`load()` の `.catch`) | 一致 |
| `ChatScreen.tsx:53` の `throw` | `throw new Error('composer は R-1 では無効である (isDisabled が効いていない)')` | 一致 |
| `thread.aui.tsx:224` `:238` `:280` `:285` | `tooltip="Scroll to bottom"` / `How can I help you today?` / `placeholder="Send a message..."` / `aria-label="Message input"` | **4/4 完全一致** |
| `grep 'unhandledrejection\|ErrorBoundary\|componentDidCatch\|window.onerror\|getDerivedStateFromError' src/` | **0 件** | 一致 |

**前提は正しい。** renderer は Round 1 以降 1 行も変わっていない。したがって H-001 / H-002 / H-003 / M-001〜M-005 / L-001〜L-004 は**全件未解消**である。以下では再掲を避け、(1) pr-gate として新たに見えたもの、(2) 依頼された 3 点の判定に絞る。

ただし **`cfec16b` は renderer を触っていないのに H-001 の危険を増やしている** — 詳細は H-001 の「追加事実」に記す。

## 初回読了 viewpoint

- FR/SC (本 track の範囲): FR-009 / FR-013 / FR-017 / FR-018 / FR-019 / FR-025 / FR-028 / FR-030 / FR-031 / FR-039 / FR-047 / SC-002 / SC-004 / SC-006 / SC-007 / SC-013 / SC-015
- touched files に該当する charter / Confirmation: `docs/domains/ui/charter.md` 業務ルール「日本語で破綻しない操作体験」「assistant-ui の design system に乗る」/ `docs/domains/runtime/charter.md` / Constitution **Principle VIII の Verification: Manual = `ux-reviewer` / `a11y-reviewer`** (R-1 ではこの矛盾を止める機械経路が存在しない)
- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の Owner 範囲。renderer に認証 UI なし
- B. 入力検証 / injection / 暗号: 該当なし: 同上
- C. 業務不変条件 / Charter drift: 該当なし: `architecture-reviewer` の Owner 範囲
- D. Constitution / ADR drift: 該当なし: 同上 (Principle VIII の Manual 担当分は G に計上)
- E. User Story 価値 / SC / AC: 該当なし: `po-reviewer` の Owner 範囲
- F. 命名 / module / lint hookup: 該当なし: `convention-reviewer` の Owner 範囲
- G. UX state (empty / error / loading / i18n / IA / feedback): Critical:0 High:4 Medium:6 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

pr-gate Round 2 として renderer 全域 (4 画面 / 2 hook / 3 共通 state 部品 / `thread.aui.tsx` / シェル) を再読し、さらに **reject が実際に発生する経路を main 側から renderer まで通して追跡**した (`folder-store.ts` → `folder-service.ts` → `ipc.ts` → `preload/index.ts` → `useFolders.ts`)。code-gate iteration 2 では renderer 側だけを見て「reject の受け皿が無い」と述べたが、pr-gate では**反対側の端から reject が設計上の応答形であることを確認**した。

結論: **Critical 0 件を維持する。** H-001 は Critical の定義 (サービス停止に直結) を満たさないと判定した — 判断根拠は下に全部書いた。代わりに **empty / loading / error の 3 状態が 2 画面で同じ表示に潰れている** という新規 High 1 件を出す。これは前回見落としていたもので、**異常系ではなく毎回の正常系で偽の文言が出る**点で H-001〜H-003 より発生頻度が高い。

---

## 1. 依頼事項 1 — H-001 は pr-gate の Critical か

**判定: Critical ではない。High を維持する。**

`reviewer-base.md` の Critical は「ユーザデータ漏洩 / なりすまし / 権限昇格 / **サービス停止に直結** / accepted ADR drift」に限定されている。「利用者が操作を完了できない = サービス停止に相当するか」を実装で検証した結果、**相当しない**。

### Critical を否定する観察事実 (3 点)

1. **`move` の永久ローディングは操作を封鎖していない。** `WorkspaceFoldersScreen.tsx:349-361` は `loading` 中に `aria-busy` と `opacity-50` を付けるだけで、**`disabled` を一切付けない**。`:362-460` の「ルートへ」「親へ」「項目ボタン」「ここを登録する」はすべて mount されたままクリック可能である (iteration 1 でフォーカス喪失を直した際に骨格を残す形にしたのが、結果的にここで効いている)。`entries` / `cwd` は `lastOk` 由来なので直前の階層が残り、**`ここを登録する` は押せる**。つまり US-2 の中核操作は完了できる。
2. **常時見える離脱口がある。** `閉じる` (`:336-338`) は `aria-busy` の `div` (`:349`) の**外側**にあり、`disabled` も付かない。押せば `closeBrowse` が `browse` と `lastError` を落とし、やり直せる。加えて `App.tsx:31` は active な 1 画面しか mount しないため、**タブを切り替えるだけで hook の state ごと破棄される** (これは L-001 系の欠点として前回書いたが、可用性の面では脱出経路になっている)。
3. **データを壊さない。** reject するのは書き込みが失敗したときであり、`folder-store.ts:165-168` は一時ファイル + `rename` を使う。破損の可能性は pr-gate Round 1 の **H-Q (database owner)** が扱っており、本 track の H-001 は「失敗が伝わらない」ことだけを問う。

### それでも High 上限である積極的な理由

`reviewer-base.md` §Severity 判定の禁則が「現時点では機能しているが、防御を厚くすべき」という defensive coding 提案を **High 上限**と明記している。H-001 は「正常系は動き、異常系に受け皿が無い」形であり、この規定に正面から当たる。ここを Critical にすると `cascade_enforce` で降格されるだけでなく、C-001 / C-002 (実測された ADR drift) と同じ段に並べることになり severity 体系が歪む。

### 追加事実 (Round 間の情報更新。格上げには使わない)

前回は「reject は起こりうる」と書いただけだった。pr-gate では **reject が設計上の正規応答であること**を反対側の端から確認した。これは severity を上げる材料ではないが、**High を「後回し可」と読ませないための材料**として記録する。

- `src/main/app/ipc.ts:71-81` — `handle()` は信頼できない送信元に `throw new Error('rejected')` を返す。コメントは **「応答を返さない形にすると renderer が待ち続ける」** と明記しており、**main は renderer が reject を受け取って処理することを前提に reject を選んでいる**。その前提が renderer 側に 5 経路で存在しない。
- `src/main/app/folder-service.ts:370` / `:392` — `await store.save(folders)` に `catch` が無い。`src/main/infra/settings/folder-store.ts:156-168` の `mkdir` / `writeFile` / `rename` にも `catch` が無い。**ディスク書き込み失敗は `registerFolder` / `unregisterFolder` の reject としてそのまま renderer に届く。**
- **`cfec16b` (直近 3 コミットの 1 つ) は renderer を触っていないが、reject 可能経路を 1 本増やしている。** `randomUUID` を `folder-service` から追い出して `composition-root.ts:80` の `newId` 注入にした結果、`folder-service.ts:212` の `makeFolderId(newId)` は `src/domain/workspace/registry.ts:67` の `throw new Error('乱数源が短すぎる')` に依存するようになった。現在の注入値 (`randomUUID().replace(/-/g,'')`) は契約を満たすので発火しないが、**登録経路の throw 可能点が注入の正しさに依存する形へ移った**のに、その throw の受け手は依然 0 件である。
- したがって `register` (`useFolders.ts:151`) の未捕捉 reject は「IPC が落ちたとき」だけの話ではなく、**ディスク満杯 / 権限 / 注入ミス**で起きる。利用者が見るのは「ここを登録する」を押しても一覧が増えず、`setDisplayName('')` (`WorkspaceFoldersScreen.tsx:454`) も走らないので**入力欄に打った表示名だけが残る画面**である。エラー文言は 1 文字も出ない。

### 結論

**H-001 は High。ただし Round 2 でも未解消であり、これで 3 周目になる。** `.specify/spec-gate` の severity 写像では SHOULD_FIX に落ちるが、gate は「3 iteration 連続で同一指摘が SHOULD_FIX のまま残っている」事実を `pr-gate.md` に記録すべきである。修正は `useFolders.ts` の 5 経路に `try/catch` を入れて `labels.ts` に 1 行足すだけで、実装の作り変えを伴わない。

## 2. 依頼事項 2 — H-002 の白画面リスク

**判定: High を維持する。ただし前回の「推奨アクション」に技術的な誤りがあったので訂正する。**

### 訂正: error boundary は `ChatScreen.tsx:53` の `throw` を捕まえない

React の error boundary が捕まえるのは **render / lifecycle / constructor 中の例外**だけで、**イベントハンドラ内の例外は捕まえない**。`ChatScreen.test.tsx:43` が

```ts
expect(() => fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })).not.toThrow()
```

と**同期的に throw を観測できる形**でテストを書いていることが、この `onNew` が同期のイベントハンドラ経路で呼ばれる証拠である。したがって前回 H-002 の推奨アクション「`App.tsx` を error boundary で包む」だけでは **`ChatScreen` の `throw` には一切効かない**。効くのは `window.onerror` / `unhandledrejection` の側である。この訂正なしに前回の推奨をそのまま実装すると、**「対処した」という記録だけが残って白画面は残る**。

### 白画面の実発生確率は低い — が、それは H-002 が軽いという意味ではない

render 中に落ちる箇所を全数探した結果、**現実的な crash 経路はほぼ無い**:

- `BLOCKED_LABELS[...]` / `RESOLUTION_STEP_LABELS[...]` / `UNREACHABLE_LABELS[...]` / `RESTORE_ISSUE_LABELS[...]` / `ENUMERATION_ISSUE_LABELS[...]` はいずれも未知キーで `undefined` を返し、React は何も描かない (**crash しない。代わりに文言が黙って消える** — これは H-004 と同じ「黙って嘘をつく」系の欠陥だが crash ではない)
- `WorkspaceFoldersScreen.tsx:448` の `cwd.value.split('/')` は `cwd === null` ガードの内側
- `:451` の `folders.browse!.location` はパネル描画中のみ到達する
- `main.tsx:7` の `document.getElementById('root')!` は起動時 1 回のみ

**つまり H-002 の実体は「白画面」ではなく「非同期失敗の最後の受け皿が存在しない」ことである。** そしてその受け皿が要る理由は H-001 の 5 経路 (+ `pickHostFolder` を `await` する `WorkspaceFoldersScreen.tsx:272`) が**未処理 rejection を毎回そこへ流し込む**からである。H-001 と H-002 は独立した 2 件ではなく、**同一の穴の内側と外側**である。

### 推奨アクション (訂正版)

1. `main.tsx` に `window.addEventListener('unhandledrejection', ...)` と `window.addEventListener('error', ...)` を 1 本ずつ置き、日本語 1 行のバナー (「操作を実行できませんでした。アプリを再起動してください」) を出す。**これが `ChatScreen` の `throw` と H-001 の 5 経路の両方に効く唯一の手**である。
2. error boundary は別途 `App.tsx` に置く価値がある (将来の render crash 用) が、**H-002 の解消条件に数えてはならない**。数えると (1) を実装せずに閉じられてしまう。
3. `ChatScreen.tsx:53` の `throw` は維持する。受け皿ができれば「退行が見える」と「利用者が詰まらない」が両立する。

## 3. 依頼事項 3 — 開発者向け変更が利用者体験に影響しないことの確認

**確認できた。利用者体験への影響は 0 件である。** 根拠:

| 変更 | 検証 | 結果 |
|---|---|---|
| `test:rules` の所要時間増 (`ca6f2ce` fixture の個別検証) | `scripts/` は出荷物に含まれず、renderer / main の実行経路から参照が無い | **影響なし** (CI 時間のみ) |
| 診断出力の追加 | `grep -n 'console\.(log\|warn\|error\|info\|debug)' src/` → **1 件のみ** = `src/main/app/measure.ts:86` | `createMeasure(enabled)` は `:68` で `if (!enabled) return (_point, run) => run()` と早期に無効化され、`composition-root.ts:53` が `createMeasure(isDevBuild())` を渡す。**出荷ビルドでは 1 行も出ない** |
| `cfec16b` の `newId` 注入 | `folder.id` は `WorkspaceFoldersScreen.tsx:497` の React `key` と `duplicateOfId` 照合に使われる。`composition-root.ts:80` の `randomUUID().replace(/-/g,'')` は `registry.ts:53` の `/^wf_[0-9a-z]{8,32}$/` を満たす | **表示・重複ハイライトに影響なし**。ただし reject 可能点が 1 本増えた (→ H-001 の追加事実) |

`measure.ts:81-85` が予算のない計測点に「SC-004 の予算なし。内訳の観測用」と書き分けている点は、**開発者向け出力でありながら誤読を防ぐ設計**として妥当である。

---

## Findings

### [High] `useFolders` の capability 呼び出しに reject の受け皿が 1 件もない (H-001) (scope: feature) — **Round 1 から未解消 / High 維持**

前回 (`ux-reviewer.md` H-001) から観察・リスク・推奨アクションは変わらない。`useFolders.ts:95` `:104` `:128` `:151` `:174` `:197` の 6 経路、`catch` は `:82` の 1 件のみ。**§1 に Critical 判定の全根拠と追加事実 3 点を記した。** 推奨アクションも前回のまま (5 経路を `try/catch` で包み `labels.ts` に `transport-failed` を 1 行足す)。

### [High] error boundary / `unhandledrejection` が 0 件のまま意図的な `throw` だけ増えた (H-002) (scope: feature) — **Round 1 から未解消 / High 維持・推奨アクション訂正**

`grep 'unhandledrejection|ErrorBoundary|componentDidCatch|window.onerror|getDerivedStateFromError' src/` → **0 件** (Round 2 でも再実測)。**§2 に白画面リスクの実測評価と、前回の推奨アクションの技術的誤りの訂正を記した。** 解消条件は「error boundary を置いた」ではなく **`unhandledrejection` / `error` リスナを置いた**ことである。

### [High] 未接続を日本語で告知した直後に英語の chat UI が主見出しとして出る (H-003) (scope: feature) — **Round 1 から未解消 / 同種事象の件数を訂正**

- **観察**: `ChatScreen.tsx:64-75` のバナー (日本語で「入力はできません。」) の直下に `thread.aui.tsx:238` の `<h1>How can I help you today?</h1>` が出る。変化なし。
- **同種事象探索 (訂正)**: 前回は 4 件と報告したが、`grep -E '(tooltip|aria-label|placeholder|title)="[A-Za-z][A-Za-z ,.?!-]+"' src/renderer/src/components/` で **28 件 / 5 ファイル**である。内訳: `thread.aui.tsx` **17 件** (前回挙げた 4 件 + `:309` `Start voice input` / `:324` `Stop voice input` / `:340` `Send message` / `:353` `Stop generating` / `:460` `Assistant is working` ほか)、`attachment.aui.tsx` 3 件、`image.tsx` 6 件、`markdown-text.tsx` 1 件、`empty-state.tsx` 1 件 (`:95` `aria-label="Send"`)。`ChatScreen` が `Thread` を mount する時点で **`thread.aui.tsx` の 17 件と `attachment.aui.tsx` の 3 件が画面に乗る**。前回の「4 件」は過少申告だった。
- **`empty-state.tsx:95` は現状 dead** — `EmptyStateComposer` / `EmptyStateGreeting` / `EmptyStateSuggestion*` の利用は `grep 'EmptyState'` で **0 件** (3 画面が使うのはコンテナの `EmptyState` のみ、中身は日本語)。**FR-047 上の実害は無い**ので H-003 の対象からは外す。
- 推奨アクションは前回のまま (`ThreadProps.components.Welcome` の差し替え + placeholder / aria-label の prop 化)。

### [High] empty / loading / error の 3 状態が 2 画面で「登録がありません」に潰れ、毎回の正常系で偽の文言が出る (H-004) (scope: feature) — **新規**

- **観察**:
  - `ResolutionScreen.tsx:169-175` は `folderList` / `runtimeList` を `folders.list` / `runtimes.list` から導き、`hasPairs = folderList.length > 0 && runtimeList.length > 0` を作る。`:245` の `if (!hasPairs)` は **loading チェックより前**にあり、`:250-256` で `EmptyState` に **「登録された作業フォルダがありません。」「『作業フォルダ』画面で所在を選んで登録してください。」** を描く。
  - `folders.list` / `runtimes.list` は読み込み中 `null` である (`useFolders.ts:69` / `useRuntimes.ts` の初期値)。したがって **`listFolders` が解決するまでこの偽の空状態が出る**。`App.tsx:31` は active な 1 画面しか mount しないため、**「組み合わせ」タブを開くたびに毎回**起きる。`measure.ts:47-58` は `list-folders` に SC-004 の予算を置いていない (= 秒単位を許容している) 経路である。
  - さらに `ResolutionScreen` は **`folders.failed` を一度も読まない** (`grep 'folders\.failed' src/renderer/src` → **1 件**、`WorkspaceFoldersScreen.tsx:226` のみ)。`runtimes.loadState` も読まない (`grep 'loadState'` → `useRuntimes.ts` と `RuntimeListScreen.tsx:163` のみ)。**`listFolders` が失敗すると「登録された作業フォルダがありません」が恒久的に表示される。** 利用者は登録済みのフォルダが消えたと読み、指示どおり「作業フォルダ」画面へ行くと (そちらは `:226` で `ErrorState` を出すので) **2 画面が別のことを言う**。
  - 同型が `WorkspaceFoldersScreen.tsx:393-397`。`entries` は `lastOk` 由来 (`:249`) なので、**初回ブラウズ中は必ず `[]`** である。結果 `loading: true` の最中に **「このフォルダには項目がありません。」** が描かれる。`beginBrowse` が `{ ok: false }` を返した場合 (`useFolders.ts:112`) は `cwd` が `—` (`:341`) のまま**この偽の文言とエラー文 (`:470` の live region) が同時に並ぶ**。`beginBrowse` が reject した場合 (H-001) は **エラー文が出ないので、利用者が受け取る唯一の情報が偽の文言になる**。
- **同種事象探索**: `grep -n 'length === 0' src/renderer/src/features/` → **6 件**。うち **状態を潰しているのは 2 件** (`ResolutionScreen.tsx:250` + `:245` のガード、`WorkspaceFoldersScreen.tsx:393`)。**正しく分離できている 2 件が同じ diff 内に在る** — `WorkspaceFoldersScreen.tsx:479-492` は `list === null` → `GenerationLoader` / `length === 0` → `EmptyState` を分け、`RuntimeListScreen.tsx:163-182` は `loadState === 'failed'` → `ErrorState` / `list === null` → loader / `length === 0` → `EmptyState` の 3 段に分けている。**同じ人が同じ diff で正解を書いているのに、2 画面でそれが適用されていない。** 残り 2 件 (`ResolutionScreen.tsx:187` / `:307`、`RuntimeListScreen.tsx:57`) は判定後の値を見ているので該当しない。
- **リスク/影響**: H-001〜H-003 が異常系の欠陥であるのに対し、**これは正常系で 100% 再現する**。US-3 の入口で最初に読まれる文が偽であり、しかも**実行すると何も解決しない指示 (CTA)** を伴う。「登録済みなのに『登録してください』と言われる」は、利用者が自分の登録が失われたと判断して**登録し直す → 重複拒否される**という無駄な往復を作る (その重複経路自体は SF-008 で丁寧に作られているのに、ここで不要に踏ませる)。FR-028 は「理由と次に取るべき操作を提示」を求めており、**理由が偽なら次の操作も偽になる**。SC-013 (復元できなかった件数と理由の提示) が守ろうとしている「黙って消さない」の裏返し — 消えていないものを「無い」と言っている。
- **Critical にしない理由**: 画面は操作可能で、他タブへ移動でき、データは失われない。`reviewer-base.md` の Critical 列挙 (漏洩 / なりすまし / 権限昇格 / サービス停止) に当たらない。H-001 と同じ基準を適用した。
- **推奨アクション**:
  1. `ResolutionScreen` の `:245` の前に 2 段を足す。`folders.failed || runtimes.loadState === 'failed'` → 既存の `ErrorState` (title「組み合わせの前提を読み込めませんでした」/ `onRetry` = `reevaluate`)。`folderData === null || runtimeData === null` → 既存の `GenerationLoader label="読み込んでいます"`。**`hasPairs` の判定は両方が非 null のときだけ行う。**
  2. `WorkspaceFoldersScreen.tsx:393` の空行を `folders.browse.loading || lastOk === null` のときは出さない (loading 中は loader のみ、`lastOk === null` の失敗時はエラー文のみ)。
  3. 回帰テストを 2 本。`ResolutionScreen.test.tsx` に「`listFolders` が未解決のあいだ『登録された作業フォルダがありません』が出ないこと」、「`listFolders` が reject したとき `ErrorState` が出ること」。`test-support/capability.ts:13-24` の基盤がそのまま使える。
- **根拠**: FR-028 / FR-019 / SC-013 の精神 (状態を潰さない) / `docs/domains/ui/charter.md` §業務ルール / Constitution Principle VIII の Manual 検証
- **scope 根拠**: feature の touched files (`ResolutionScreen.tsx` / `WorkspaceFoldersScreen.tsx`) 内で直接修正可能

### [Medium] 登録成功に確認フィードバックが無く、拒否されたときのほうが強いフィードバックを持つ (M-006) (scope: feature) — **新規**

- **観察**: `useFolders.ts:152-156` の成功時は `setBrowse(null)` (= ブラウザパネルが消える) と `load()` だけで、**成功を名指す表示が無い**。一方 `:165` の重複拒否時は `duplicateOfId` を立て、`WorkspaceFoldersScreen.tsx:130` の `ring-2` と `:133-137` の「このフォルダは既に登録されています。」と `:118-121` の `scrollIntoView` が動く。**拒否 > 成功のフィードバック量**という逆転が起きている。
- **リスク/影響**: 登録済み一覧が長いと、成功時に利用者が見るのは「パネルが突然消えた」ことだけである。`閉じる` を押した場合と**見分けがつかない**。新しいエントリは一覧の末尾 (`:495` の `map` はストア順) に増えるが、折り返しの下なら視界に入らない。live region (`:470`) は `errorText` が `null` のとき `empty:hidden` で潰れるため、支援技術にも成功が通知されない。
- **推奨アクション**: 成功時にも `duplicateOfId` と同じ仕組みを使う (例: `lastRegisteredId` を立てて `highlighted` と同じ `ring` + `scrollIntoView` + 「登録しました」の 1 行)。既存部品の再利用だけで済み、新しい toast 機構は不要である。live region に「『<表示名>』を登録しました」を 1 回流せば通知カテゴリも揃う。
- **根拠**: FR-013 / 操作結果のフィードバック (200ms 超の操作と状態遷移に確認を与える)
- **scope 根拠**: feature の touched files 内

### [Low] `RuntimeListScreen` の空状態が到達不能で、CTA も無い (L-005) (scope: feature) — **新規**

- **観察**: `RuntimeListScreen.tsx:210-213` の `EmptyState`「ランタイムが見つかりませんでした。」。直上 `:200` のコメント自身が **「`win32` が必ず 1 件返るので下の空状態には到達しない」** と述べている。
- **リスク/影響**: 実害は無い (到達しないので利用者は見ない) が、**到達しないと分かっている分岐の文言が「次の操作」を持たない状態で残っている**。将来 `host` の列挙が失敗しうる形に変わったとき、利用者は理由も次の操作も無い 1 行を見る。`WSL_AVAILABILITY_LABELS` の告知 (`:204-208`) が「WSL 無し / 列挙失敗 / 0 台」を区別するために追加されたのと同じ配慮が、この分岐には無い。
- **推奨アクション**: 分岐を消して「到達しない」ことをコメントに残すか、残すなら「再検出」への CTA を 1 行足して他の 3 つの空状態 (`WorkspaceFoldersScreen.tsx:488-492` / `ResolutionScreen.tsx:249-265` / `:308-315`) と同じ「理由 + 次の操作」の 2 段構成に揃える。
- **根拠**: 一貫性 (4 つの空状態のうち 1 つだけが CTA を欠く) / FR-028
- **scope 根拠**: feature の touched files 内

---

## 4. Round 1 (= code-gate iteration 2) 指摘の解消状況 — 全 12 件

renderer が未変更のため **12 件すべて未解消**である。再掲は避け、状態と Round 2 での更新点のみ記す。

| ID | 内容 | 状態 | Round 2 での更新 |
|---|---|---|---|
| H-001 | `useFolders` の reject 受け皿 0 件 | **未解消** | Critical 判定を実施 → **High 維持** (§1)。追加事実 3 点 (main 側の reject 設計 / `store.save` 無 catch / `cfec16b` の throw 可能点増) |
| H-002 | error boundary / `unhandledrejection` 0 件 | **未解消** | 白画面リスクを実測 → 実体は「非同期失敗の受け皿不在」。**推奨アクションを訂正** (error boundary はイベントハンドラの throw を捕まえない) (§2) |
| H-003 | 英語の chat UI が主見出し | **未解消** | 同種事象を **4 件 → 28 件 (5 ファイル)** に訂正。`ChatScreen` が乗せるのは 20 件 |
| M-001 | 表示名の二重表示が `mono` でパスに見える | **未解消** | `RuntimeListScreen.tsx:120-122` 変化なし |
| M-002 | `reevaluate` が古い `resolveAll` を掴み effect と二重に走る | **未解消** | `ResolutionScreen.tsx:231-239` / `:200-222` 変化なし |
| M-003 | MF-002 の修正に回帰テストが無い | **未解消** | `grep '判定できませんでした' src/renderer/` → 依然 **1 件** (実装のみ)。**H-004 の 2 本と合わせて 3 本を同時に書けば済む** |
| M-004 | `unregister-failed` が訳出表に無く「処理できませんでした」に潰れる | **未解消** | **新たな観点**: 確認ダイアログ (`:154-192`) を通って「解除する」を押した後、`{ ok: false }` なら card から遠い `:470` に無意味な 7 文字、reject なら無通知。どちらも card が残るため **破壊的操作が実行されたかを利用者が判定できない**。destructive action としては M-004 と H-001 の合わせ技が本体である |
| M-005 | 導入手順の導線がリポジトリ相対パスの文字列のまま | **未解消 (意図的繰り延べ)** | `RuntimeListScreen.tsx:80-84` 変化なし。pr-gate Round 1 の **po H-O が同じ事実を「繰り延べ先が spec のどこにも無い」面から挙げている**。owner は po に寄せてよい |
| L-001 | 「再判定」の多義 / ローダ文言のずれ | **未解消** | 変化なし |
| L-002 | loader の告知経路が画面ごとに不揃い | **未解消** | 変化なし (`RuntimeListScreen.tsx:125` `:179`、`ResolutionScreen.tsx:287` に `role="status"` 無し) |
| L-003 | ローダのドットが `tick={0}` 固定で静止 | **未解消** | `grep 'tick={0}'` → 依然 **5 件** |
| L-004 | `ErrorState` の `retrying` が 2 画面で `false` 固定 | **未解消** | 変化なし (`ResolutionScreen.tsx:277` / `WorkspaceFoldersScreen.tsx:233`) |

## 5. 他 track との重複抑制

- `.gate-verdict-code.json` / `code-gate.md` を読み、**iteration 1 MUST_FIX 7 件で resolved になった箇所 (MF-001 / MF-003 / MF-004 / MF-005 / MF-006 / MF-007) を再指摘していない**。MF-002 由来の H-001 / H-002 は「解消済みと判定された箇所」ではなく **推奨アクションの未実施部分と cascade 漏れ**であり、suppress 対象外である。
- pr-gate Round 1 との重複: **po H-O = 本 track M-005** (同一事実、owner は po)。**po H-K「SC-011 の証拠 0 件 (日本語フォルダ名を描く renderer テストが無い)」は H-004 / M-003 と同じ「renderer テストの穴」に属する** — H-004 の推奨テスト 2 本を書くときに同じファイルで閉じられる。**database H-Q (一時ファイル競合)** は H-001 の reject を起こす具体的トリガの 1 つだが、破損の評価は database owner に残す。
- `a11y-reviewer` との境界: H-004 の live region / loader の告知 (L-002) は WCAG 評価としては a11y owner。本 track は**フィードバック経路の一貫性**としてのみ記録する。

## 6. 該当なしを明記する UX カテゴリ

- **Mobile / Responsive**: 該当なし。Electron デスクトップ単体で、`index.html` に viewport 依存の要件が無い。touch target は `a11y-reviewer` の Owner 範囲
- **Onboarding / Tooltips**: 該当なし。R-1 は初回起動導線を FR に持たない。`thread.aui.tsx:224` の英語 tooltip は H-003 に計上済み
- **Form validation**: 対象 1 件のみ (`WorkspaceFoldersScreen.tsx:427-441` の表示名入力)。可視ラベル + `aria-describedby` の hint + 未入力時のフォールバック説明が揃っており、**新規指摘なし**

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `try \{\|catch` (`useFolders.ts`) | 1 | `:82` のみ。未保護 6 経路 = `:95` `:104` `:128` `:151` `:174` `:197` |
| H-001 | `throw new` (`src/main/`, 非テスト) | 6 | `ipc.ts:79` / `registry.ts:67` / `composition-root.ts:62` / `wsl-cli.ts:60` / `folder-store.ts:57` `:63` `:69` |
| H-001 | `catch` (`folder-service.ts` / `folder-store.ts` の save 経路) | 0 | `folder-service.ts:370` `:392` / `folder-store.ts:156-168` すべて無 catch |
| H-001 / H-002 | `unhandledrejection\|ErrorBoundary\|componentDidCatch\|window.onerror\|getDerivedStateFromError` (`src/`) | **0** | — |
| H-002 | `console\.(log\|warn\|error\|info\|debug)` (`src/`) | 1 | `measure.ts:86` のみ (dev ビルド限定)。**render crash を記録する経路も 0 件** |
| H-003 | `(tooltip\|aria-label\|placeholder\|title)="[A-Za-z]…"` (`src/renderer/src/components/`) | **28 / 5 files** | `thread.aui.tsx` 17 / `attachment.aui.tsx` 3 / `image.tsx` 6 / `markdown-text.tsx` 1 / `empty-state.tsx` 1 (`:95`, dead) |
| H-004 | `length === 0` (`src/renderer/src/features/`) | 6 | **潰している 2 件** = `ResolutionScreen.tsx:250` (+`:245`) / `WorkspaceFoldersScreen.tsx:393`。**分離できている 2 件** = `WorkspaceFoldersScreen.tsx:487` / `RuntimeListScreen.tsx:210`。非該当 2 件 = `ResolutionScreen.tsx:187` `:307` |
| H-004 | `folders\.failed` (`src/renderer/src`) | 1 | `WorkspaceFoldersScreen.tsx:226` のみ。`ResolutionScreen` は **0 件** |
| H-004 | `loadState` (`src/renderer/src`) | 3 | `useRuntimes.ts:17` `:43` `:101` / 消費は `RuntimeListScreen.tsx:163` のみ。`ResolutionScreen` は **0 件** |
| M-003 / H-004 | `判定できませんでした` (`src/renderer/`) | 1 | `ResolutionScreen.tsx:275` (実装のみ、テスト **0 件**) |
| L-003 | `tick=\{0\}` (`src/renderer/src`) | 5 | `WorkspaceFoldersScreen.tsx:357` `:483` / `ResolutionScreen.tsx:287` / `RuntimeListScreen.tsx:125` `:179` |
| L-005 | `EmptyState` (`src/renderer/`) | 12 | 使用 4 箇所 (`RuntimeListScreen.tsx:211` / `WorkspaceFoldersScreen.tsx:488` / `ResolutionScreen.tsx:249` `:308`)。`EmptyStateGreeting` / `Suggestion*` / `Composer` の利用は **0 件 (dead)** |

## Verdict

- Critical: **0**
- High: **4** (H-001 / H-002 / H-003 未解消 + H-004 新規)
- Medium: **6** (M-001〜M-005 未解消 + M-006 新規)
- Low: **5** (L-001〜L-004 未解消 + L-005 新規)
- Round inheritance: **resolved from Round 1: 0 / unresolved: 12 (H-001〜H-003, M-001〜M-005, L-001〜L-004) / new: 3 (H-004 / M-006 / L-005)**
- **Critical への格上げ: 0 件。** H-001 は依頼どおり pr-gate の Critical 定義に照らして評価し、**High を維持**した (§1 に 3 つの否定根拠と禁則条項の適用)。追加事実は記録したが格上げには使っていない。

**Round 2 の最小セット (推奨順)**

1. **H-004** — `ResolutionScreen` に loading / failed の 2 段を足す (既存部品のみ、~15 行)。**正常系で毎回出る偽の文言**なので、異常系の H-001 より先に直す価値がある
2. **H-001** — `useFolders` の 5 経路に `try/catch` + `labels.ts` に 1 行。**3 round 連続の未解消**
3. **H-002** — `main.tsx` に `unhandledrejection` / `error` リスナを 1 本ずつ (**error boundary だけでは解消条件を満たさない**)
4. **M-003 + H-004 のテスト** — `ResolutionScreen.test.tsx` に reject / loading の 3 ケース。po H-K の穴も同じファイルで閉じられる
5. **H-003** — `Thread` の `components.Welcome` 差し替え (繰り延べるなら AD-024 か spec に残タスクとして明記。**Principle VIII の Manual 番人は本 reviewer しかいない**)

**開発者向け変更 (test:rules の所要時間 / 診断出力) は利用者体験に影響しない**ことを実測で確認した (§3)。
