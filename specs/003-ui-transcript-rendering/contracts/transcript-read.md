# Contract: transcript の取得 (agents ↔ domain ↔ main ↔ renderer)

[plan.md](../plan.md) / [data-model.md](../data-model.md) の契約。読み取り専用の transcript 取得経路。

## C-1 取得は読み取り専用 SDK 呼び出し

- 取得プロセス (`src/agents/`) が `getSessionMessages(sessionId, { includeSystemMessages })` を呼ぶ。
  **SDK を呼ぶのはここだけ** (Principle IV / AD-023 §2)
- **`dir` オプションは使わない** — `dir` は SDK の **project dir** であって config dir ではない
  ([data-model.md](../data-model.md) §1 / AD-021 は listSessions について立証、getSessionMessages は sdk.d.ts で確認)。
  config ディレクトリは **プロセス env `CLAUDE_CONFIG_DIR`** で渡す (C-2)
- **書き込み系 API を呼ばない** — `renameSession` / `tagSession` / `deleteSession` / `forkSession` /
  `importSessionToStore` は禁止 (読み取り専用。FR-001)
- `sessionStore?` は **@alpha** のため渡さない (ローカル FS 読み)。I-1 で store を使うまで保留

## C-2 config ディレクトリは env 固定の専用プロセスで渡す (env レース排除)

- **transcript は target ごとに `CLAUDE_CONFIG_DIR` を起動時固定した専用 (短命) プロセス**で取得する
  (AD-021 の子プロセス方式)。R-2 の**常駐プロセスの共有可変 env に相乗りしない** —
  相乗りすると本文の並行取得が列挙と env を踏み合い別ディストロを読む (AD-021 §3 / AD-030 §3)
- 親環境を丸ごと継承させず、渡す env を最小 allowlist にする (Principle V の踏襲)
- config ディレクトリの組み立ては R-2 の `config-dir.ts` を再利用し、値をそのまま渡す
  (`UNC_FORBIDDEN_IN = ['src/agents/']` を継承。取得プロセスは UNC を結合・分解しない)

## C-3 本文は main を経由せず MessageChannelMain の port transfer で運ぶ (Principle IX)

- **main を transcript 本文のデータ経路に置かない。** main は本文を保持・`JSON.parse`・
  structured clone deserialize しない
- **形**: main が `MessageChannelMain` を作り、port1 を取得プロセスへ transfer
  (`child.postMessage(msg, [port1])`)、port2 を renderer へ transfer (`webContents.postMessage(ch, null, [port2])`)。
  **本文 (`ThreadMessageLike` DTO) は取得プロセス↔renderer 直通**で流れる。main は port ハンドルの橋渡しのみ
- 変換 (`SessionMessage[]`→`ThreadMessageLike[]`) は取得プロセス側で `domain` の純粋関数として走らせ、
  DTO を port に流す (main も renderer 描画スレッドも重い変換で塞がない)
- `MessagePortMain` / `parentPort` は薄い adapter に閉じ、本体は import に現れない (Principle VII / AD-010)
- **renderer に取得プロセスへの transferable な port を「素通し」しない** — main が仲介した port2 を
  renderer が受けるが、要求の発行 (sessionId/targetKey) は必ず `getTranscript` invoke を通し main の検証を経る
- **port2 は取得プロセス→renderer の一方向データ送出専用**。取得プロセスは inbound の port メッセージを受理しない
  (spawn 時固定の単一 sessionId のみ扱い、port 経由で取得対象を変更できない構造保証。S-001。CWE-862)

## C-4 SDK 呼び出しの許可 (機械検証) と read-only の構造保証

- **read-only の第一義的保証**: 書き込みを起こす IPC メソッドが存在しないこと (getTranscript 1 本のみ、
  取得専用)。これを ADR / 本契約に明記する
- 加えて `scripts/constitution/allowlists.mjs` の `AGENT_SDK_ALLOWED_CALLS` に **`getSessionMessages` を追加**する
  (**ファイル冒頭規則により ADR 必須**)。判定は呼び出し形で行う (import / 型注釈は違反にしない)
- 既存の違反 fixture `sdk-forbidden-call` は `getSessionMessages` を禁止例にしていたため、
  **書き込み系 API (`renameSession` 等) に差し替え**、発火を維持する (AD-027)
- **defense-in-depth** (M-008): item 14 は呼び出し形の正規表現のみで alias (`const r=renameSession; r()`) /
  dynamic import を素通しする。書き込み系 API の binding レベル denylist を足すか、alias 形の fixture を 1 件加え
  `UNDETECTED_NOTES` に限界を `nextFeature` つきで明記する (AD-027 / SC-017 規範)

## C-5 変換は domain の純粋関数

- `src/domain/session/transcript.ts` が `SessionMessage[]` → `ThreadMessageLike[]` を変換する。
  **I/O を持たず、モックなしでテストできる** (FR-004)。対応は [data-model.md](../data-model.md) §3、
  tool_use↔tool_result は §4、system サブ種別は §3 の実名割り当て

## C-6 本文サニタイザ (R-2 normalize を本文に流用しない)

- 本文・tool 入出力は会話由来の逐語を含む。**transcript 本文用のサニタイザ**を通す
  ([data-model.md](../data-model.md) §6) — **改行/タブ保持**・bidi/C1/危険 C0 除去・本文相応の上限・
  tool_result 切り詰め + 折りたたみ。**R-2 の 1 行要約用 `normalize` (改行除去・512B) をそのまま使わない**

## C-7 XSS / 本文の露出面 (FR-020)

- 会話由来 markdown は**生 HTML を描画しない** (rehype-raw を足さない)。URL は http(s)/相対/data:(画像 MIME) に
  allowlist し javascript:/vbscript:/file: を除去 ([data-model.md](../data-model.md) §7)。CSP を最終防御線に保つ
  - **enforcement 点 = `src/renderer/src/lib/safe-url.ts` の `safeUrlTransform`**。react-markdown の `urlTransform` として
    `src/renderer/src/components/markdown-text.tsx` の `MarkdownTextPrimitive` に渡す。`img` の `src` は相対 + data:画像のみに
    絞り (CSP `img-src 'self' data:` と一致させ http(s) リモート画像を除外)、`a` の `href` は http(s)/相対/data:画像を許可する
- **transcript 本文・tool_result の中身を log / error message / renderer への理由文字列に含めない**
  (bounded な `FailureReason` コードのみ返す。CWE-532)

## 検証 (この契約に対応する SC)

| 契約 | 検証 | SC |
| --- | --- | --- |
| C-1 読み取り専用 | 書き込み系 API 呼び出し 0 件 / config 書き込み 0 件 / 起動 0 件 | SC-007 |
| C-2 env 固定 / レース排除 | transcript と列挙の並行要求で各応答が要求 targetKey と一致する回帰テスト | SC-001 / SC-007 |
| C-3 main 非経由 | **main が本文を受け取らない構造 (port transfer) の検査 + 手動レビュー** (依存グラフ自動証明は未構築) | SC-007 |
| C-4 許可 + read-only 構造 | `check:constitution` の SDK 項目 + fixture 発火 + 「書き込み IPC 不在」 | SC-007 |
| C-5 純粋変換 | 変換関数の Vitest (対応表の全行 + system 実名) | SC-001 / SC-005 / SC-009 |
| C-6 本文サニタイザ | 改行/タブ保持 + bidi/C1 除去 + 大 tool_result 切り詰めの Vitest | SC-006 |
| C-7 XSS / log | XSS payload negative test / 本文が log に出ない検査 | SC-008 |
