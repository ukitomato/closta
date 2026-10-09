# Quickstart: 計量と制限の表示 (O-4)

自動の検証 (lint・型検査・依存グラフ・Constitution 検証・単体・E2E) は [docs/discovery.md](../../docs/discovery.md) の "Build / Test / Lint" 表の「agent 用」の列で流す。以下は自動の合否で見ない確認と、PR の説明に写す差分の確認。

## V-1 境界の差分 (SC-006)

`main` を基準に、次の差分が 0 であること。

- `git diff main...HEAD -- src/main src/preload src/domain/capability.ts` — IPC のチャネル・preload・main (`meter` は port だけを通る。状態通知の型 `status-update.ts` の差分も 0)
- `git diff main...HEAD -- src/agents/session-core.ts` の `QUERY_OPTION_KEYS` の行と、`scripts/constitution/allowlists.mjs` の `AGENT_SDK_ALLOWED_CALLS` / `PERMISSION_MODE_ESCALATION_VALUES` の行
- `src/domain/session/transcript-dto.ts` の `TRANSCRIPT_PART_FIELDS` の行
- `SESSION_EVENT_KINDS` の差分が `meter` の 1 つ、`LAUNCH_FAILURE_REASONS` の差分が data-model §1 の 8 つ (固定テストが値で見る)

## V-2 対応表 (SC-005)

`node scripts/constitution/check.mjs` の項目 21 が ok で、出力の後続の件数に O-4 が無い。M3 の完了の条件の残り (Tier A の後続のうち割当先が M3 の行) から O-4 の 5 行が消えている。

## V-3 「プロバイダ」の表記 (SC-007)

Grep で `プロバイダ` を `src/renderer` と `e2e` で探し、文言の表 (`labels.ts`) とテストの期待値に 0 件。

## V-4 実機の目視 (利用者。自動の合否に含めない)

本番ビルドで行う (本番の CSP でだけ落ちる見た目があるため)。結果は `quickstart-results.md` に書く。完了までに確かめられなかった項目は roadmap の O-4 の行に残す (tasks SH-013 / SH-014)。

| # | 手順 | 見ること | 関わるリスク |
|---|---|---|---|
| 1 | 認証が切れた状態 (ログアウト・期限切れの API キー) で 1 回送る | 失敗の理由が「認証または権限のエラー」で、再ログインの導線が出る。**同じ状態で、届く result と assistant のメッセージの形 (subtype / `api_error_status` / `error`) を下の「形の控え方」で控える** (アプリは生の値を出さない) | plan RK-06 |
| 2 | claude.ai のサブスクリプションの Provider で長めのセッションを回す | 使用量のタブの費用・トークン・ターン数・モデルごとの内訳と、中央のヘッダの目盛りが動く。Bedrock / API キーの Provider では Quota banner が出ない。**起動の設定のモデル id と、使用量のタブの内訳のモデルの id (`modelUsage` のキー) の形 (alias・`[1m]` の有無) を見比べて控える。内訳に主モデルの行が無ければ「形の控え方」でキーを控える** | RK-02 / RK-15 |
| 3 | tool を何度も呼ぶターンの後で、Claude Code の `/context` を見る | 中央のヘッダのコンテキストの割合と `/context` の差が ±10% 以内。**差の値を控える** (超えたら SH-014 で data-model §2 / §4 を見直す) | RK-03 / RK-08 |
| 4 | 制限に近づく・超えるまで使う (できるとき) | Quota banner の種類・割合・解除の時刻。**`rate_limit_event` の `utilization` と `resetsAt` の生の値を「形の控え方」で控え、単位を確かめる** | RK-07 |
| 5 | plan モードで起動し、ExitPlanMode を承認する | 「権限モードが … に変わりました」の行と、「概要」の「現在の権限モード」。安全 3 値の外に変わったら警告の帯 (隔離の文言は `allowed` のランタイムでも「確かめていません」)。**変化の行が出たのが承認の直後 (`status`) か、次に送ったターンの最初 (`init`) かを控える** | RK-09 |
| 6 | 長い Bash を走らせる。思考の長い依頼を送る | tool の見出しの経過時間が 1 秒ごとに進む。transcript の末尾に「思考中 約 N トークン」が出て、応答が届くと消える | RK-04 |
| 7 | `/compact` を送る (または長い会話で自動の圧縮を待つ) | 「コンテキストの圧縮」の行が「圧縮中」から成功 / 失敗に書き換わる | — |
| 8 | 背景の subagent を走らせる | task の行に種類が残ったまま、トークン・tool の回数・経過時間が増える | RK-10 |
| 9 | 右のペインを開き、タブを ←/→・Home / End で移る | 選ばれたタブだけが Tab 順に入り、移ると中身が切り替わる | — |
| 10 | 承認待ちで「許可」を押す。稼働中の行の「閉じる」を押す | フォーカスが composer / 隣の行に移る (body に落ちない) | — |

### 形の控え方 (アプリの外。#1 / #2 / #4)

アプリは生の値 (subtype・HTTP の状態・assistant の `error`・`utilization` / `resetsAt` の単位) を画面にも記録にも出さない。`modelUsage` のキーは使用量のタブのモデルごとの内訳に出るが、検証で落ちた行は出ない (data-model §1 / §2。plan RK-14)。形はアプリの外の Claude Code CLI で控える。アプリのコードに stream の解析を足さない (Principle IV)。

1. アプリがそのセッションを動かすのと同じランタイム (WSL の distro など) の中で、同じ Provider の認証を与える (設定ディレクトリの Provider なら同じ `CLAUDE_CONFIG_DIR`、API キーの Provider なら同じ環境変数)。#1 は認証が切れた同じ状態で行う
2. `claude -p "<短い依頼>" --output-format stream-json --verbose` を走らせる。モデルは起動の設定と同じ id を `--model` で渡す (#2)
3. 出力の行から次の値だけを書き写す。**出力をファイルに保存してリポジトリに置かない。** `errors`・`result`・本文・`cwd`・パス・`tools`・`mcp_servers` などは控えない (会話・エラー文・パス・秘密を含みうる。Principle V / U-5)

| 行 (`type` / `subtype`) | 控える値 (数と列挙とモデルの id だけ) | 使う先 |
|---|---|---|
| `result` | `subtype`・`is_error`・`api_error_status`・`modelUsage` のキー (モデルの id) と各 `contextWindow` | #1 → data-model §1 / #2 → data-model §4 の主モデルの照合 |
| `assistant` (`parent_tool_use_id` が null) | `error` (列挙。無ければ「無し」) | #1 → data-model §1 |
| `rate_limit_event` (届いたとき) | `rate_limit_info` の `status`・`rateLimitType`・`utilization`・`resetsAt`・`isUsingOverage` | #4 → data-model §2 の値域と単位 |
| `system` / `init` | `permissionMode` | 起動の設定 (`--permission-mode`) と同じ値か |

控えた値は `quickstart-results.md` に書く。data-model を直すかは tasks SH-014 のとおり。
