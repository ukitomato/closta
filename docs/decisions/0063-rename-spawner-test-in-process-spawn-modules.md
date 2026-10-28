---
status: accepted
date: 2026-10-28
id: AD-063
deciders: ukitomato
tags: [session, constitution-check, allowlist, test]
supersedes: []
superseded-by: []
---

# AD-063: 改名の子の起動の単体テスト `rename-spawner.test.ts` を `PROCESS_SPAWN_MODULES` に足す

本 ADR は [spec 023](../../specs/023-session-launch-axes-and-operations/spec.md) の code-gate の指摘 (platform-boundary H-001) で起こした。2026-10-28 の夜間の規則 (承認の要る判断は推奨案で採用して進む) で推奨案を採用し、2026-10-28 に accepted とした。[AD-062](0062-live-session-permission-mode-model-and-rename.md) Decision 4 の決定は変えず、同じ許可リストにもう 1 件を足す判断だけを書く。

## Context

- AD-062 Decision 4 が `PROCESS_SPAWN_MODULES` に実名で足すと決めたのは `src/main/app/rename-spawner.ts` だけである
- その単体テスト `src/main/app/rename-spawner.test.ts` は、実プロセスを起こさない偽の子に差し替えるため `vi.mock('electron', () => ({ utilityProcess: { fork: ... } }))` と書く。Constitution 検証の項目 7 はテストファイルも走査し、`SPAWN_CALL_PATTERNS` の `utilityProcess` の語がここに掛かる
- 実装の枝ではこのテストファイルを `PROCESS_SPAWN_MODULES` に足していたが、ADR を経ていなかった。Principle VI は許可リストの追加に ADR を要する (`.specify/memory/constitution.md` の `allowlist_source` / Verification)
- AD-062 は accepted なので、許可の範囲を広げる変更を AD-062 の本文に書けない (AD-031。in-place で書いてよいのは事実誤認の訂正だけ)

## Decision

1. **`src/main/app/rename-spawner.test.ts` を `PROCESS_SPAWN_MODULES` に実名で足す。** 許可は項目 7 だけである。項目 1 / 3 / 4 / 5 / 15 は引き続きこのファイルに掛かる (`wsl.exe` のリテラルを持たない)
2. **許可はこの 1 ファイルに限る。** テストファイルを suffix (`*.test.ts`) や置き場で許可する形にはしない。他の spawner のテストに同じ登録が要るときは、そのたびに ADR を起こす
3. **項目 7 の走査範囲は変えない。** テストファイルは今までどおり走査の対象に残す

## Consequences

- このテストファイルの中で本物のプロセス起動を書いても、項目 7 は捕まえない。テストのモジュールは `vi.mock('electron')` で `electron` を差し替えており、`utilityProcess` は偽物を指す。本物の起動を書くには `vi.mock` を外すか別の起動 API を import する必要があり、それは diff のレビューで見える
- `PROCESS_SPAWN_MODULES` の中のテストファイルはこの 1 件になる (今までは 0 件)

## Alternatives

- **`createRenameSpawner` が `fork` を注入で受ける形にし、テストは `utilityProcess` を綴らない** (platform-boundary H-001 の推奨) — 登録は要らなくなるが、検証器の語の照合に合わせるためだけに本体の形を変える。他の spawner (`transcript-spawner.ts` / `enumerator-spawner.ts`) と構成が分かれ、実装の差し戻しになる。採らない
- **`vi.mock` のキー名を分割するなどして `utilityProcess` の語を走査から隠す** — 検出の回避であって許可の判断ではない。採らない
- **項目 7 の走査からテストファイルを外す** — 全テストが構造的に検査から外れ、検出を弱める。採らない
- **AD-062 Decision 4 に追記する** — 許可の範囲を広げるのは決定の変更であり、AD-031 の in-place 訂正の対象ではない。採らない

## Confirmation

- `scripts/constitution/allowlists.mjs` の `PROCESS_SPAWN_MODULES` の当該項目のコメントが本 ADR を参照する
- `node scripts/constitution/check.mjs` が違反 0 で終わる
