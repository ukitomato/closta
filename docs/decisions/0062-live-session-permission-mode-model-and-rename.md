---
status: accepted
date: 2026-10-27
id: AD-062
deciders: ukitomato
tags: [session, sdk, permission, supervisor, constitution-check]
supersedes: []
superseded-by: []
---

# AD-062: 実行中のセッションの権限モード・モデルの切り替えと改名 — `Query` の 2 つのメソッドと `renameSession` を許す

本 ADR は X-6 の最初の分割 ([spec 023](../../specs/023-session-launch-axes-and-operations/spec.md)) の plan で起こした。spec の U-1〜U-8・plan の P-1〜P-13 と本 ADR は、2026-10-27 の夜間の規則 (承認の要る判断は推奨案で採用して進む) で推奨案を採用し、2026-10-27 に accepted とした。規則の詳細の正本は [data-model.md](../../specs/023-session-launch-axes-and-operations/data-model.md) で、本 ADR は決定と読み替えだけを書く。調査は [research.md](../../specs/023-session-launch-axes-and-operations/research.md)。

## Context

023 は、動いているセッションの権限モードとモデルを止めずに変え、名前を付けられるようにする (`docs/ui-coverage.md` E 節の `後続: X-6` の 4 行)。そのために、権限の正の構成と SDK の呼び出しの許可を広げる必要がある。

- [AD-036](0036-single-session-launch-process-and-live-stream.md) §4 P3 は「`Query` のメソッドは `interrupt()` だけを呼ぶ」とし、§5 は「権限モードを実行時も変更しない」とした。Constitution 検証の項目 16 は `QUERY_MUTATION_METHODS` (22) の呼び出しの綴りを違反にし、その集合は「外すには ADR が要る」(`scripts/constitution/allowlists.mjs`)
- 権限モードは X-4 で安全 3 値 (`default` / `plan` / `dontAsk`) に閉じた ([AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (a))。X-1 の SC-006(a) (005 spec) は「初期オプションと実行時 `setPermissionMode` の双方で昇格の値への遷移経路が 0 件」を求める
- Agent SDK の改名の手段は `renameSession()` だけで (`Query` に改名のメソッドは無い)、transcript に custom-title の 1 行を足す。[AD-034](0034-transcript-read-path-and-process-boundary.md) 決定 3 は「書き込み系 API (`renameSession` / `tagSession` / `deleteSession` / `forkSession` / `importSessionToStore`) は許可しない」とし、R-3 (003 spec) FR-001 は「transcript は読み取り専用。第一の担保は書き込みを起こす IPC が無いこと」とした。`AGENT_SDK_ALLOWED_CALLS` は 5
- Constitution Principle IV は `renameSession()` をセッションの書き込みの手段として既に挙げている (Constitution は改めない)

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-036 §4 P3 (`Query` は `interrupt()` だけ) | `interrupt()` に加えて `setPermissionMode` (安全 3 値だけ) と `setModel` (カタログの値だけ) を呼ぶ (Decision 1 / 2)。他の変更系のメソッドは今どおり呼ばない |
| AD-036 §5 (実行時に権限モードを変えない) / 005 SC-006(a) | 実行時の変更は安全 3 値の中の遷移だけを許す。昇格の値 (`acceptEdits` / `auto` / `bypassPermissions`) への遷移経路が 0 件であることは変えない (Decision 1)。安全 3 値の中の遷移は昇格ではない (AD-020 の危険度表) |
| `QUERY_MUTATION_METHODS` の 22 (AD-036 §4 P3 / AD-048 / AD-047 / AD-049) | `setPermissionMode` / `setModel` を外して 20 にする (Decision 3)。`setMaxThinkingTokens` は残す |
| AD-034 決定 3 / R-3 FR-001 (書き込み系 API を許可しない・transcript は読み取り専用) | `renameSession` だけを許し、呼べるファイルを 1 つに縛る (Decision 4)。書き込みは custom-title の追記だけ。`tagSession` / `deleteSession` / `forkSession` / `importSessionToStore` は今どおり許可しない。過去の行の transcript の取得は読み取り専用のまま |
| AD-041 (h) の「fork / resume / rename / tag / delete は X-6」 | rename のうち動いているセッションの分を 023 が持つ。過去の行の rename と fork / tag / delete は X-6 の後続の分割に残す |

## Decision

1. **権限モードの実行時の変更を、安全 3 値の中に閉じて許す。** 経路は renderer → main の検証済み IPC → セッションスレッドの制御 (`SessionControl` の `set-permission-mode`) だけ。値は main の `isSafePermissionMode`・セッションスレッドの decoder の同じ述語・呼び出しの直前の `assertSafePermissionMode(...)` の 3 段で検査する。項目 16 は SDK を保持するファイルの `.setPermissionMode(` の引数が `assertSafePermissionMode(...)` で包まれて閉じていなければ違反にする (`permissionMode:` の値の検査と同じ形)
2. **モデルの実行時の変更を、そのセッションの Provider のカタログの値に閉じて許す。** main がカタログ (起動の effort が効くモデルだけ) と照合し、SDK の値 (`inferenceProfileId ?? id`) を決めて送る。セッションスレッドは起動の `model` と同じ文字種の検査を通し、引数なし (既定に戻す) では呼ばない。effort は変えない (実行中に effort を変える口を足さない。`applyFlagSettings` は禁止のまま)
3. **`QUERY_MUTATION_METHODS` から 2 つを外す (22 → 20)。** `sdk-agent-session.ts` の `Query` のメソッドの分類に「実行中の設定の変更」(`setPermissionMode` / `setModel`) を足し、型の網羅で SDK の版上げの増減を tsc が落とす形は保つ。`setMaxThinkingTokens` (SDK が deprecated) は呼ばず、禁止に残す
4. **`AGENT_SDK_ALLOWED_CALLS` に `renameSession` を足す (5 → 6)。** `AGENT_SDK_CALL_FILES` で `src/agents/rename-session.ts` だけに縛る。このファイルは env (`CLAUDE_CONFIG_DIR`) を起動の時点で固定した短命の `utilityProcess` として main が起こし (AD-034 決定 2 と同じ形)、`dir` の option は渡さない (`dir` はホストのプロジェクトのパスで、WSL の作業ディレクトリを表せない)。起こすモジュール `src/main/app/rename-spawner.ts` を `PROCESS_SPAWN_MODULES` に実名で足す (Principle VI の手続き)。改名は会話の id を持ち `claude` が動いていてターンを実行していない行だけで受け、判定は main の registry が行う。名前は main のメモリにだけ持ち、永続化しない (正本は transcript。Principle X)
5. **書き込み系 API の別名と動的 import を項目 14 で塞ぐ。** AD-034 決定 3 の第一の担保 (「書き込みを起こす IPC が無い」) が改名の IPC で成り立たなくなるため、SDK の名前付き import のうち値の import (`type` でないもの) は許可の名前に限り (呼べるファイルの表に載る名前は表のファイルに限り)、SDK のパッケージの `import()` / `require()` を違反にする。AD-034 決定 3 の defense-in-depth の項 (「binding レベル denylist を足すか、alias 形の違反 fixture を 1 件加え」) の前者を本 ADR で行う
6. **変更の結果はセッションスレッド → 調停役スレッド → main の経路で返す。** message の種類 `control-result` (要求の id と成否だけ) を足し、調停役スレッドは窓で束ねずに送る (デコーダは `supervisor-protocol.ts`。[AD-043](0043-single-supervisor-session-threads-and-session-limit.md) の構成のまま)。同じセッションの変更は 1 つずつ受ける

## Consequences

- `IPC_CHANNELS` が 3 つ増える (権限モード・モデル・名前)。`SessionControl` は 8 種類になる。`QUERY_OPTION_KEYS`・`SessionEvent` の種類・`SessionLaunchConfig`・状態通知の形は変わらない
- 書き込みを起こす IPC が 1 つできる。書けるのは稼働中の行の会話の custom-title の 1 行だけで、対象の会話の id は main の registry から取り、renderer からは受けない
- `renameSession` は `claude` が書いている JSONL に追記する。ターンの実行中は受けないが、応答待ちに入った直後の追記と重なる窓が残る。WSL の UNC 越しの追記の原子性は確かめていない (023 quickstart V-5)
- Closta の外で同じ会話に名前を付けたとき、稼働中の行の表示は Closta が付けた名前のままで、過去の一覧は次の列挙で Claude Code の値 (最後の custom-title) を出す
- 実行中に変えた権限モード・モデルはプリセットにも再開の初期値にも残らない。再開すると起動の値に戻る

## Alternatives

- **変えるたびにセッションを終えて X-9 の再開で起動し直す** — `claude` を起こし直すたびに実行中の tool と承認待ちを失う
- **`setPermissionMode` を禁止のまま `sdk-agent-session.ts` だけを項目 16 の例外にする** — 例外のファイルの中では何を渡しても通る。引数の包みを見る方が AD-041 (a) の `permissionMode:` の検査と揃う
- **composer から `/rename <名前>` を送る** — ヘッドレスで効くかが分からず、ターンとプロンプトのキューに混ざる
- **名前を Closta の中だけに持つ** — 過去の一覧に出ず、Claude Code の正本と食い違う (Principle X)
- **`renameSession` をセッションスレッドで呼ぶ** — Worker は supervisor の env を共有し、Provider ごとの config ディレクトリと一致しない

## Confirmation

- `tests/docs/query-mutation-methods.test.ts` が 20 と `QueryMutationMethod` の union の一致を固定する。rule fixture で、`.setPermissionMode(` の包みなし・包みが閉じてから続く形・`setMaxThinkingTokens` の呼び出しが項目 16 で、`renameSession` の `rename-session.ts` の外での呼び出しと書き込み系 API の別名が項目 14 で発火する
- main の検証とセッションスレッドの制御の単体テストで、安全 3 値の外・カタログの外・文字種の外の値が拒否され、SDK のメソッドが呼ばれないことを確かめる (023 SC-001 / SC-003)
- main の registry と改名の単体テストで、受け付ける状態の表と、WSL / Win32 の config ディレクトリの env を確かめる (023 SC-004)
- 023 quickstart V-1〜V-5 で、実行中に `plan` に切り替えると書き込みの tool が実行されないこと・次の応答のモデルが変わること・名前が過去の一覧と CLI の `/resume` に出て transcript が壊れていないことを実機で記録する
