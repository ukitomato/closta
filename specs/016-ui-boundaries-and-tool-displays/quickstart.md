# Quickstart: 会話の境界と tool の専用表示の第 2 弾 (O-6)

自動の検証は `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で流す。以下は自動で見ない確認。

## V-1 境界の差分 (SC-005)

- `SESSION_EVENT_KINDS` と `TRANSCRIPT_PART_FIELDS` の差分が 0 (O-4 の後の値から増えない)
- `AGENT_SDK_ALLOWED_CALLS` と `QUERY_OPTION_KEYS` の差分が 0。IPC・preload・main の差分が 0

## V-2 対応表 (SC-004)

`node scripts/constitution/check.mjs` の項目 21 が ok で、出力の後続の件数に O-6 が無く、M3 の完了の条件の残りから O-6 の 14 行が消えている。

## V-3 実機の目視 (利用者。自動の合否に含めない。本番ビルドで)

- `/compact` を実行し、圧縮の境界が出ること。過去ログで同じセッションを開き、同じ形で出ること
- `/clear` で会話の作り直しの境界が出ること
- コードを読ませる依頼で `Read` / `Glob` / `Grep` が専用の表示で出て、WSL のパスが崩れないこと
- `WebFetch` / `WebSearch` が出ること (クエリ付きの URL で見出しにクエリが出ないこと)
- `TaskCreate` などが TodoList の形で出ること
- 長い Bash の間に「結果待ち」、強制終了の後に「結果不明」が出ること
- スクリーンリーダー (ナレーター) で、tool のエラーと圧縮が読み上げられ、うるさすぎないこと
- **O-2 の V-4 の未記録の 2 項目 (並列の tool の結果が 1 つずつ来るか・subagent の tool 名) を記録する** (O-11 の判断の材料)
