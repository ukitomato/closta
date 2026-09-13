---
status: accepted
date: 2026-09-13
id: AD-023
deciders: ukitomato
tags: [architecture, convention, enforcement]
supersedes: []
superseded-by: []
---

# AD-023: アプリケーションのレイヤ構成と依存規則

## Context

R-1（フォルダ登録とランタイム検出）はプロジェクトの初期化を兼ねる。
**最初のコミットでディレクトリ構成と依存規則が固定される**ため、着手前に決める必要があった。

Clean Architecture 系の手法を機械的に強制したい、という方針が出発点である。

調査の結果、[Electron の公式 Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) と
[utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process) が示す構成
（main / preload / renderer + MessagePort による utilityProcess 連携）は
[AD-006](0006-supervisor-in-utility-process.md) の判断と一致していた。
Electron + React のアーキテクチャ論では「UI は差し替え可能、データプレーンはそうでない」
「IPC は少数の名前付きメソッドに絞る」が繰り返し挙げられている。

なお本プロジェクトには**既に部分的な依存規則が存在していた**。
[AD-010](0010-supervisor-runs-standalone.md)（supervisor は Electron にもネイティブにも依存しない）と
Constitution Principle I / II / VII は、いずれも依存の向きを固定する規則である。
本 ADR はそれらを一般化して全体に適用する。

## Decision

### 1. 5 レイヤに分ける

```
┌──────────────────────────────────────────────────────┐
│ app        Electron の組み立て                          │  main + preload
│            ウィンドウ / IPC 配線 / プロセス生成 / 結線     │
└──────────────────────────────────────────────────────┘
        │ホストする(IPC)                    │結線する
        ▼                                  ▼
┌───────────────────┐          ┌───────────────────────┐
│ ui                │          │ agents      │ infra   │
│ assistant-ui      │          │ Agent SDK   │ SQLite  │
│ React / Zustand   │          │ stream      │ Docker  │
│                   │          │ interrupt   │ WSL検出 │
└───────────────────┘          └───────────────────────┘
        │                              │        │
        └──────────┬───────────────────┴────────┘
                   ▼
        ┌──────────────────────────┐
        │ domain                    │
        │ entity / 規則 / interface  │
        │ I/O なし。誰も知らない      │
        └──────────────────────────┘
```

| レイヤ | 責務 | プロセス | 寿命 |
|---|---|---|---|
| `domain` | entity・規則・インタフェース定義。**I/O なし** | なし（全プロセスに配られる） | — |
| `agents` | Agent SDK との境界。`query()` / stream / interrupt | utilityProcess | **セッション開始〜終了** |
| `infra` | OS 資源との境界。SQLite / safeStorage / Docker CLI / ランタイム検出 | main | アプリ起動〜終了 |
| `ui` | assistant-ui / React / Zustand | renderer | ウィンドウ |
| `app` | Electron の組み立て、結線、IPC 配線 | main + preload | アプリ起動〜終了 |

**`app` と `infra` は同じ main プロセスに同居する。レイヤが違うだけである。**
**`agents` だけが別プロセスで、しかもセッションと寿命を共にする。**

### 2. 外部データソースが 2 つあるため `agents` と `infra` を分ける

`agents` を「データ層」と捉えると、SQLite や Docker も同じ層に入ってしまい名前が実態と合わない。
本アプリの外部データソースは 2 つある。

- **Agent**（Claude Code）→ `agents`
- **ローカル資源**（SQLite / キーチェーン / Docker / WSL）→ `infra`

両者はプロセスも寿命も違うため、分けたほうが依存規則を機械検証しやすい。

### 3. インタフェースは `domain` 側に置く

外部技術に依存する箇所は、**`domain` がインタフェースを宣言し、`agents` / `infra` が実装する**。

```ts
// domain/interfaces.ts — domain が「必要なこと」だけを宣言する
export interface AgentSession {
  start(config: SessionLaunchConfig): AsyncIterable<SessionEvent>;
  interrupt(): Promise<void>;
  stop(): Promise<void>;
}
```

```ts
// agents/sdk-agent-session.ts — 実装
import { query } from '@anthropic-ai/claude-agent-sdk';
export class SdkAgentSession implements AgentSession { /* ... */ }
```

```ts
// app/ — composition root。ここで初めて両者が出会う
const session: AgentSession = new SdkAgentSession(descriptor);
```

**同じ `interface` でも置き場所で意味が変わる。** `agents/` に置けば `domain → agents` の
外向き依存が必要になるが、`domain/` に置けば矢印が `agents → domain` に反転する。
「`domain` は `agents` を import してはならない」という規則を機械強制すると、
**インタフェースは自動的に `domain` 側に置かざるを得なくなる。**

class 用である必要はない。関数型 1 つで足りることもある。

```ts
export type ResolveClaudePath = (descriptor: RuntimeDescriptor) => Promise<string>;
```

### 4. すべてをインタフェースにしない

インタフェースを挟む価値は「**複数の実装がある**」か「**テストで差し替えたい**」ときにのみ出る。

| 対象 | インタフェースにするか | 理由 |
|---|---|---|
| `AgentRuntime` | する | 4 実装（[AD-003](0003-runtime-abstraction-by-transport.md)） |
| `AgentSession`（SDK 呼び出し） | する | テストで fake にしたい |
| `SessionStore` | する | **SDK が定義済み**（[AD-021](0021-session-store-and-enumeration.md)） |
| `CredentialSource` | する | 9 方式（[AD-005](0005-provider-as-registrable-value.md)） |
| コンテナ操作 | する | CI で docker を動かしたくない |
| **SQLite の上の repository 抽象** | **しない** | 1 実装で差し替え予定なし。間接層が増えるだけ |

### 5. UseCase レイヤを作らない

Clean Architecture の典型である「ユースケース 1 つにつき 1 クラス、`execute()` 1 メソッド」は
本アプリには噛み合わない。

**理由 1: 中心的な操作がステートフルである。** セッション起動はプロセスハンドル・ストリーム・
状態機械を保持し、監視は 10 セッション分の状態を持ち、ランタイム検出はキャッシュを持つ
（[AD-015](0015-wsl-access-strategy.md)）。`execute()` 一発の形に収まらない。

**理由 2: 数が多い。** roadmap の feature から操作を数えると 20 を超える。
1 メソッドのクラスが 20 個できる。

**理由 3: 価値が出ない。** Service が薄ければ UseCase は Service の別名にすぎず、
Service が厚ければ UseCase は委譲するだけの層になる。どちらに転んでも 1 層分の価値が出ない。

代わりに、**状態の有無で書き方を変える**。

| 種類 | 形 | 例 |
|---|---|---|
| 状態を持たない規則 | **純粋関数**（class にしない） | パス変換、権限モードのゲート、軸の依存解決、越境判定 |
| 状態を持つ調停 | **class** | `SessionService` / `RuntimeRegistry` / `ProviderService` / `ContainerService` |

**Service にビジネス規則を書かない。** Service はインタフェースを注入され、`domain` の
純粋関数を呼ぶだけにする。これが肥大化（God Service）への唯一の歯止めであり、
下記 7 で機械検証する。

### 6. `agents` はセッションごとに 1 プロセスとする

[AD-006](0006-supervisor-in-utility-process.md) が supervisor を分離した理由は
「数 MB の `JSON.parse` が main を固まらせる」である。

**1 プロセスで全セッションを捌くと、同じ問題が `agents` の中で再発する。**
Node は単一スレッドであり、セッション A の 5MB パース中は B〜J のストリームが止まる。

セッションごとに 1 プロセスとする。

- クラッシュ隔離が得られる（Electron 公式も `utilityProcess` の用途に
  "crash prone components" を挙げている）
- [AD-010](0010-supervisor-runs-standalone.md) の「単独起動可能」がセッションと 1:1 で自然
- コストは Node 約 50MB × N。`claude` が 225MB（[AD-001](0001-adopt-electron-over-tauri.md)）
  なので **2 割強の上乗せ**に収まる

### 7. 依存規則を ESLint と dependency-cruiser の両方で強制する

```
ui     → domain                    型の共有のみ
agents → domain                    インタフェースを実装
infra  → domain                    同上
app    → domain, agents, infra     結線するので全部知る
domain → なし

app ↔ ui                           互いに import しない（別プロセス・別バンドル、IPC 接続）
agents ─✗→ infra                   別プロセス。IPC 経由のみ
agents ─✗→ electron / better-sqlite3 / node-pty     ※推移的に禁止
domain ─✗→ 一切の I/O モジュール                      ※推移的に禁止
services ─✗→ I/O モジュール直接                       インタフェース経由を強制
```

| ツール | 役割 |
|---|---|
| [eslint-plugin-boundaries](https://www.npmjs.com/package/eslint-plugin-boundaries) + `no-restricted-imports` | 編集時フィードバック。直接 import の規則 |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | CI でのグラフ検証。**推移的依存**と循環依存 |

**dependency-cruiser が不可欠な理由がある。** `platform-boundary-reviewer` の観点 PB-7 は
「Principle VII の `supervisor/` 制限が間接 import（supervisor が import する共通モジュールが
electron に依存）を通り抜けていないか」を挙げている。
**ESLint の `no-restricted-imports` は直接 import しか見ない。** グラフ全体を見る
dependency-cruiser でのみこの穴を塞げる。

これにより [AD-010](0010-supervisor-runs-standalone.md) が規約から**検証可能な制約**になる。

### 8. `electron` の import は `app` と `infra/secrets` に限定する

`ui` は contextIsolation 下で preload 越しの API のみを使い、`electron` を import しない。
`agents` は禁止（AD-010）。`domain` は I/O を持たないので当然入らない。

**例外は `safeStorage` である。** これは Electron API だが、
[AD-011](0011-delegate-credential-resolution.md) / Principle V が使うと定めている。
暗号化・復号を `app` に移すと `infra → app` の逆向き依存が生じるため、
**`infra/secrets/` を唯一の例外とし、dependency-cruiser のルールでそのパスだけを許可する。**

結果として `electron` が現れるのは `app/` と `infra/secrets/` の 2 箇所のみになる。

## Consequences

- **R-1 のスコープに本構成の骨組みと 2 つの検証ツールの設定が入る。**
  ディレクトリ、`eslint.config.ts`、`.dependency-cruiser.cjs`、CI でのグラフ検証
- `domain` のテストはモックがゼロになる。入力を渡して戻り値を見るだけで済む
- **`AgentRuntime` は「検出」と「起動」に分かれる。** 検出（`wsl -l -v`、docker probe、
  capability 実地テスト）は `infra`、起動（argv 構築）は `agents`、パス変換は `domain`。
  1 クラスにすると `agents` が Electron 側の検出処理を引きずり AD-010 が壊れる。
  境界には `RuntimeDescriptor` という**値**を置く
- **`SessionStore.append` は `agents` から `infra` へ IPC で渡す。**
  SDK は 100ms 間隔で呼ぶ（AD-021）が、`agents` は `better-sqlite3` を持てない（AD-010）。
  背圧設計が必要になる
- `ui` の内部構成は規約を課さない。5 feature しかないため Feature-Sliced Design の
  3 階層規約は過剰と判断した。M3 で肥大したら再検討する

## Open Questions

- [ ] `agents` → `app` → `infra` の 100ms バッチ転送における背圧設計。
      10 セッション並列だと 100ms ごとに 10 バッチが流れる
- [ ] `app` の composition root をどう書くか。DI コンテナは使わず関数引数で渡す方針だが、
      結線が深くなったときの可読性
- [ ] `ui` が `domain` から import してよいのは型だけか、純粋関数も許すか。
      越境判定のような表示に必要な規則は `ui` からも呼びたい
- [ ] dependency-cruiser のルールを Constitution の検証条件として参照するか。
      Principle I / II / VII の Automated 欄を更新する余地がある

## References

- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)
- [eslint-plugin-boundaries](https://www.npmjs.com/package/eslint-plugin-boundaries)
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
- [AD-003](0003-runtime-abstraction-by-transport.md) — ランタイム抽象
- [AD-006](0006-supervisor-in-utility-process.md) / [AD-010](0010-supervisor-runs-standalone.md) — supervisor の位置づけ
- [AD-021](0021-session-store-and-enumeration.md) — `SessionStore` の契約
- Constitution Principle I / II / VII
