# Data Model: transcript の基本表示 (R-3)

[spec.md](spec.md) / [plan.md](plan.md) の Phase 1 成果物。**表示のためのデータ変換**を定義する。
実装コード (`src/domain/session/transcript.ts` ほか) がこの表を正本とする。

## §1 入力: `SessionMessage` (SDK。一次情報で確認済み)

`@anthropic-ai/claude-agent-sdk` **0.3.270** の `sdk.d.ts` を直読して確認した (2026-09-24)。

```ts
// sdk.d.ts:807
function getSessionMessages(sessionId: string, options?: GetSessionMessagesOptions): Promise<SessionMessage[]>

// sdk.d.ts:812
type GetSessionMessagesOptions = {
  dir?: string                 // **プロジェクトディレクトリ** (省略時は全 project を検索)。config dir ではない
  limit?: number
  offset?: number
  includeSystemMessages?: boolean  // 既定 false。compact boundary / informational を含めるか
  sessionStore?: SessionStore      // @alpha。省略時はローカル FS から読む
}

// sdk.d.ts:5903
type SessionMessage = {
  type: 'user' | 'assistant' | 'system'
  uuid: string
  session_id: string
  message: unknown               // Anthropic API の message。content ブロック列を持つ
  parent_tool_use_id: string | null
  parent_agent_id: string | null // subagent 由来。R-3 は主セッション (null) を対象
}
```

**確認事項**:
- `dir` は **project dir であって config dir ではない** (AD-021 が `listSessions` について立証したのと同じ。
  本 API も同型であることを sdk.d.ts で確認した)。config ディレクトリはローカル FS 読みでは
  `CLAUDE_CONFIG_DIR` env に従う → R-3 は取得プロセスの **env を起動時固定**して渡す (§8 / FR-006)
- `message` は `unknown`。**型を狭めてから読む** (信頼せず narrowing する)
- `sessionStore?` は **@alpha** — I-1 で store を使うまで本 feature は渡さない (ローカル FS 読み)。
  SDK 更新時に破壊的変更がありうるリスクを明記する (AD-021 #4 と同様)
- `includeSystemMessages: true` のとき `type: 'system'` (compact boundary / informational) が混じる (§3 / §4)

## §2 出力: `ThreadMessageLike` (assistant-ui)

`useExternalStoreRuntime` に渡す表示用の形 (`.claude/skills/runtime/references/external-store.md` の
API reference)。`role` / `content` (string | MessagePart[]) / `id` / `createdAt` / `status` / `metadata`。

- `content` の `MessagePart` は `thread.aui.tsx` が既に描画する種別に合わせる —
  `text` (→ `MarkdownText`) / `reasoning` (→ Reasoning) / `tool-call` (→ `part.toolUI ?? ToolFallback`) /
  `image` / `file`

## §3 変換対応表 (`transcript.ts` の純粋関数。FR-004)

**この表が変換の正本である。** 行が増えたら実装とテストが落ちる形にする (SC-009)。

| SDK 側 (`message.content` の block) | `SessionMessage.type` | ThreadMessageLike | 表示先 (part) | 備考 |
| --- | --- | --- | --- | --- |
| `text` | user | role=user, `text` part | user バブル (markdown) | 会話由来 → **本文サニタイザ** (§6) |
| `text` | assistant | role=assistant, `text` part | `MarkdownText` | 〃 |
| `thinking` / `redacted_thinking` | assistant | role=assistant, `reasoning` part | Reasoning 表示 | streaming 対応済み |
| `tool_use` | assistant | role=assistant, `tool-call` part (`toolName`/`args`/`toolCallId`) | `part.toolUI ?? ToolFallback` | **専用表示は R-4**。R-3 は fallback |
| `tool_result` | user | 直前の `tool-call` part の `result` に**対応づける** (§5) | 同上の fallback 内 | 孤児は fallback に単独表示 |
| `image` | user/assistant | `image` part | Image 表示 | data URI (画像 MIME allowlist) / 参照。§7 |
| document/file | user/assistant | `file` part | File 表示 | 大きい本文は切り詰め |

### system メッセージの実名割り当て (`includeSystemMessages: true`。M-002/M-010 の穴を塞ぐ)

「or 表示対象外」の曖昧さを残さない。getSessionMessages が返しうる `type: 'system'` を実名で割り当てる。

| system の内容 | ThreadMessageLike | 表示先 | 備考 |
| --- | --- | --- | --- |
| compact boundary (`SDKCompactBoundaryMessage` 相当) | role=system, 区切り part | 最小の区切り表示 | FR-018。専用 element は O-2 |
| informational notice | role=system, `text` part (サニタイズ) | 最小のシステム行表示 | 会話由来でないが本文サニタイザを通す |
| 上記以外の system サブ種別 | — | **表示対象外として明示記録** | H-005 の sdk.d.ts 確認で列挙し、各行を「表示 or 表示対象外」で**実名確定**する (選択肢のままにしない) |

**実装時の義務**: `includeSystemMessages: true` の返り値に現れる system サブ種別を sdk.d.ts と実データで洗い出し、
上表に**実名で**追記する。未分類の system を「表示対象外」に暗黙で落とさない (Principle XII)。

### 表示先の割り当て (Principle XII の先取り。FR-019 / SC-009)

> **2026-10-03 追記 (O-2)**: この割り当ては先行の台帳である。正本は [`docs/ui-coverage.md`](../../docs/ui-coverage.md) (SDK の型から導き、Constitution 検証の項目 21 で照合する) に移った。

`docs/ui-coverage.md` は O-2 で作る。**その不在中、Principle XII の自動検証 (未割当行 grep) は
ファイル不在で vacuously pass する** — 本 feature の未割当ゼロは**この割り当て表 + レビュー**でのみ担保される。
この scope 解釈 (data-model §3 を O-2 前の暫定台帳とする) は **design-gate の人間承認を要する**。

- `SessionMessage.type` の 3 値すべて (user / assistant / system) に行がある
- content block: text / thinking / tool_use / tool_result / image / file / compact boundary /
  informational / その他 system — すべて表示先 (表示対象外を含む) を実名で持つ
- **R-3 の対象外を明示**: subagent (`parent_agent_id != null`) のネスト表示は R-4、
  種別ごとの専用 tool 表示は R-4、専用 compact element は O-2

## §4 tool_use ↔ tool_result の対応づけ (最も誤りやすい)

Anthropic の transcript では **`tool_use` は assistant メッセージ**に、**`tool_result` は
後続の user メッセージ**に現れる。assistant-ui は隣接する assistant + tool を表示上マージする。

**規則**:
- `tool_use.id` と `tool_result.tool_use_id` を鍵に対応づけ、1 つの `tool-call` part
  (`toolCallId` / `toolName` / `args` / `result`) に畳む
- **対応する `tool_use` を持たない孤児 `tool_result`** は捨てず、fallback で単独表示する (欠落禁止)
- **`result` を持たない `tool_use`** (応答前に途切れたターン) は result 無しの tool-call として示す
- **subagent が混じる場合** (`parent_agent_id != null`) は欠落させず fallback でフラットに示す (ネストは R-4)
- 対応づけは**純粋関数内で閉じる** (I/O なし)。位置ではなく id で対応づける

## §5 スレッドの直線性と分岐

`getSessionMessages` は記録順の配列を返す。**R-3 は直線スレッドとして扱う** (各メッセージの親は直前)。
編集・再生成による分岐ツリー (`ExportedMessageRepository` / `parentId` / `headId`) は本 feature では扱わない。
`useExternalStoreRuntime` の素の `messages` 配列で足りる。

## §6 transcript 本文サニタイザ (C-003 の解消。FR-016)

**R-2 の `normalize` (`src/domain/session/normalize.ts`) を本文にそのまま流用しない。**
`normalize` は一覧の 1 行要約用で、`isRemovable` が `codePoint < 0x20` を除去する (=**改行 `\n`・タブ `\t`・
CR を落とす**) うえ `TEXT_MAX_BYTES = 512` で切り詰める。これを markdown 本文に通すとコードフェンス・
段落・インデントが 1 行に潰れ (FR-007 破綻)、512B で本文が打ち切られる。

本文用に別のサニタイザ (`sanitizeBody` 等) を `domain` に定義する。

| 項目 | 規則 |
| --- | --- |
| 双方向制御文字 (U+202A–202E / U+2066–2069 / U+200E/F / U+061C) | **除去** (表示偽装防御) |
| C1 制御 (U+0080–009F) / DEL | **除去** |
| C0 制御のうち危険なもの | 除去 |
| **改行 `\n` (0x0A) / タブ `\t` (0x09)** | **保持** (markdown の整形に必須) |
| バイト長上限 | 本文相応の上限 (要約 512B ではない)。超過分は切り詰め |
| 大きい tool_result | バイト長上限で**切り詰め + 折りたたみフラグ**を付ける |

- `normalize` の bidi/C1 除去ロジックは共通化して再利用してよいが、**改行除去と 512B 上限は本文に適用しない**
- 数値 (時刻等) の検証は R-2 の `normalizeEpochMs` 等を再利用してよい

## §7 XSS / URL 安全性 (FR-020)

会話由来 markdown は攻撃者が内容を仕込める外部由来である。

- **生 HTML を描画しない** (`@assistant-ui/react-markdown` に `rehype-raw` を足さない)
- **リンク URL** は `http(s)` / 相対に allowlist し、`javascript:` / `vbscript:` / `file:` 等を除去する
- **画像 URL は `data:`(画像 MIME) / 相対のみ**に allowlist する — **実 CSP `img-src 'self' data:` と一致させ
  http(s) リモート画像を除外** (会話由来のリモート画像による tracking pixel を allowlist 段でも塞ぐ。S-002)
- 画像の `data:` は画像 MIME に限る (SVG の扱いは L-001 で defense-in-depth 検討)
- CSP を XSS の最終防御線として保つ (AD-024/AD-025 §7)

## §8 取得結果の状態と非同期順序 (H-002/M-004 の解消)

| 状態 | 意味 | 表示 |
| --- | --- | --- |
| `loading` | 取得中 | loading-state element (R-1) |
| `empty` | メッセージ 0 件 | empty-state。fallback 応答を捏造しない |
| `ready` | 取得済み | transcript を仮想化描画 |
| `failed` | ファイル不在 / 所在停止中 / 権限拒否 | error-state + 理由 (R-2 の `FailureReason`) + **再試行導線** |

- **stale 応答の破棄**: 取得要求に **request token (または選択 epoch)** を持たせ、応答到着時に
  現在選択の token と一致しなければ**破棄**する。選択切替で in-flight の旧応答が現在表示を上書きしない (US-1 AC-5)
- **in-flight プロセスの停止と同時数上限**: 選択切替では token 破棄と同時に **in-flight の取得プロセスを
  kill/cancel** する。**同時取得プロセス数の上限**を実名定数で設け超過要求を拒否/キューする —
  専用プロセスは ~2.7s 生存するため、高速切替や連打で積み上がる resource exhaustion (自機 DoS) を防ぐ (S-003 / CWE-400)
- **retry**: `failed` から**同一 `sessionId` / `targetKey` で再取得**する導線を持つ (所在を起動した後などに回復可能)。
  「再選択で回復」ではなく明示的な retry を持つ (R-2 の error-state と整合)
- **config dir 混線の防止**: 取得は target ごとに env 固定の専用プロセス (§1 / FR-006)。
  共有可変 env の並行レース (別ディストロ読み) を構造的に排除する
- 正本は Claude Code 側 (Principle X)。再取得で置き換える。ディスクに書かない

## §9 新規用語 (glossary へ追加。UL 帰属を整理)

| 用語 | 定義 | Domain |
| --- | --- | --- |
| **TranscriptView (transcript 表示)** | 選んだセッションの過去メッセージを仮想化描画する**画面状態** | `ui` |
| **message mapping (メッセージ変換)** | `SessionMessage[]` → `ThreadMessageLike[]` の純粋変換 (tool_use↔tool_result 対応づけを含む)。**`src/domain/session/` の共有層**に置く | `session` (共有 domain) |
| **SessionMessage** | SDK が過去 transcript から返す外部型 (§1)。**SDK 由来の外部型**として glossary に注記 | `session` (外部型) |

- **帰属の整理** (M-003): 変換ロジックは `domain/session` の共有層 (`_overview.md` の「ui は全 domain に依存」と整合)、
  表示状態 (TranscriptView) は `ui`。既存の transcript / Session (Domain: session) と齟齬しない
- 既存項の更新 (plan #5): **transcript** / **Session** の「取得は R-3 で追加する」を「取得済み (R-3)」に改める
