---
status: needs-human-review
last_updated: 2026-09-12
generated_by: human (PLAN.md 付録A + §3〜§7 を素材に起草)
total_terms: 23
---

# Glossary (Ubiquitous Language)

このプロジェクトで使用する **Domain 用語** の SSoT。すべての spec / code / UI / docs で
本 glossary 記載の用語を一貫使用する（Constitution Principle XIV）。

新規用語は本ファイルへ追記後、`architecture-reviewer` / `po-reviewer` が drift を検出する。

## Conventions

- **Canonical**: コード識別子は英語（Principle XV）。本 glossary の見出しは canonical な英語表記とする
- **日本語表記**: ドキュメントと UI では日本語を第一言語とするため、対応する日本語表記を併記する
- **Domain**: 主に使われる domain。複数にまたがるものは "Cross-domain"

## Canonical Terms

### A

#### **AgentRuntime**

- **Definition**: Claude Code プロセスを起動する場所と方法を表す抽象。シングルトンではなく、
  検出結果から生成される**値**である。`DirectRuntime` / `WslRuntime` / `Win32Runtime` / `DockerRuntime` の 4 実装を持つ
- **日本語表記**: ランタイム
- **Domain**: `runtime`
- **Counterexamples**: 「プラットフォーム」（posix / win32）は軸として持たない。
  ホストが Windows でもコンテナ内は Linux でありうるため
- **Ref**: [AD-003](decisions/0003-runtime-abstraction-by-transport.md)

#### **Approval card**

- **Definition**: `canUseTool` の permission 要求に応答する UI。単発承認と capability 付与を区別する
- **日本語表記**: 承認カード
- **Domain**: `ui`（状態は `session` が持つ）

#### **autoModeSafe**

- **Definition**: そのランタイムで無人実行（Auto / `bypassPermissions`）を許してよいかを示す
  `capabilities` の一項目。`false` のランタイムでは危険な権限モードを選択可能にしてはならない
- **Domain**: `runtime`（表明）/ `isolation`（ゲート）
- **Ref**: Constitution Principle III

### C

#### **capabilities**

- **Definition**: `AgentRuntime` が提供する能力。`sandbox` の種別と `autoModeSafe` の可否を持つ
- **Domain**: `runtime`

#### **Closta**

- **Definition**: 本プロダクトの名称。cloister（回廊）の縮約による造語。
  中庭を囲んで独立した房が並び中央から全体を見渡せる構造に由来し、
  隔離・俯瞰・差配の 3 要素を 1 語に含む
- **Domain**: Cross-domain
- **Ref**: [AD-014](decisions/0014-product-name-closta.md)

#### **CredentialSource**

- **Definition**: Provider の認証方式。9 種類あり、それぞれ「アプリが秘密を持つか」が定義されている。
  推奨は `api-key-helper` と `aws-credential-export`
- **Domain**: `provider`
- **Ref**: [AD-011](decisions/0011-delegate-credential-resolution.md)

### D

#### **Disposable container**

- **Definition**: セッションに紐づき、終了時に破棄されるコンテナ。
  「永続環境を構築しない」という原則の**唯一の例外**として管理対象になる
- **日本語表記**: 使い捨てコンテナ
- **Domain**: `isolation`
- **Counterexamples**: 永続コンテナ、Docker **イメージ**。いずれも管理対象外
- **Ref**: [AD-008](decisions/0008-no-persistent-environment-provisioning.md)

### E

#### **Element**

- **Definition**: assistant-ui が提供する UI 部品。202 種（2026-09-13 確認）
- **Domain**: `ui`
- **Counterexamples**: 自作コンポーネント。同等の element が存在する場合は自作しない（Principle XIII）

#### **endpoint**

- **Definition**: `DockerRuntime` が docker CLI に到達する経路。
  `host`（Docker Desktop / ネイティブ）と `wsl:<distro>`（WSL 内 Docker Engine）がある。
  後者は `WslRuntime` の上に `DockerRuntime` が乗る合成になる
- **Domain**: `runtime` / `isolation`
- **Ref**: [AD-012](decisions/0012-docker-control-via-cli.md)

### H

#### **HostPath**

- **Definition**: Electron プロセスから見たパス。Windows ではドライブレター形式。
  branded type として `RuntimePath` と型レベルで分離される
- **Domain**: `runtime`
- **Ref**: [AD-004](decisions/0004-branded-path-types.md)

### I

#### **Isolation badge**

- **Definition**: セッションが隔離境界の内側で動いていることを示す表示。
  `bypassPermissions` で動作中のものは視覚的に区別される
- **日本語表記**: 隔離バッジ
- **Domain**: `isolation`（判定）/ `ui`（表示）

### M

#### **Model catalog**

- **Definition**: Provider ごとに使えるモデルの集合。Bedrock は inference profile ID で pin する
- **日本語表記**: モデルカタログ
- **Domain**: `provider`

### P

#### **Preset**

- **Definition**: 名前付きで保存された `SessionLaunchConfig`。**資格情報の値は含まない**
- **日本語表記**: プリセット
- **Domain**: `session`

#### **Provider**

- **Definition**: 認証方式・設定ディレクトリ・モデルカタログを含む**登録可能なエンティティ**。
  コード上の列挙ではなくアプリに登録される値であり、同一バックエンドを複数登録できる
- **Domain**: `provider`
- **Counterexamples**: 汎用語としての "Provider"（DI コンテナの provider 等）。
  本プロジェクトでは常に上記の意味で使う
- **Ref**: [AD-005](decisions/0005-provider-as-registrable-value.md)

#### **ProviderProfile**

- **Definition**: `Provider` の実体を表す型。`backend` / `configDir` / `credential` / `models` / `extraEnv` を持つ
- **Domain**: `provider`

### R

#### **RuntimePath**

- **Definition**: ランタイム内部から見たパス。現状は常に POSIX 形式。
  WSL 内 Docker Engine を使う構成では `HostPath` → WSL の `RuntimePath` → コンテナ内の
  `RuntimePath` と 2 段になる
- **Domain**: `runtime`
- **Ref**: [AD-004](decisions/0004-branded-path-types.md)

### S

#### **Session**

- **Definition**: Claude Code の 1 会話。UUID で識別され
  `<config-dir>/projects/<encoded-cwd>/<uuid>.jsonl` に永続化される。
  **正本は Claude Code 側にあり**、アプリのストアはキャッシュ / インデックスである
- **日本語表記**: セッション
- **Domain**: `session`
- **Ref**: [AD-007](decisions/0007-session-source-of-truth-is-claude-code.md)

#### **SessionLaunchConfig**

- **Definition**: セッション起動時に選択される設定の組。作業フォルダ / ランタイム / Provider /
  モデル / effort / 権限モード / sandbox / 追加ディレクトリ / 上限 / セッション名。
  三本の軸が交わる点であり日常操作の入口
- **Domain**: `session`

#### **sessionStore**

- **Definition**: コンテナ内に閉じた JSONL をホスト側 SQLite にミラーするアダプタ。
  キャッシュであり、ミラー側を正本に昇格させない
- **Domain**: `isolation`
- **Open**: 保持期限・削除経路が未定義（AD-007 の blocking gap）

#### **supervisor**

- **Definition**: セッションのプロセスとストリームを持つ `utilityProcess`。
  **Electron API にもネイティブモジュールにも依存しない**。`node dist/supervisor.js` で単独起動できる
- **Domain**: `session`
- **Ref**: [AD-006](decisions/0006-supervisor-in-utility-process.md) / [AD-010](decisions/0010-supervisor-runs-standalone.md)

### T

#### **Tier A / B / C**

- **Definition**: Element の実装優先度。A は Claude Code の一次概念に直結する必須、
  B は体験を押し上げるもの、C は対象外（Voice 系 / Generative 群など）
- **Domain**: `ui`

#### **transcript**

- **Definition**: セッションの会話ログ。`<config-dir>/projects/<encoded-cwd>/` 配下の JSONL に永続化される。
  `encoded-cwd` は作業ディレクトリの非英数字を `-` に置換したもの
- **Domain**: `session`

### U

#### **ui-coverage 対応表**

- **Definition**: `docs/ui-coverage.md`。SDK のメッセージ型・tool 名・システムイベントと
  表示実装の対応表。**未割当行がある間、UI 系 feature を `completed` にしない**
- **Domain**: `ui`
- **Ref**: Constitution Principle XII

## Detected synonyms (要統一)

| Concept | 使われている表記 | Proposed canonical | 備考 |
|---|---|---|---|
| AgentRuntime | 「ランタイム」「Runtime」「実行環境」 | `AgentRuntime`（コード）/ ランタイム（日本語文） | 「実行環境」は Provider の意味でも使われうるため避ける |
| Disposable container | 「使い捨てコンテナ」「コンテナ」 | `Disposable container` / 使い捨てコンテナ | 単に「コンテナ」と書くとイメージと紛れる |
| Isolation | 「隔離」「サンドボックス」 | 隔離（境界全般）/ sandbox（OS 組み込み機構に限定） | Seatbelt / bubblewrap を指すときのみ sandbox |

## Generic words excluded

以下の汎用語は本 glossary に含めない（本プロジェクト固有の意味を持つ場合を除く）。

```
User, Manager, Service, Handler, Helper, Util, Tool, Component, Module
Item, List, Data, Info, Detail, Result, Response, Request, Config, Setting, Option
Type, Status, State, Mode, Kind, Flag, Value, Key, Name, Id, Code
```

**例外**: `Provider` は汎用語だが、本プロジェクトでは §5 の定義に固定された domain 用語として扱う。
