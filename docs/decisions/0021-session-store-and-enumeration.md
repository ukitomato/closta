---
status: accepted
date: 2026-09-13
id: AD-021
deciders: ukitomato
tags: [session, isolation, sdk, storage]
supersedes: []
superseded-by: []
---

# AD-021: セッション列挙と `SessionStore` は SDK の公式拡張点を使う

## Context

SPIKE-1（`listSessions()` と `CLAUDE_CONFIG_DIR` の関係）と
SPIKE-11（`sessionStore` ミラーの実現手段）の結果。R-2 と I-1 の前提となる。

PLAN.md §11 は SPIKE-1 について「`ListSessionsOptions` に config dir 指定がない。
ホストプロセスの環境変数を参照している可能性が高い」と推測し、逃げとして
「Provider ごとに短命な child process で列挙し IPC で返す」を挙げていた。

また [AD-007](0007-session-source-of-truth-is-claude-code.md) は
「`DockerRuntime` ではコンテナ内に JSONL が閉じるため `sessionStore` アダプタで
ホスト側 SQLite にミラーする」としていたが、**`sessionStore` が何であるかは定義していなかった**。

`@anthropic-ai/claude-agent-sdk` **0.3.270** の型定義を一次情報として調査した。

## 調査結果

### `ListSessionsOptions` に config dir の指定はない

```ts
export declare type ListSessionsOptions = {
  dir?: string;                  // プロジェクトディレクトリ。省略時は全プロジェクト
  limit?: number;
  offset?: number;
  includeWorktrees?: boolean;    // git worktree を含めるか。既定 true
  includeProgrammatic?: boolean; // SDK / daemon 由来のセッションを含めるか。既定 true
  sessionStore?: SessionStore;   // ← store から列挙する（@alpha）
};
```

**PLAN.md の推測どおり、config dir は引数で渡せない。** `dir` は「プロジェクトディレクトリ」
であって config ディレクトリではない。ローカルファイルシステムから読む場合は
`CLAUDE_CONFIG_DIR` 環境変数に従う。

### `SessionStore` は SDK の公式インタフェースだった

```ts
export declare type SessionStore = {
  append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void>;
  load(key: SessionKey): Promise<SessionStoreEntry[] | null>;
  listSessions(projectKey: string): Promise<Array<{ sessionId: string; mtime: number }>>;
  listSessionSummaries(projectKey: string): Promise<SessionSummaryEntry[]>;
  delete(key: SessionKey): Promise<void>;
  listSubkeys(key: { projectKey: string; sessionId: string }): Promise<string[]>;
};
```

参考実装 `InMemorySessionStore` も同梱されている。

`sessionStore?: SessionStore` は `ListSessionsOptions` / `GetSessionInfoOptions` /
`ImportSessionToStoreOptions` ほかに用意されており、**アプリが実装した store を渡せる**。

### `append` の契約（型定義のコメントより）

- **サブプロセスのローカル書き込みが成功した「後」に呼ばれる。**
  "durability is already guaranteed locally"
- アクティブなターン中は **約 100ms 間隔**でバッチが届く
- エントリは JSON-safe な POJO。ローカル JSONL の 1 行に対応する
- **`uuid` を冪等キーとして扱うこと**（upsert / ignore-duplicate）。
  リトライや `importSessionToStore()` の replay で重複行を作らないため
- `uuid` を持たないエントリ（titles / tags / mode markers）は dedup せず append する
- 拒否は **3 回までリトライ**。60 秒タイムアウトはリトライしない（in-flight が着地しうるため）

### `importSessionToStore()`

```ts
export declare function importSessionToStore(
  sessionId: string, store: SessionStore, options?: ImportSessionToStoreOptions
): Promise<void>;
```

既存のローカル JSONL を store に取り込む公式 API。

## Decision

### 1. `sessionStore` は自作せず、SDK の `SessionStore` インタフェースを実装する

[AD-007](0007-session-source-of-truth-is-claude-code.md) が構想していた「ミラーアダプタ」は、
**SDK が公式に用意している拡張点そのもの**である。`docker cp` やファイル監視のような
自前機構を作らない。

**`append` が「ローカル書き込み成功後」に呼ばれるという契約は、AD-007 の
「正本は Claude Code 側、アプリのストアはキャッシュ」と完全に一致する。**
ミラーが失敗しても正本は無事であり、Principle X が構造的に守られる。

### 2. `uuid` を主キーとした upsert で実装する

型定義が明示的に要求している。リトライと `importSessionToStore()` の replay があるため、
**append-only の実装は重複行を生む**。`uuid` を持たないエントリのみ append とする。

### 3. 複数 config ディレクトリの列挙は「子プロセス方式」を既定とする

`listSessions()` が config dir を取れない以上、選択肢は 2 つある。

| 方式 | 内容 | 評価 |
|---|---|---|
| **(a) 子プロセス方式** | Provider ごとに `CLAUDE_CONFIG_DIR` を変えた短命プロセスで列挙し、結果を集約 | **既定とする** |
| (b) store 集約方式 | 全 Provider のセッションを 1 つの `SessionStore` に集約し、そこから列挙 | 将来の最適化 |

(a) を既定とする理由は、**(b) が「アプリが正本を持つ」方向に一歩踏み込むため**である。
store に集約した時点で、store に無いセッションは見えなくなる。
`importSessionToStore()` で取り込み漏れがあれば、利用者から見て「セッションが消えた」ことになる。

(b) は R-2 の段階では採らない。**I-1（コンテナ内セッションのミラー）で store が必要になった後、
列挙も store 経由に寄せるかを再検討する。**

なお Node では `process.env.CLAUDE_CONFIG_DIR` を呼び出しごとに書き換える手もあるが、
**並行列挙でレースを起こす**ため採らない。

### 4. `@alpha` である点をリスクとして明記する

`SessionStore` と `sessionStore?` オプションは型定義上 `@alpha` と注記されている。
**破壊的変更がありうる。** I-1 着手時に SDK バージョンを固定し、更新時は差分を確認する。

## Consequences

- **SPIKE-11 は実質不要になった。** ミラー手段は SDK が提供しており、調査すべきは
  「SQLite スキーマをどう設計するか」に変わる。roadmap の SPIKE-11 を再定義する
- **`supervisor` が `SessionStore` を呼ぶ位置になる。** しかし
  [AD-010](0010-supervisor-runs-standalone.md) は「supervisor はネイティブモジュールに
  依存してはならない」と定めており、`better-sqlite3` は main process 側にある。
  **`SessionStore` の実装は「supervisor が受け取り、IPC で main process に転送して書く」形**になる。
  100ms 間隔のバッチが IPC を通るため、バッチ化と背圧の設計が要る
- R-2 は Provider ごとの短命プロセス方式で実装する。SPIKE-1 の「逃げ」が本線になった
- `listSessions({ dir })` は git worktree を既定で含む（`includeWorktrees` の既定が `true`）。
  worktree を使う利用者にとっては便利だが、**セッション一覧に想定外のものが混ざる**可能性がある

## Open Questions

- [ ] `SessionStoreEntry` の具体的な型。SQLite スキーマ設計に必要（I-1 の前に確認）
- [ ] 100ms バッチが supervisor → main process の IPC を通るときの背圧設計。
      10 セッション並列だと 100ms ごとに 10 バッチが流れる
- [ ] `includeProgrammatic` の既定 `true` により、Closta 自身が起動したセッションも
      一覧に出る。これを区別して表示するか
- [ ] `@alpha` API のバージョン固定方針。SDK を上げるたびに壊れうる

## References

- SPIKE-1 / SPIKE-11（docs/roadmap.md）
- `@anthropic-ai/claude-agent-sdk` 0.3.270 の `sdk.d.ts`
- [AD-007](0007-session-source-of-truth-is-claude-code.md) — セッションの正本はアプリ外
- [AD-010](0010-supervisor-runs-standalone.md) — supervisor のネイティブ非依存
- [AD-020](0020-sdk-emitted-message-inventory.md) — 同じ調査で得た message 型の実態
