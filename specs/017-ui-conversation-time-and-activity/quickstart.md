# Quickstart: 会話の時間と活動の可視化 (O-9)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data model**: [data-model.md](./data-model.md)

実装の後に確かめる手順。規則は data-model が正本で、ここには手順と期待だけを書く。結果は `quickstart-results.md` に書く。

## 前提

- 本 feature の branch (`017-ui-conversation-time-and-activity`) の上で、依存を入れ終えている
- コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列 (`node` で直接呼ぶ。`pnpm` / `npx` は使わない)

## V-1 自動の検査 (agent)

| # | コマンド | 期待 |
|---|---|---|
| 1 | `node node_modules/vitest/vitest.mjs run` | 全件 pass。特に次のテストが入っていること: `parseMessageTime` の表 (data-model §1)・過去ログの変換の時刻 (あり・無し・壊れ・範囲外・Hook / task の合成・入れ子)・実行中の時刻 (assistant・送り直し・結果だけ・システムイベントの行)・稼働中のストアの `appendUser` と積まれた入力の時刻・`receivedAt` (取り込みと差し替え)・`deriveTurns` (時計が 2 つの fixture を含む)・`activityBins` の表 (data-model §4)・時刻と所要時間の component (偽の時計)・地図と帯の component (vitest-axe の違反 0。1,000 ターンの描く行の上限) |
| 2 | `node node_modules/eslint/bin/eslint.js --cache .` | エラー 0 |
| 3 | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false` と `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --composite false` | エラー 0 |
| 4 | `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src` | 違反 0 (agents が新しく import するのは `domain/session/transcript-time.ts` だけ) |
| 5 | `node scripts/constitution/check.mjs` | 全項目 ok。項目 21 (対応表) が ok |

## V-2 差分と記録の確認 (agent)

- `git diff main --stat -- src/main src/preload` が空 (SC-005。IPC・preload・main を変えない)
- 固定テスト `TRANSCRIPT_MESSAGE_FIELDS` / `TRANSCRIPT_PART_FIELDS` / `METER_UPDATE_TYPES` の期待値を変えていない (SC-005)
- `src/agents/` の Agent SDK の呼び出しの許可リスト (`scripts/constitution/allowlists.mjs`) と query の options のキーに差分が無い (FR-005)
- `docs/ui-coverage.md`: F 節の Message timing / Heat graph / Conversation map の使い道が `A SDKAssistantMessage / A SDKUserMessage`、Activity graph / Trace waterfall が `未使用` と理由。備考の割当先が O-9 の行が 0 (SC-006)。A 節の 2 行と「SDK を上げたときの手順」の 4 (data-model §7)
- `docs/decisions/0051-message-time-source-and-display-only.md` が `status: proposed` で存在する (SC-006)
- glossary・ui charter・session charter・`_overview.md`・`prompts.md`・roadmap が data-model §7 のとおり
- PR の説明に registry の照合の結果 (候補名と不適合の理由。research R-10) がある (Principle XIII)
- E2E の基準画像 (`composer-fullwidth.png`・`sidebar-past-sessions.png`) は時刻と右のペインを写さないので変わらない。CI の e2e job で差分が出たら、原因を確かめてから CI の artifact で取り直す

## V-3 実機の目視 (利用者。本番ビルド)

| # | 手順 | 期待 / 記録すること |
|---|---|---|
| 1 | 過去のセッションを 1 つ開く | 利用者と assistant のメッセージに時刻が出る。**出なければ** `getSessionMessages` の返りに `timestamp` が無い (U-2 の前提が崩れる)。その旨を記録して利用者に返す |
| 2 | 同じ過去のセッションで、時刻にポインタを重ねる・Tab でフォーカスする | 年月日と秒が出る |
| 3 | 同じ過去のセッションで、圧縮の要約 (`/compact` の後) を含むものがあれば開く | 要約が地図の 1 ターンに数えられる見え方を記録する (research R-06 の既知の限界) |
| 4 | **WSL ランタイムで** 新しいセッションを起動して 2 ターン送る (docker endpoint があれば、それでも 1 回) | 入力に送信の時刻、応答に時刻が出る。1 ターン目は 2 ターン目を送った後 (または応答の終わりの後) に所要時間が出る。実行中のターンには出ない。所要時間が体感の経過時間と合う (ランタイムの時計のずれを含まない。U-8)。終わってから同じセッションを過去ログとして開き、同じターンの所要時間との差を記録する (受信の遅れの分だけ違いうる)。応答の時刻と入力の時刻の差が所要時間と大きく違えば、ランタイムの時計のずれとして記録する。実行中の SDK のメッセージが `timestamp` を持つかは画面から見分けられない (無ければ受信時刻に倒れて同じに見える) ので、**未確認として記録してよい** |
| 5 | 応答中に入力を積み (message queue)、応答の終わりで送られるのを待つ | 積んだ入力の時刻は送られた時刻 |
| 6 | 右のペインの「会話の地図」を開く | ターンごとの行・時刻・入力の先頭・所要時間・tool の数・エラーの数・境界の印。行を選ぶと中央がそのターンへ移り、フォーカスは地図に残る |
| 7 | 長い過去のセッション (数百ターン) で地図の末尾の行を選ぶ | 中央の仮想化の外でも移る |
| 8 | 実行中に 100 件を超えたセッションで、地図の最初の行を選ぶ | 窓が広がって移る |
| 9 | 帯の区間を矢印キーで移り、Enter で選ぶ | ナレーターで区間の時刻の範囲と活動の数が読まれる。活動の無い区間は押しても移らない |
| 10 | 中央を別のセッションに切り替える・何も出さない状態にする | 地図が替わる・空の状態になる |
| 11 | 過去のセッションが 50 件以上ある状態で、目当ての会話を語 1〜2 個で絞れるか (012 の V-3 の未実施の項目。research R-11) | 結果を記録する。絞れなければ U-7 の再検討の条件に当たる |
| 12 | assistant のメッセージに 1 つずつ時刻が出る見え方 (tool だけのメッセージを含む) | 密度が気になるかを記録する (plan RK-06) |
