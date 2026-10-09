## Specification Analysis Report — 015-ui-mcp-elicitation-commands (O-5 / Track A / design-gate R1)

| ID | Category | Severity | Location | Summary | Recommendation |
|---|---|---|---|---|---|
| F1 | Inconsistency | HIGH | data-model.md:51 / FR-005 | 前回と同じかを「件数と名前の連結の長さ」で比べると、MCP の `status` だけの変化や同じ長さの別のモデルを見逃す。US-2 AC2 / AC4 の主な場面で送られない | 無害化した後の値全体で比べる。「status だけ変わる → 送る」のテスト |
| C1 | Underspec / Coverage | HIGH | FR-001・US-1 AC2 / data-model §1 / `tool-result.ts:23-35` / `transcript-dto.ts:30` | `toolResultText` は text 以外を捨て、`result` は `string\|null`。画像 / resource の印は今の契約では実現できない | (a) 印を外す (b) `toolResultText` に印の文字列を差し込むタスク (全 tool・両経路)。DTO を広げるなら ADR |
| F2 | Inconsistency | HIGH | US-1 AC4 と Edge Cases・data-model §1 | AC4 は「`__` を含む名前は全体を tool 名」、§1 は「最初の `__` で分ける」 | AC4 を §1 に合わせ、限界を記す |
| B1 | Ambiguity (security) | MEDIUM | data-model §1 (`uri`) | `mayCarrySecret` は URL の資格情報を検出しない | `uri` を出さないか userinfo と query を落とす |
| B2 | Ambiguity (security) | MEDIUM | FR-003 / data-model §1 | 承認カードの名前が 64 文字で切られる | 承認カードは切り詰めない |
| C2 | Underspec | MEDIUM | data-model §2 / O-4 の間引き | O-4 の 1 秒 20 件の上限に config / commands が掛かるか。F1 と組み合わさると二度と届かない場合 | 間引きの対象外か、基準を送れた後にだけ更新 |
| F3 | Terminology | MEDIUM | data-model §2・§3 / `running-session-store.ts:379` | `meters.config` と既存の `sessions[id].config` (`SessionLaunchConfig`) が同じ名前。モデルが「概要」と「構成」に違う値で出る | 種類名を変え glossary で区別。モデルの置き場を決める |
| F4 | Inconsistency | MEDIUM | US-3 AC3 と data-model §4 / `sdk.d.ts:5214` | AC3 は「名前」、§4 は「最後の 1 件」。SDK の `name` は per-marketplace name | AC3 を §4 に合わせ「マーケットプレース名」に |
| D1 | Constitution XIII | MEDIUM | data-model §5 / FE-021・SH-002 | F 節の MCP server panel の使い道を先に決めているが、照合の結果が FE-021 に反映される形でない | FE-021 を SH-002 の後に、照合の結果で F 節を決める |
| C3 | Underspec | MEDIUM | plan / BE-030 / `sdk-agent-session.ts:559` | `auth_status` は最上位の型 (`sdk.d.ts:3414`) で今は `default` で捨てる。switch の分岐のタスクが無い | BE-030 に分岐と closure の値 |
| C4 | Underspec | MEDIUM | data-model §3 / 013 data-model §4 | O-7 の `PanelTab` に注意の印のフィールドが無い | §3 に形 (`attention(sessionId)` など) |
| L1 | Inconsistency | LOW | data-model §4 / plan | `started` は既に `SYSTEM_EVENT_STATUSES` (`transcript-dto.ts:67`)。category の正本は `transcript-dto.ts:62` | 訂正 |
| L2 | Inconsistency | LOW | FR-005 / Clarification Q2 | `init` の `mcp_servers` に `error` は無い (`McpServerStatus` 側) | 文言を直す (テストの防御は残してよい) |
| L3 | Underspec | LOW | data-model §5 | 経路の列の書き換えが無い | 書く |
| L4 | Underspec | LOW | data-model §2・§3 / Edge Cases | `OmittedCounts` の形と文言の不一致 | 揃える |
| L5 | Underspec | LOW | data-model §3 / `sdk-agent-session.ts:286` | `commands_changed` は最初のプロンプトより前に届くが config が無い間は一覧も隠れる | 決める |
| L6 | Coverage | LOW | `system-event.ts:117` | `HOOK_OUTCOMES[x] ??` が BE-030 で触るファイルに残る | `Object.hasOwn` に |
| L7 | Underspec | LOW | SH-010 / roadmap | O-10 の ID と順、O-5 の行の依存 (O-4)・題名から Elicitation を外すことを SH-010 で明示していない | 書き出す |
| L8 | Underspec | LOW | O-4 FE-040 | tool の経過時間を McpToolCall にも出すか | FE-011 に一言 |

### Coverage

FR-001〜FR-012 / SC-001〜SC-005 すべてに task (C1・B2・F1・C2・C4・D1・C3 を備考)。

### Constitution Alignment

違反なし (Critical 0)。XII: `後続: O-5` は実測 21 行 (A 5 / C 6 / E 10) で data-model §5 がすべてを扱う。O-10 に回る 4 行のうち 3 行が Tier A。XIII: D1。XIV: F3。

### コードの事実

合っている: `tool-registry.aui.tsx:22-38,36`、`ApprovalCard.tsx:30`、`sdk-agent-session.ts:543-558,80`、SDK 型の行番号。ずれ: `onUserDialog` の範囲は :1662 まで。

### Metrics

要件 17 (FR 12 / SC 5) / タスク 13 / カバー率 100% / 曖昧 4 / 重複 0 / **Critical 0** / High 3 / Medium 8 / Low 8
