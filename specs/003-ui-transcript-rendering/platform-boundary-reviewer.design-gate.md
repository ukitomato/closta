# platform-boundary-reviewer — design-gate (R-3) Round 2

**Run**: 2026-09-24 / read-only

## Verdict: Critical 0 / High 2 / Medium 1 / Low 0

Round 1 resolved: 5 (C-001 中核 env 固定専用プロセス / H-001 MessageChannelMain main-out-of-path / H-002 SC-007 正直化 / M-001 dir / M-002 alias defense)。unresolved: 1 (C-001 の回帰ガード = H-102)。new: 2 (H-101, M-101)。

## High

### H-101 (new) — plan Constitution Check VII の「既存列挙プロセスに相乗りさせる」が C-001 解決設計 (専用プロセス) と矛盾
- **Where**: plan.md:137 (Principle VII 行) が「transcript 取得を `src/agents/` の**既存列挙プロセスに相乗りさせる**」。他の全箇所 (plan.md:42,67,402 / contracts C-2 / data-model §8 / tasks BE-020 / research R-02 / spec) は「相乗りしない / env 固定専用プロセス」で一致
- **Issue**: VII の checkbox 根拠がこの矛盾文言で `[x]`。字義どおり実装すると R-2 の常駐プロセス (共有可変 env) に相乗りし Round 1 Critical の env レースを再導入する。
- **Action**: plan.md:137 を Summary #1 / Complexity / contracts C-2 と同一表現 (「列挙の常駐プロセスとは別の env 固定の専用短命プロセスで行い、共有可変 env に相乗りしない」) に統一。「既存列挙プロセスに相乗り」の語を削る。

### H-102 (unresolved from R1) — C-001 の env 分離を守る並行/混線の回帰テストがどのタスクにも未割当
- **Where**: contracts/transcript-read.md C-2 の検証行が「transcript と列挙の並行要求で各応答が要求 targetKey と一致する回帰テスト」を約束するが tasks BE-027 / SH-067 に対応行が無い。spec Edge Cases「並行取得の env 汚染」も対応タスク未特定
- **Issue**: dedicated-process 設計は正しく実装されれば env レースが構造的に消えるが、「相乗り」への後退や常駐へ戻す refactor を検出するテストが無い。SC-007 の自動証明が未構築な以上、この回帰テストが env 分離の唯一の機械的番人。
- **Action**: BE-027 (または新設テスト task) に「target A の transcript 取得と target B の列挙を並行に走らせ、各応答が要求 targetKey の config 由来であることを assert する回帰テスト」を明記し C-2 の検証行と 1:1 対応。

## Medium (new)
- **M-101**: transcript 専用プロセスの spawn 許可 (`PROCESS_SPAWN_MODULES`) と ADR スコープが計画から抜けている。`check.mjs` 項目 7 は `utilityProcess` を `PROCESS_SPAWN_MODULES` 外で使うと violation にするが、plan の上流 SSoT 追随表 / SH-001 ADR は `AGENT_SDK_ALLOWED_CALLS` 拡張しか挙げない。→ SH-001 ADR のスコープに「transcript 専用プロセスの spawn を担うモジュールと `PROCESS_SPAWN_MODULES` への追加 (または enumerator-spawner.ts 再利用) の判断」を含め、上流 SSoT 追随表に 1 行。新規モジュールなら実名で allowlist に ADR 根拠つきで追加。Principle VI / FR-041。

## Round 1 継承
- C-001 (Critical) → resolved (中核。env 固定専用プロセス確定)。回帰ガード欠落は H-102 として継続。
- H-001 (main deserialize) → resolved (MessageChannelMain で main を経路から外す)。
- H-002 (SC-007 検出不能) → resolved (正直化。port transfer 構造検査 + 到達集合検査 未構築明記 + SH-062b で持ち主登録)。
- M-001 (dir 名前空間) → resolved (data-model §1 で dir=project dir 確定、使わない、UNC_FORBIDDEN_IN 継承)。
- M-002 (alias/dynamic 迂回) → resolved (defense-in-depth 既知処理。plan #3(d) / C-4 / SH-061)。

## 備考 (owner 外)
- renderer↔取得プロセスの port 授受迂回は security owner (S-001)。
- `domain/session/transcript.ts` が SDK 型 (SessionMessage) を import すると item 14 の import ディレクトリ検査が発火 → architecture の D スライス。enumerate.ts は `SdkSessionLike` を構造的にローカル定義して回避済み (同パターン踏襲が要る) — 参考。
