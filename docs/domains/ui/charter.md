---
domain: ui
status: needs-human-review
owner: ukitomato
generated_by: human (PLAN.md を素案として再導出)
last_reviewed: 2026-09-29
related_adrs:
  - docs/decisions/0001-adopt-electron-over-tauri.md
  - docs/decisions/0006-supervisor-in-utility-process.md
related_specs:
  - specs/003-ui-transcript-rendering/spec.md
  - specs/004-ui-tier-a-tool-display/spec.md
  - specs/006-ui-japanese-ime-composer/spec.md
---

# Domain Charter: ui

## Mission

`ui` domain は、**Claude Code が emit する情報のすべてに専用表示を与え、
日本語環境で破綻しない操作体験を提供する**ことを担う。

本プロダクトの軸 1 であり、**機能の付随物ではなく採否を決める要素**である。
貧弱な UI、既製感のある UI、日本語が崩れる UI は、機能が揃っていても使われない。

### UI は domain ではないのでは、という問いについて

UI は本来 delivery mechanism であり domain ではない。それでも独立させるのは、
「emit される情報のうち専用表示を持たないものをゼロにする」という**測定可能な達成目標**が
あるためである。各 domain に表示責務を散らすと Principle XII の持ち主がいなくなり、
軸 1 が検証不能になる。

## Scope

### In scope

- assistant-ui の Elements / Tool UI の実装（Tier A 必須、Tier B は体験向上）
- transcript の表示（markdown / streaming / 仮想スクロール / スクロールアンカリング）
- tool 出力の専用表示（Terminal block / Code diff / Todo / Subagent / Agent plan / Reasoning ほか）
- composer（日本語 IME、message queue、draft restore、slash commands、mentions、attachments）
- `docs/ui-coverage.md`（SDK のメッセージ型・tool 名・システムイベントと表示実装の対応表）の維持
- 情報密度の切替（compact / comfortable）— **transcript の密度** (O-2)。稼働中セッション一覧 (監視ビュー) の行の密度は
  session の操作 UI として O-1 が持つ (下の Out of scope「他 domain の操作 UI」。O-1 USER 決定 2026-10-02)
- Thread 検索、conversation map、observability 系の表示
- Electron 特有の配線（preload / IPC 越しのストリーミングブリッジ）
  — **基盤そのものではない。** renderer の配信プロトコル・CSP 基線・
  Constitution 検証項目 10 は **R-1 が `app` レイヤで固定した**。
  本 domain の feature がこれを超える指定を要する場合は、
  **nonce / hash で `unsafe-inline` を用いずに満たすか、緩和を ADR で記録する**
  （[AD-025](../../decisions/0025-workspace-folder-carries-location.md) §7。
  `unsafe-inline` は開発ビルドの `script-src` / `style-src` に限り許され、
  `unsafe-eval` は両環境で禁止。ゲートは `app.isPackaged` である）
- PTY フォールバックタブ（optional scope）

### Out of scope

- セッションの起動ロジックと状態遷移 → `session` domain
  （本 domain は `session` が持つ状態を**表示する**）
- Provider の登録ロジックと到達可能性判定 → `provider` domain
- 隔離状態の**判定** → `isolation` domain（本 domain はそれを**表示する**）
- Voice 系 element（Voice conversation / Read aloud / Orb）→ **非目標**
- Generative 22 要素、Image generation、Map answer、Mobile composer → **Tier C、対象外**
- **他 domain の操作 UI（一覧・登録・選択画面）** → 各 domain が持つ。
  本 domain は **transcript / tool 表示の element 選定と見た目**を持つ。
  こう分けるのは [Principle XII](../../../.specify/memory/constitution.md)（`docs/ui-coverage.md` の
  未割当行がある間 UI 系 feature を完了にしない）の**持ち主を明確にする**ためである。
  対応表が対象とするのは SDK のメッセージ型・tool 名・システムイベントであり、
  ランタイム一覧やフォルダ登録画面はそこに現れない。
  これらを本 domain の担当にすると、**対応表に載らない画面が Principle XII の判定対象に
  なってしまい、判定が不能になる**（R-1 の画面は `runtime` domain が持つ）

## Actors / Personas

- **エンドユーザ（開発者）**: CLI の TUI では tool 実行内容が読みにくい。
  ANSI エスケープの流れを目で追うのをやめたい。日本語で普通に入力したい
- **監視者としての同一ユーザ**: 10 セッション並列を俯瞰したいときと、
  1 セッションに没入したいときで必要な情報密度が違う

## User Journey

### Journey 1: 過去セッションを読む

1. ユーザがセッションを選ぶ
2. transcript が表示される。markdown は整形され、コードはハイライトされる
3. tool 実行は種類ごとの専用表示で現れる（Bash は行単位ストリーム + exit status、
   Edit は hunk 単位の diff、TodoWrite はチェックリスト）
4. 数千メッセージでもスクロールが破綻しない

### Journey 2: 実行中セッションを見て応答する

1. ストリーミング中もスクロール位置が奪われない
2. permission 要求が承認カードとして現れる。単発承認と capability 付与が区別される
3. 実行中に次の入力を積める（message queue）
4. 中断しても途中出力が残り、再開できる

### Journey 3: 日本語で入力する

1. ユーザが日本語を入力し、変換候補を確定するために Enter を押す
2. **送信されない**。変換が確定するだけ
3. もう一度 Enter で送信される
4. 全角混在でもレイアウトが崩れない

### Journey 4: 密度を切り替える

1. 監視ビューでは各セッションが compact に並ぶ
2. 1 つを開くと comfortable な没入ビューになる

O-1 で読み替えた: 監視ビューはセッション画面のサイドバー (session の操作 UI) で、行の密度 (compact / comfortable) は
利用者が切り替える。没入ビューは表示中セッションのペイン。transcript 側の密度の切替は本 domain の O-2 が扱う
([010 spec](../../../specs/010-session-monitoring-view/spec.md))

## Key concepts

- **Element**: assistant-ui が提供する UI 部品。202 種（2026-09-13 確認、[AD-019](../../decisions/0019-assistant-ui-element-inventory.md)）
- **Tier A / B / C**: Element の実装優先度。A は Claude Code の一次概念に直結する必須、
  B は体験を押し上げるもの、C は対象外
- **ui-coverage 対応表**: `docs/ui-coverage.md`。emit される情報と表示実装の対応
- **承認カード (Approval card)**: `canUseTool` の応答 UI。本アプリの心臓部

詳細は [docs/glossary.md](../../glossary.md) を参照。

## 業務ルール / 不変条件

- **assistant-ui の design system に乗る。** 独自のカラートークン・スペーシングスケールを
  増やさない。同等の element が存在する UI を自作しない（Principle XIII）
- **emit される情報に未表示のものを残さない。** 対応表に未割当がある間、
  UI 系 feature を `completed` にしない（Principle XII）
- **日本語で破綻しない。** IME 変換確定時の誤送信、フォント崩れ、
  全角混在時のレイアウト崩れを許容しない（Principle VIII）
- **長大スレッドは仮想化する。** スクロールアンカリングを壊さない
- **隔離状態は一目で分かること。** セッションカード・タブ・ヘッダに隔離バッジを表示する

## KPI / Success metrics

- **表示網羅**: `docs/ui-coverage.md` の未割当行が 0 — 計測経路: ui-coverage-reviewer による機械検証
- **日本語の健全性**: composer の IME テストが E2E に存在し通過、
  日本語を含むスクリーンショット比較が CI に存在する — 計測経路: Playwright + CI
- **スクロールの安定**: 数千メッセージの transcript でストリーミング中にスクロール位置が奪われない —
  計測経路: E2E。**E2E 自体は延期中 (AD-024 #18。持ち主は roadmap の「E2E / 検証基盤 feature」)。
  R-3 は暫定代替として Vitest (同時マウント DOM ノード数が総件数に依存しない / スクロール位置飛び 0) +
  quickstart 実機 (V-5) で担保する** (R-3 / [AD-033](../../decisions/0033-assistant-ui-elements-introduction-cost.md))
- **自作率**: 自作コンポーネントのうち「対応する element が存在しない」と PR で説明されたものの割合が 100% — 計測経路: convention-reviewer / ux-reviewer

## Cross-domain dependencies

- 依存する domain: `runtime`, `session`, `provider`, `isolation`（表示対象がすべてにまたがる）
- 依存される domain: なし（最上層）
- 共有 invariant: Principle III（選べない選択肢を出さない）/ VIII / XII / XIII。
  詳細は [docs/domains/_overview.md](../_overview.md)

## Related ADRs

- [AD-001](../../decisions/0001-adopt-electron-over-tauri.md) — Electron を採用する（本 domain の検証コストが決め手）
- [AD-006](../../decisions/0006-supervisor-in-utility-process.md) — supervisor 分離（描画をブロックしないため）
- [AD-037](../../decisions/0037-japanese-ime-composer-behavior.md) — 日本語 IME の composer 挙動（SPIKE-4）。二重ガードで自前ガード不要 / 実行中積み・下書きは runtime capability / Principle VIII Automated の持ち主は X-2
- [AD-038](../../decisions/0038-e2e-screenshot-harness.md) — E2E / スクリーンショット検証ハーネス（Playwright + Electron。credential-free・フォント同梱・e2e を src グラフ外に分離）

## Related Specs

- [R-3: transcript の基本表示](../../../specs/003-ui-transcript-rendering/spec.md) — **完了** (#3)。
  本 domain 初の feature。markdown 本文 / streaming text / scroll anchor / 未定義 tool の fallback /
  数千メッセージの仮想化を実装し、**この時点で見栄えの一次判断を行う** (下記 Principle「見た目の判断を先送りしない」)。
  取得経路とプロセス境界は [AD-034](../../decisions/0034-transcript-read-path-and-process-boundary.md)
- [R-4: Tier A tool 表示](../../../specs/004-ui-tier-a-tool-display/spec.md) — **完了** (#4)。
  R-3 の fallback を 7 種の専用表示に置き換える (Bash→Terminal / Edit・Write→Code diff / TodoWrite→Todo /
  Task→Subagent 入れ子 / ExitPlanMode→Agent plan、Reasoning・Tool group は R-3 済)。element 選定と subagent 入れ子の
  DTO 表現は [AD-035](../../decisions/0035-tier-a-tool-display-and-subagent-nesting.md)。**M1 最終 feature**。
  **見栄えの正式な方針確定は SC-010 rubric の実機記入 + R-3 一次判断とあわせた別ステップ** (roadmap の tracked debt)
- [X-2: 日本語 composer](../../../specs/006-ui-japanese-ime-composer/spec.md) — **実装中**。
  Journey 3 (IME 確定 Enter 非送信 / 全角レイアウト) と Journey 2 step 3 (message queue) を実装し、
  Principle VIII Automated 2 項目 (IME E2E / 日本語スクリーンショット比較) を CI に常設する。
  自前 IME ガードは新設せず assistant-ui の二重ガードを殺さない ([AD-037](../../decisions/0037-japanese-ime-composer-behavior.md) D1)。
  E2E / スクリーンショット検証ハーネスは [AD-038](../../decisions/0038-e2e-screenshot-harness.md)
- （残り。O-2 / O-3 / OPT-pty が本 domain に属する）

## Open Questions

- [x] ~~element の実在確認~~ → [AD-019](../../decisions/0019-assistant-ui-element-inventory.md)。
      §4.2 / §4.3 が名指しする 35 element はすべて実在。Tier A の選定を変える理由はない
- [ ] **Tier B / C の再棚卸し（未分類 59 要素）** — O-2 のスコープ
- [ ] **§4.2 の Tier A 表は暫定** — [AD-020](../../decisions/0020-sdk-emitted-message-inventory.md)。
      SDK が emit するのは 39 型で、Hook / Background task / コンパクション / 自動拒否が
      §4.2 に無い。O-2 で SDK 型から引き直す
- [ ] **Hook / Background task の表示の割当と、状態の保持が要る場合の持ち主 domain** — O-2 が判断する。
      session は状態管理を責務に含めないと決めた (O-1 USER 決定 2026-10-02。session charter の Open Questions)。
      本 domain の Out of scope「状態遷移 → session」とあわせ、保持が要ると分かったら domain の帰属を人間に諮る
- [ ] SPIKE-2: assistant-ui Elements の導入コスト実測。element のインストール単位、
      カスタマイズ範囲、design system の拘束度、Claude Code の tool_result 形式との変換コスト。
      **結果次第では本 charter の Scope を見直す**
- [x] ~~SPIKE-4: assistant-ui の composer が `isComposing` を正しく扱うか~~ →
      [AD-037](../../decisions/0037-japanese-ime-composer-behavior.md)。`ComposerPrimitive.Input` が変換確定 Enter を
      二重ガード (keydown の `nativeEvent.isComposing` + `compositionRef`) で扱う。**自前ガードは不要**。
      実行中積み・下書き復元は IME でなく runtime capability / composer state として X-2 が持つ (D2)
- [ ] Tier C のうち Data table / Chart / Timeline / Diagram は、将来 MCP ツールの
      結果表示に転用しうる。いつ判断するか

## Principles (domain-specific)

### Principle: 見た目の判断を先送りしない

**Statement**: UI の方向性に関わる判断は、実装が積み上がってからではなく、
最小の表示が出た時点で行う。

**Why**: 軸 1 が製品の採否を決める以上、方向性が誤っていた場合の手戻りは大きい。
M1 を 4 feature に抑え、R-3（transcript の基本表示）の時点で一次判断ができる構成にしてある。
M1 の結果次第では本 charter と PLAN.md §4 の方針そのものを見直す。
