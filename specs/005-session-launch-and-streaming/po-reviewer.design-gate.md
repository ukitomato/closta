# Track B — po-reviewer

**Run**: 2026-09-25 · **Gate**: design · **Verdict**: Critical 1 / High 2 / Medium 3 / Low 2

## viewpoint coverage
- A 認可/認証/secret: 該当なし (security owner)
- B 入力検証/injection/CSP: 該当なし (security owner)
- C 業務不変条件/Charter drift: 該当なし (architecture owner。KPI は L-001)
- D Constitution/ADR drift: 該当なし (architecture owner)
- E User Story/SC/AC/UX: Critical 1 / High 2 / Medium 3 / Low 2
- F 命名/module/lint: 該当なし (convention owner)
- G optional reviewer 範囲: 該当なし
- H テスト/coverage/observability: Medium 2 (M-001 / M-005)

## Findings

### [Critical] C-001 — 起動 entry point (folder+runtime 選択→launch) の scope 記述が US-1 / FR-003 / C-1 と矛盾し所有者不在 (scope: feature)
- **Where**: spec.md:33-34 (位置づけ「軸=ランタイム…の選択は X-4」) / spec.md:366 (Out of Scope「ランタイムの選択 → X-4」) vs spec.md:47 (US-1「実行中の WSL ランタイムを選び」) / spec.md:203-206 (FR-003「実行中確認済み WslRuntime に対してのみ」) / contracts C-1:11 (`session.launch {folderId, runtimeId}`) / tasks.md:141-144 (FE に launch トリガ 0 件)
- **Issue**: Out of Scope と FR-003/C-1 が「ランタイム選択」の含む/含まないを逆に宣言。FE タスクに folder+runtime 選択→launch 発火の導線が 1 件も無い
- **Why**: 実装者が Out of Scope を信じれば起動導線を作らず US-1 の第一動作が開始できず MVP 不成立。逆に作れば「X-4 のはず」と手戻り
- **Action**: (1) 位置づけ/Out of Scope を書き換え、X-4 = 軸依存解決を伴う起動設定ダイアログ/プリセット、X-1 = R-1 の組み合わせ選択 UI を再利用した最小 folder+runtime 指定で launch、と切り分けを明示 (charter Journey 2: X-4=step2-3、X-1=step4)。(2) FE タスクに「R-1 組み合わせ選択 → `session.launch` 発火」の entry point 配線を追加し SC-001 に紐付け。(3) 未選択・停止中の入口ガードを US-4/BE-030 に接続

### [High] H-001 — Provider/認証/API/ネットワークの実行時失敗が FailureReason・AC・Edge Case に無い (scope: feature)
- **Where**: data-model.md:99-106 (FailureReason 7 値) / spec US-4 141-166 / Edge Cases 170-186 / quickstart.md:7 (前提「claude にログイン済み」で未ログイン系を除外)
- **Issue**: 「claude 起動成功後の Provider 認証切れ/未ログイン/クレジット不足/rate limit/API 到達不可」の理由キー・AC・Edge Case が無い。SDK 上は crash でなく `SDKResultMessage`(error) 等で返る (AD-020) ため現行タクソノミに落ちず最悪 `done` に見える
- **Why**: X-1 は初実走 feature で最頻の初回失敗が未ログイン/認証切れ。pre-launch 到達性判定 (X-3) でなく実行中に起きる。US-4「理由と次の操作」が最頻失敗で不成立
- **Action**: (1) FailureReason に `provider-error` を追加し US-4 AC と Edge Case に 1 本足す。(2) Out of Scope に責務境界明記 (pre-launch 到達性=X-3、実行中 API/認証エラーの表示と理由キー=X-1)。(3) 未ログイン起動を quickstart に追加

### [High] H-002 — SC-009 の「全角混在でレイアウトが崩れない」に本 feature 内の計測経路が無い (scope: feature)
- **Where**: spec.md:322-324 (SC-009。計測=isComposing 単体/component、full IME は X-2 へ defer)
- **Issue**: 「レイアウト崩れない」は視覚検証 (スクリーンショット比較) を要し X-2 へ defer 済み。当 feature 内で boolean-evaluable でない
- **Action**: SC-009 から「レイアウトが崩れない」を分離し X-1 は「変換確定 Enter が送信にならない」に限定 (component で測れる)。全角レイアウト視覚検証は X-2 SC に移し X-1 合否対象外に

### [Medium] M-001 — SC-005/SC-010 の「孤児プロセス 0 件」の in-scope 自動計測が弱い (scope: feature)
- **Where**: spec.md:309-310 / 326-328 (計測=kill レイヤ差し替え Vitest + quickstart)。Vitest では fake のため実孤児は生じず「kill 呼び出し発火」まで。実残存は quickstart V-8 (人間 deferred)
- **Action**: 計測経路に保証粒度を正直に明記、または spawn ハンドルのライフサイクル (spawn→保持→kill→解放) の leak assert を追加

### [Medium] M-002 — capability 付与 (`scope:'capability'`) の寿命・永続範囲が未定義 (scope: feature)
- **Where**: spec US-2 AS6 / FR-012 / data-model.md:80-91。permissionMode default 固定・体系は X-4 だが capability の適用範囲 (session 内 memory か永続か) が無い
- **Action**: data-model §5 か FR-012 に「X-1 の capability 付与は当該セッション寿命の in-memory 適用、永続化/プリセットは X-4」と明記し AC を「同一セッション内で同 tool 再問い合わせしない」等 testable に

### [Medium] M-003 — 生成中(running)のプロンプト送信/queue 挙動が未定義で US-3 AS5 と内部矛盾 (scope: feature)
- **Where**: spec US-3 AS5 (still_queued/cancelled) / data-model.md:49 (interrupt-receipt) vs data-model.md:60-71 状態機械に `running --sendPrompt--> ?` が無い / FR-018 (message queue は X-2)
- **Issue**: queue が無ければ still_queued/cancelled が常に空で AS5 空振り。running 中 composer の有効/disable が未定義
- **Action**: running 中送信の扱いを確定 (最小 in-memory queue なら状態機械に遷移追加 + AC 1 本、disable なら AS5 の由来を再整理)

### [Medium] M-004 — outbound プロンプトの空送信抑止・巨大入力の扱いが未定義 (scope: feature)
- **Where**: contracts C-1:12 (`session.sendPrompt` 検証「text は正規化」のみ)。Edge Cases は巨大 tool_result (出力) は扱うが入力側が無い
- **Action**: Edge Cases か FR-018 に outbound の最小ガード (空/空白は送信不可、上限超過の扱い) を追記し sendPrompt 検証に空チェック/長さ上限を含める

### [Medium] M-005 — 起動失敗/クラッシュの診断観測点 (log/metric) が理由キー以外に無い (scope: feature)
- **Where**: FR-020 (理由キーのみ) / SC-006c (env を出さない制約のみ) / quickstart.md:24 (起動時間ログは合否外)
- **Action**: FailureReason ごとに検知レイヤを示す最小構造化ログ (env/資格情報除外) を SC/FR 化、または plan の観測性方針に明記

### [Low] L-001 — X-1 の成功が charter KPI に紐付かない (value traceability) (scope: system)
- **Where**: charter.md:116-128 (KPI 4 項目はいずれも X-1 を直接計測しない)
- **Action**: charter KPI に「起動成功率/初描画体感時間」を追記 (計測=quickstart+開発ログ、当面合否外) するか、spec に「価値は M2 完了判定で測る」と明示。SH-005 と併せて判断

### [Low] L-002 — User Story が "As a/I want/So that" 定型でない (scope: feature)
- **Action**: 各 US 見出し直下に 1 行の定型を足すと WHY 追跡が容易 (任意)

## Verdict
Critical 1 / High 2 / Medium 3 / Low 2。C-001 を FIX_REQUIRED の主因とする。H-001 / H-002 も MVP 成立性・SC 測定性に直結。指摘は「入口(起動導線)と出口(Provider/認証失敗)」に集中。
