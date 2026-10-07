# Quickstart: 計量と制限の表示 (O-4)

自動の検証は `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で流す。以下は自動で見ない確認。

## V-1 境界の差分 (SC-006)

- `git diff main...HEAD -- scripts/constitution/allowlists.mjs src/agents/session-core.ts` で `AGENT_SDK_ALLOWED_CALLS` と `QUERY_OPTION_KEYS` の差分が 0
- `git diff main...HEAD -- src/domain/capability.ts src/preload src/main` で IPC のチャネル・preload・main の差分が 0 (`meter` は port だけを通る)

## V-2 対応表 (SC-005)

`node scripts/constitution/check.mjs` の項目 21 が ok で、出力の後続の件数に O-4 が無い。

## V-3 実機の目視 (利用者。自動の合否に含めない)

- claude.ai のサブスクリプションの Provider で長めのセッションを回し、使用量のタブの費用・トークン・コンテキストの目盛りが動くこと。Bedrock / API キーの Provider では Quota banner が出ないこと (RK-02)
- tool を何度も呼ぶターンの後で、コンテキストの目盛りの値と Claude Code の `/context` の値の差が ±10% 以内であること (RK-08)
- `rate_limit_event` の `utilization` と `resetsAt` の実際の値の単位を記録すること (RK-07)
- 実機の目視は本番ビルドで行う (本番の CSP でだけ落ちる見た目があるため)
- plan モードで起動し ExitPlanMode を承認して、権限モードの変化の行と中央のヘッダの表示が変わること
- 長い Bash で tool の経過時間が 1 秒ごとに進むこと、思考中のトークン数が出ること
- `/compact` (または長い会話) で圧縮の行が出て、成功 / 失敗に書き換わること
- 認証が切れた状態で送信し、失敗の理由が「認証の失敗」で再ログインの導線が出ること
