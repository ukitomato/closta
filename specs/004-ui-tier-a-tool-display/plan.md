# Implementation Plan: Tier A tool 表示 (R-4)

**Branch**: `004-ui-tier-a-tool-display` | **Date**: 2026-09-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-ui-tier-a-tool-display/spec.md`

## Domain Context

### Charter reference

- **Domain**: `ui` ([charter](../../docs/domains/ui/charter.md))
- **Mission**: Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない
  操作体験を提供する。**軸 1 であり、機能の付随物ではなく採否を決める要素**である
- **本 feature が満たす In scope**: 「tool 出力の専用表示 (Terminal block / Code diff / Todo /
  Subagent / Agent plan / Reasoning ほか)」— charter Scope の in-scope 項目そのもの
- **本 feature が満たさない In scope**: `docs/ui-coverage.md` の確立と Tier A 完全化は **O-2**、
  composer (日本語 IME / message queue) は **X-2**、live 実行 (承認カード / 中断 / message queue) は **X-1**、
  情報密度の切替は **O-1**、Thread 検索 / observability は **O-3**
- **charter の User Journey 1 step 3「tool 実行は種類ごとの専用表示で現れる」がそのまま本 feature の US-1** である。
  charter は具体例として「Bash は行単位ストリーム + exit status、Edit は hunk 単位の diff、
  TodoWrite はチェックリスト」を挙げる。**行単位ストリームは live (X-1) の概念であり、R-4 は過去ログの
  完了済み出力を静的に再現する** (spec [ASSUMED: live 実行は対象外])
- **charter の domain-specific Principle「見た目の判断を先送りしない」**: R-3 が一次判断、R-4 が tool 表示まで
  含めた**判断材料を提示**する (SC-010)。**「M1 完了 / 軸 1 方針確定」自体は R-4 の done-gate 合否条件にしない** —
  軸 1 の正式な確定は R-3 実機一次判断の記入とあわせた別ステップ (roadmap に tracked。design-gate C-001 で positioning 緩和を確定)
- **charter の Out of scope との関係**: 「他 domain の操作 UI (一覧・登録・選択画面)」は持たない —
  本 feature は R-2/R-3 が用意した transcript の表示部品を tool 種別ごとに深めるだけで、一覧画面は持たない
- **charter KPI との対応**: 「表示網羅」(`docs/ui-coverage.md` 未割当ゼロ) は **O-2 の到達点**であり
  R-4 は主張しない。R-4 は data-model の割り当て表 + レビューで**扱う範囲の**未割当ゼロを担保する (FR-016)。
  「自作率」(対応 element が無いと PR で説明されたものの割合 100%) は FR-013 の element 実名照合が満たす

### Related ADRs

| ADR | 本 feature への影響 |
| --- | --- |
| [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) | **SPIKE-14。§4.2 の Tier A 35 element は実在**。Terminal block / Code diff / Todo list / Subagent list / Agent plan は registry (`elements-terminal-block` / `-code-diff` / `-todo-list` / `-subagent-list` / `-agent-plan`) に実在する。R-4 の element 選定を変える理由はない (FR-013 の照合対象) |
| [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) | `SDKMessage` は 39 型 (SDK メッセージ型の**分母**)。**`parent_agent_id` / subagent 親子リンクは AD-020 の決定ではない** — 出所は sdk.d.ts 0.3.270 / R-3 data-model §1 であり、対応づけの実 key は research R-02 で確定する。**Tier A の全列挙 (§4.2 の暫定表の引き直し) は O-2** — R-4 は 7 種に限る |
| [AD-033](../../docs/decisions/0033-assistant-ui-elements-introduction-cost.md) | 導入は R-1 で払い済み、**`.aui.tsx` + `useExternalStoreRuntime` 固定**。R-4 の専用表示も `.aui.tsx` の形で足す。design system に乗せ独自トークンを増やさない |
| [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) | **取得経路とプロセス境界の正本。** 本文は `MessageChannelMain` の port で取得プロセス↔renderer 直通、main を経路から外す。変換 (`transcript.ts`) は**取得プロセス側で走る**。R-4 の subagent グルーピング (DTO 拡張) は**この変換の内側に足す** → main は依然本文経路に乗らない。**DTO 形の evolution は本 feature の ADR で AD-034 の shape を継ぐ形で記録する** |
| [AD-023](../../docs/decisions/0023-application-architecture.md) | 5 レイヤ。**変換は `domain` の純粋関数、SDK 境界は `agents`、表示は `ui`**。R-4 の subagent 対応づけは `domain` (I/O なし)、専用表示は `ui/renderer`、args narrowing は renderer (本文経路を増やさない) |

### Glossary

本 feature で追加/更新する用語は [data-model.md](data-model.md) §5 のとおり。既存項の追随:

- **Element** / **Tier A/B/C** — 既存定義を使う。R-4 は Tier A の tool 表示部品を実データに配線する。
  **「Tier A 完全化」は O-2** であり本 feature は 7 種に限ることを glossary の注記と齟齬させない
- **Subagent** (新規語): Task で起動される副エージェント。**親参照 id で親子が対応づく (実 key は R-02 で確定)**。
  [data-model.md](data-model.md) §5 に定義を足す (`session` 共有 domain の外部概念)

## Summary

R-3 が「未定義 tool はすべて fallback」で残した部分を、**Claude Code の一次概念に直結する 7 種の tool 表示**に
置き換える、`ui` domain 2 本目 = M1 最終 feature。技術的な核は 4 点。

1. **専用表示を `toolName` で分岐して描画する** (US-1)。R-3 の `thread.aui.tsx` は
   `case "tool-call": return part.toolUI ?? <ToolFallback {...part} />` で描画している。R-4 は
   **Bash / Edit・Write・MultiEdit / TodoWrite / Task / ExitPlanMode を `toolName` で拾って専用 element に回す**。
   未対応 tool は fallback のまま。登録方式 (`makeAssistantToolUI` による name 別登録 か
   `thread.aui.tsx` 内の toolName ディスパッチ) は research R-01 で公式イディオムを確定する
2. **各 tool の args を untrusted としてパースする** (US-1 / US-3)。DTO の `argsText` (JSON 文字列) を
   renderer で narrowing し、失敗・欠落時は**生 argsText の fallback へ安全退避**する (R-3 の `convert.ts` の
   `parseArgs` と同じ精神)。**本文経路を増やさない**ため args パースは renderer に置く (spec [ASSUMED])
3. **subagent の親子対応づけを `domain` の純粋関数に足し、DTO を入れ子表現に拡張する** (US-2)。
   現 `transcript.ts` は `parent_agent_id` を**宣言だけして使っていない** (メッセージを flat に出す)。
   R-4 は**親参照 id** (`parent_tool_use_id` / `parent_agent_id`。実 key は research R-02 で確定) と Task の `tool_use` id を
   鍵に**親子を id で対応づけ** (位置非依存)、対応する親を持たない subagent は fallback でフラットに残す。**変換は取得プロセス側で
   走るため main は本文経路に乗らない** (AD-034 継承)。**循環 / 一意でない id は visited-set で検出し二重展開しない** (design-gate M-1/L-4)
4. **element を実名照合して採用/自作を決める** (FR-013 / Principle XIII)。registry の
   `terminal-block` / `code-diff` / `todo-list` / `subagent-list` / `agent-plan` を候補に、
   `.aui.tsx` の形で導入・調整する。不適合で自作する場合は候補名と不適合理由を PR に記す。
   **Reasoning / Tool group は R-3 で実装済み** — R-4 は Tier A 適合の確認と専用表示との共存のみ (FR-007)

**本 feature は backend を最小限しか触らない。** 新規 SDK 呼び出し・新規 IPC・新規プロセスは無い
(取得経路は R-3 の `getSessionMessages` + port をそのまま使う)。BE の変更は
**`domain` の subagent グルーピング純粋関数と `transcript-dto.ts` の入れ子拡張の 2 点**に限られる。
`targets: both` に上がる理由はこの 1 点 (subagent 入れ子) であり、5 種の専用表示は renderer 単独で成立する。

## Technical Context

**Language/Version**: TypeScript 5.9 / Node 24 系 (Electron 39 同梱) / React 19

**Primary Dependencies**: `@assistant-ui/react` 0.15 (`useExternalStoreRuntime` / `MessagePrimitive` /
tool UI 登録機構) / `@assistant-ui/react-markdown` 0.14 (Agent plan の markdown / R-3 の XSS 境界) /
`@tanstack/react-virtual` (R-3 導入済み) / `@anthropic-ai/claude-agent-sdk` 0.3.270 (**新規呼び出しなし**)。
**assistant-ui registry から追加する element**: `elements-terminal-block` / `-code-diff` / `-todo-list` /
`-subagent-list` / `-agent-plan` (研究の結果で採否確定。FR-013)

**Storage**: なし。R-3 のキャッシュ経路をそのまま使う (Principle X)。config への書き込み 0 件

**Testing**: Vitest (`domain` の subagent グルーピング純粋関数 / 各専用表示の renderer 単体 / DTO schema /
negative test) + quickstart の実機確認。**E2E (Playwright) は本 feature でも作らない** (Principle VIII の
延期を踏襲。AD-024 #18)

**Target Platform**: Windows 11 + WSL2 (開発ホスト)。R-3 の transcript 取得経路をそのまま使う

**Project Type**: Electron デスクトップアプリ (main + preload + renderer + utilityProcess)

**Performance Goals**: 数千メッセージ (R-3 の仮想化) の上で専用表示が回帰しない / 巨大 tool_result・
巨大 diff で描画がブロックしない (切り詰め + 折りたたみ。FR-017)

**Constraints**: 本文が main process のデータ経路に現れない (SC-006 = R-3 SC-007 の維持) /
生 HTML 非描画・URL allowlist を回帰させない (FR-012) / composer 送信経路は閉じたまま (FR-015) /
新規 SDK 呼び出し 0 件 / 新規 IPC 0 件

**Scale/Scope**: 新設 renderer 表示 5 種 (Terminal / Code diff / Todo / Subagent / Agent plan) +
tool-UI 登録 1 + `domain` の subagent グルーピング純粋関数 1 群 + DTO 入れ子拡張 1 + `thread.aui.tsx` の
分岐追記 1

## Constitution Check

_GATE: Phase 0 前に通す。Phase 1 設計後に再確認する。_

`.specify/memory/constitution.md` v1.2.6 に基づくゲート。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — **N/A: 本 feature はパスを組み立てない** (表示と変換のみ)
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — **N/A: 本 feature は
      プラットフォーム分岐を持たない** (renderer 表示 + 変換純粋関数)
- [x] **III. 権限モードは capability に従う** — **N/A: 本 feature は権限モードを扱わない** (読み取り専用)
- [x] **IV. 通信は Agent SDK 経由** — **新規 SDK 呼び出しなし**。R-3 の `getSessionMessages` の返りを
      表示するのみ。JSONL の自前パースをしない。`AGENT_SDK_ALLOWED_CALLS` の変更なし → **ADR 不要**
      (許可リストを広げない)
- [x] **V. 長期資格情報を永続化しない** — 本 feature は資格情報を扱わない
- [x] **VI. 永続環境を構築・変更しない** — ディストロを起動せず config を作成・変更しない。
      **プロセス起動 API / 許可リストの変更なし** (取得経路は R-3 のまま)
- [x] **VII. `src/agents/` は Electron / ネイティブ非依存** — 変換 (`transcript.ts`) は `domain` の
      純粋関数のまま。subagent グルーピングを足しても `electron` / ネイティブへの到達を増やさない
- [x] **VIII. 日本語環境で破綻しない** — Terminal block / Code diff の**等幅で全角桁が崩れない**、
      Todo / Subagent / Agent plan の日本語ラベルが崩れない (SC-007 / FR-014)。composer 送信経路は
      R-3 のまま閉じる (FR-015。`ChatScreen.test.tsx` の回帰前提を維持)。**Automated 2 項目
      (IME テスト / スクショ比較) は載せない** (composer を開けないため。AD-024 #18)
- [x] **IX. main process をブロックしない** — **本文経路を R-3 のまま維持**する。subagent グルーピングは
      **取得プロセス側で走る変換 (`transcript.ts`) の内側**に足し (AD-034)、DTO を入れ子拡張しても
      **main は port ハンドルの中継のみ**。**`argsText` は tool により大きくなりうる** (Write `content` / Edit・MultiEdit の
      old/new / ExitPlanMode `plan` は数 MB になりうる。「巨大なのは result だけ」は誤り。design-gate H-1) が、
      **argsText も port2 経由で renderer に届き main を通らない**。ただし巨大 args が renderer の `JSON.parse`/描画を
      ブロックしないよう、**取得プロセス側 (parse 前) で argsText に `sanitizeBody` + バイト上限を効かせる** (data-model §2/§6)。
      **検証の正直化**: R-3 と同じく到達集合の自動証明は未構築 (AD-031)。SC-006 は port transfer の
      構造検査 (入れ子拡張後の frame が port2 のみを流れ handshake に本文/children が載らないことを含む。design-gate M-7) +
      手動レビュー + Vitest で担保する (R-3 SC-007 を回帰させない)
- [x] **X. セッションの正本はアプリ外** — R-3 のキャッシュ経路をそのまま使う。ディスクに書かない
- [x] **XI. 垂直スライス** — 観測可能な振る舞いは「過去ログの tool 実行が種別ごとの専用表示で読める」(US-1)
- [x] **XII. 未表示情報を残さない** — `docs/ui-coverage.md` は **O-2**。本 feature は
      **R-4 が扱う tool 名・content 種別すべてに表示先を割り当て**、[data-model.md](data-model.md) §3 に
      記録する (FR-016 / SC-008)。**Tier A 完全化は主張しない** — 未対応 tool は fallback に割り当て済み
      (割り当て漏れではない)。**`docs/ui-coverage.md` 不在中は自動検証が vacuous** — 未割当ゼロは
      data-model §3 + レビューでのみ担保される。**この scope 解釈 (R-3 が design-gate 承認済み) の継続は
      本 gate でも人間承認を要する** (下記 Post-design)
- [x] **XIII. assistant-ui の element と design system を優先** — **Terminal block / Code diff /
      Todo list / Subagent list / Agent plan を registry の候補と実名照合**し、採用・調整する。
      Constitution の Principle XIII の Example そのもの (「✓ Good: Tool fallback AUI をカスタマイズして
      Bash 用の Terminal block に寄せる」)。自作する場合は候補名と不適合理由を PR に記す (FR-013)。
      独自トークンを追加しない
- [x] **XIV. Ubiquitous Language** — Subagent を glossary に足す (data-model §5)。Element / Tier A/B/C の
      既存定義を使う
- [x] **XV. 多言語規約** — code は英語、UI ラベル / docs は日本語、commit は英語 1 行

**Domain charter の整合**

- [x] 本 feature の domain (`ui`) が charter の In scope に収まっている (tool 出力の専用表示)
- [x] Out of scope に踏み込んでいない (ui-coverage O-2 / composer X-2 / live X-1 / 密度 O-1 / 検索 O-3 を除外)
- [ ] **charter 側の追随が要る** — `related_specs` / Related Specs に本 spec を追加し、
      「(残り。R-4 / X-2 / …)」の記述を R-4 着手中に更新する (下記「上流 SSoT の追随」)

## Project Structure

### Documentation (this feature)

```text
specs/004-ui-tier-a-tool-display/
├── plan.md                        # This file
├── spec.md
├── research.md                    # Phase 0 (element 選定 / tool-UI 登録方式 / subagent リンク key / args 形)
├── data-model.md                  # Phase 1 (toolName→表示 対応表 / 各 tool の args 形 / DTO 入れ子拡張 / 割り当て表)
├── quickstart.md                  # Phase 1 (各専用表示の実機確認 V-1〜 + SC-010 rubric)
├── contracts/
│   ├── tool-display-mapping.md    # toolName ↔ 専用表示 の契約 + args narrowing / 安全退避規則
│   └── transcript-subagent.md     # subagent 入れ子の DTO 契約 + 親子対応づけ規則 (id ベース)
├── checklists/requirements.md
└── tasks.md                       # /cl-tasks が生成する
```

### Source Code (repository root)

```text
src/domain/session/
├── transcript.ts                  ← 改修。subagent 親子グルーピングを足す (親参照 id と Task id で対応づけ。実 key は R-02)。
│                                    位置非依存。孤児 subagent はフラット。**取得プロセス側で走る変換の内側**
├── transcript.test.ts             ← 追記。入れ子 / 孤児 / 多段 / 隣接非依存 (SC-004/SC-009)
├── transcript-dto.ts              ← 改修。subagent 入れ子を表現するフィールドを追加し
│                                    TRANSCRIPT_PART_FIELDS / schema に載せる (FR-011)
└── transcript-schema.test.ts      ← 追記。入れ子フィールドの schema 固定 (SC-008)

src/renderer/src/
├── features/chat/
│   ├── convert.ts                 ← 改修。DTO の入れ子を ThreadMessageLike へ写す (subagent part)
│   ├── tool-args.ts               ← 新設。各 tool の argsText を untrusted narrowing (Bash/Edit/Write/
│   │                                MultiEdit/TodoWrite/Task/ExitPlanMode)。失敗時は生 argsText を返す (FR-009)
│   ├── tool-args.test.ts          ← 新設。壊れた args / 欠落フィールド / 別名 tool の安全退避 (SC-005)
│   └── ChatScreen.test.tsx        ← 追記。各専用表示の描画 / fallback 退避 / XSS 回帰 / 送信経路閉塞 (回帰維持)
├── components/assistant-ui/elements/
│   ├── terminal-block.aui.tsx     ← 新設 (registry `elements-terminal-block` を調整。Bash)
│   ├── code-diff.aui.tsx          ← 新設 (registry `elements-code-diff` を調整。Edit/Write/MultiEdit)
│   ├── todo-list.aui.tsx          ← 新設 (registry `elements-todo-list` を調整。TodoWrite)
│   ├── subagent.aui.tsx           ← 新設 (registry `elements-subagent-list` を調整。Task + 入れ子)
│   ├── agent-plan.aui.tsx         ← 新設 (registry `elements-agent-plan` を調整。ExitPlanMode)
│   ├── tool-registry.aui.tsx      ← 新設。toolName → 専用表示 の登録 (research R-01 の方式)。
│   │                                未対応は ToolFallback。__tests__ で分岐を固定
│   └── thread.aui.tsx             ← 改修。tool-call 分岐に tool-registry を差し込む (fallback は維持)
└── (既存の reasoning.aui.tsx / tool-group.aui.tsx は R-3 のまま。FR-007 で共存を確認)

docs/ui-coverage.md                ← 作らない (O-2)。R-4 の割り当ては data-model §3 が暫定台帳
scripts/constitution/allowlists.mjs ← 変更なし (新規 SDK 呼び出し / spawn なし)
```

**Structure Decision**: R-1 が固定し R-3 が使った 5 レイヤ構成 (AD-023) にそのまま載せる。新設は
renderer の `elements/*.aui.tsx` 5 種 + `tool-registry.aui.tsx` + `tool-args.ts` が中心で、
`domain` は `transcript.ts` / `transcript-dto.ts` への**追記**。新規ディレクトリ・新規 IPC・新規プロセスは作らない。

### tool-UI の登録方式 (公式ドキュメントに基づく「あるべき形」)

R-3 の `thread.aui.tsx` は `part.toolUI ?? <ToolFallback {...part} />` で tool を描画する
(`part.toolUI` は runtime に name 別登録された tool UI が入る slot)。R-4 の選択肢:

| 方式 | 概要 | 判断 |
| --- | --- | --- |
| (a) **`makeAssistantToolUI` で name 別登録** | `useExternalStoreRuntime` のツリー内に Bash/Edit/… の tool UI を name で登録し `part.toolUI` を埋める | **research R-01 で公式イディオムとして裏取りする第一候補**。assistant-ui の tool skill が示す標準経路 |
| (b) `thread.aui.tsx` 内 toolName ディスパッチ | `case "tool-call"` で `toolName` を switch し専用 element か fallback を返す | 公式登録機構を使えない場合の代替。R-3 の描画点に閉じるが、name 別 UI の runtime 機構を迂回する |

**research R-01 で (a) が `useExternalStoreRuntime` (backend 無し) で成立するかを公式ドキュメントで確認**し、
成立するなら (a)、しないなら (b) を採る。いずれも **未対応 tool は `ToolFallback` に落ちる**ことを不変とし、
`tool-registry.aui.tsx` に登録表を 1 箇所へ集める (Principle XII の割り当て漏れを作らない)。

## 上流からの申し送りと本 feature での扱い

**棚卸しの方法** (cl-plan Phase 1 step 4。機械的に洗い出す):

```bash
# spec_id / feature_id / 新設概念で grep する (実行日 2026-09-25)
grep -rn "R-4\|Tier A\|Terminal block\|Code diff\|Todo list\|Subagent\|Agent plan\|parent_agent_id\|ui-coverage" \
  docs/ .specify/ tests/ specs/ scripts/ src/ \
  --include='*.md' --include='*.mjs' --include='*.ts' --include='*.tsx' --include='*.json'
# 加えて描画点の grep:
grep -rn "toolName\|part.toolUI\|makeAssistantToolUI\|ToolFallback\|parent_agent_id" src/
```

**総ヒット: `R-4`/Tier A 系 42 ファイル (md) / 描画点 8 ファイル (src)** (2026-09-25 実行)。
本 feature を名指す**処理を要する記述は 7 件**。すべてここで処理を決める。「該当なし」も理由つきで残す。

### #1 R-3 data-model §3「subagent のネスト表示は R-4」(specs/003 / roadmap)

[R-3 data-model.md](../003-ui-transcript-rendering/data-model.md) §3 が「subagent (`parent_agent_id != null`) の
ネスト表示は R-4」「種別ごとの専用 tool 表示は R-4」と本 feature へ**明示的に申し送っている**。

**対応**: US-1 (専用表示) と US-2 (subagent 入れ子) で消化する。R-3 の `transcript.ts` が宣言だけしている
親参照 (`parent_agent_id` / `parent_tool_use_id`。実 key は R-02 で確定) を実際に使う (Summary #3)。**id ベース対応づけ**は R-3 の tool_use↔tool_result 対応づけと
同じ精神で `domain` に置く。

### #2 R-3 `convert.ts` の未完了マッピング (specs/003 / src)

R-3 の [convert.ts](../../src/renderer/src/features/chat/convert.ts) が `file` part を `📎 filename` の text に、
`divider` を text に落とし、コメントで「File element への完全対応は R-4 / O-2 に譲る」としている。

**対応**: **File 表示は O-2 に送る** (spec [ASSUMED: File 表示は据え置き])。ユーザ入力に無く、tool 表示の
スコープ外。`divider` (compact boundary) も O-2 の専用 element 待ち (R-3 の最小表示を維持)。R-4 は
`convert.ts` に **subagent 入れ子の写し**を足すのみ。

### #3 R-3 `thread.aui.tsx` の tool 描画点 (src)

R-3 の [thread.aui.tsx](../../src/renderer/src/components/assistant-ui/elements/thread.aui.tsx) が
`case "tool-call": return part.toolUI ?? <ToolFallbackComponent {...part} />` と、
`ToolGroup` / `ReasoningGroup` の override slot を既に用意している。

**対応**: R-4 は**この描画点をそのまま使う** (tool-registry を差し込むか `makeAssistantToolUI` で
`part.toolUI` を埋める。research R-01)。**fallback 分岐は不変**とし、専用表示は Tool group / Reasoning
グループの畳み込みの内側でも成立させる (FR-007 / US-1 AC-6)。R-3 のコメント「Tool UIs registered by name
… take precedence over ToolFallback」がこの経路を予見している。

### #4 PLAN.md §4.2 の Tier A 表 (docs)

PLAN.md §4.2 は Tier A の Claude Code 概念 ↔ Element を対応づける。R-4 の 7 種はこの表の行そのもの
(Bash→Terminal block、Edit/Write/MultiEdit→Code diff/Reviewable diff、TodoWrite→Todo list、
Task→Subagent list/Agent handoff、plan mode/ExitPlanMode→Agent plan、thinking→Reasoning、
連続 tool→Tool group)。

**対応**: FR-001〜007 が §4.2 の該当行を実装する。**§4.2 の残行 (Read/Glob/Grep→File tree、canUseTool→
Approval card、effort/cost/quota/context/slash/MCP/WebSearch ほか) は O-2 / X-1 以降**であり、R-4 で
fallback のまま残すことを spec [ASSUMED: 対象 tool は 7 種] に明記した。§4.2 は「暫定」(charter Open Question)
なので R-4 で表を引き直さない (O-2 が SDK 39 型から引き直す)。

### #5 charter の Related Specs / _overview.md の R-4 行 (docs)

`docs/domains/ui/charter.md` の Related Specs は「(残り。R-4 / X-2 / … が本 domain に属する)」、
`related_specs` に R-3 のみ。`docs/domains/_overview.md` の R-4 行は「Tier A tool 表示」。

**対応**: `related_specs` に本 spec を追加、Related Specs 節に R-4 を「着手中」で記す。
`_overview.md` の R-4 行に spec_id を紐づける (人間承認項目)。

### #6 roadmap の「R-4 着手の前提」= R-3 実機一次判断 (docs)

`docs/roadmap.md` は「**R-4 の spec 着手前に `quickstart-results.md` の rubric-a/b を実機で埋め
『一次判断』結論を記す**。いずれかが NG なら charter に従い charter/PLAN.md §4 の見直しを別 task で起票」
と定める。持ち主は R-3。

**対応**: 本 spec の Dependencies に**前提の存在を記録**した。実機操作は人間 deferred。R-4 の設計自体は
R-3 の描画基盤 (実在) に依存するため spec/plan は進められる。**design-gate で「R-3 一次判断が未記入でも
R-4 design を進めてよいか」を人間確認事項**として挙げる (Post-design)。NG 判定が出た場合の charter/PLAN 見直しは
別 task。

### #7 roadmap M1「ここで §4 の方針を確定する」/ SC-010 判断材料の提示 (docs / charter)

roadmap M1 と charter「見た目の判断を先送りしない」は M1 完了 = 軸 1 方針確定を求めるが、
**軸 1 の正式確定は R-4 done-gate の合否条件にしない** (design-gate C-001 (a) の positioning 緩和)。R-3 が一次判断、R-4 が最終 feature。

**対応**: SC-010 を quickstart の実機確認に割り当て、tool 表示まで含めた**判断材料を提示**し
`quickstart-results.md` に**判定表を記録**する (**done 必須は表の記録のみ**。R-3 の SH-067b と同じ機械確認形式)。
**軸 1 の正式確定と R-3 一次判断の実機記入は roadmap の tracked debt (別ステップ)** であり R-4 done から切り離す。

### 「該当なし」と判断したもの (理由つき)

- `scripts/constitution/allowlists.mjs` — **変更不要**。R-4 は新規 SDK 呼び出し・新規 spawn を持たない
  (取得は R-3 の `getSessionMessages` + port をそのまま使う)。`AGENT_SDK_ALLOWED_CALLS` /
  `PROCESS_SPAWN_MODULES` に触れない → ADR 必須条件に当たらない
- `tests/rule-fixtures/` — **変更不要**。許可リストを変えないため fixture の発火条件も変わらない
- `docs/discovery.md` — **変更不要**。新規依存を足さない (registry element はソース同梱で dependency 追加なし。
  research R-01 で裏取り)。仮想化 (L82) は R-3 で present 済み
- `.specify/memory/constitution.md` — **PATCH 不要**。Principle の指針・現状の制約を変える事実がない
  (Principle IX は AD-034 の port 経路を維持するだけ)

## 上流 SSoT の追随 (本 feature の成果物に含める)

| 対象 | 追随内容 |
| --- | --- |
| `docs/domains/ui/charter.md` | `related_specs` と Related Specs に本 spec を追加、R-4 着手中を明記 (#5) |
| `docs/domains/_overview.md` | R-4 行に spec_id を紐づける (#5。**人間承認**) |
| `docs/glossary.md` | **Subagent** を追加 (data-model §5)。Element / Tier A/B/C の既存定義を使う |
| `docs/roadmap.md` | R-3 申し送り #1 (subagent ネスト) の消化を反映、R-4 行を着手中に更新。**R-3 実機一次判断 (rubric-a/b) の記入 + 軸 1 の正式確定を tracked debt として明記** (design-gate C-001 (a))。到達集合検査行に R-4 で変換が重くなった旨を 1 行 (design-gate M-7) |
| `docs/ui-coverage.md` | **作らない (O-2)**。R-4 の割り当ては data-model §3 が暫定台帳 (FR-016) |

### 本 feature で起票する ADR

| 内容 | 理由 |
| --- | --- |
| **Tier A tool 表示の element 選定と subagent 入れ子の DTO 表現** | (a) **Principle XIII の実名照合の記録** — `terminal-block` / `code-diff` / `todo-list` / `subagent-list` / `agent-plan` を採用/調整/自作のいずれにするか、候補名と判断理由を残す (FR-013)、(b) **subagent 入れ子の DTO 表現** — AD-034 が定めた `TranscriptPartDTO` / `TranscriptMessageDTO` の shape を継ぐ形で入れ子フィールドを足す evolution を記録 (FR-011)、(c) **tool-UI 登録方式** (`makeAssistantToolUI` か描画点ディスパッチ。research R-01)、(d) **multi-hop subagent の深さ打ち切り方針** (spec [ASSUMED])。**Principle 変更・許可リスト変更を伴わない**ため ADR は「設計判断の記録」であり、採否は design-gate の人間承認とする |

## Complexity Tracking

> Constitution Check に違反はない。**説明を要する設計判断**を記録する。

| 判断 | なぜ必要か | 却下した単純な代替 |
| --- | --- | --- |
| subagent 対応づけを `domain` の純粋関数に置く | 件数・順序に関わる構造 (親子) は変換の責務で、位置非依存の id 対応づけが要る (SC-009)。取得プロセス側で走るため main を経路に乗せない (Principle IX) | renderer で `parent_agent_id` を後付けグルーピングする案は、描画スレッドで全メッセージを走査し直し、変換の重複と回帰面を生む |
| args narrowing は renderer に置く | argsText は tool により大きくなりうるが**取得プロセス側で `sanitizeBody` + byte cap 済み** (design-gate H-1) のため renderer parse は境界内。DTO に構造化フィールドを足すと本文経路が増える (Principle IX)。R-3 の `parseArgs` と同じ精神で untrusted narrowing | DTO に各 tool の構造化フィールドを足す案は、DTO と schema が tool ごとに膨らみ port ペイロードが増える |
| element を実名照合して採用/調整する | Principle XIII の Example そのもの (Terminal block に寄せる)。registry に実在する (AD-019) | 全部自作する案は Principle XIII 違反。逆に無調整で貼る案は Claude Code の args/result 形と合わず表示が壊れる |
| 未対応 tool を fallback に落とす不変を保つ | Tier A 完全化は O-2。R-4 で全 tool を専用化すると scope が M1 を超える | 全 tool を R-4 で専用化する案は O-2 のスコープを侵し M1 を肥大させる |
| multi-hop subagent を深さ打ち切りにする + 循環を visited-set で検出する | 無制限ネストは描画コストと可読性を損なう。過去ログに深いネスト・破損した循環親参照が実在しうる (design-gate M-1) | 無制限ネスト描画案は深い木で DOM とインデントが破綻する。ネストを捨てる案は欠落 (Principle XII 違反)。循環を見ない案は取得プロセスが固まる/二重展開する |
| argsText を `domain` で `sanitizeBody` + バイト上限に通す | R-3 は argsText を素通ししていた (text/thinking/result のみ sanitize)。5 専用表示の主コンテンツが argsText 由来で bidi 表示偽装 + 巨大 args DoS の面がある (design-gate H-1) | 「R-3 のサニタイザで足りる」案は事実誤認 (argsText は未適用)。renderer だけで sanitize する案は取得プロセスで cap を先に効かせず巨大 args が port/parse を通る |

## Post-design re-check

_Phase 1 完了後に確認する (design-gate の指摘反映後に埋める)。_

- [x] Constitution Check の全項目を Phase 1 の成果物に対して確認した (IX = 本文経路 R-3 維持、
      XII = vacuous 明記 + 扱う範囲の割り当て、XIII = 実名照合)
- [x] 未解決マーカーが plan / data-model / contracts / quickstart に残っていない
- [x] 上流からの申し送り **7 件**すべてに処理を割り当てた (本節の grep で機械化済み)
- [x] **新規 IPC / 新規 SDK 呼び出し / 新規プロセスが無い**ことを確認した (取得経路は R-3 のまま)
- [x] spec の FR (18) / SC (10) と data-model / contracts の対応が取れている
- [ ] **design-gate で人間承認が要る項目**:
      1. 起票する ADR (element 選定 + subagent 入れ子 DTO + tool-UI 登録方式 + 深さ打ち切り) の採否
      2. **Principle XII の scope 解釈の継続** — data-model §3 を O-2 前の暫定台帳とし、`docs/ui-coverage.md` を
         O-2 に委譲、不在中は自動検証が vacuous、の承認 (R-3 が承認済みの継続。#4)
      3. charter / `_overview.md` の追随 (#5)
      4. **R-3 実機一次判断 (roadmap の R-4 前提) の扱い** (#6) — **design-gate C-001 で positioning 緩和 (a) を確定**。
         R-4 の done-gate は「判断材料の提示 + 判定表の記録」までとし、R-3 一次判断の実機記入と軸 1 の正式確定は
         **roadmap に tracked debt として残す別ステップ**。NG 判定時の charter/PLAN §4 見直しは別 task
