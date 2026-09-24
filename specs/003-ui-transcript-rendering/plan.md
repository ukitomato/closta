# Implementation Plan: transcript の基本表示 (R-3)

**Branch**: `003-ui-transcript-rendering` | **Date**: 2026-09-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-ui-transcript-rendering/spec.md`

## Domain Context

### Charter reference

- **Domain**: `ui` ([charter](../../docs/domains/ui/charter.md))
- **Mission**: Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない
  操作体験を提供する。**軸 1 であり、機能の付随物ではなく採否を決める要素**である
- **本 feature が満たす In scope**: transcript の表示 (markdown / streaming / 仮想スクロール /
  スクロールアンカリング) と、未定義 tool の fallback 表示
- **本 feature が満たさない In scope**: 種別ごとの専用 tool 表示 (Terminal / Code diff / Todo /
  Subagent / Agent plan / Reasoning ほか) は **R-4**、composer (日本語 IME / message queue) は **X-2**、
  情報密度の切替 (compact / comfortable) は **O-1**、`docs/ui-coverage.md` の確立は **O-2**
- **charter の User Journey 1「過去セッションを読む」がそのまま本 feature の US-1 である**
- **charter の domain-specific Principle「見た目の判断を先送りしない」の発火点が本 feature**である。
  M1 を 4 feature に抑え、R-3 の時点で一次判断ができる構成にしてある。
  **本 feature の結果次第で charter と PLAN.md §4 の方針そのものを見直す**
- **charter の Out of scope との関係**: 「他 domain の操作 UI」は持たない — 本 feature は
  R-2 が持つ一覧の**選択結果を入力**として transcript を表示するだけで、一覧画面は `session` domain が持つ
- **charter KPI との対応**: 「スクロールの安定」(数千メッセージでストリーミング中に位置が奪われない) が
  US-2 / US-3、「日本語の健全性」の一部 (フォント崩れ・全角レイアウト) が FR-016。
  **ただし「日本語スクリーンショット比較を CI に」は本 feature では載せない** — composer の送信経路を
  開けないため Principle VIII (A) は発火せず、(B) は目標レイアウト ADR 未採択のため撮り直しが確定する
  (Constitution v1.2.3 / AD-024 #18。**M4 完了後に再検討**の持ち主は据え置き)
- **charter の Open Question のうち本 feature で決着するもの**: SPIKE-2 (導入コスト実測) は
  [AD-033](../../docs/decisions/0033-assistant-ui-elements-introduction-cost.md) で解決済み。
  transcript ミラーの保持期限は I-1 (本 feature は正本を読むだけでミラーを作らない)

### Related ADRs

| ADR | 本 feature への影響 |
| --- | --- |
| [AD-033](../../docs/decisions/0033-assistant-ui-elements-introduction-cost.md) | **SPIKE-2 の結論。** 導入は R-1 で払い済み、`.aui.tsx` + `useExternalStoreRuntime` 固定。**残コストは「仮想化」と「transcript データ配線」の 2 点**。markdown / streaming / scroll anchor / tool fallback は実在。仮想化だけが唯一の穴 |
| [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) | SPIKE-14。§4.2 の Tier A 35 element は実在。R-3 の表示部品の選定を変える理由はない |
| [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) | `SDKMessage` は 39 型。`SDKCompactBoundaryMessage` は **R-3 で必ず出会う** (FR-018)。専用表示の全列挙は O-2 |
| [AD-021](../../docs/decisions/0021-session-store-and-enumeration.md) | **`listSessions()` は config dir を引数で取らず `CLAUDE_CONFIG_DIR` に従う**ことを立証 (getSessionMessages は AD-021 に記載が無く、sdk.d.ts 0.3.270 で別途確認 — [data-model.md](data-model.md) §1)。**§3: per-call env mutation は並行でレースを起こすため採らない**。`sessionStore?` は `@alpha` (I-1) |
| [AD-030](../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md) | 列挙は常駐単一プロセス + **直列化が共有可変 env の唯一の緩和** (§3)。**R-3 は本文を並行取得するためこのモデルに相乗りできない** → transcript は env 固定の専用プロセスで取得する (Summary #1 / 申し送り #2) |
| [AD-023](../../docs/decisions/0023-application-architecture.md) | 5 レイヤ。**「過去ログは `getSessionMessages()` から `useExternalStoreRuntime` に流し込む」= 本 feature そのもの**。SDK 境界は `agents` (utilityProcess)。IPC はデータのみ。preload は単一 capability。**大きなペイロードは MessagePort で運ぶ** (main の IPC に通さない) |
| [AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md) | **Principle IX の再評価が本 feature の中核設計判断** (Decision 2)。R-2 は列挙メタデータ 1 行を main でパースしたが、**R-3 は数 MB の `tool_result` 本文を運ぶ**。構造体 postMessage への移行を判断する (下記「上流からの申し送り」#1 / #2) |
| [AD-027](../../docs/decisions/0027-rule-firing-verification-and-service-io-rule.md) | **ルールは「違反サンプルで発火した」ことで確認する**。`AGENT_SDK_ALLOWED_CALLS` に `getSessionMessages` を足す時点で、既存 fixture `sdk-forbidden-call` (getSessionMessages を禁止例に使用) の差し替えが要る (下記 #3) |
| [AD-024](../../docs/decisions/0024-constitution-verification-paths.md) | 検証経路。#18 が Principle VIII の Automated 2 項目を延期しており、本 feature も composer 送信経路を開けないため踏襲する |

### Glossary

本 feature で追加/更新する用語は [data-model.md](data-model.md) の表のとおり。既存項の追随:

- **transcript** — 現在「一覧 (R-2) は本文を取得も転送もしない — 取得は R-3 で追加する」とある。
  **本 feature で「取得は R-3」を実体化**する。glossary の当該行を「取得済み (R-3)」に更新する
- **Session** — 「一覧が扱うのは要約とメタデータのみ、本文の取得は R-3 で追加する」を同様に更新
- **Element** / **Tier A/B/C** — 既存定義を使う。本 feature は Tier A の表示部品 (markdown / reasoning /
  tool fallback) を実データに配線するのみで、種別ごとの専用 tool 表示 (R-4) は追加しない

## Summary

R-2 の一覧で選んだセッションの **過去 transcript を実データで表示する**、`ui` domain 最初の feature。
[AD-033](../../docs/decisions/0033-assistant-ui-elements-introduction-cost.md) が
残作業を **「仮想化の追加」と「transcript データ配線」の 2 点**に切り出している。技術的な核は 4 点。

1. **取得は target ごとに `CLAUDE_CONFIG_DIR` を起動時固定した専用 (短命) プロセス**で行う
   (AD-021 の子プロセス方式)。`getSessionMessages()` を読み取り専用で呼び (Principle IV)、
   `dir` オプションは使わない (`dir` は project dir。config dir は env。data-model §1)。
   **R-2 の常駐プロセスの共有可変 env に相乗りしない** — 本文の並行取得が列挙と env を踏み合い
   別ディストロを読むため (AD-021 §3 / AD-030 §3。申し送り #2)。ディストロを起動しない
2. **main を本文のデータ経路から外す** (Principle IX / [AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md) Decision 2 / AD-023)。
   `JSON.parse` を避けるだけでは不十分 — `parentPort` は main に繋がり、`postMessage` した数 MB が
   main の V8 で structured clone deserialize され main を固める。**`MessageChannelMain` で
   取得プロセス↔renderer を直結**し (main が port を作り両端へ transfer)、本文は main を通らない。
   `getTranscript` invoke は軽量メタのみ返す。変換は取得プロセス側で走らせる
3. **`SessionMessage[]` → `ThreadMessageLike[]` の変換は `domain` の純粋関数**とする (FR-004)。
   tool_use (assistant) と後続 user の tool_result を **`toolCallId` で対にし**、
   thinking を reasoning、text を markdown、未定義 tool を fallback part に写す。会話由来文字列は
   **transcript 本文用サニタイザ (改行/タブ保持・bidi/C1 除去・本文相応の上限) を通す** —
   R-2 の 1 行要約用 `normalize` (改行除去・512B) は本文に流用しない (FR-016 / data-model §6)
4. **仮想化は公式の `ViewportProvider` 構成に置き換える** (AD-033 の唯一の非自明作業)。
   `@tanstack/react-virtual` + `ThreadPrimitive.ViewportProvider` + `ThreadPrimitive.MessageByIndex`
   (挿入に強い `Unstable_MessageById` も候補) にし、現 `Viewport` の auto-follow /
   measurement guard / run-start jump / `ScrollToBottom` を**その上で作り直す**
   (`.claude/skills/primitives/references/messages.md` §Virtualization)

## Technical Context

**Language/Version**: TypeScript 5.9 / Node 24 系 (Electron 39 同梱) / React 19

**Primary Dependencies**: `@assistant-ui/react` 0.15 (`useExternalStoreRuntime` / `ThreadPrimitive` /
`MessagePrimitive`) / `@assistant-ui/react-markdown` 0.14 (既存 `MarkdownText`) /
**`@tanstack/react-virtual` (新規追加。AD-033 / discovery L82 の予定どおり)** /
`@anthropic-ai/claude-agent-sdk` 0.3.270 (`getSessionMessages` を追加使用) / Zustand 5 / Electron 39

**Storage**: なし。取得結果はプロセス寿命のキャッシュに限る (Principle X)。config への書き込み 0 件

**Testing**: Vitest (`domain` の変換純粋関数 / 仮想化のマウント数 / renderer 単体) + quickstart の実機確認。
**E2E (Playwright) は本 feature でも作らない** (Principle VIII の延期を踏襲。AD-024 #18)

**Target Platform**: Windows 11 + WSL2 (開発ホスト)。WSL 内セッションを UNC 経路で読む

**Project Type**: Electron デスクトップアプリ (main + preload + renderer + utilityProcess)

**Performance Goals**: 数千メッセージ (3,000+) でスクロールが破綻しない (SC-002) /
同時マウント DOM ノード数が総件数に依存しない (SC-003) / 初期表示が体感で妥当

**Constraints**: main process で本文の巨大 `JSON.parse` 0 件 (SC-007) / `wsl.exe` 起動 0 回 /
config 書き込み 0 件 / セッション起動 0 件 / composer 送信経路は閉じたまま (FR-014)

**Scale/Scope**: 新設画面の追記 1 (`ChatScreen` を配線) / 新設 IPC メソッド 1 (transcript 取得) /
`domain` 変換関数 1 群 / 仮想化への `thread.aui.tsx` の再配線 1

## Constitution Check

_GATE: Phase 0 前に通す。Phase 1 設計後に再確認する。_

`.specify/memory/constitution.md` v1.2.5 に基づくゲート。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — 本 feature は新たにパスを組み立てない。
      config ディレクトリの解決は R-2 の `config-dir.ts` を再利用し、`agents` は受け取った値を
      SDK に渡すだけ。`UNC_FORBIDDEN_IN = ['src/agents/']` を継承する
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — 本 feature は
      プラットフォーム分岐を持たない (renderer と変換純粋関数と SDK 読み取りのみ)
- [x] **III. 権限モードは capability に従う** — **N/A: 本 feature は権限モードを扱わない**
      (読み取り専用であり起動しない)
- [x] **IV. 通信は Agent SDK 経由** — `getSessionMessages()` のみを追加使用し、JSONL の自前パースをしない。
      `AGENT_SDK_ALLOWED_CALLS` に `getSessionMessages` を足す (**ADR 必須**。下記 #3)。
      **書き込み系 API (`renameSession` / `tagSession` / `deleteSession` / `forkSession`) は許可しない**
      (読み取り専用。FR-001)
- [x] **V. 長期資格情報を永続化しない** — 本 feature は資格情報を扱わない。列挙プロセスに
      親環境をそのまま継承させない R-2 の方針を踏襲する
- [x] **VI. 永続環境を構築・変更しない** — ディストロを起動せず config を作成・変更しない。
      `getSessionMessages` の追加は許可リスト (`scripts/constitution/allowlists.mjs`) の変更を伴うため
      **ADR を要する** (ファイル冒頭の規則)
- [x] **VII. `src/agents/` は Electron / ネイティブ非依存** — transcript 取得を `src/agents/` に
      **専用 (短命) プロセス**として置き、R-2 の常駐列挙プロセスに相乗りさせない (共有可変 env のレース回避。AD-021 §3 / AD-030 §3)。`electron` / ネイティブモジュールへの推移的到達 0 を維持する
      (dependency-cruiser)。**structured clone の `MessagePort` は `utilityProcess` の親子通信 API であり、
      薄い adapter に閉じる** (Principle VII Statement 後半 / AD-010。`parentPort` は import に現れないため
      本体は stdio と同じ抽象を話す形にする)
- [x] **VIII. 日本語環境で破綻しない** — composer の送信経路は R-1 のまま閉じる (FR-014。
      `ChatScreen.test.tsx` の回帰前提を維持)。transcript 本文の日本語・全角・絵文字の
      レイアウト健全性は SC-006 が見る。**markdown レンダラの CJK は下記「表示レンダラの選択」で扱う**。
      **Automated 2 項目 (IME テスト / スクショ比較) は載せない** (composer を開けないため。AD-024 #18)
- [x] **IX. main process をブロックしない** — **本 feature の中核判断**。
      R-2 は列挙応答 1 行を main で `JSON.parse` したが (メタデータのみ、AD-031 で許容)、
      **R-3 は数 MB の `tool_result` 本文を運ぶ**。取得と `ThreadMessageLike[]` 変換を取得プロセス側で行い、
      **`MessageChannelMain` の port transfer で取得プロセス↔renderer を直結**して本文を main に通さない。
      **`JSON.parse` を避けるだけでは不十分** — `parentPort` 経由の structured clone は main の V8 で
      deserialize され main を固めるため、main を**データ経路から外す** (FR-003 / SC-007)。
      **検証の正直化**: 「main で評価されない」の依存グラフ自動証明は現状存在しない (AD-031 が名指す
      composition-root 到達集合検査は未構築)。SC-007 は port transfer の構造検査 + 手動レビューで担保し、
      その検査の持ち主 feature を roadmap に登録する (下記 #1)。これが AD-031 Decision 2 の再評価の答えである
- [x] **X. セッションの正本はアプリ外** — `getSessionMessages` の結果でキャッシュを置き換える。
      ディスクに書かない。正本は Claude Code 側の JSONL
- [x] **XI. 垂直スライス** — 観測可能な振る舞いは「選んだセッションの過去ログが画面に出る」(US-1)
- [x] **XII. 未表示情報を残さない** — `docs/ui-coverage.md` は O-2。本 feature は
      **表示する `SessionMessage` 種別と content ブロック種別すべてに表示先を割り当て**、
      [data-model.md](data-model.md) §3 に割り当て表として記録する (FR-019 / SC-009)。
      専用 tool 表示 (R-4) を持たない tool は fallback に割り当てる (割り当て漏れを作らない)。
      **ただし `docs/ui-coverage.md` 不在中は Principle XII の自動検証 (未割当行 grep) が
      ファイル不在で vacuously pass する** — 本 feature の未割当ゼロは data-model §3 + レビューでのみ担保される。
      **この scope 解釈 (data-model §3 を O-2 前の暫定台帳とする) は design-gate の人間承認を要する** (下記 Post-design)
- [x] **XIII. assistant-ui の element と design system を優先** — 独自トークンを追加しない。
      仮想化は公式の `ViewportProvider` + `MessageByIndex` / `Unstable_MessageById` を使う (FR-015)。
      表示部品は既存の `thread.aui.tsx` (markdown / reasoning / tool-fallback) を流用する。
      **`Viewport` を `ViewportProvider` に置き換えるのは公式が示す仮想化の唯一の形**であり、
      自作スクローラではない。**採否の理由を PR に記載する** (AD-033 の「非仮想パスとの両立」判断を含む)
- [x] **XIV. Ubiquitous Language** — glossary の transcript / Session の「取得は R-3」を実体化して更新。
      変換の新語は [data-model.md](data-model.md) に定義する
- [x] **XV. 多言語規約** — code は英語、UI / docs は日本語、commit は英語 1 行

**Domain charter の整合**

- [x] 本 feature の domain (`ui`) が charter の In scope に収まっている
- [x] Out of scope に踏み込んでいない (専用 tool 表示 R-4 / composer X-2 / 密度 O-1 / ui-coverage O-2 を除外)
- [ ] **charter 側の追随が要る** — `related_specs` / Related Specs に本 spec を追加し、
      domain-specific Principle「見た目の判断を先送りしない」の一次判断を本 feature で行う旨を明記する
      (下記「上流 SSoT の追随」)

## Project Structure

### Documentation (this feature)

```text
specs/003-ui-transcript-rendering/
├── plan.md                        # This file
├── spec.md
├── research.md                    # Phase 0 (仮想化の実測 / 本文サイズ / 変換の対応)
├── data-model.md                  # Phase 1 (SessionMessage→ThreadMessageLike 対応表 / 表示先割り当て)
├── quickstart.md                  # Phase 1 (実機確認 V-1〜。R-2 の SH-089 再実行を継承)
├── contracts/
│   ├── transcript-read.md         # agents ↔ domain ↔ main の取得契約 + SDK 呼び出し許可
│   └── ipc-transcript.md          # 単一 capability への追加 (取得 1 メソッド + 検証表)
├── checklists/requirements.md
└── tasks.md                       # /cl-tasks が生成する
```

### Source Code (repository root)

```text
src/domain/session/
├── transcript.ts                  ← 新設。SessionMessage→ThreadMessageLike 変換 (純粋関数。I/O なし)
│                                    tool_use↔tool_result 対応づけ、thinking→reasoning、
│                                    未定義 tool→fallback、compact boundary / system 実名割り当て
├── transcript.test.ts             ← 新設。対応表の全行 + subagent fallback + 未知 block
├── transcript-dto.ts              ← 新設。JSON-safe な ThreadMessageLikeDTO / TranscriptHandshakeDTO
├── sanitize-body.ts               ← 新設。**本文用サニタイザ (改行/タブ保持・bidi/C1 除去・本文相応の上限)**
│                                    **R-2 の 1 行要約用 normalize は本文に流用しない** (C-003)
└── sanitize-body.test.ts          ← 新設。改行/タブ保持 + bidi/C1 除去 + 大 tool_result 切り詰め

src/agents/
├── read-transcript.ts             ← 新設。**target ごとに env 固定の専用 (短命) プロセス**で
│                                    getSessionMessages を読み取り専用で呼ぶ (SDK を呼ぶ唯一の場所)。
│                                    変換して port に流す。**共有可変 env に相乗りしない** (C-002)
├── read-transcript-protocol.ts    ← 新設。本文は MessageChannelMain の port、要求メタは handshake
└── (MessagePortMain adapter)       薄い adapter に閉じる (Principle VII。import に現れない)

src/main/app/
├── session-service.ts             (追記) transcript 取得の起動 + **port 仲介** (本文を保持しない)
├── session-ipc.ts                 (追記) getTranscript ハンドラ (**本文を返さず handshake のみ**)
├── ipc.ts / validate.ts           (追記) getTranscript と **sessionId の UUID 検証** / targetKey / requestToken
└── composition-root.ts            (追記) 結線 (**MessageChannelMain を作り両端へ transfer**)

src/preload/index.ts               (追記) 単一 capability に getTranscript を追加 (生の ipcRenderer 不可)

src/renderer/src/
├── features/chat/
│   ├── ChatScreen.tsx             (改修) [] を渡すのをやめ、選択セッションの ThreadMessageLike を配線。
│   │                                isDisabled: true は維持 (送信は X-1)
│   ├── useTranscript.ts           ← 新設。IPC + port2 受信 + 選択購読 + 状態 + **stale 破棄 (token) / retry**
│   └── ChatScreen.test.tsx        (追記) 実データ / 空 / 失敗+retry / stale 破棄 / **XSS payload** / 送信経路閉塞 (回帰維持)
├── components/assistant-ui/elements/
│   └── thread.aui.tsx             (改修) Viewport→ViewportProvider + react-virtual + MessageByIndex。
│                                    auto-follow / measurement guard / run-start jump / ScrollToBottom を再実装
└── stores/sessions.ts            (追記) 選択セッションの transcript を保持する external store

package.json                       (追記) @tanstack/react-virtual を dependencies に追加
docs/discovery.md                  (追記) L82「仮想化 absent(R-3 で入る)」を present に更新
scripts/constitution/allowlists.mjs (追記) AGENT_SDK_ALLOWED_CALLS に getSessionMessages (ADR 必須)
tests/rule-fixtures/               (改修) sdk-forbidden-call fixture を書き込み系 API に差し替え
```

**Structure Decision**: R-1 が固定した 5 レイヤ構成 (AD-023) にそのまま載せる。新設は
`src/domain/session/transcript*.ts` と renderer の `useTranscript.ts` が中心で、
`agents` / `main/app` / `preload` は R-2 の経路への**追記**である。新規ディレクトリは作らない。

### 表示レンダラの選択 (公式ドキュメントに基づく「あるべき形」)

`.claude/skills/markdown/` の公式指針で 2 つの text レンダラを比較した。

| レンダラ | 特性 | 本 feature での判断 |
| --- | --- | --- |
| **`MarkdownTextPrimitive`** (現状) | remark-gfm / `smooth` (既定 on) / コードハイライト。**R-1 で配線済み** | **R-3 はこれを継続する**。過去ログは完結済みで未完 markdown 修復の便益が出ないため、既存配線を変えない (Principle XIII / 最小変更) |
| `StreamdownTextPrimitive` | block-aware streaming / **未完 markdown 修復** / **`@streamdown/cjk`** / Shiki / KaTeX / Mermaid | **X-1 (live streaming) の着手時に採否を判断**。未完 markdown 修復と CJK は live ストリームで真価が出る。本 feature の research に「X-1 で Streamdown を評価する」を申し送りとして残す |

**理由**: 本 feature の streaming text (FR-010) は live 源を持たない (過去ログは完結済み)。
未完 markdown 修復が実際に効くのは X-1 であり、R-3 で Streamdown を入れると
「便益の出ない機械を先に入れる」ことになる (investigation ≠ implementation の精神)。
**もっともあるべき形は「R-3 は既配線の `MarkdownText` を使い、Streamdown は live streaming の X-1 で評価する」**
であり、この判断を data-model / research に記録する。design-gate で人間が覆せる余地を残す。

**レンダラ選択に依らず XSS 境界を R-3 で固める** (FR-020 / data-model §7)。会話由来 markdown は
攻撃者が内容を仕込める外部由来のため、**生 HTML を描画しない** (rehype-raw を足さない)、URL を
http(s)/相対/data:(画像 MIME) に allowlist、CSP を最終防御線に保つ。現行 `MarkdownText`
(`@assistant-ui/react-markdown`) がこの前提を満たすことを契約に明記し、negative test を課す。

## 上流からの申し送りと本 feature での扱い

**棚卸しの方法** (cl-plan Phase 1 step 4。機械的に洗い出す):

```bash
# spec_id と feature_id と新設概念で grep する
grep -rn "003-ui-transcript-rendering\|R-3\|getSessionMessages\|react-virtual\|ViewportProvider" \
  docs/ .specify/ tests/ specs/001-* specs/002-* scripts/ src/ \
  --include='*.md' --include='*.mjs' --include='*.ts' --include='*.tsx' --include='*.json'
```

**総ヒット: `R-3` 系 54 ファイル / `getSessionMessages`・仮想化系 24 ファイル** (2026-09-24 実行)。
本 feature を名指す**処理を要する記述は 9 件**。すべてここで処理を決める。「該当なし」も理由つきで残す。

### #1 Principle IX の再評価 — transcript 本文のパース配置 (roadmap R-3 #1 / AD-031 Decision 2)

R-2 は列挙応答 1 行を main で `JSON.parse` した (メタデータのみ)。`bad_pattern_grep` は
パースコードの置き場を見るだけで**どのプロセスで評価されるかを見ない**ため、
`existing_violations: 0` は遵守を意味しない (Constitution Principle IX 現状の制約)。

**対応**: R-3 は数 MB の `tool_result` 本文を運ぶ。**`MessageChannelMain` で取得プロセス↔renderer を
直結し、main を本文のデータ経路から外す** (main は port ハンドルの中継のみ)。**`JSON.parse` を避けるだけでは
不十分** — `parentPort` 経由の structured clone は main の V8 で deserialize され main を固めるため
(design-gate platform-boundary/architecture 指摘)。この判断を本 feature の ADR に記録する
(AD-031 Decision 2 の再評価の答え)。**検証の正直化**: 「main で評価されない」の依存グラフ自動証明は
現状存在しない (AD-031 が名指す composition-root 到達集合検査は未構築) → SC-007 は port transfer の構造検査 +
手動レビューで担保し、**到達集合検査の持ち主 feature を roadmap に登録**する。**Constitution Principle IX の
「現状の制約」を改める PATCH は「structured clone 経路へ移した。到達集合検査は依然未構築」と正直に書く**
(「解決済み」と読める書き換えを禁じる。人間レビュー必須)。

### #2 行長上限 + 共有可変 env の並行レース (roadmap R-3 #2 / AD-031 訂正 / AD-021 §3 / AD-030 §3)

(a) R-2 のパース対象のバイト列に上限が無い。本文を行区切り JSON で運ぶと巨大 `tool_result` で
1 行が数 MB になり #1 と同じ問題を踏む。(b) **R-2 の常駐プロセスは `CLAUDE_CONFIG_DIR` を
プロセス global の可変 env に書き、直列 chain だけが安全性を担保している (AD-030 §3)。本文を
別チャネルで並行取得すると env を踏み合い別ディストロを読む** (AD-021 §3 が警告。design-gate C-002)。

**対応**: (a) 本文チャネルを **`MessageChannelMain` の port** に分け、行アセンブラを本文に使わない
(列挙メタデータの行区切り経路 (R-2) は据え置く)。(b) **transcript は target ごとに
`CLAUDE_CONFIG_DIR` を起動時固定した専用 (短命) プロセス**で取得し、共有可変 env を持たせない
(AD-021 の子プロセス方式)。「別チャネルで並行」と「共有 global env」の同居を棄却する。
この設計を SH-001 の ADR に記録する (「AD-030 の単一常駐+global env モデルは本文の並行取得へ拡張できない」)。

### #3 `AGENT_SDK_ALLOWED_CALLS` の拡張と fixture の差し替え (allowlists.mjs / AD-027 / SH-081)

`scripts/constitution/allowlists.mjs` の `AGENT_SDK_ALLOWED_CALLS = ['listSessions']` は
**呼んでよい SDK API を 1 件に絞っている**。冒頭コメントが「`getSessionMessages` のような
**読み取り API** が抜けると FR-044 が守られない」と、まさに本 feature を予見している。

**対応**: (a) `getSessionMessages` を許可に足す (**ファイル冒頭規則により ADR 必須**。#1 の ADR に相乗り)。
(b) **既存の違反 fixture `tests/rule-fixtures/.../sdk-forbidden-call` は `getSessionMessages` を
禁止例に使っている** — 許可に移すと発火しなくなるので、**書き込み系 API (`renameSession` など、
読み取り専用の本 feature で禁止すべきもの) に差し替える**。AD-027 の「ルールは発火で確認する」を守る。
(c) `AGENT_SDK_IMPORT_DIRECTORIES = ['src/agents/']` はディレクトリ単位なので変更不要。
(d) **read-only の第一義的保証は「書き込みを起こす IPC メソッドが存在しないこと」** (getTranscript のみ、
取得専用) とし ADR/contract に明記する。item 14 は呼び出し形の正規表現のみで alias
(`const r=renameSession; r()`) / dynamic import を素通しするため (design-gate M-008)、**defense-in-depth**
として binding レベル denylist を足すか alias 形 fixture を 1 件加え `UNDETECTED_NOTES` に限界を明記する。

### #4 discovery.md L82 の仮想化ステータス更新

`docs/discovery.md` L82 が「仮想化 `@tanstack/react-virtual` … absent (R-3 で入る)」と予定している。

**対応**: 本 feature で追加後、当該行を present に更新する。AD-033 の Confirmation とも整合させる。

### #5 glossary の transcript / Session の更新

`docs/glossary.md` の transcript / Session に「一覧は本文を取得も転送もしない — 取得は R-3 で追加する」
とある。**本 feature が「取得は R-3」を実体化**する。

**対応**: 両項を「取得済み (R-3)」に更新する。変換の新語は data-model に定義し glossary に足す。

### #6 ui charter の追随 (related_specs / 一次判断)

`docs/domains/ui/charter.md` の Related Specs は「未着手。R-3 / R-4 / … が本 domain に属する」、
`related_specs: []` のまま。domain-specific Principle「見た目の判断を先送りしない」は
**R-3 の時点で一次判断**と明記している。

**対応**: `related_specs` に本 spec を追加、Related Specs 節に R-3 を記す。
`docs/domains/_overview.md` の R-3 行を「着手中」に更新する (人間承認項目)。

### #7 quickstart の実機再実行 (R-2 の SH-089 を継承。roadmap R-3 #7)

R-2 の SH-089 が quickstart の実機再実行を **R-3 に送った** (pr-gate Round 6)。
持ち主は `docs/roadmap.md` R-3 申し送り #7 で、実機操作を伴う人間タスク。

**対応**: 本 feature の quickstart に、R-2 で踏めなかった項目 (V-3 出自 / 越境 `/mnt/c` / V-8 空状態) を
transcript 表示の文脈で組み込む。**実機操作のため done の必須完了項目にはしない**が、
持ち主が R-3 であることを quickstart に明記する。

### #8 「見栄えの一次判断」を実施する (roadmap / charter / ユーザ入力)

roadmap は「R-3 の完了時点で見栄えの一次判断ができる。R-4 まで待たない」、charter は
「M1 の結果次第で本 charter と PLAN.md §4 の方針を見直す」と定める。ユーザ入力も
「この時点で UI の見栄えを判断できることを受け入れ条件に含める」と明記。

**対応**: SC-010 を quickstart の実機確認に割り当て、**判断結果を quickstart-results に記録**する。
方針変更が要る場合は charter / roadmap の見直しを別 task として起票する余地を残す。

### #9 targets の見直し (frontend → both) の記録

ユーザ入力は `--targets frontend` だったが、実データ表示に読み取り専用の backend 経路
(`getSessionMessages` + IPC) が要るため、**AskUserQuestion で targets を both に確定した**
(spec frontmatter `targets_selected_by: user`)。

**対応**: 本 feature を BE (取得経路) / FE (表示・仮想化) / SH (許可リスト・ADR・docs) の
3 section に分ける (tasks.md)。この判断の経緯を spec の Dependencies と本節に残す。

## 上流 SSoT の追随 (本 feature の成果物に含める)

| 対象 | 追随内容 |
| --- | --- |
| `scripts/constitution/allowlists.mjs` | `AGENT_SDK_ALLOWED_CALLS` に `getSessionMessages` を追加、**`PROCESS_SPAWN_MODULES` に transcript 専用プロセスの spawn 主体モジュールを追加** (#3 / H-002。いずれも ADR 必須) |
| `tests/rule-fixtures/` (`expected.mjs` + fixture) | `sdk-forbidden-call` を書き込み系 API に差し替え、発火を維持 (#3) |
| `.specify/memory/constitution.md` | **Principle IX 現状の制約の再評価** を PATCH で反映 (#1。人間レビュー必須) |
| `docs/discovery.md` | L82 の仮想化を present に更新 (#4) |
| `docs/glossary.md` | transcript / Session の「取得は R-3」を実体化 (#5)、変換の新語追加 |
| `docs/domains/ui/charter.md` | `related_specs` と Related Specs に本 spec を追加、一次判断の実施を明記 (#6)。**KPI「スクロールの安定」の計測経路に E2E 延期 (AD-024 #18) + Vitest/実機 暫定代替を注記** (M-009) |
| `docs/domains/_overview.md` | R-3 行を「着手中」に更新 (#6。人間承認) |
| `docs/roadmap.md` | R-3 申し送り #1 / #2 / #7 の消化を反映。#7 の quickstart 持ち主を確定 |

### 本 feature で起票する ADR

| 内容 | 理由 |
| --- | --- |
| **transcript 本文の取得経路とプロセス境界** | (a) Principle IX 再評価の答え — **`MessageChannelMain` で main を本文データ経路から外す** (JSON.parse も structured clone deserialize も main で起こさない。AD-031 Decision 2 の消化)、(b) **transcript は env 固定の専用プロセスで取得**し共有可変 env の並行レースを排除 (AD-021 §3 / AD-030 §3 との調停。「単一常駐+global env は本文の並行取得へ拡張できない」)、(c) `AGENT_SDK_ALLOWED_CALLS` への `getSessionMessages` 追加根拠 (許可リスト拡張には ADR。Principle VI) + read-only の構造保証 (書き込み IPC 不在)、(d) 行長上限 (#2) の構造的解消、(e) **Constitution Principle IX PATCH の前提 — ただし「到達集合検査は未構築」を残し「解決済み」と書かない** |

## Complexity Tracking

> Constitution Check に違反はない。**説明を要する設計判断**を記録する。

| 判断 | なぜ必要か | 却下した単純な代替 |
| --- | --- | --- |
| 本文を `MessageChannelMain` で取得プロセス↔renderer 直結し main を経路から外す | `JSON.parse` を避けても `parentPort` 経由の structured clone は main の V8 で deserialize され main を固める (design-gate)。main を経路に置かない構造でのみ Principle IX を満たす | 「main を経由/中継」案は main が数 MB を deserialize して固まる。R-2 の行区切り JSON も同様 |
| transcript を env 固定の専用 (短命) プロセスで取得する | R-2 の常駐プロセスの共有可変 env に相乗りすると本文の並行取得が列挙と env を踏み合い別ディストロを読む (AD-021 §3 / AD-030 §3) | 常駐プロセスに相乗り + 並行案は env レース (別ディストロ読み)。直列化案は本文取得が列挙をブロックし別チャネルの意義を失う |
| 変換を取得プロセス側で行う | main / renderer をブロックせず大きな transcript を扱う (Principle IX)。`domain` の純粋関数なので走らせても I/O を持たない | renderer で変換する案は、大きな transcript で描画スレッドを塞ぐ |
| 本文用サニタイザを別に定義する | R-2 の `normalize` は改行/タブ除去・512B で本文表示 (FR-007) を壊す。制御文字防御と本文表示を両立させる (design-gate C-003) | `normalize` を本文に流用する案は「表示が壊れる」か「防御が消える」の二択 |
| `Viewport` を `ViewportProvider` + react-virtual に置き換える | 数千メッセージで全 DOM マウントが破綻する (AD-033 の唯一の穴)。公式指針が示す唯一の仮想化の形 | `content-visibility` だけの現行最適化は DOM 全件マウントが残り数千件で破綻する (AD-033) |
| 仮想化と非仮想の両立を検討する | 小規模スレッドでは仮想化の複雑性 (measurement guard) が回帰を生みうる (AD-033 の但し書き) | 常に仮想化する案は小規模で過剰。research で閾値と両立可否を決める |
| `MarkdownText` を継続し Streamdown を X-1 に送る | 過去ログは完結済みで未完 markdown 修復の便益が出ない (上記「表示レンダラの選択」) | R-3 で Streamdown を入れる案は、便益の出ない機械を先に入れる (investigation ≠ implementation) |

## Post-design re-check

_Phase 1 完了後に確認した (design-gate Round 1 の指摘反映後)。_

- [x] Constitution Check の全項目を Phase 1 の成果物に対して再確認した (IX を main-out-of-path + 検証正直化に、XII を vacuous 明記に更新)
- [x] 未解決マーカーが plan / data-model / contracts / quickstart に残っていない
- [x] 上流からの申し送り **9 件**すべてに処理を割り当てた (本節の grep で機械化済み)
- [x] 新設 IPC メソッドが単一 capability に収まり、検証表に行が追加されている
- [x] spec の FR (20) / SC (10) と data-model / contracts の対応が取れている
- [ ] **design-gate で人間承認が要る項目** (Round 1 の指摘で追加):
      1. 起票する ADR (transcript 取得経路 + プロセス境界 + SDK 許可拡張) の採否
      2. **Constitution Principle IX PATCH の採否** — 「structured clone 経路へ移した。**到達集合検査は未構築**」と正直に書く (#1)
      3. **到達集合検査 (composition-root からの main 評価到達) の持ち主 feature を roadmap に登録**する採否 (#1 / AD-031)
      4. charter / `_overview.md` の追随、charter KPI「スクロールの安定」の E2E 計測経路の追随 (#6 / M-009)
      5. **Principle XII の scope 解釈** — data-model §3 を O-2 前の暫定台帳とし ui-coverage.md を委譲、不在中は自動検証が vacuous、の承認 (H-006)
      6. `MarkdownText` 継続 / Streamdown 先送りの判断 (表示レンダラの選択)
