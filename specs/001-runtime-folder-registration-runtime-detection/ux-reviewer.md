# ux-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Round**: 2 (code-gate iteration 2)

> **本ファイルの保存経緯**: `ux-reviewer` は `reviewer-base.md` §Adversary 共通 5 の read-only 規定により
> `Read` / `Glob` / `Grep` のみを持ち `Write` を持たない。本文は reviewer の最終報告をそのまま
> code-gate が保存したものである。

---

## 初回読了 viewpoint

- FR/SC (本 track が見る範囲): FR-009 / FR-013 / FR-017 / FR-018 / FR-019 / FR-028 / FR-030 / FR-031 / FR-047 / SC-006 / SC-007 / SC-013 / SC-015
- touched files に該当する charter / Confirmation: `docs/domains/ui/charter.md` 業務ルール「日本語で破綻しない」「assistant-ui の design system に乗る」/ `docs/domains/runtime/charter.md` (R-1 の 3 画面は `runtime` domain が持つ) / Constitution **Principle VIII の Verification: Manual = `ux-reviewer`, `a11y-reviewer`** (`.specify/memory/constitution.md:438-443` — R-1 では本 reviewer が番人の 1/2 である)
- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の Owner 範囲。renderer に認証 UI なし
- B. 入力検証 / injection / 暗号: 該当なし: 同上
- C. 業務不変条件 / Charter drift: 該当なし: `architecture-reviewer` の Owner 範囲
- D. Constitution / ADR drift: 該当なし: 同上。Principle VIII の **Manual 担当分**は G に計上した
- E. User Story 価値 / SC / AC: 該当なし: `po-reviewer` の Owner 範囲
- F. 命名 / module / lint hookup: 該当なし: `convention-reviewer` の Owner 範囲
- G. UX state (empty / error / loading / i18n / IA / feedback): Critical:0 High:3 Medium:4 Low:4
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

iteration 1 の ux 系 MUST_FIX 3 件 (MF-002 / MF-005 / MF-007) の再検証と、`ChatScreen` の composer 封鎖 UX の妥当性判定を行った。読了したのは renderer の 4 画面 (`RuntimeListScreen` / `WorkspaceFoldersScreen` / `ResolutionScreen` / `ChatScreen`)、2 つの `labels.ts`、2 つの hook (`useRuntimes` / `useFolders`)、シェル (`App.tsx` / `main.tsx` / `index.html`)、共通 state 部品 (`empty-state` / `error-state` / `loading-state`)、`thread.aui.tsx`、および renderer 単体テスト 2 本である。

**3 件とも、指摘された行そのものは解消している。** ただし MF-002 は **推奨アクションの後半 (error boundary / `unhandledrejection`) が未実施**で、かつ**同型の欠落が `useFolders` に 5 箇所残っている** (cascade 漏れ)。MF-005 は内部識別子こそ消えたが表示名の二重表示という別の見づらさに置き換わった。`ChatScreen` の composer 封鎖は判断として妥当だが、**封鎖した画面に英語の chat UI がそのまま露出しており、告知文と矛盾している**。

---

## 1. iteration 1 MUST_FIX の再検証

| ID | 判定 | 根拠 |
|---|---|---|
| **MF-002** (永久ローディング) | **部分解消** | `ResolutionScreen.tsx:216-218` / `:238` に `.catch` が入り、`failed` state (`:161`) を `pairs === null` と分離して `ErrorState` (`:270-284`) を出すようになった。**指摘された 2 箇所は直っている。** 一方 (a) 推奨アクションにあった error boundary / `unhandledrejection` は `src/` 全体で **0 件** のまま、(b) 同型の欠落が `useFolders.ts` に残る (→ H-001 / H-002) |
| **MF-005** (内部識別子の露出) | **解消 (ただし副作用あり)** | `RuntimeListScreen.tsx:120-122` が `{runtime.id}` から `{runtime.distroName ?? 'Windows'}` + `title={runtime.id}` に変わった。`host` / `wsl:<distro>` は画面から消えた。**FR-047 違反は解消。** ただし表示名の二重表示が生じた (→ M-001) |
| **MF-007** (無反応な「選ぶ」ボタン) | **解消** | `ResolutionScreen.tsx:125-131` でボタンごと削除され、理由 (R-1 のスコープは解決までで選択の永続化を要求する FR が無い) がコメントに残っている。`ResolutionScreen.test.tsx:208-219` が FR-030 の確認を「選択肢に現れ、`今は使えません` が付かないこと」へ置き換えており、削除で AC の検証が空洞化してもいない。**判断・実装・テストの 3 点が揃っている** |

## 2. `.catch` 追加後のエラー表示の成立度

`ResolutionScreen.tsx:274-281` は title「組み合わせを判定できませんでした」/ detail「再判定を試してください。続く場合はアプリを再起動してください。」/ `retryLabel="再判定"` を出す。

- **何が起きたか**: 伝わる (この画面の判定が失敗した)
- **次に何をすればよいか**: 伝わる (再判定 → だめならアプリ再起動)。`onRetry` は `reevaluate` に繋がっており、押せば実際に `refreshRuntimes()` から走り直す。**押しても何も起きない状態ではない**
- **不足**: (a) 失敗が一時的か恒久的かの手がかりが無い (IPC 落ち / main のクラッシュ / 個別ペアの失敗を区別できない)。(b) 1 ペアの失敗で **既に解決済みの全ペアが画面から消える** — `pairs` を捨てて全画面エラーに切り替えるため、10 組中 1 組の失敗でも残り 9 組が見えなくなる。(c) 再試行中のフィードバックが無い (`retrying={false}` 固定、→ L-004)。(d) この経路に回帰テストが無い (→ M-003)

判定: **成立している (最低線は満たす)**。上記 (b)(c)(d) は Medium / Low として下記に計上した。

## 3. `ChatScreen` の composer 封鎖 UX の妥当性

**結論: 方向は妥当。ただし「閉じた」ことが画面上で完結していない。**

妥当な点:
- 未接続の告知が**送信前**に出る (`ChatScreen.tsx:64-75`)。iteration 1 の SF-011「予告が送信後にしかない」は解消
- 偽の assistant 応答が消えた (`messages` は空配列固定、`onNew` は到達したら throw)
- `role="note"` の選択は妥当。警告でも操作結果でもない常設の説明であり、`role="alert"` にすると毎レンダーで割り込む
- 内部 feature ID がタブラベルから消えた (`stores/ui.ts:20` 「会話 (準備中)」)。本文にはまだ R-3 / X-1 が残るが、これは「いつ実装されるか」の情報として文脈がある

成立していない点:
- バナーが「入力はできません」と日本語で言う直後に、`thread.aui.tsx:238` の **`<h1>How can I help you today?</h1>`** が最大の見出しとして出る。**画面の主見出しが、できないことを英語で問いかけている** (→ H-003)
- `onNew` の `throw` (`ChatScreen.tsx:53`) は退行検知としては正しいが、**受け皿が 0 件**のため実際に発火したときの利用者体験は「白画面」である (→ H-002)
- `ChatScreen.test.tsx` が押さえているのは `Message input` の `disabled` のみ。添付ボタン (`ComposerAddAttachment`) / 送信ボタン / dictation の無効化は誰も見ていない

---

## Findings

### [High] `useFolders` の capability 呼び出しに reject の受け皿が 1 件もなく、MF-002 と同型の永久ローディングが残っている (H-001) (scope: feature)

- **Where**: `src/renderer/src/features/workspace-folders/useFolders.ts:95` / `:104` / `:128` / `:151` / `:174` / `:197`
- **Issue**: このファイルで `catch` が付いているのは `load()` の 1 箇所 (`:82`) だけである (`grep 'try \{|catch' useFolders.ts` → **1 件**)。とりわけ `move` は
  ```ts
  setBrowse((prev) => ...{ ...prev, loading: true })   // :121-125
  const next = await capability().browseDirectory(token, target)  // :128  ← reject すると以降が走らない
  setBrowse((prev) => ...{ ...prev, loading: false })  // :129-139
  ```
  の形で、**`loading: true` を立てた後に await している**。IPC が reject すると `loading` が `true` のまま固定され、`WorkspaceFoldersScreen.tsx:349-361` の `aria-busy` と `GenerationLoader label="読み込み中"` が**永久に出続ける**。これは MF-002 で must-fix とされた形そのものである。`beginBrowse` (`:95`) が reject した場合は所在ボタンを押しても **`browse` が `null` のまま何も起きない** (MF-007 と同じ「押しても無反応」)。`register` (`:151`) / `unregister` (`:174`) / `pickHostFolder` (`:197`) の reject も同様に無通知で、いずれも `onClick` の async 関数から未処理のまま抜ける
- **Why**: `{ ok: false }` の**業務上の失敗**は `BROWSE_ERROR_LABELS` / `REGISTER_ERROR_LABELS` で丁寧に訳出されているのに、**transport の失敗だけが全経路で無言**になっている。main 側は `ipc.ts` の検証不一致で応答を破棄する設計 (FR-039) であり、reject / 無応答は例外経路ではなく設計上起こりうる状態である。US-2 の中核操作 (所在選択 → ブラウズ → 登録) の全段でこれが起きる
- **同種事象探索**: `grep -n 'try \{|catch' src/renderer/src/features/workspace-folders/useFolders.ts` → **1 件** (`:82` のみ)。`grep -rn 'unhandledrejection|ErrorBoundary|componentDidCatch|window.onerror' src/` → **0 件** (受け皿も無い)。`useRuntimes.ts` は `:56` / `:80` / `:98` の 3 経路すべてに catch があり、**`useFolders` だけが例外**である
- **Suggested fix**: `useFolders` の 5 経路を `try { ... } catch { ... }` で包み、(a) `move` は `loading: false` へ戻してから `setLastError('transport-failed')`、(b) `beginBrowse` は `setBrowse(null)` + 同 error、(c) `register` / `unregister` / `pickHostFolder` も同 error を立てる。`labels.ts` に `transport-failed: '操作を実行できませんでした。アプリを再起動してください'` を足せば、既存の `role="status"` live region (`WorkspaceFoldersScreen.tsx:470`) にそのまま乗る
- **根拠**: FR-013 / FR-018 / FR-019 (導線の提示)、iteration 1 MF-002 と同一クラス、ui charter「日本語で破綻しない操作体験」
- **scope 根拠**: feature の touched files 内で直接修正可能

### [High] renderer に error boundary / `unhandledrejection` が 0 件のまま、意図的な `throw` だけが増えた (H-002) (scope: feature)

- **Where**: `src/renderer/src/main.tsx:7-11` / `src/renderer/src/App.tsx:34-73` / `src/renderer/src/features/chat/ChatScreen.tsx:53`
- **Issue**: MF-002 の推奨アクションは「`.catch` を 2 箇所」だけでなく「`App.tsx` に error boundary を 1 枚置き、`main.tsx` で `unhandledrejection` を拾う」を含んでいた。**後半は未実施**である (`grep -rn 'unhandledrejection|ErrorBoundary|componentDidCatch|window.onerror' src/` → 0 件)。一方で iteration 2 は `ChatScreen.tsx:53` に `throw new Error('composer は R-1 では無効である')` を**新設**した
- **Why**: render / event handler 由来の例外は React が root ごと unmount するため、**利用者に見えるのは白いウィンドウだけ**になる。復帰手段はアプリ再起動しかなく、しかも白画面には再起動を促す文言も無い。`ChatScreen` の throw は「退行を黙らせない」意図だが、受け皿が無い現状では**退行の通知先が利用者の白画面**になっている。`ResolutionScreen` の `.catch` が塞いだのは *1 画面の 1 経路*であって、`RuntimeListScreen` の `BLOCKED_LABELS[...]` 系の `Record` 参照が未知キーで `undefined` を返す経路など、render 中の例外は他にも残る
- **同種事象探索**: 上記 grep で **0 件**。`.catch` を持つ非同期経路は `useRuntimes.ts:56/80/98`、`useFolders.ts:82`、`ResolutionScreen.tsx:216/238`、`RuntimeListScreen.tsx:191`、`WorkspaceFoldersScreen.tsx:322` の 9 件で、**同期 render の受け皿はどこにも無い**
- **Suggested fix**: `App.tsx` を 1 枚の error boundary で包み、fallback に既存の `ErrorState` (title「画面を表示できませんでした」/ detail「アプリを再起動してください」/ `onRetry` = 再マウント) を出す。`main.tsx` に `window.addEventListener('unhandledrejection', ...)` を 1 本置き、少なくとも 1 行のバナーを出す。`ChatScreen` の `throw` はそのままでよい — 受け皿ができれば「退行が見える」と「利用者が詰まらない」が両立する
- **根拠**: iteration 1 MF-002 の推奨アクション、FR-028「理由と次に取るべき操作を提示」の精神
- **scope 根拠**: feature の touched files (`App.tsx` / `main.tsx`) 内

### [High] 未接続を日本語で告知した直後に、英語の chat UI が主見出しとして出る (H-003) (scope: feature)

- **Where**: `src/renderer/src/features/chat/ChatScreen.tsx:64-79` → `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:237-239` / `:280` / `:285` / `:224`
- **Issue**: `ChatScreen` のバナーは日本語で「この画面はまだ Claude Code に繋がっていません。」「入力はできません。」と述べる。その直下に mount される `Thread` は、**`<h1>How can I help you today?</h1>`** (`:238`)、placeholder `"Send a message..."` (`:280`)、`aria-label="Message input"` (`:285`)、tooltip `"Scroll to bottom"` (`:224`) をそのまま描画する。結果として、画面で最も大きい文字が **英語で入力を促す問いかけ**になり、直上の「入力はできません」と正面から矛盾する
- **Why**: FR-047 は「UI のラベル・メッセージは日本語を第一言語とし」と定めており、ui charter の Mission は「日本語環境で破綻しない操作体験」を軸 1 に置いている。Constitution Principle VIII の Verification は R-1 では **Manual (`ux-reviewer` / `a11y-reviewer`) と `ChatScreen.test.tsx` の 2 ケースだけ**が番人であると明記されている (`.specify/memory/constitution.md:438-443`) — つまりこの矛盾を止める機械経路は存在しない。加えて「入力できない」ことを伝える手段がバナー 1 枚しかなく、**composer 自体には理由が結ばれていない**ため、バナーをスクロールで追い出すと理由が消える
- **同種事象探索**: `grep -n 'How can I help you today|Send a message|Message input|Scroll to bottom' src/renderer/src/components/assistant-ui/elements/` → **4 件** (すべて `thread.aui.tsx`)。`ErrorState` は同じ問題を `retryLabel` / `retryingLabel` prop で既に解決済み (`error-state.tsx:16-30` に registry 逸脱の理由が記録されている) — **同じ手が `Thread` には適用されていない**
- **Suggested fix**: (a) `ChatScreen` が `Thread` の `components.Welcome` を渡して日本語の説明 (「ここは表示部品の確認用の画面です。入力は R-2 以降で開きます」) に差し替える — `ThreadProps.components.Welcome` (`thread.aui.tsx:77-92`) が既に用意された拡張点である。(b) placeholder / aria-label は `ErrorState` と同じく prop で受ける形にして日本語既定を与える。(c) `ChatScreen.test.tsx` に「英語の welcome 見出しが出ないこと」と「添付・送信ボタンが無効であること」の 2 ケースを足す (現状は `Message input` の `disabled` 1 点のみ)
- **根拠**: FR-047 / `docs/domains/ui/charter.md` §業務ルール / Constitution Principle VIII (Manual 検証の担当として)
- **scope 根拠**: feature の touched files。`thread.aui.tsx` は registry の写しだが、`error-state.tsx` が確立した「prop で受けて既定は原文」の前例がある

### [Medium] MF-005 の修正が表示名の二重表示になり、パスに見える (M-001) (scope: feature)

- **Where**: `src/renderer/src/features/runtime-list/RuntimeListScreen.tsx:109-122`
- **Issue**: カード見出しが `runtimeTitle()` で `Windows (ホスト)` / `WSL: Ubuntu-26.04` を出し、その直下の行が `{runtime.distroName ?? 'Windows'}` で **`Windows` / `Ubuntu-26.04`** を出す。同じ情報が 2 行続き、しかも下の行は `mono` (等幅) で描かれる。`mono` は同画面・同アプリ内では**パス**の表現に使われている (`WorkspaceFoldersScreen.tsx:141` / `:341`、`ResolutionScreen.tsx:118`)
- **Why**: MF-005 は「表示名と表記が競合し、利用者に 2 つの名前を覚えさせる」ことを問題にしていた。識別子は消えたが**冗長な 2 行**は残り、かつ等幅表示によって「これはパスか識別子の類だ」という誤った手がかりを与える。`host` を消した意図 (参照キーを見せない) が、見た目の面では半分しか達成されていない
- **Suggested fix**: 行ごと削除する (`title={runtime.id}` は親の `<p>` か `<li>` に移せばデバッグ用途は保てる)。残すなら `mono` を外し、`WSL バージョン` などと同じ `Field` 行に畳む
- **根拠**: FR-047 / 一貫性 (同じ視覚トークンが異なる意味を持たないこと)
- **scope 根拠**: feature の touched files 内

### [Medium] `reevaluate` が古い `resolveAll` を掴んだまま再解決し、effect と二重に走る (M-002) (scope: feature)

- **Where**: `src/renderer/src/features/folder-runtime-resolution/ResolutionScreen.tsx:231-239` (`reevaluate`) と `:200-222` (effect)
- **Issue**: `reevaluate` は `runtimes.refresh().then(() => resolveAll())` と繋ぐが、この `resolveAll` は **`reevaluate` が生成された時点の runtime 一覧に束縛された関数**である (`:184-198` の依存は `[folderData, runtimeData]`)。`refresh()` が新しい一覧を `setList` した後も、この chain が呼ぶのは古い集合である。一方 `setList` によって `resolveAll` の identity が変わるため、**effect (`:200-222`) も同時に再発火**する。結果として (a) 同じ解決が 2 回走り `resolveFolderRuntime` の IPC が folders×runtimes 回分だけ重複し、(b) どちらが後に `setPairs` するかは非決定である
- **Why**: 「ディストロを起動する → ランタイムを再検出する」は `BLOCKED_LABELS['distro-not-running']` が利用者に指示する手順そのものである。古い集合側の書き込みが後勝ちすると、**手順どおり操作したのに新しく起動したディストロの行が現れない**。SF-009 が塞いだ「押しても同じ blocked が返る」の残余がここに残っている。`resolveAll` は `for` の二重ループで逐次 `await` するため (`:189-196`)、重複分は所要時間にも直結する
- **Suggested fix**: `reevaluate` から `resolveAll()` の直接呼び出しを外し、`await runtimes.refresh()` だけを行って**解決は effect 1 本に集約**する (`pairs` を `null` に落とせばローディングは出る)。あるいは世代カウンタを持ち、古い chain の `setPairs` を捨てる
- **根拠**: FR-028 (解消手順が実行可能であること) / SC-004 (再表示の応答性)
- **scope 根拠**: feature の touched files 内

### [Medium] MF-002 の修正に回帰テストが無い (M-003) (scope: feature)

- **Where**: `src/renderer/src/features/folder-runtime-resolution/ResolutionScreen.test.tsx` (全 379 行)
- **Issue**: `resolveFolderRuntime` が reject するケースが 1 件も無い。`grep -n '判定できませんでした' src/renderer/` → **1 件** (`ResolutionScreen.tsx:275` の実装のみ、テストに 0 件)。`test-support/capability.ts:13-24` は「未スタブのメソッドは reject を返す」基盤を**既に持っている**ので、書くコストはほぼ無い
- **Why**: MF-002 は must-fix として 1 イテレーションを消費した欠陥である。`.catch` は削除しても型検査・lint・既存テストのいずれも落ちないため、**次の変更で静かに戻りうる**。同じ理由で `ChatScreen.test.tsx` が新設されたのに、こちらだけ番人が無い
- **Suggested fix**: `installCapability({ resolveFolderRuntime: async () => { throw new Error('ipc down') } })` で render し、「組み合わせを判定できませんでした」が出ること・`GenerationLoader` が残らないこと・「再判定」が押せることの 3 点を assert する
- **根拠**: reviewer-base viewpoint H / iteration 1 MF-002
- **scope 根拠**: feature の touched files 内

### [Medium] `unregister-failed` が訳出表に無く「処理できませんでした」に潰れる (M-004) (scope: feature)

- **Where**: `src/renderer/src/features/workspace-folders/useFolders.ts:180` / `labels.ts:70-87` / `WorkspaceFoldersScreen.tsx:52-58`
- **Issue**: 解除失敗時に `setLastError('unregister-failed')` を立てるが、このキーは `BROWSE_ERROR_LABELS` にも `REGISTER_ERROR_LABELS` にも無いため `errorText()` の fallback「処理できませんでした」に落ちる (`WorkspaceFoldersScreen.tsx:57`)。利用者が見るのは**どの操作が失敗したのかも次の操作も含まない 7 文字**である。しかも表示位置は一覧の**上**の live region (`:470`) で、操作した card から離れている
- **Why**: iteration 1 の CONSIDER「`unregisterFolder` の `{ ok: false }` が無通知」に対する修正だが、**無通知が「意味の無い通知」に変わっただけ**である。確認ダイアログ (`:154-192`) を通って「解除する」を押した後にこれが出ると、解除されたのかどうかすら分からない (card は残っている)
- **Suggested fix**: 専用のラベル定数を足す (例: `'登録を解除できませんでした。もう一度お試しください'`)。`errorText` の fallback は未知キー用に残す
- **根拠**: FR-017 / FR-047 (参照キーを生で出さない一方で、意味も失わせない)
- **scope 根拠**: feature の touched files 内

### [Medium] SF-012 未解消: 導入手順の導線がリポジトリ相対パスの文字列のまま (M-005) (scope: feature)

- **Where**: `src/renderer/src/features/runtime-list/RuntimeListScreen.tsx:80-84` / `labels.ts:80`
- **Issue**: 「導入手順: プロジェクトの `docs/runtime/wsl-sandbox-dependencies.md` にある 「bubblewrap」の節」と出る。パッケージ済みアプリの利用者はこのパスに到達できず、開く手段も capability に無い。`DEPENDENCY_LABELS['bwrap']` が `'bubblewrap'`、`docAnchor` も `'bubblewrap'` (`src/domain/runtime/capabilities.ts:27-30`) のため、**同じ語が 1 行に 2 回**出る
- **Why**: FR-009 は「導入手順を記載した文書への導線を案内しなければならない」と定める。現状は「導線の説明」であって導線ではない。コード側は理由 (IPC 面を広げない / 到達性は D-1) を明記しており**意図的な繰り延べ**だが、iteration 1 の SHOULD_FIX としては未解消である
- **Suggested fix**: R-1 で閉じるなら、文言から `docAnchor` の重複を外し (「導入手順は同梱ドキュメントの bubblewrap の節にあります」)、D-1 への繰り延べを spec の Out of Scope か tasks の残タスクとして**文書側に明示**する。IPC を広げず済ませるなら `shell.openPath` 相当を `app` レイヤに 1 本足す案もあるが FR-039 の面積判断が要る
- **根拠**: FR-009 / FR-048 / SC-012 の精神 (未実装を実装済みに見せない)
- **scope 根拠**: feature の touched files。到達性の最終解決は D-1 (system)

### [Low] 同じ操作が画面ごとに別のラベルを持ち、ローダの文言が実際の処理とずれる (L-001) (scope: feature)

- **Where**: `ResolutionScreen.tsx:279` (`retryLabel="再判定"`) / `:301-303` (`ランタイムを再検出して再判定`) / `RuntimeListScreen.tsx:128` (`再判定` = `probeRuntime` 1 件のみ) / `ResolutionScreen.tsx:287` (`label="組み合わせを調べています"`)
- **Issue**: 「再判定」がランタイム画面では**単一ランタイムの probe**、組み合わせ画面では**全ランタイムの再検出 + 全ペアの再解決**を指す。組み合わせ画面の中でも同一操作に 2 つのラベル (`再判定` / `ランタイムを再検出して再判定`) が付いている。さらに `reevaluate` の前半は再検出なのに、その間のローダは「組み合わせを調べています」と表示する
- **Suggested fix**: 組み合わせ画面の `retryLabel` をヘッダのボタンと同じ「ランタイムを再検出して再判定」に統一し、ローダ文言を「ランタイムを再検出しています」→「組み合わせを調べています」の 2 段にするか、「再検出して組み合わせを調べています」に寄せる
- **根拠**: 一貫性 (同じ操作に同じ名前) / SC-004 の待ち時間説明
- **scope 根拠**: feature の touched files 内

### [Low] 読み込み中の告知経路が画面ごとに揃っていない (L-002) (scope: feature)

- **Where**: `WorkspaceFoldersScreen.tsx:356-360` / `:483-486` は `role="status" aria-live="polite"` を `GenerationLoader` に渡すが、`ResolutionScreen.tsx:287` と `RuntimeListScreen.tsx:125` / `:179` は渡していない
- **Issue**: `grep -n 'aria-live|role="status"' src/renderer/src/features/` → **6 件**、うち loader に付いているのは folders 画面の 2 件のみ。同じ `GenerationLoader` が画面によって告知されたりされなかったりする
- **Suggested fix**: `GenerationLoader` を使う 5 箇所すべてに `role="status" aria-live="polite"` を付ける (props は既に spread される)。WCAG 上の評価は `a11y-reviewer` の Owner 範囲だが、**フィードバック経路の一貫性**として本 track からも記録する
- **根拠**: 一貫性 / iteration 1 SF-003 の残余
- **scope 根拠**: feature の touched files 内

### [Low] ローダのドットが `tick={0}` 固定で静止している (L-003) (scope: feature)

- **Where**: `grep -n 'tick={0}' src/renderer/src` → **5 件** (`WorkspaceFoldersScreen.tsx:357` / `:483`、`ResolutionScreen.tsx:287`、`RuntimeListScreen.tsx:125` / `:179`)
- **Issue**: `loading-state.tsx:31` は `tick` からアニメーション位相を計算する。`0` 固定では 9 セルのグリッドが**完全に静止**し、動くのはラベルの shimmer だけになる。SC-004 は capability 判定バッチに 4 秒を許容しており、その間ずっと静止画が出る
- **Suggested fix**: `useEffect` + `setInterval` で `tick` を進める小さな hook を 1 本置いて 5 箇所で共有する (`prefers-reduced-motion` は部品側が `motion-reduce:` で既に処理している)
- **根拠**: iteration 1 CONSIDER の未解消項目
- **scope 根拠**: feature の touched files 内

### [Low] `ErrorState` の `retrying` が 2 画面で `false` 固定 (L-004) (scope: feature)

- **Where**: `ResolutionScreen.tsx:278` / `WorkspaceFoldersScreen.tsx:234`
- **Issue**: `RuntimeListScreen.tsx:171` は `retrying={refreshing}` を渡して「再試行中」を出せるのに、他 2 画面は `false` 固定。`WorkspaceFoldersScreen` の `onRetry` は `folders.refresh` (= fire-and-forget な `load`) で、押しても**成功するまで画面が一切変化しない**
- **Suggested fix**: `useFolders` に `loading` を足して渡す。`ResolutionScreen` は `setFailed(false)` でローダに切り替わるため実害は小さいが、`retrying` を `runtimes.refreshing` に繋いでおくと意味が揃う
- **根拠**: 200ms 超の操作にフィードバックを与える (loading state の基本)
- **scope 根拠**: feature の touched files 内

---

## 4. iteration 1 の SHOULD_FIX / CONSIDER の残存状況 (ux origin のみ)

| ID | 内容 | 状態 | 参照 |
|---|---|---|---|
| SF-006 | `登録を解除` に確認も undo も無い | **解消** | `WorkspaceFoldersScreen.tsx:154-192` に対象名・パスを名指す確認ダイアログ。到達可能なエントリには「今も使えます」の追加警告あり |
| SF-007 | 「WSL が見つからない旨」が UI に無い | **解消** | `wslAvailability` 3 値 + `RuntimeListScreen.tsx:204-208`、テスト 4 本 (`ResolutionScreen.test.tsx:284-324`) |
| SF-008 | 重複登録時の `existing` を捨てている | **解消** | `useFolders.ts:165` + `FolderCard` の `highlighted` (ring + 文言 + `scrollIntoView`) |
| SF-009 | 「再判定」が `refreshRuntimes()` を呼ばない | **部分解消** | `ResolutionScreen.tsx:234-238` で呼ぶようになった。ただし古い `resolveAll` を掴む race が残る → **M-002** |
| SF-010 | 期限切れで現在地が失われる | **解消** | `BrowseState.lastOk` (`useFolders.ts:43`) と画面側の `lastOk` 参照 (`WorkspaceFoldersScreen.tsx:248-251`) |
| SF-011 | 未接続の予告が送信後にしか出ない / 内部 ID | **部分解消** | バナー化 + 偽応答の除去 + タブラベルから R-3 を除去。英語 chat UI との矛盾が残る → **H-003** |
| SF-012 | 導入手順への導線が文字列のみ | **未解消 (意図的繰り延べ)** | → **M-005** |
| CONSIDER: `ErrorState` の Retry だけ英語 | | **解消** | `error-state.tsx:28-29` の `retryLabel` / `retryingLabel` prop |
| CONSIDER: `unregisterFolder` の `{ ok: false }` が無通知 | | **部分解消** | 通知は出るが意味が落ちる → **M-004** |
| CONSIDER: ローダが `tick={0}` で静止 | | **未解消** | → **L-003** |
| CONSIDER: 「再判定」が画面ごとに別の意味 | | **未解消** | → **L-001** |
| CONSIDER: タブ切替で画面状態が全破棄 | | **未解消** | `App.tsx:31` / `:68` は active な 1 画面のみ mount するため、切替のたびに `listRuntimes` / `listFolders` / 全ペアの再解決が走る。ブラウズ中の現在地も失われる |
| CONSIDER: エラー表示が発生源から遠い | | **部分解消** | live region (`:470`) はブラウザ直下に移り登録操作には近くなった。解除失敗は依然として card から遠い |

## 5. 新たな UX 退行の有無 (確認項目 3)

- **MF-002 の修正**: 退行なし。ただし 1 ペアの失敗で全ペアが画面から消える点と二重解決 (M-002) が副作用として入った
- **MF-005 の修正**: 表示名の二重表示という軽微な退行 (M-001)
- **MF-007 の修正**: 退行なし。テストの assert も併せて置き換えられており空洞化していない
- **`ChatScreen` の封鎖**: 偽応答が消えた分は明確な改善。`onNew` の `throw` 新設が受け皿不在と組み合わさって白画面リスクを上げた (H-002)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `try \{\|catch` (useFolders.ts) | 1 | `useFolders.ts:82` のみ。未保護は `:95` `:104` `:128` `:151` `:174` `:197` |
| H-001 / H-002 | `unhandledrejection\|ErrorBoundary\|componentDidCatch\|window.onerror` (src/) | 0 | — |
| H-003 | `How can I help you today\|Send a message\|Message input\|Scroll to bottom` (elements/) | 4 | `thread.aui.tsx:238` `:280` `:285` `:224` |
| M-003 | `判定できませんでした` (src/renderer/) | 1 | `ResolutionScreen.tsx:275` (実装のみ、テスト 0 件) |
| M-005 | `docAnchor` (src/) | 3 | `capabilities.ts:35` `:43`、`dto.ts:34`、表示は `RuntimeListScreen.tsx:83` |
| L-002 | `aria-live\|role="status"` (features/) | 6 | `RuntimeListScreen.tsx:205`、`WorkspaceFoldersScreen.tsx:358` `:359` `:470` `:484` `:485` |
| L-003 | `tick=\{0\}` (src/renderer/src) | 5 | `WorkspaceFoldersScreen.tsx:357` `:483`、`ResolutionScreen.tsx:287`、`RuntimeListScreen.tsx:125` `:179` |

## Verdict

- Critical: 0
- High: 3 (H-001 / H-002 / H-003)
- Medium: 5 (M-001 〜 M-005)
- Low: 4 (L-001 〜 L-004)
- Round inheritance: **resolved from 1**: MF-005 / MF-007 / SF-006 / SF-007 / SF-008 / SF-010 / CONSIDER (Retry 英語)。**partially resolved**: MF-002 / SF-009 / SF-011 / CONSIDER (unregister 無通知 / エラー表示の距離)。**unresolved**: SF-012 / CONSIDER (tick 固定 / 再判定の多義 / タブ切替の状態破棄)。**new**: H-001 (MF-002 の cascade 漏れ) / H-002 (推奨アクション後半の未実施 + throw 新設) / H-003 (composer 封鎖で顕在化) / M-001 (MF-005 修正の副作用) / M-002 (SF-009 修正の副作用) / M-003 (MF-002 の番人不在) / M-004 (CONSIDER 修正の副作用)

**次イテレーションの must-fix 候補は H-001 と H-002 の 2 件。** どちらも iteration 1 の MF-002 が指示した修正範囲の内側であり、**同じ指摘を 3 周させないために今回で閉じるべき**である。H-003 は Constitution Principle VIII の Manual 番人が本 reviewer しかいない以上、記録を残したまま繰り延べる場合は AD-024 か spec 側に明示的な残タスクとして書き付けることを推奨する。
