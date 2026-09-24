---
description: 'Task list for R-3 transcript の基本表示'
---

# Tasks: transcript の基本表示 (R-3)

**Input**: [spec.md](spec.md) / [plan.md](plan.md) / [research.md](research.md) /
[data-model.md](data-model.md) / [contracts/](contracts/) / [quickstart.md](quickstart.md)

**Tests**: SC-003/004/005/007/008/009 は Vitest、**SC-001/006 は Vitest + 実機の双方**、
**SC-002 は Vitest (位置飛び/マウント数) + quickstart (実機体感)**、SC-010 は quickstart 実機 + rubric 判定表の記録。

## Format

`[ID] [P?] Description` — `BE` = Node / Electron / agents 側、`FE` = renderer、
`SH` = ツール / ドキュメント / 検証 / ADR。`[P]` は同 phase 内で並列実行可能 (別ファイル・依存なし)。

`## US-1` 〜 `## US-3` が spec の User Story に対応する。target 別の索引は末尾。

---

## Phase 1: Setup

- [x] SH-001 **ADR を起票する (前倒し)** — transcript 取得経路とプロセス境界。
      (a) Principle IX 再評価の答え — **`MessageChannelMain` で main を本文データ経路から外す**
      (JSON.parse も structured clone deserialize も main で起こさない)、
      (b) **transcript は target ごとに env 固定の専用 (短命) プロセスで取得**し共有可変 env の
      並行レースを排除 (AD-021 §3 / AD-030 §3 との調停)、
      (c) `AGENT_SDK_ALLOWED_CALLS` への `getSessionMessages` 追加根拠 (Principle VI) +
      **read-only の構造保証 (書き込みを起こす IPC が存在しない)**、
      (d) 行長上限 (#2) の構造的解消、
      (e) **検証の正直化 — 「main で評価されない」の依存グラフ自動証明は未構築 (AD-031 の到達集合検査)。
      SC-007 は port transfer の構造検査 + 手動レビューで担保し、到達集合検査の持ち主 feature を roadmap に登録する**、
      (f) **transcript 専用プロセスを spawn するモジュールを実名で決め `PROCESS_SPAWN_MODULES` に追加**する根拠
      (Principle VI。`enumerator-spawner.ts` は AD-030 常駐用 postMessage+stdout 前提のため、MessageChannelMain
      port transfer 用に新設 spawner を置くか一般化するかを決める。check.mjs 項目 7)、
      (g) **AD-030 調停 — 並行 spawn 劣化 (transcript は user 選択ごと 1 回で hot loop でない点で許容) と、
      専用プロセスのクラッシュ封じ込め・window close/before-quit 時終了・孤児 UNC ハンドル回避 (AD-030 §7 踏襲)、
      per-session (AD-023 §6) / resident (AD-030) に対する第 3 のプロセス形態としての位置づけ**。
      **BE-020/BE-021 は本 ADR の accepted を前提とする** (許可リスト/プロセス境界を調停より先に書かない)
- [x] SH-002 [P] `@tanstack/react-virtual` を `package.json` の dependencies に追加 (AD-033 / discovery L82) — `^3.14.13`
- [x] SH-003 [P] 大量メッセージの fixture (3,000 件超) は `virtualization.test.tsx` の `build(3000)`、
      敵対的 fixture は各テストにインライン配置: 生 HTML / `javascript:` リンク / `<img onerror>` は
      `ChatScreen.test.tsx` の XSS + `safe-url.test.ts`、双方向制御文字は `sanitize-body.test.ts` (BE-014)、
      未閉鎖コードフェンスは `ChatScreen.test.tsx` の FE-051。SC-002/003/005/008 の各テストが所有

**Checkpoint**: ADR が accepted、react-virtual が入りビルドが通る

---

## Phase 2: Foundational — `domain` の純粋関数 (BLOCKING)

**I/O を一切持たない。** モックゼロでテストできることを確認する (AD-023 Consequences)。

- [x] BE-010 `src/domain/session/transcript-dto.ts` — JSON-safe な `ThreadMessageLikeDTO` /
      `TranscriptHandshakeDTO` ([data-model.md](data-model.md) §2 / [contracts/ipc-transcript.md](contracts/ipc-transcript.md))
- [x] BE-011 `src/domain/session/transcript.ts` — `SessionMessage[]` → `ThreadMessageLike[]` 変換。
      **[data-model.md](data-model.md) §3 の対応表をそのまま実装**。text→markdown / thinking→reasoning /
      tool_use→tool-call / image→image / file→file / **system サブ種別を §3 の実名割り当てで処理**
      (「表示 or 表示対象外」を実名確定、未分類を暗黙で落とさない)。`message: unknown` を narrowing (FR-004/006/008/018)
- [x] BE-012 `transcript.ts` の **tool_use ↔ tool_result 対応づけ** — id で対にし位置に依存しない。
      孤児・result 無し・subagent 混在を欠落させず fallback ([data-model.md](data-model.md) §4)
- [x] BE-013 **transcript 本文用サニタイザ** `src/domain/session/sanitize-body.ts` — **改行/タブを保持**し、
      双方向制御文字・C1・危険 C0 を除去、本文相応のバイト上限、大きい tool_result の切り詰め + 折りたたみフラグ。
      **R-2 の 1 行要約用 `normalize` (改行除去・512B) を本文に流用しない** (C-003 / FR-016 / [data-model.md](data-model.md) §6)
- [x] BE-014 `transcript.test.ts` + `sanitize-body.test.ts` — **対応表の全行** + tool_use↔tool_result の対 /
      孤児 / result 無し / **subagent フラット fallback** / 未知 content block / **本文サニタイザが改行/タブを保持し
      bidi/C1 を除去** / 大きい tool_result 切り詰め / compact boundary / system 実名割り当て (SC-005/SC-006/SC-009)
- [x] BE-015 [P] `transcript-schema.test.ts` — `ThreadMessageLikeDTO` のフィールド集合が想定と一致し、
      生の逐語を運ぶフィールドが本文サニタイザを通っていることを固定 (SC-009)

**Checkpoint**: `domain` の変換テストが I/O なしで全通過し、対応表の全種別に表示先が付いている

---

## US-1: 選んだセッションの過去 transcript を読む (P1)

### 取得の経路 (BE)

- [x] BE-020 `src/agents/read-transcript.ts` — **target ごとに `CLAUDE_CONFIG_DIR` を起動時固定した
      専用 (短命) プロセス**で `getSessionMessages(sessionId, { includeSystemMessages })` を読み取り専用で呼ぶ。
      **`dir` オプションは使わない** (project dir。config dir は env)。書き込み系 API を呼ばない。
      親環境を丸ごと継承させず最小 env allowlist。ディストロを起動しない
      ([transcript-read.md](contracts/transcript-read.md) C-1/C-2)
- [x] BE-021 **`MessageChannelMain` の port で本文を運ぶ** — main が port を作り port1 を取得プロセスへ、
      port2 を renderer へ transfer。取得プロセスが `domain` の `transcript.ts` で変換し `ThreadMessageLikeDTO` を
      **port1 経由で renderer に直送**。**main は本文を保持・`JSON.parse`・deserialize しない** (port ハンドルの中継のみ)。
      `MessagePortMain`/`parentPort` は薄い adapter に閉じる (Principle IX/VII / FR-003 / SC-007 / C-3)
- [x] BE-022 `src/agents/read-transcript-protocol.ts` — 取得プロセスの要求/応答。本文は port、要求メタは
      handshake。列挙メタデータの行区切り経路 (R-2) には相乗りしない (行長上限を踏まない。#2)
- [x] BE-023 `src/main/app/session-service.ts` (追記) — transcript 取得の起動と port 仲介、キャッシュ、
      取得時刻。**本文を保持しない**。ディスクに書かない (FR-001 / Principle X / [data-model.md](data-model.md) §8)
- [x] BE-024 `src/main/app/session-ipc.ts` / `ipc.ts` / `validate.ts` (追記) — `getTranscript` ハンドラ。
      **`sessionId` を UUID 正規表現で検証** (path traversal 防止)、`targetKey` は既知集合、`requestToken` 非空。
      **invoke は本文を返さず handshake のみ**。検証は `validate.ts` に集約しハンドラが呼ぶことをテスト
      ([contracts/ipc-transcript.md](contracts/ipc-transcript.md) 検証表 / FR-017)
- [x] BE-025 [P] `src/preload/index.ts` (追記) — 単一 capability に `getTranscript` と port2 受け渡しを追加。
      **生の `ipcRenderer` / 取得プロセスへの transferable port を renderer に素通ししない** (FR-005)
- [x] BE-026 `composition-root.ts` (追記) で結線する
- [x] BE-027 IPC 検証テスト + service テスト — **`sessionId` の非 UUID / traversal 文字列の拒否** (SC-008) /
      検証表の各行 / 取得の置き換え / 失敗の封じ込め / **本文が invoke 応答 (handshake) に含まれない**こと (SC-007)
- [x] BE-027b **env レース回帰テスト** — target A の transcript 取得と target B の列挙を**並行**に走らせ、
      各応答が要求 targetKey の config ディレクトリ由来であることを assert する (contracts C-2 の検証行と 1:1。
      SC-001/SC-007。env 固定専用プロセスが「相乗り」へ後退しても検出する唯一の機械的番人。platform-boundary H-102)

### 表示への配線 (FE)

- [x] FE-030 選択セッションの transcript (`ThreadMessageLike[]` + 状態 + **request token**) を保持する external store。
      **global の `stores/sessions.ts` を汚さず `useTranscript` の local state + `useExternalStoreRuntime` に閉じる**
      (transcript は view-local。選択購読だけ `useSessionsStore` から引く)
- [x] FE-031 `src/renderer/src/features/chat/useTranscript.ts` — `getTranscript` 呼び出し + **port2 の受信**、
      R-2 の選択購読、loading/empty/ready/failed 状態、**stale 応答の破棄** (現在 token と不一致なら捨てる)、
      **retry 導線** (failed から同一 sessionId/targetKey で再取得) ([data-model.md](data-model.md) §8 / H-002/M-004)
- [x] FE-032 `ChatScreen.tsx` (改修) — `messages: []` をやめ選択セッションの `ThreadMessageLike` を
      `useExternalStoreRuntime` に配線。**`isDisabled: true` を維持** (送信は X-1。FR-014)。選択なし・切替の表示 (US-1 AC-5)
- [x] FE-033 loading/empty/failed を R-1/R-2 の element で表示。失敗理由は R-2 の `FailureReason`。**retry ボタン** (US-1 AC-4)
- [x] FE-035 **markdown URL allowlist の enforcement を実装する** (FR-020 / data-model §7 / contracts C-7) —
      MarkdownText (`@assistant-ui/react-markdown`) に `urlTransform` / sanitize schema を渡すか domain 側で href を検査し、
      URL を **`data:`(画像 MIME) + 相対のみ**に絞り (S-002: 実 CSP `img-src 'self' data:` と一致させ http(s) リモート画像を除外)、
      `javascript:`/`vbscript:`/`file:` を除去する。**rehype-raw を足さない (生 HTML 非描画)** ことを確認。
      enforcement 点 (モジュール名) を contracts C-7 に記す (ライブラリ既定依存なら既定を裏取り。security S-004)
- [x] FE-034 `ChatScreen.test.tsx` (追記) — 実データ描画 / 記録順 / 未定義 tool の fallback / 空 / 失敗 + retry /
      **選択切替で旧応答 (token 不一致) が現在表示を上書きしない** / **XSS payload で script 非実行・生 HTML 非描画 +
      `javascript:`/`vbscript:` リンクの href が無害化される** (jsdom で navigation が走らないため href の inert を直接 assert) (SC-001/SC-005/SC-008)。
      **既存の「composer 送信経路が閉じている」回帰を維持** (Principle VIII)

**Checkpoint**: 実機で選んだセッション (WSL 内含む) の過去 transcript が実データで並ぶ (SC-001 / quickstart V-1〜V-4)

---

## US-2: 数千メッセージでもスクロールが破綻しない (P1)

- [x] FE-040 `thread.aui.tsx` (改修) — `ThreadPrimitive.Viewport` を `@tanstack/react-virtual` +
      `ThreadPrimitive.MessageByIndex` の仮想化パスに置換。行は padding spacer 間の通常フロー + `measureElement`
      (FR-011/012/015)。**[調整] `ViewportProvider` は使わず自前 `<div>` スクローラで scroll を所有する** —
      公式サンプル `examples/with-virtualized-thread` の構造 (仮想スクローラは scrollHeight を spacer で動的に変えるため
      `Viewport`/`ViewportProvider` の auto-scroll を流用できず、`ViewportProvider` 単体では `isAtBottom` が
      更新されず `ScrollToBottom` も機能しない)。ローカル skill reference (ViewportProvider 版) より公式サンプルを優先
      (ユーザ指示「公式ドキュメントを確認しもっともあるべき形で導入」)
- [x] FE-041 **auto-follow / measurement guard / run-start jump / jump-to-bottom を自前スクローラ上で作り直す**
      (AD-033 の唯一の非自明作業)。stickyRef + `ResizeObserver` + wheel/touch disarm + `scrollToFn` の sticky ガード。
      **[調整] `turnAnchor="top"` の top-anchor 機構は `Viewport` 前提で仮想化では使えない** → 過去ログは chat 慣習で
      **初期位置=最下部** にし追従は stickyRef で持つ (FR-010 / US-2 AC-3)。`MessageByIndex` (index ベース) は R-3 の
      静的過去ログで index が安定なため採用。**末尾が伸びる X-1 では turn グルーピング + `Unstable_MessageById` に上げる**
- [x] FE-042 **非仮想パスとの両立を判断** (AD-033 但し書き) — **閾値 `VIRTUALIZE_THRESHOLD = 40` を採用**。
      40 以下は既存の非仮想 `ThreadPrimitive.Viewport` パス (assistant-ui の auto-follow/turnAnchor をそのまま使い、
      **既存の `ChatScreen.test.tsx` の回帰テストが番人**)、超過で仮想化。理由 = 小規模では measureElement/spacer の
      複雑性が得るものより回帰面を増やす (skill reference「ボトルネックのときだけ」)。`thread.aui.tsx` のコメントに理由を明記
- [x] FE-043 テスト — `virtualization.test.tsx`: 200 件と 3,000 件で**同時マウント DOM ノード数が一致し総件数に依存しない**
      (SC-003) / 閾値で仮想パスへ切り替わる。**スクロール位置飛び 0 の実体験は quickstart V-5 (実機)** が担う
      (jsdom はレイアウトを持たないため位置飛びは機械検証に不向き。SC-002/SC-004)

**Checkpoint**: 数千件でスクロールが破綻せずマウント数一定 (SC-002 は quickstart V-5)

---

## US-3: 実行中を見据えた表示の頑健性 (streaming text) (P2)

- [x] FE-050 **逐次伸長 + 折りたたみ展開への耐性** — `MarkdownText` は `remark-gfm` + `defer` + 既定の
      `smooth` を維持 (`markdown-text.tsx`)。未完 markdown でも react-markdown が部分木を描画し throw しない
      ことを確認。R-3 は静的過去ログのため逐次伸長は X-1 で本格化 (Streamdown 申し送り SH-052。research R-04)
- [x] FE-051 テスト — `ChatScreen.test.tsx`: **未閉鎖コードフェンス/未閉鎖強調でも描画がクラッシュせず本文が出る**
      (SC-005 / FR-010)。scroll anchor の逐次伸長中保持は仮想化の measureElement + stickyRef が担保し、
      実体験は quickstart V-6 (実機。SC-004。jsdom はレイアウトを持たず位置検証に不向き)
- [x] SH-052 [P] **Streamdown を X-1 に申し送る** (research R-04) — 未完 markdown 修復 / CJK は live streaming で
      真価。roadmap の X-1/X-2 行に残す。**ただし XSS 境界 (生 HTML 非描画・URL allowlist) は R-3 で固める** (FR-020)

**Checkpoint**: 逐次伸長/展開で表示が崩れず位置が奪われない (quickstart V-6)

---

## Phase 7: 検証と上流 SSoT の追随

**SH-060 (許可リスト) は SH-001 (ADR) と同時**。許可リストを ADR 無しで広げない。

- [x] SH-060 `AGENT_SDK_ALLOWED_CALLS` に **`getSessionMessages` を追加** (#3 / C-4) し、
      `PROCESS_SPAWN_MODULES` に **transcript 専用プロセスの spawn 主体モジュールを実名追加** (SH-001 (f))。
      **SH-001 の ADR と同時** (許可リスト拡張には ADR。Principle VI)。SDK は呼び出し形で判定
- [x] SH-061 **違反 fixture `sdk-forbidden-call` を書き込み系 API (`renameSession` 等) に差し替え**、
      `expected.mjs` を更新して発火を維持 (AD-027)。**defense-in-depth**: alias 形 (`const r=renameSession; r()`) の
      fixture を 1 件加えるか binding denylist を検討し、限界を `UNDETECTED_NOTES` に `nextFeature` つきで明記 (M-008)
- [x] SH-062 **Constitution Principle IX の「現状の制約」を PATCH** — 「structured clone (MessageChannelMain) 経路へ
      移し main を本文経路から外した。**ただし composition-root 到達集合検査は依然未構築**」と正直に書く
      (「解決済み」と読める書き換えを禁止)。Amendment trail に 1 行。**人間レビュー必須** (SH-001 の ADR と整合)
- [x] SH-062b **到達集合検査の持ち主 feature を `docs/roadmap.md` に登録** (#1 / AD-031 の「持ち主のいない延期を残さない」)
- [x] SH-063 [P] `docs/discovery.md` L82 の仮想化を **absent → present** に更新 (#4)
- [x] SH-064 [P] `docs/glossary.md` の **transcript / Session の「取得は R-3」を実体化**し、
      [data-model.md](data-model.md) §9 の新語を **domain 帰属を整理して**追加 (message mapping/SessionMessage=session 共有層・
      外部型、TranscriptView=ui。M-003/L-001) (#5)
- [x] SH-065 `docs/domains/ui/charter.md` の **`related_specs` と Related Specs に本 spec を追加**し、
      一次判断の実施を明記。**KPI「スクロールの安定」の計測経路に E2E 延期 (AD-024 #18) + Vitest/実機 暫定代替を注記** (M-009)。
      `docs/domains/_overview.md` の R-3 行を「着手中」に更新 (#6。**人間承認**)
- [x] SH-066 `docs/roadmap.md` の R-3 申し送り #1/#2/#7 の消化を反映。#7 (quickstart 実機再実行) の持ち主が R-3 と明記
- [x] SH-067 `lint`/`typecheck`/`depcruise`/`check:constitution`/`test`/`test:rules` を**全通過**:
      lint error 0 (react-virtual の incompatible-library warning のみ意図明示で disable) / typecheck node+web 0 /
      depcruise 0 (183 modules) / check:constitution ok 14・違反 0 (**項目 7 に transcript-spawner.ts**、
      **項目 14 に getSessionMessages 許可・書き込み系禁止**) / test 850 pass / test:rules 期待表 26 件一致 exit 0
      (`sdk-forbidden-call` = 書き込み系 `renameSession` が constitution で発火)。`src/agents/` の electron/native 推移到達 0、
      **本文の port transfer 構造は SC-007 テスト + 手動レビューで担保** (到達集合の自動証明は未構築 = roadmap E2E feature)、
      **本文を渡す `console.*` は 0** (M-002。grep 確認済み)
- [x] SH-067b **SC-010 rubric の機械確認** — `tests/spec-artifacts/r3-quickstart-rubric.test.ts` が
      `quickstart-results.md` の rubric-a〜rubric-d 行と判定 (OK/NG/未実施) の存在を検査。欠落で test 失敗 = done を fail。
      判定表は `| rubric-<a-d> | 観点 | 判定 | 根拠 |` の grep 可能な決定的形式 (po M-001)
- [x] SH-068 `quickstart-results.md` を作成し **SC-010 rubric 判定表 (a〜d) を記録**、自動検証で満たした SC を併記。
      **実機操作の実施は人間 deferred** (rubric は現状 `未実施`。実機後に OK/NG へ更新) だが、**判定表が記録済み**なので
      done 必須 artifact は満たす (SH-067b が機械確認)。方針変更が要れば charter/roadmap 見直しを別 task で起票 (#7/#8)

**Checkpoint**: 全 SC の計測経路が実行済みで、上流文書と spec の食い違いが 0

---

## Dependencies

```text
Phase 1 (SH-001 ADR / SH-002 dep / SH-003 fixture)
   ↓
Phase 2 (BE-010 → BE-011/BE-012/BE-013 → BE-014/BE-015)   ← BLOCKING
   ↓
US-1 BE (BE-020 → BE-021 → BE-022 → BE-023 → BE-024 → BE-025 → BE-026 → BE-027)
   ↓                                                        ↘
US-1 FE (FE-030 → FE-031 → FE-032 → FE-033 → FE-034)
   ↓
US-2 (FE-040 → FE-041 → FE-042 → FE-043)   ← US-1 の表示が出てから仮想化に置き換える
   ↓
US-3 (FE-050 → FE-051 / SH-052)
   ↓
Phase 7 (SH-060 〜 SH-068。SH-060/SH-061 は SH-001 と同時)
```

- **BE-011/012/013 は BE-010 に依存** (DTO が出力型を決める)
- **BE-020/BE-021 は SH-001 の ADR accepted を前提** (プロセス境界/許可リストを調停より先に書かない)
- **BE-021 (MessageChannelMain) は BE-011 (変換) に依存** (取得プロセスが変換して port に流す)
- **FE-040 は US-1 の表示 (FE-032) が動いてから** (仮想化は既存表示の置き換え)
- **SH-060/SH-061/SH-062/SH-062b は SH-001 と整合** (許可リスト・PATCH・持ち主登録を ADR と同時に)
- **SH-062/SH-065 は design-gate の人間承認を要する** (Constitution PATCH と charter/overview の改定)

## 並列化の指針

- Phase 1 の SH-002/SH-003 は独立
- Phase 2 の BE-013 (サニタイザ) / BE-015 は別ファイルで独立
- Phase 7 のドキュメント系 (SH-063/SH-064) は相互に独立
- US-1 の BE と FE は BE-024/BE-025 の DTO・IPC 確定後に並行可

---

## Target 別索引

### Backend (`src/domain/session/` / `src/agents/` / `src/main/`)

BE-010 〜 BE-015 (foundational。変換 + 本文サニタイザ) / BE-020 〜 BE-027 (US-1。専用プロセス + MessageChannelMain + IPC)

### Frontend (`src/renderer/`)

FE-030 〜 FE-034 (US-1。配線 + stale/retry + XSS test) / FE-040 〜 FE-043 (US-2。仮想化) / FE-050/FE-051 (US-3)

### Shared (ツール / 検証 / ドキュメント / ADR)

SH-001 (ADR。前倒し) / SH-002 / SH-003 (setup) / SH-052 (X-1 申し送り) /
SH-060 〜 SH-068 (許可リスト・fixture・Constitution PATCH・到達集合検査の持ち主登録・docs・検証・quickstart)
