---
id: AD-034
title: transcript 取得の経路とプロセス境界 — main を本文データ経路から外し、env 固定の専用プロセスで取得する
status: accepted
date: 2026-09-24
deciders: [ukitomato]
tags: [ui, session, ipc, principle-ix, process-boundary]
supersedes: []
superseded-by: []
related: [AD-021, AD-023, AD-030, AD-031, AD-033]
---

# AD-034: transcript 取得の経路とプロセス境界

> **status: accepted (2026-09-24、ukitomato 承認)。** 本 ADR は R-3 (spec `003-ui-transcript-rendering`) の
> SH-001 として起票し、人間承認を得た。これにより BE-020 / BE-021 の実装が解禁される (tasks.md Dependencies)。
> design-gate Round 2 で全 5 トラック Critical 0 を確認済み。

## Context

R-3 は選んだセッションの過去 transcript を実データ表示する。取得は Agent SDK の
`getSessionMessages()` (読み取り専用) を使い、数 MB になりうる `tool_result` 本文を renderer に届ける。
設計中に design-gate が 4 つの Critical を検出し、いずれも本 ADR が固定する決定で解消した。

- **Principle IX** ([AD-031](0031-adr-in-place-corrections-and-principle-ix-scope.md) Decision 2 が
  「R-3 が本文を運ぶ時点で再評価する」と R-3 に宿題を残していた): 本文を main でパースすると main が固まる。
- **共有可変 env の並行レース** ([AD-021](0021-session-store-and-enumeration.md) §3 /
  [AD-030](0030-enumeration-runs-in-one-resident-process.md) §3): 列挙は常駐単一プロセスが
  `CLAUDE_CONFIG_DIR` を可変 global env に書き、**直列化だけが安全性を担保**している。
- **許可リストのガバナンス** (Principle VI): SDK 呼び出しとプロセス起動 API の許可拡張には ADR を要する。

## Decision

### 1. main を transcript 本文のデータ経路から外す (`MessageChannelMain`)

`JSON.parse` を避けるだけでは不十分である。`utilityProcess` の `parentPort` は main に繋がるため、
`postMessage` した数 MB は **main の V8 で structured clone deserialize** され main を固める
(AD-006 が名指した実害。design-gate platform-boundary/architecture 指摘)。

したがって **main が `MessageChannelMain` を作り、port1 を取得プロセスへ、port2 を renderer へ transfer** し、
**本文 (`ThreadMessageLike` DTO) は取得プロセス↔renderer 直通**で流す。main は port ハンドルの中継のみで
本文を保持・`JSON.parse`・deserialize しない。`getTranscript` の IPC invoke は本文を返さず、
status / handshake / 軽量メタのみを返す。

- **port2 は取得プロセス→renderer の一方向データ送出専用**。取得プロセスは inbound の port メッセージを
  受理しない (spawn 時固定の単一 sessionId のみ扱い、port 経由で取得対象を変更できない)。
  取得要求の発行は必ず `getTranscript` invoke を通し main の検証を経る (main 検証の迂回を作らない)。
- 変換 (`SessionMessage[]` → `ThreadMessageLike[]`) は `domain` の純粋関数を取得プロセス側で走らせる
  (main も renderer 描画スレッドも重い変換で塞がない)。

### 2. transcript は target ごとに env 固定の専用 (短命) プロセスで取得する

R-2 の常駐列挙プロセスの共有可変 env に**相乗りしない**。本文を別チャネルで並行に取得すると、
transcript 取得が `CONFIG_DIR=distroA` を設定した直後に列挙が `CONFIG_DIR=distroB` を設定し、
**distroA の取得が distroB を読む** (AD-021 §3 が却下した per-call env mutation のレース)。

したがって **target ごとに `CLAUDE_CONFIG_DIR` を起動時固定した専用 (短命) プロセス**で取得する
([AD-021](0021-session-store-and-enumeration.md) が AD-030 で畳む前の子プロセス方式に回帰)。
`getSessionMessages` の `dir` オプションは使わない (`dir` は project dir であって config dir ではない。
sdk.d.ts 0.3.270 で確認)。親環境を丸ごと継承させず、渡す env を最小 allowlist にする (Principle V)。

**AD-030 との調停**:

- AD-030 §5 の「単一常駐 + global env」モデルは env レースの緩和を直列化に依存しており、
  **本文の並行取得へは素直に拡張できない**。R-3 はこれを別モデル (env 固定専用プロセス) で解く。
- AD-030 が実測した「並行に起こすと遅くなる」(WSL UNC 同時 spawn で 10,470ms 等) は、
  **transcript が user 選択ごとの 1 回であり hot loop でない**ため許容する (research R-02 / R-07)。
- 専用プロセスの**クラッシュ封じ込め・window close / before-quit 時の終了・孤児 UNC ハンドル回避**を
  AD-030 §7 / §Consequences に倣って行う。選択切替では in-flight プロセスを kill し、同時取得数に上限を設ける
  (resource exhaustion 防止)。
- これは [AD-023](0023-application-architecture.md) §6 の「per-session」・AD-030 の「resident」に続く
  **`agents` の第 3 のプロセス形態 (per-request 短命)** として位置づける。

### 3. read-only の担保と SDK 呼び出し許可

- **第一義的な担保は「書き込みを起こす IPC メソッドが存在しないこと」** (`getTranscript` の取得 1 本のみ)。
- 加えて `scripts/constitution/allowlists.mjs` の `AGENT_SDK_ALLOWED_CALLS` に **`getSessionMessages` を追加**する。
  判定は呼び出し形で行う (import / 型注釈は違反にしない)。書き込み系 API (`renameSession` / `tagSession` /
  `deleteSession` / `forkSession` / `importSessionToStore`) は許可しない。
- **defense-in-depth**: item 14 は呼び出し形の正規表現のみで alias (`const r=renameSession; r()`) /
  dynamic import を素通しする。binding レベル denylist を足すか、alias 形の違反 fixture を 1 件加え、
  捕まらない経路を `UNDETECTED_NOTES` に `nextFeature` つきで明記する (AD-027 / SC-017 規範)。
- 既存の違反 fixture `sdk-forbidden-call` は `getSessionMessages` を禁止例に使っているため、
  **書き込み系 API に差し替え**て発火を維持する。

### 4. transcript 専用プロセスを spawn するモジュールを許可リストに加える

専用プロセスの起動は新規の `utilityProcess` 起動を伴う。`check.mjs` 項目 7 は
`PROCESS_SPAWN_MODULES` 外での `utilityProcess` 使用を違反にするため、**spawn 主体モジュールを実名で
`PROCESS_SPAWN_MODULES` に追加**する (Principle VI: 追加には ADR を要する)。
`enumerator-spawner.ts` は AD-030 常駐用の postMessage+stdout 前提であり MessageChannelMain の
port transfer と前提が違うため、**新設 spawner を置く**か `enumerator-spawner.ts` を一般化するかを実装で決め、
決定を本 ADR に追記する。

### 5. Principle IX の検証は「構造」で担保し、自動証明の未構築を隠さない

「main で本文が評価されない」を依存グラフで自動証明する検査は**現状存在しない**
(AD-031 が名指した composition-root からの到達集合検査は未構築)。

- SC-007 の担保は **port transfer の構造検査 (main が本文を受け取らない) + 手動レビュー + Vitest**とする。
- 本 ADR を根拠に **Constitution Principle IX の「現状の制約」を PATCH** するが、
  「structured clone (MessageChannelMain) 経路へ移した。**到達集合検査は依然未構築**」と正直に書く
  (「解決済み」と読める書き換えを禁じる)。**到達集合検査の持ち主 feature を `docs/roadmap.md` に登録**する
  (AD-031 が確立した「持ち主のいない延期を残さない」規範)。

## Consequences

### 良くなること

- Principle IX が構造 (main がデータ経路上に無い) で守られ、`JSON.parse` 回避に頼らない。
- env レースが構造的に消える (専用プロセスは env を spawn 時固定)。
- read-only が「書き込み IPC 不在」+ 許可リストで二重に担保される。

### 代償 / リスク

- 専用プロセスの spawn は ~2.7s の起動費がかかる (AD-030 実測)。transcript は user 選択ごとの 1 回のため許容するが、
  体感遅延として現れうる (SC-002 の初期表示時間は合否外で実測を quickstart-results に記録)。
- `MessageChannelMain` の port transfer は本プロジェクト初の main 非仲介チャネルであり、
  inbound 方向の封じ込め (決定 1) を実装とテスト (BE-027) で守る必要がある。
- `sessionStore?` は `@alpha` (AD-021 #4)。本 feature は使わない (ローカル FS 読み) が、
  SDK 更新時に `getSessionMessages` の型を再確認する。

### 申し送り (R-3 が持ち主)

- [ ] composition-root からの到達集合検査 (Principle IX の自動証明) の持ち主 feature を roadmap に登録する
- [ ] spawn 主体モジュール (新設 spawner か enumerator-spawner 一般化か) の決定を本 ADR に追記する

## Confirmation

- design-gate Round 2 で全 5 トラック Critical 0 (`specs/003-ui-transcript-rendering/.gate-verdict-design.json`)。
- `getSessionMessages` の型は `@anthropic-ai/claude-agent-sdk` 0.3.270 の `sdk.d.ts` で確認
  (`specs/003-ui-transcript-rendering/data-model.md` §1)。
- 実装時に `check:constitution` 項目 7 (spawn 許可) と SDK 呼び出し検査が緑であること、
  BE-027 の env レース回帰テストと本文非経由の構造検査が通ることを確認する。

## References

- [AD-021](0021-session-store-and-enumeration.md) §3 (per-call env mutation のレース) / #4 (@alpha)
- [AD-023](0023-application-architecture.md) §6 (per-session プロセス) / MessagePort でストリームを運ぶ
- [AD-030](0030-enumeration-runs-in-one-resident-process.md) §3 / §5 / §7 (常駐 + 直列化、並行 spawn 劣化、寿命)
- [AD-031](0031-adr-in-place-corrections-and-principle-ix-scope.md) Decision 2 (Principle IX 再評価の宿題)
- [AD-033](0033-assistant-ui-elements-introduction-cost.md) (SPIKE-2。残作業は仮想化とデータ配線)
- spec `003-ui-transcript-rendering`: plan.md / data-model.md §1・§6・§8 / contracts/transcript-read.md
