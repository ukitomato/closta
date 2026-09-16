# Code Gate Iteration 1: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Spec**: `specs/001-runtime-folder-registration-runtime-detection/`
**Diff scope**: 194 files, +35,236 / -183 (`main...HEAD`)
**Tracks**: lint-agent, test-agent, convention-reviewer, a11y-reviewer, ux-reviewer

`database-reviewer` は migration / `.sql` が 0 件のため起動していない。
`security-reviewer` / `architecture-reviewer` / `po-reviewer` は **pr-gate 専任**のため起動していない。

## 仕様との差異 2 点 (Phase 0 / Phase 1)

1. **`git diff HEAD` が空である。** 実装はすべてコミット済みで、skill の Phase 0 step 4 を
   字義どおり適用すると halt する。gate の目的は実装のレビューなので **scope を `main...HEAD`** に取った
2. **`touched-files.txt` に 88 件の記載漏れがあった。** skill は scope を
   `diff_files ∩ touched_files` と定めるため、そのまま交差すると
   **88 ファイルが黙ってレビュー対象から外れる**。実測から生成し直してから scope を決めた

## Verdict

| Severity | Count |
|---|---|
| MUST_FIX | **7** |
| SHOULD_FIX | 13 |
| CONSIDER | 10 |

**Status**: **FIX_REQUIRED**

機械検証 (lint / typecheck / depcruise / check:constitution / test / test:rules) は**すべて 0 件**である。
MUST_FIX はすべて**機械検証が構造的に見られない領域**から出ている。

---

## MUST_FIX findings

### MF-001 — AD-024 #18 の「R-1 に composer が無い」は事実誤認 [origin: a11y]

- **Where**: `.specify/memory/constitution.md` (Principle VIII の現状の制約) /
  `docs/decisions/0024-constitution-verification-paths.md` #18
- **Issue**: Principle VIII の Automated 検証を載せない根拠として
  「(A) composer の IME テストケース — **対象が無い**。R-1 に composer が無い」と書いた。
  **R-1 には composer がある。** `src/renderer/src/features/chat/ChatScreen.tsx:46-52` が
  `Thread` を mount し、`components/assistant-ui/elements/thread.aui.tsx` が
  `ComposerPrimitive.Input` を描画する。`ChatScreen.tsx:29-43` の `onNew` は
  user メッセージと assistant ロールの応答を実際に積むので、**誤送信は観測可能な結果を持つ**
- **Why must-fix**: Constitution の NON-NEGOTIABLE Principle の検証免除が、
  成立しない前提に乗っている。`bad_pattern_grep` が 0 件を返すのは
  「守られている」からではなく**送信経路が `@assistant-ui/react` の内側にある**ためで、
  `isComposing` ガードはリポジトリに 1 件も無い。
  **X-1 でモデルに繋いだ瞬間に実害化する**
- **Suggested fix**: (a) 事実を Constitution と AD-024 に反映する (改定手続きを踏む)。
  (b) `compositionend` 直後の Enter が `onNew` を呼ばないことを 1 本のテストで確認する
  (`tests/setup/harness.test.tsx` の基盤が既にある)

### MF-002 — `ResolutionScreen` が IPC 失敗で永久にローディングのまま固まる [origin: ux]

- **Where**: `src/renderer/src/features/folder-runtime-resolution/ResolutionScreen.tsx:176` / `:228`
- **Issue**: `void resolveAll().then(...)` が 2 箇所とも `.catch` を持たない。
  `resolveFolderRuntime` が reject すると `pairs` は `null` のままで、
  `:213-215` の `GenerationLoader label="組み合わせを調べています"` が**永続する**。
  再試行も失敗表示も無い。「再判定」も同じ形なので押しても何も起きない
- **Why must-fix**: US-3 の価値を運ぶ**唯一の画面**が、理由も次の操作も無い停止画面になる。
  他 2 画面は `ErrorState` を持つので、同じ失敗が画面ごとに別体験になる。
  FR-028 は「選択肢が 0 件になる場合は理由と次に取るべき操作を提示」と定めている
- **Suggested fix**: 2 箇所に `.catch` を付け、他画面と同じ `ErrorState(title/detail/onRetry)` を出す。
  `App.tsx` に error boundary を 1 枚置き、`main.tsx` で `unhandledrejection` を拾う
  (renderer に受け皿が 0 件のため、白画面からの復帰手段がアプリ再起動しかない)

### MF-003 — `browseDirectory` のトークンに送信元の束縛が無い [origin: test]

- **Where**: `src/main/app/folder-service.ts:44-48` (`BrowseSession`) / `src/main/app/ipc.ts:121-124`
- **Issue**: `contracts/ipc-capability.md:221` は `token` の検証条件として
  **「発行した送信元と一致すること」**を明記している。しかし
  `BrowseSession` は `{ token, namespace, verified }` のみで送信元を保持せず、
  `ipc.ts:121` のハンドラは `async (_event, ...args) =>` と **`event` を捨てている**。
  検証が実装されていない
- **Why must-fix**: 契約が要求する検証の欠落である。
  今は `isTrustedSender` が origin で全チャンネルを守っており**単一 WebContents では悪用経路が無い**が、
  AD-025 の目標レイアウトは **Browser / PR Webview を別 WebContents で持つ**と決めている。
  その時点で「別の送信元が他人のトークンを使える」状態が生きる。
  SC-018 が最低要件に挙げる「**他送信元のトークン**」「**期限切れトークン**」は
  どちらも**テストにも 1 件も無い** (`browse-session-expired` が試験コードに現れない)
- **Suggested fix**: `BrowseSession` に発行元の `WebContents` id を持たせ、
  `browseDirectory` ハンドラで `event.sender.id` と照合する。
  併せて期限切れ・他送信元・流用の 3 経路をテストにする

### MF-004 — `index.html` に静的な CSP があり、両環境で `unsafe-inline` を許し、検証の走査外にある [origin: self]

- **Where**: `src/renderer/index.html:7-10` / `scripts/constitution/allowlists.mjs:27-38`
- **Issue**: scaffold 由来の `<meta http-equiv="Content-Security-Policy">` が残っており、
  `style-src 'self' 'unsafe-inline'` を**開発・出荷の両方で**静的に許している。
  AD-025 §7 は「緩和は **CSP を組み立てる 1 関数の dev 分岐にのみ**現れる」「ゲートは `app.isPackaged`」と定めた。
  さらに `SCAN_EXTENSIONS` に **`.html` が無い**ため、
  検証項目 10 はこの 2 つ目の CSP 定義を**一度も見ていない**
- **Why must-fix**: 「緩和が 1 箇所に現れる」という AD-025 の決定が成立していない。
  加えて AD-025 §7 は「開発用の CSP 定義も検証スクリプトの走査対象に含め、除外リストへ移さない」と
  書いているのに、**拡張子で構造的に外れている**。
  検証項目 10 が ok を返し続けるので、この形は気付かれない
- **Suggested fix**: meta タグを削除し (CSP は `protocol.ts` のヘッダが与える)、
  `SCAN_EXTENSIONS` に `.html` を足す。**先に `.html` を足して meta タグで発火することを確かめる**
  — ルールは違反サンプルで発火してから信用する (AD-025)

### MF-005 — 内部識別子 `host` / `wsl:<distro>` が全ランタイムカードに生で出ている [origin: ux]

- **Where**: `src/renderer/src/features/runtime-list/RuntimeListScreen.tsx:103`
- **Issue**: `<p className={cn(mono, ...)}>{runtime.id}</p>`。
  `Windows (ホスト)` の直下に `host`、`WSL: Ubuntu-26.04` の直下に `wsl:Ubuntu-26.04` が出る
- **Why must-fix**: FR-047「内部識別子をそのまま提示してはならない」への直接の違反。
  参照キーの訳出は `labels.ts` の `Record` で徹底されているのに、
  **ここだけが例外**になっている。表示名 (`WSL: Ubuntu-26.04`) と表記が競合し、
  利用者に 2 つの名前を覚えさせる
- **Suggested fix**: 行を削除するか、`title` / `data-*` 属性へ退避する

### MF-006 — `<html lang>` が無く、`<title>` が scaffold のまま [origin: a11y]

- **Where**: `src/renderer/index.html:2` / `:5`
- **Issue**: `<html>` に `lang` 属性が無い。`<title>Electron</title>` のまま。
  UI 文言は FR-047 に従い全面日本語である
- **Why must-fix**: WCAG 2.1 **3.1.1 Language of Page (Level A)**。
  スクリーンリーダが既定音声で日本語を読もうとし、読み上げが破綻する。
  **日本語を第一言語として選んだ以上、`lang="ja"` はそれを支援技術に伝える唯一の手段**である。
  `<title>Electron</title>` は 2.4.2 の「トピック・目的を説明する」を満たさず、
  かつ製品名 (AD-014) でもない
- **Suggested fix**: `<html lang="ja">` / `<title>Closta</title>`

### MF-007 — 「選ぶ」ボタンに `onClick` が無く、押しても何も起きない [origin: a11y / ux]

- **Where**: `src/renderer/src/features/folder-runtime-resolution/ResolutionScreen.tsx:108-110`
- **Issue**: `<Button size="sm" variant="outline" disabled={blocked}>` に
  `onClick` / `type` / `form` のいずれも無い。有効状態で押して**無反応**。
  features 配下の `<Button>` 12 件のうち `onClick` を持たないのはこの 1 件だけ
- **Why must-fix**: 対話要素として公開されているのに振る舞いが無い (WCAG 4.1.2)。
  US-3 の主たる操作に見える位置にあるため、故障と区別できない
- **Suggested fix**: R-1 で「選ぶ」の意味が決まらないなら**ボタンにしない**。
  R-1 は組み合わせの**解決**までがスコープで、選択の永続化は含まない。
  ボタンを残すなら押下後の結果を示すこと

---

## SHOULD_FIX (13 件の要点)

機械検証の穴と、仕様が要求する体験の欠落。

| ID | 内容 | origin |
|---|---|---|
| SF-001 | 到達可能性バッジの文字色が light 既定で AA 未満 (`amber-600` 約 2.9:1 / `emerald-600` 約 3.7:1)。**色以外の手がかり (日本語ラベル) はあるので 1.4.1 は満たす。問題はその色が読めないこと** | a11y |
| SF-002 | `disabled` にした操作の理由が `aria-describedby` で結ばれておらず、`disabled` によりフォーカスも当たらない (features 配下に `aria-describedby` 0 件) | a11y |
| SF-003 | 読み込み中・エラー・操作結果に live region が無い (features 配下に `aria-live` / `role="status"` が **0 件**。生成物側は 5 件ある) | a11y |
| SF-004 | フォルダ階層を移動するとコンテナが unmount されフォーカスが `<body>` に落ちる。移動先も通知されない | a11y |
| SF-005 | 表示名 input にラベルが無く `placeholder` のみ (入力開始で手がかりが消える) | a11y |
| SF-006 | `登録を解除` が 1 クリックで確認も undo も無い。**`blocked` / `unreachable` のエントリは所在選択が塞がるためアプリ内で作り直せない** | ux |
| SF-007 | SC-015 の「WSL が見つからない旨」が UI に存在しない。`wsl-detector.ts:82` が必ず `Win32Runtime` を返すため空状態にも到達しない | ux |
| SF-008 | 重複登録時に main が返す `existing` を renderer が捨てている (`grep existing src/renderer` → 0 件)。AC US-2-5 の「既存エントリが選択状態になる」が未実装 | ux |
| SF-009 | `ResolutionScreen` の `blocked` 手順が「ランタイムを再検出する」を指示するが、この画面の「再判定」は解決の再計算だけで `refreshRuntimes()` を呼ばない。**手順どおり押しても同じ `blocked` が返り続ける** | ux |
| SF-010 | ブラウズセッション期限切れで `result` を失敗形に差し替えるため現在地が失われる。quickstart V-2 #9 の「同じ位置から続行できる」を満たさない | ux |
| SF-011 | 「会話 (R-3)」タブが動作するチャットに見え、未接続の予告は**送信後にしか出ない**。偽の assistant 応答が返るためモデルが答えたように見える。予告が内部 feature ID「R-3」 | ux |
| SF-012 | 不足依存の「導入手順への導線」がリポジトリ相対パスの**文字列**で、開く手段が capability に無い。`docAnchor` も生で出ている | ux |
| SF-013 | `eslint-plugin-jsx-a11y` / axe が未導入。MF-006 / SF-005 は既定ルールが検出する類であり、**a11y 回帰を止める自動経路が 0** | a11y |

## CONSIDER (10 件の要点)

`h1` 不在と見出し階層 / 入力欄の非テキスト対比 / フォルダとファイルの区別が絵文字と色のみ /
操作できない項目を `<button disabled>` で公開 / ローダが `tick={0}` 固定で静止 /
エラー表示が発生源から遠い / `ErrorState` の `Retry` だけ英語 /
タブ切替で画面状態が全破棄 / 「再判定」が画面ごとに別の意味 /
`unregisterFolder` の `{ ok: false }` が無通知。

## 機械検証トラックの結果 (すべて 0 件)

| 検証 | 結果 |
|---|---|
| `pnpm lint` | 違反 **0** (`--no-cache` 再実行で 103 ファイルが実際に検査されたことを確認) |
| `pnpm typecheck` | エラー **0** (2 project) |
| `pnpm depcruise` | 違反 **0** (115 modules / 398 dependencies) |
| `pnpm check:constitution` | 違反 **0** (ok 10 / **検査対象なし 1**) |
| `pnpm test` | 13 files / **245 passed** |
| `pnpm test:rules` | 期待表と **20 件一致**、捕まらない経路 2 件 (記録済み) |

**「検査対象なし」は合格に数えない。** 項目 5 (イメージ構築サブコマンド) は
docker を名指せるモジュールが 0 件のため対象が無い (R-1 の設計どおり。X-4 で対象が生じる)。

**この 0 件は「ルールが発火した結果の 0 件」である。** `test:rules` が
20 件の違反サンプルで各検出器の発火を確認している。

## 検証ツール自身に見つかった問題

**`pnpm test:rules` は違反サンプルを実際の作業ツリー (`src/**/__rulecheck__/`) に展開する。**
そのため **`lint` / `depcruise` / `check:constitution` と並列に走らせると偽の違反が出る。**
本 gate で実測した — 別トラックが `test:rules` を走らせている最中の
`check:constitution` が 5 項目 12 件の違反を報告し、**全件が `__rulecheck__` 配下を指していた**
(検査対象が 100 → 120 ファイルに増えていた)。

CI (`verify.yml`) は 1 ステップ 1 検証の直列なので安全だが、
**手元で並列に回す運用は安全でない。** 展開先を検査対象ツリーの外に出すか、
`test:rules` を他の検証と排他にする必要がある。

## テストが仕様と乖離している箇所

SC-018 と BE-048 は計測経路を「**main 側ハンドラを直接呼ぶ**ユニットテスト」と定めているが、
`src/main/app/validate.test.ts` は `isTrustedSender` / `isValidPathDTO` などの
**検証述語を直接呼んでいるだけ**で、`registerIpcHandlers` も `FolderService` も
一度もインスタンス化しない。テスト自身のヘッダが「検証関数を直接呼ぶ」と書き換えており、
**仕様の要求を無言で緩めている**。このため
「ハンドラが実際にその検証を呼んでいるか」「期限検査がファイルアクセスより前か」は
誰も見ていない (MF-003 の温床)。

## Status 遷移

verdict が FIX_REQUIRED のため **`implementing` に据置**。`reviewing` へは昇格しない。
