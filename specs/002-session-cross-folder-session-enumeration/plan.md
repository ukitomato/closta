# Implementation Plan: セッション列挙 (R-2)

**Branch**: `002-session-cross-folder-session-enumeration` | **Date**: 2026-09-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-session-cross-folder-session-enumeration/spec.md`

## Domain Context

### Charter reference

- **Domain**: `session` ([charter](../../docs/domains/session/charter.md))
- **Mission**: 複数フォルダ・複数ランタイムにまたがって存在する Claude Code のセッションを、
  一箇所から走査・起動・監視・差配できるようにする
- **本 feature が満たす In scope**: 登録フォルダを横断したセッションの列挙
  (**複数ランタイム分**。複数 Provider 分は X-3)
- **本 feature が満たさない In scope**: セッションの起動 / ストリーミング / 中断 / 再開 / 分岐 (X-1)、
  `SessionLaunchConfig` とプリセット (X-4)、`canUseTool` の配管 (X-1)、
  supervisor の分離 (X-5)、状態管理と監視ビュー (O-1)
- **charter の User Journey 1 がそのまま本 feature の US-1 である。**
  ただし charter の Journey 1 は「登録済みフォルダの一覧を開く」から始まっており、
  **未登録フォルダのセッション** (US-2) を含んでいない。
  起案時に人間が「全件列挙し未登録も示す」を確定したため、**charter 側に追記が要る**
- **charter の Out of scope との関係**: 「transcript や tool 出力の**描画**は `ui`」は守る —
  本 feature は一覧のみを描画し、本文を描画しない。
  一覧画面そのものは charter が In scope に「監視ビュー」を挙げている粒度に収まる
- **charter KPI「列挙の網羅」の但し書きと整合する** —
  「**停止中ディストロ内のセッションは R-2 では原理的に列挙できない**」は
  本 feature の FR-007 / US-3 / Out of Scope と一致する。
  **ただし同 KPI の「計測経路: E2E」は本 feature では満たさない** (下記「上流からの申し送り」#4)
- **charter の Open Question のうち本 feature で決着するもの**:
  なし。`wsl.exe` 強制終了時の JSONL 破損 (AD-018) は起動を伴うため X-1、
  `PermissionMode` / `effort` の列挙値は X-4、transcript ミラーの保持期限は I-1

### Related ADRs

| ADR | 本 feature への影響 |
| --- | --- |
| [AD-002](../../docs/decisions/0002-use-agent-sdk-not-cli.md) | 通信は Agent SDK 経由。JSONL の自前パースをしない |
| [AD-007](../../docs/decisions/0007-session-source-of-truth-is-claude-code.md) | 正本は Claude Code 側。キャッシュは置き換え、保持期限を持ち込まない |
| [AD-010](../../docs/decisions/0010-supervisor-runs-standalone.md) | 列挙プロセスは `electron` とネイティブモジュールに非依存 (推移的到達も禁止) |
| [AD-015](../../docs/decisions/0015-wsl-access-strategy.md) | ファイル読みは UNC 直読み。`wsl.exe` は 1 回約 1.5 秒でループ内禁止。検出結果はキャッシュし再取得は明示操作 |
| [AD-016](../../docs/decisions/0016-cross-filesystem-performance-cliff.md) | 越境の性能崖。対応づけ結果に越境を保持する |
| [AD-021](../../docs/decisions/0021-session-store-and-enumeration.md) | `listSessions()` は config dir を引数で取らない (子プロセスへ環境変数で渡す)。**実行単位は [AD-030](../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md) §1 で常駐 1 プロセス + 直列に差し替え済み** (当初の短命プロセス方式は起動費用で棄却)。環境変数の書き換えは直列化でレースを消す。`includeWorktrees` / `includeProgrammatic` の既定は「含む」。`sessionStore` は `@alpha` (I-1) |
| [AD-023](../../docs/decisions/0023-application-architecture.md) | 5 レイヤ。Agent SDK の境界は `agents`。IPC はデータのみ。preload は単一 capability。`useExternalStoreRuntime` を採る |
| [AD-025](../../docs/decisions/0025-workspace-folder-carries-location.md) | 所在を伴う値。3 名前空間。**UNC は `infra` の内側**。`ui → domain` は型と純粋関数まで。**セッション一覧は thread-list element** (申し送り)。**列挙用のプロセス起動モジュールは許可リストに ADR で追加**(申し送り) |
| [AD-024](../../docs/decisions/0024-constitution-verification-paths.md) | Constitution の検証経路。#18 が R-2 の E2E 基盤を前提にしている (下記 #4) |
| [AD-027](../../docs/decisions/0027-rule-firing-verification-and-service-io-rule.md) | **ルールは「違反サンプルで発火した」ことで確認する**。`services-not-to-io` の `from` は実名列挙であり、**本 feature が `SessionService` を作る時点で追加の履行義務が生じる** (下記 #5) |
| [AD-018](../../docs/decisions/0018-wsl-process-control.md) | 本 feature では**使わない**。プロセス起動は X-1 |

### Glossary

本 feature で追加する用語は [data-model.md](data-model.md) §10 の表のとおり
(列挙対象 / 作業ディレクトリの出自 / セッション要約行 / 未登録フォルダ / 対応づけ保留 / 所在不明)。
既存の **Session** / **transcript** の項に「一覧は要約とメタデータのみを扱う」を追記する。

**「由来 config ディレクトリの所在」と「セッションの所在」を同じ語で呼ばない** —
本 feature で最も誤りやすい区別であり、Principle XIV の対象とする ([data-model.md](data-model.md) §8)。

## Summary

登録フォルダを横断して Claude Code のセッションを**読み取り専用**で一覧する。
WSL ディストロ内の config ディレクトリは **Windows 側のプロセスから UNC 経路で** SDK に読ませる。

技術的な核は 4 点である。

1. **1 つの `utilityProcess` を常駐させ、要求を直列に処理する** ([AD-030](../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md) §1)。
   `CLAUDE_CONFIG_DIR` は**要求 1 件ごとに行に載せて**渡し、SDK の `listSessions()` を呼ぶ。
   これで「main をブロックしない」「環境変数を書き換えない」「Electron に依存しない」が同時に立つ。
   当初の「列挙対象ごとの短命プロセス」は実測で費用のほぼ全部が起動だったため差し替えた
   (起動 2,704 ms に対して列挙 36〜83 ms)
   ([research.md](research.md) R-01 / R-04)
2. **作業ディレクトリの名前空間を値の形から判定する。** 1 つの config ディレクトリに
   Windows / POSIX / UNC の 3 形式が混在することを実測した。所在を推測しない (R-02)
3. **対応づけは R-1 の `resolveFolderRuntime()` を変換エンジンとして再利用する。**
   越境と到達可能性の表を 2 つ持たない ([data-model.md](data-model.md) §4)
4. **要求は先頭ページと全件の 2 段。** 実測で先頭 50 件 384 ms / 全件 915 ms (269 件) (R-06)

## Technical Context

**Language/Version**: TypeScript 5.9 / Node 24 系 (Electron 39 同梱) / React 19

**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` 0.3.270 (`listSessions` のみ) /
`@assistant-ui/react` 0.15 (thread-list 系 element と primitive) / Zustand 5 / Electron 39

**Storage**: なし。**列挙結果はプロセス寿命のキャッシュに限る** (FR-036 / SC-014)。
R-1 の設定ファイル (登録フォルダ) は読むだけ

**Testing**: Vitest (`domain` の純粋関数 / `infra` の差し替え / renderer 単体) +
quickstart の手動検証 + `scripts/constitution/check.mjs` の呼び出し形走査。
**E2E は本 feature では作らない** (`[USER]` 確定)

**Target Platform**: Windows 11 + WSL2 (開発ホスト)。WSL 不在のホストでも動作すること (FR-012 相当)

**Project Type**: Electron デスクトップアプリ (main + preload + renderer + utilityProcess)

**Performance Goals**: 先頭 50 件 2 秒以内 / 1 所在の全件 10 秒以内 /
キャッシュヒット 100 ミリ秒以内 (SC-008)

**Constraints**: `wsl.exe` の起動 0 回 (SC-003) / config ディレクトリへの書き込み 0 件 (SC-004) /
停止中ディストロへの起動を伴う操作 0 件 (SC-002) / IPC に UNC と transcript 本文を出さない

**Scale/Scope**: 所在 2〜5 / 列挙対象 2〜8 / セッション 1 所在あたり数百 (実測 269・844 JSONL) /
新設画面 1 / 新設 IPC メソッド 3 + 通知 1

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` v1.2.5 に基づくゲート。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — 新規モジュールで `node:path` を import しない。
      UNC 値の **branding (組み立て) は `src/domain/runtime/` のパス API に限り**、
  **文字列として materialize してよい `infra` のモジュールを実名リストで固定する**
  (`wsl-fs.ts` / `config-dir.ts`)。2 つは別概念であり、**リストも 2 本に分ける** (research R-05)。
      列挙プロセスは受け取った値を SDK に渡すだけで、結合・分解をしない
      ([contracts/session-enumeration.md](contracts/session-enumeration.md) C-2)
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — 本 feature は
      新たなプラットフォーム分岐を持たない。所在による分岐は**所在の値による分岐**であり
      `process.platform` を見ない
- [x] **III. 権限モードは capability に従う** — **N/A: 本 feature は権限モードを扱わない**
      (読み取り専用であり起動しない)
- [x] **IV. 通信は Agent SDK 経由** — `listSessions()` のみを使う。JSONL の自前パースをしない。
      **`projects` 配下の再帰列挙を自前で行わない** ([research.md](research.md) R-03)
- [x] **V. 長期資格情報を永続化しない** — 本 feature は資格情報を扱わない。
      加えて**列挙プロセスに親の環境をそのまま継承させない** —
      X-3 で入る Provider の資格情報が流れ込む経路を最初から作らない (C-2)
- [x] **VI. 永続環境を構築・変更しない** — ディストロ内に何も導入しない。
      config ディレクトリを作成・変更しない (FR-013 / SC-004)。
      **ディストロを起動しない** (FR-007 / SC-002)
- [x] **VII. `src/agents/` は Electron / ネイティブモジュールに非依存** — 列挙プロセスが
      `src/agents/` の**最初の実体**になる。dependency-cruiser の推移的到達禁止ルールは
      R-1 で書かれており、**本 feature で初めて対象を持つ** (下記「上流からの申し送り」#2)
- [x] **VIII. 日本語環境で破綻しない** — composer の送信経路は R-1 のまま閉じており、
      本 feature は開けない。日本語の要約とフォルダ名の表示は SC-009 が見る。
      **Automated は 0 のままである** (AD-024 #18。下記 #4)

**Standard**

- [x] **IX. main process をブロックしない** — 列挙の I/O を `utilityProcess` に出す
      (FR-005 / research R-04)。Principle IX の Statement は stream の逐次パースを名指すが、
      **数百ファイルの読み取りは同じ性質**であるため同じ扱いにする。

      **ただし「パースも出す」は事実ではない**
      (pr-gate Round 2 / architecture A-202 →
      [AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md))。
      子は応答を `JSON.stringify` した 1 行として返し、
      **親 (main) が `decodeResponse` = `JSON.parse` する**。
      1 応答に載る上限は `MAX_SESSIONS_PER_TARGET` (5,000) 件である。
      これは Principle IX の ✗ Bad の形に一致するが、
      **transcript 本文を載せない** (FR-044 / SC-011) メタデータに限られるため許容した。
      `bad_pattern_grep` はパースコードの置き場 (`src/agents/`) を見るので
      **この経路を検出しない** — この `[x]` は検査が緑であることを根拠にしていない。
      **R-3 が本文を運ぶ時点で再評価する** (AD-031 Decision 2)
- [x] **X. セッションの正本はアプリ外** — 本 feature の中核。キャッシュは置き換え (FR-035)、
      取得時刻を提示し (FR-034)、ディスクに書かない (FR-036)
- [x] **XI. 垂直スライス** — 観測可能な振る舞いは US-1 〜 US-4 の一覧画面
- [x] **XII. 未表示情報を残さない** — `docs/ui-coverage.md` は O-2 で作る。
      本 feature は `SDKMessage` を扱わないため同表の未割当は増えない。
      **かわりに `SDKSessionInfo` の全項目に表示先を割り当てる** —
      `summary` / `customTitle` / `firstPrompt` / `lastModified` / `createdAt` / `fileSize` /
      `gitBranch` / `tag` / `cwd` / `sessionId` の 10 項目
      (割り当てない項目を残すと、Principle XII の精神に反したまま O-2 まで持ち越される)
- [x] **XIII. assistant-ui の element と design system を優先** —
      **thread-list 系 element を土台にする** (`[USER]` 確定 / AD-025 の申し送り)。
      **AD-025 の申し送りは `thread-list-sidebar` を実名で指定していたが、R-2 は
      上部ナビの 1 画面として実装するため `thread-list` 系を採る。目標レイアウト ADR が
      accepted になった時点で `thread-list-sidebar` へ寄せる** (ADR にも同じ 1 行を残す)。
      ただし (a) element 内蔵の日付グルーピングと検索は使わず primitive を直接組む
      (本 feature のグループは 4 種で日付ではない)、
      (b) **rename / archive / delete / New conversation の操作を外す**
      (読み取り専用。FR-003)。**どちらも理由を PR に記載する**
- [x] **XIV. Ubiquitous Language** — [data-model.md](data-model.md) §10 の 6 用語を glossary に追加。
      「由来 config の所在」と「セッションの所在」の区別を明記する
- [x] **XV. 多言語規約** — code は英語、UI / docs は日本語、commit は英語 1 行

**Domain charter の整合**

- [x] 本 feature の domain (`session`) が charter の In scope に収まっている
- [ ] **Out of scope に踏み込んでいない** — 踏み込んではいないが、
      **charter 側に 2 点の追記が必要**である (US-2 の未登録フォルダ / KPI の計測経路)。
      下記「上流 SSoT の追随」で扱う

## Project Structure

### Documentation (this feature)

```text
specs/002-session-cross-folder-session-enumeration/
├── plan.md                        # This file
├── spec.md
├── research.md                    # Phase 0 (実測つき)
├── data-model.md                  # Phase 1
├── quickstart.md                  # Phase 1
├── contracts/
│   ├── session-enumeration.md     # agents ↔ domain ↔ infra
│   └── ipc-session-list.md        # 単一 capability への追加
├── checklists/requirements.md
└── tasks.md                       # /cl-tasks が生成する
```

### Source Code (repository root)

```text
src/domain/runtime/
├── path-api.ts                        (追記) `classifyRawPath()` — 生値の形の判定 (唯一の入口)。
│                                       `parseWslUncPath()` — 実測 2 綴りの解析。AD-032。
│                                      **標準モジュールを import してよい唯一のファイル**のまま
└── path-api.test.ts                   (追記) 解析の境界値 (大小差 / legacy `\\wsl$\`)

src/domain/session/                    ← 新設。I/O なし
├── target.ts                          EnumerationTarget と不変条件
├── cwd-origin.ts                      出自の判定 (純粋関数。data-model §2)
├── cwd-origin.test.ts
├── match.ts                           FolderMatch の 4 段判定 (data-model §4)
├── match.test.ts
├── group.ts                           SessionGroup へのまとめ + 総数保存
├── group.test.ts
├── summary.ts                         代替表示の規則 (FR-047)
├── interfaces.ts                      EnumerationTargetFinder / SessionEnumerator
└── dto.ts                             SessionIndexDTO ほか (preload と renderer が import)

src/main/infra/session/                ← 新設
├── config-dir.ts                      UNC 値の materialize (**実名リストの 2 件目**。research R-05)
├── target-finder.ts                   UNC の浅い列挙で候補探索 (R-1 の WslFileSystem を使う)
└── target-finder.test.ts

src/agents/                            ← 最初の実体が入る
├── enumerate-sessions.ts              列挙プロセス本体 (**Agent SDK を呼ぶ唯一の場所**)
└── protocol.ts                        親子間のデータのみプロトコル

src/main/app/
├── session-service.ts                 ← 新設。キャッシュ / 2 段取得 / 束ね / 対応づけの適用
├── session-service.test.ts
├── session-enumerator.ts              ← 新設。utilityProcess の起動と結線 (app が結線する)
├── ipc.ts                             (追記) listSessions / refreshSessions / fetchMoreSessions
├── validate.ts                        (追記) targetKey / offset の検証
└── composition-root.ts                (追記) 結線

src/preload/index.ts                   (追記) capability に 3 メソッド + 1 通知

src/renderer/src/
├── components/assistant-ui/elements/
│   └── thread-list.aui.tsx            ← registry から追加し、書き込み操作を外す
├── features/session-list/             ← 新設
│   ├── SessionListScreen.tsx          グループ見出し + 失敗行 + thread-list primitive
│   ├── SessionListScreen.test.tsx
│   ├── labels.ts                      参照キーの訳出 (FR-046)
│   └── useSessions.ts                 IPC 呼び出しと購読
├── stores/sessions.ts                 ← 新設。external store (Zustand)
└── runtime/thread-list-adapter.ts     ← 新設。ExternalStoreThreadListAdapter

electron.vite.config.ts                (追記) agents のエントリを ?modulePath でバンドル
eslint.config.mjs                      (追記) renderer での PathDTO 組み立て禁止 (申し送り #1)
tests/rule-fixtures/                   (追記) 上記ルールの違反サンプルと期待表の更新
scripts/constitution/allowlists.mjs    (追記) 列挙プロセスの起動モジュール (申し送り #3)
```

**Structure Decision**: R-1 が固定した 5 レイヤ構成 (AD-023) にそのまま載せる。
新設ディレクトリは `src/domain/session/` と `src/main/infra/session/` の 2 つ、
および `src/agents/` の最初の実体である。

**`src/agents/` が実体を持つのは本 feature が初めてである。** R-1 は `.gitkeep` のみを置き、
依存規則と違反サンプルだけを先に用意した。本 feature で
`electron.vite.config.ts` の `?modulePath` によるバンドルと、
`tsconfig.node.json` の `include` が実際に効いていることを確認する。

### UI の構成 (Principle XIII の扱い)

```text
SessionListScreen
├── 所在ごとの状態 (EnumerationOutcomeDTO)    ← thread ではない。element の外側に置く
│   └── 未列挙 / 履歴なし / 失敗 + 導線
└── グループごとのセクション (4 種)
    └── ThreadListPrimitive.Root
        └── ThreadListPrimitive.Items
            └── ThreadListItemPrimitive.Root / Trigger / Title
```

- **`ExternalStoreThreadListAdapter` を使う** (AD-023 の `useExternalStoreRuntime` と整合)。
  `threadId` / `threads` を Zustand の store が持ち、選択の一元管理を store に置く
- **書き込み系のハンドラ (`onRename` / `onArchive` / `onDelete` / `onSwitchToNewThread`) を
  配線しない。** 配線すると読み取り専用 (FR-003) が UI 経路から破れる。
  コピーした element から対応する操作も外す
- **`onSwitchToThread` は配線する。** 選択状態を持つところまでが本 feature で、
  選択に応じた transcript の読み込みは R-3 である (Out of Scope)
- **グループ分けは selector の外で行う。** `s.threads.threadItems` (安定参照) を取り、
  変換は外側で行う (element の日付グルーピングは使わない)
- 空状態・失敗行は R-1 で導入済みの `empty-state` / `error-state` / `loading-state` element を使う

## 上流からの申し送りと本 feature での扱い

R-2 を名指している上流の記述が **6 件**ある。**すべてここで処理を決める。**

**棚卸しの方法 (design-gate round 1 で 2 件の漏れが出たため明文化する)**:

```bash
grep -rn "R-2\|SessionService\|services-not-to-io" docs/ .specify/ tests/ specs/001-*/
```

初版は 4 件としていたが、**AD-027 Consequences (#5) と Constitution Principle VIII /
AD-024 の本文 (#4 の還流先) が漏れていた**。人手の棚卸しは漏れるので、
以後の feature では `/cl-plan` の工程として上記 grep を必須にする。

### #1 `ui-path-concat` の残余を塞ぐ (R-1 の SC-017 / `tests/rule-fixtures/expected.mjs`)

R-1 は「`ui` がパス文字列を連結する経路は import を伴わないので lint も依存グラフも掛からない」を
未検出の残余として記録し、**`nextFeature: 'R-2'`** を割り当てた。
理由は「R-2 は renderer が受け取ったパスを IPC へ**返す**最初の feature である」。

**本 feature で条件が成立する** — 未登録フォルダの登録導線 (FR-026) が、
一覧から受け取ったパスを R-1 の `registerFolder` に渡す。

**対応**: `src/renderer/` 内で **`namespace` プロパティを持つオブジェクトリテラル**を
禁じる ESLint ルールを書き、**新しい違反サンプルを 1 件追加**する。

**ただし残余を全部は塞げない** (design-gate round 1 の指摘)。既存 fixture
`ui-path-concat.ts.fixture` の実体は**テンプレート文字列の連結**であり、
新ルールでは発火しない。`{ ...receivedDto, value: receivedDto.value + '/sub' }` のような
spread + 差し替えも `namespace` キーをリテラルで持たないためすり抜ける。
したがって **`ui-path-concat` は `UNDETECTED_NOTES` に残し**、
`mitigatedBy` に「`namespace` リテラルの組み立ては塞いだ。残る連結経路は未検証」を追記して
`nextFeature` を付け替える。**空にしない** — 空にすると SC-017 の台帳が後退する。

あわせて、**`domain` のパス値生成関数を `src/renderer/` から呼ぶことの禁止**も同じルール群に入れる。
出自判定を `ui` から呼べる設計にしている以上、関数の戻り値経由で名前空間つきの値を
得る経路がオブジェクトリテラル禁止をすり抜ける ([data-model.md](data-model.md) §2 で
判定関数が `RuntimePath` を生成しない形に分離したのはこのためである)。

### #2 `src/agents/` の依存規則が初めて対象を持つ

R-1 は `agents → electron` の推移的到達禁止ルールと違反サンプル
(`agents-electron-transitive.ts.fixture`) を用意したが、**実体は `.gitkeep` だけだった**。

**対応**: 列挙プロセスを `src/agents/` に置き、ルールが**実コードに対して**効くことを確認する。
`electron` / `better-sqlite3` / `node-pty` への推移的到達が 0 であることを
dependency-cruiser で見る (Principle VII / AD-010)。

### #3 プロセス起動モジュールを許可リストに追加する (AD-025 の申し送り)

AD-025 は「`session` が列挙用のプロセス起動モジュールを足すときは、
FR-041 の許可リスト (`scripts/constitution/allowlists.mjs` の `PROCESS_SPAWN_MODULES`) に
**ADR で追加する**必要がある」と書いている。

**対応**: 本 feature で起票する ADR に、列挙プロセスの起動モジュールを追加する根拠を書き、
許可リストを更新する。**許可リストを ADR 無しで広げない。**

### #5 `services-not-to-io` の `from` に `SessionService` を足す (AD-027 / AD-025 §9)

`.dependency-cruiser.js` の `services-not-to-io` は `from` を**実名 2 件**
(`folder-service` / `runtime-store`) に固定しており、同ルールのコメントが
「**`SessionService` を作るときは実名を足すこと**」と明示している。AD-027 Consequences が
同旨を accepted ADR として固定している。

**AD-027 は履行時期を X-1 と想定していたが、R-2 が `SessionService` を先に作る。**

**対応**: `from` に `^src/main/app/session-service[.]ts$` を追加する (SH-091)。
`session-enumerator.ts` を含めるかは**明示的に判断して理由をコメントに残す**。
追加後に既存 fixture で発火し続けることを確認する (実名列挙は綴り誤りで黙って死ぬ)。

**これを落とすと、`session` domain 最初の Service が生まれる瞬間に
「God Service への唯一の歯止め」が対象外のまま通る。** 違反が 0 件なのではなく
検査が 0 件になる形であり、緑の CI と区別がつかない。

### #6 Constitution と AD-024 に #4 の判断を還流させる

#4 の `[USER]` 判断は妥当だが、**還流先が charter 1 箇所では足りない**。
「R-2 の E2E 基盤に相乗りする」は **Constitution の active な本文 2 箇所**
(Principle VIII の Verification / Existing violations summary) と AD-024 の 3 箇所にある。

**対応**: (a) 読み替え根拠となる ADR を起票 (SH-084 に相乗り可。AD-024 は immutable)、
(b) Constitution を **PATCH (v1.2.3)** で改定する task を追加 (SH-092)、
(c) plan の追随表に 2 行追加。**Constitution 改定は人間レビュー必須**なので承認項目に載せる。

### #4 E2E 基盤の名指しは M4 完了後に再検討する (`[USER]` 確定)

`session` charter の KPI「列挙の網羅 — 計測経路: E2E」と AD-024 #18 の
「(A) / (B) は R-2 の E2E 基盤に相乗りする」が R-2 を名指している。

**人間判断により、CI / E2E に関する判断は M4 完了後に行う。**
本 feature では E2E 基盤を作らず、SC-001 を Vitest + quickstart で測る。

**この判断で壊れないことの確認**:

- AD-024 (A) の発動条件は「`ChatScreen` から `isDisabled: true` を外す変更」であり、
  **本 feature は読み取り専用で送信経路を開けない**ため発動しない
- AD-024 (B) の延期条件は「目標レイアウト ADR が accepted」かつ「E2E 基盤が存在」の
  **両方**であり、前者が未充足のため本 feature で載せても撮り直しが確定する
- charter KPI の計測経路は**上流 SSoT の記述**であり、本 feature の SC-001 と食い違う。
  **下記「上流 SSoT の追随」で charter 側に留保を書く**

## 上流 SSoT の追随 (本 feature の成果物に含める)

| 対象 | 追随内容 |
| --- | --- |
| `docs/domains/session/charter.md` の Journey 1 | **未登録フォルダのセッション**を含む形に追記する (US-2。現在は「登録済みフォルダの一覧を開く」から始まっている) |
| 同 **In scope 1 行目** | 「登録フォルダを横断したセッションの列挙」を「**登録の有無によらず config ディレクトリ配下の全件**」に改める。Journey だけ直すとゴール記述と旅程が食い違う |
| 同 KPI「列挙の網羅」 | 計測経路の「E2E」に**M4 完了後に再検討する**旨の留保と、**再開条件** (「基盤が入った時点で E2E に戻す」) を書く。E2E 基盤の**持ち主 feature を roadmap に登録する** (#4) |
| `.specify/memory/constitution.md` | **v1.2.3 PATCH**。Principle VIII の Verification と Existing violations summary の「R-2 の E2E 基盤に相乗りする」を事実に改める (#6)。**人間レビュー必須** |
| `docs/decisions/` (読み替え ADR) | AD-024 #18 は immutable。読み替え根拠を新 ADR (SH-084 (d)) に置く (#6) |
| `docs/domains/runtime/charter.md` | `related_specs` に本 spec を追加する — BE-010b が **R-1 の `runtime` domain のパス API を拡張する**ため (`parseWslUncPath()`)。`_overview.md` の R-1 行にも 1 行 |
| 同 Related Specs | 本 spec を追加し、`related_specs: []` を埋める |
| `docs/glossary.md` | [data-model.md](data-model.md) §10 の 6 用語を追加。Session / transcript の項に一覧の扱いを追記 |
| `docs/domains/_overview.md` の R-2 行 | 「**全件列挙 + 未登録フォルダ**」と「読み取り専用」を明示する |
| `docs/decisions/` | 本 feature の ADR を起票する (下記) |
| `scripts/constitution/allowlists.mjs` | プロセス起動モジュールの追加 (#3) |
| `tests/rule-fixtures/expected.mjs` | `ui-path-concat` の `none` からの移動と、新ルールの違反サンプル追加 (#1) |

### 本 feature で起票する ADR

| 内容 | 理由 |
| --- | --- |
| **列挙の実行単位と UNC の受け渡し** | (a) `agents` に「要求 1 回」という 3 つ目の寿命を追加する (AD-023 §1 / §6 の**読み替え**。in-place 改変しない)、(b) UNC の 4 規則と**2 本の実名リストの初期値** (AD-025 との調停。research R-05)、(c) プロセス起動モジュールの許可リスト追加 (#3)、(d) **Principle VIII / AD-024 #18 の延期先から R-2 を外す読み替え根拠** (#6。SH-092 の前提) |
| **作業ディレクトリの出自判定** | 1 つの config ディレクトリに 3 形式が混在するという実測は、AD-025 の「所在を推測しない」を**セッション側へ拡張**する根拠になる。AD-021 にも記録がない新事実である |

## Complexity Tracking

> Constitution Check に違反はない。**説明を要する設計判断**を記録する。

| 判断 | なぜ必要か | 却下した単純な代替 |
| --- | --- | --- |
| 列挙対象ごとに別プロセスを起こす | FR-005 / FR-014 / FR-045 を同時に満たす唯一の形 (research R-04) | 同一プロセスで環境変数を切り替える案は AD-021 §3 が却下済み。main process で列挙する案は Principle IX に反する |
| 作業ディレクトリの出自を 5 分類する | 実測で 3 形式が混在した (research R-02)。2 分類にすると POSIX 形式がどこかのディストロに誤帰属する | 「由来 config の所在をそのまま使う」案は、ホスト側の UNC / POSIX 形式 13 件 (実測) を誤対応させる |
| グループを 4 種持つ | 保留と未登録を混ぜると、登録済みフォルダに対して再登録を促す (data-model §4) | 2 種 (登録済み / それ以外) は R-1 が 3 値の到達可能性で避けた誤りと同型 |
| thread-list element の grouping / search を使わない | 本 feature のグループは日付ではなく 4 種であり、所在ごとの失敗行は thread ではない | element の日付グルーピングをそのまま使うと、未登録・保留・不明・失敗が表現できない |
| 要求を 2 段に分ける | `limit` 指定でも走査は一巡する (research R-06)。先頭ページの体感を保つには段を分けるほかない | 全件を待つ案は SC-008 の 2 秒を超える。先頭ページだけで済ませる案はグループ件数を確定できない |

## Post-design re-check

*Phase 1 (data-model / contracts / quickstart) 完了後の再確認。*

- [x] Constitution Check の全項目を Phase 1 の成果物に対して再確認した
- [x] 未解決マーカーが plan / data-model / contracts / quickstart に残っていない
      (Phase 0 の 3 件はすべて [research.md](research.md) で解消済み)
- [x] 上流からの申し送り **6 件**すべてに処理を割り当てた
      (round 1 で 4 件としていたのは棚卸しの漏れ。grep で機械化した)
- [x] 新設する IPC メソッドが単一 capability に収まり、検証表に行が追加されている
- [x] spec の FR / SC と data-model / contracts の対応が取れている
      (FR 番号を各節に明示。SC の計測経路が quickstart か Vitest のどちらかに割り当て済み)
- [ ] **design-gate で人間承認が要る項目** (round 1 で 2 点追加):
      1. charter の追記 3 点 (Journey 1 / In scope / KPI の留保と再開条件)
      2. 起票する ADR 2 件の採否
      3. **Constitution v1.2.3 PATCH の採否** (#6)
      4. **charter KPI の計測経路を E2E から緩めることの可否と、E2E 基盤の持ち主 feature** (#4)
      5. **SH-084 が固定する UNC の 2 本のリスト (`UNC_BRANDING_MODULES` /
         `UNC_MATERIALIZE_MODULES`) の確定版** — **ADR は accepted 後 immutable であり、
         この 1 点だけ順序が不可逆**であるため、起票前に承認を取る
      6. **WSL ディストロ内の全ユーザのホームを列挙対象にするかどうか** —
         現設計は `.claude` を持つ候補**すべて**を対象にし、他ユーザの会話由来文字列を
         1 画面に集約する。権限境界は越えていないが、ホスト側は「1 名分」と絞っており**非対称**。
         I-1 でミラーが入ると他ユーザの会話がホスト側 DB に書かれる
