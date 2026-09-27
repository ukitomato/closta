# Quickstart 実機検証 結果: 単一セッション起動とストリーミング (X-1)

実行日: 2026-09-27
実機: Windows 11 + WSL2 (Ubuntu-26.04, Running)。claude native installer
(`~/.local/bin/claude` → v2.1.283, ELF) にログイン済み。登録フォルダあり。

## サマリ

V-1 実施中に **起動〜初回ストリームを塞ぐ実機バグ 4 件**を発見・修正した。修正後 **V-1 は PASS**
(起動 → composer 表示 → プロンプト送信 → 応答が逐次描画)。V-2〜V-12 は未実施
(**V-8 / V-11 は done の hard 条件**で人手検証が要る)。

## 判定表

| # | 結果 | 記録 |
|---|---|---|
| V-1 | ✅ PASS (下記 4 修正後) | WSL ネイティブ folder (`/home/.../ags-platform`) で起動 → composer 表示 → 送信 → 逐次描画 |
| V-2 | ⏳ 未実施 | tool / thinking / 日本語・絵文字 |
| V-3 | ⏳ 未実施 | 承認カード allow/deny |
| V-4 | ⏳ 未実施 | 聞かれず拒否 |
| V-5 | ⏳ 未実施 | 中断 / 強制終了 / JSONL 観察 |
| V-6 | ⏳ 未実施 | 停止中 distro (B-1 の回帰確認も兼ねる) |
| V-7 | ⏳ 未実施 | claude 不在 distro (真に未導入時の claude-not-found) |
| V-8 | ✅ PASS (アプリ終了パス) | 稼働中セッション (electron worker 19528 → wsl.exe 3116→10212 → WSL claude 52789) の状態でアプリ完全終了 → **全て消滅・孤児なし**。deferred の dispose race は実機で未発生 (下記 V-8 詳細) |
| V-9 | ⏳ 未実施 | IME 確定 Enter が送信にならない (視覚は X-2) |
| V-10 | ⏳ 未実施 | 数 MB tool_result で固まらない |
| V-11 | ✅ 検証 (テスト。実機 logout は環境保護で非実施) | worker の result 分類 `classifyResult` (success+!is_error のみ complete、他は provider-error) + UI の再ログイン導線 (`isReloginFailure('provider-error')`) を対象テストで固定 (下記 V-11 詳細) |
| V-12 | ⏳ 未実施 | running 中送信の queue / still_queued |

## V-1 で発見・修正した実機バグ (4 件)

### B-1 実行中の distro が「停止中」判定で起動不可
- **症状**: Ubuntu-26.04 は Running なのに `distro-not-running` で起動拒否。
- **真因**: `evaluateLaunch` が R-1 のキャッシュ `runtime.state` を先に見ていた (キャッシュは古くなりうる)。
- **修正**: `src/domain/session/launch-gate.ts` — 起動時 `verifyRunning` の結果 `verified` を正とする。
  キャッシュが `stopped` でも `verified` があれば起動を許可。`verified=null` のときだけ cache state で
  `distro-not-running` / `not-verified-running` を区別。回帰テストを launch-gate.test.ts に追加。

### B-2 導入済みの claude が「見つからない」
- **症状**: `claude-not-found` (実際は `~/.local/bin/claude` 導入済)。
- **真因**: probe が**非ログイン `sh`** で `command -v claude` していた。claude はログインシェルの PATH
  (`~/.profile` の `~/.local/bin`) にしかない。**AD-015 §7 / AD-018 §4 が既に明記していた実装ドリフト**。
- **修正**: `src/main/infra/runtime/wsl-cli.ts` — probe を `sh -l` に (stdin 経由は維持)。
  bwrap/socat/userns は `/usr/bin` にあり影響なし (実測確認)。新 ADR 不要 (既存 ADR への整合)。

### B-3 起動直後に「応答ストリームが壊れました」(stream-protocol-error)
- **症状**: プロンプト送信前に stream-protocol-error。
- **真因**: worker (utilityProcess) が stripped env (**PATH なし**) で起動され、`spawn('wsl.exe')` が
  `ENOENT`。裸名 `wsl.exe` を PATH 探索できず、SDK が stream 例外に倒れていた。
- **修正**: `src/main/infra/runtime/launch-spec.ts` — wsl.exe を `%SystemRoot%\System32\wsl.exe` の
  **絶対パス**で起動 (`resolveWslCommand`)。PATH 探索を無くし ENOENT を解消、CWE-426 も回避。
  launch-spec.ts が元々書いていた「wsl.exe / claude を絶対パス相当で起動する」設計意図の履行。

### B-4 「起動中」のまま入力できずデッドロック
- **症状**: 起動後「起動中…」表示のまま入力欄が出ず、何も送れない。
- **真因**: (a) claude は**初回 user メッセージが届くまで無出力**(`system/init` すら出さない。実測) →
  runState は `launching` のまま。(b) `SessionScreen` が `messages` 空のとき **Thread (composer 内包) を
  描画せず** EmptyState だけ表示。(c) `isRunning` に `launching` を含め composer が**停止ボタン**化。
- **修正**: `src/renderer/src/features/session/SessionScreen.tsx` — 空でも常に Thread を描画
  (空案内は Thread の Welcome slot に日本語で)、`isRunning` を `running` のときのみに。

## V-8 詳細 (孤児プロセス / dispose race)

稼働中セッションの実プロセス木を特定 (`Get-CimInstance Win32_Process` + WSL `pgrep`):
`electron worker(19528) → wsl.exe(3116) → wsl.exe(10212) → WSL 内 claude(52789)`。
この状態で**アプリを完全終了** → 終了後に electron 0 / 3116・10212・19528 消滅 /
WSL 内 `~/.local/bin/claude --permission-mode default` (52789) 消滅。**孤児 0**。

→ pr-gate Round 2 で deferred にした **platform-boundary H-001 / architecture M-003 (dispose の
async kill が sync utilityProcess.kill に先を越され孫 wsl.exe が孤児化する懸念)** は、この環境
(Windows 11 + Electron utilityProcess) では**発生しない**ことを実測。段階化 (async before-quit) は不要。

## V-11 詳細 (provider-error / 再ログイン導線)

実機 `claude logout` は共有認証 (VSCode 拡張含む) を巻き込むため**非破壊のテスト検証**を採用 (ユーザ承認)。
V-11 の核となる 2 経路を対象テストで固定した:

1. **「認証失敗を黙って done にしない」** — `result` の終端分類を `sdk-agent-session.ts` のインラインから
   純関数 `classifyResult` (`src/agents/session-core.ts`, SDK 非 import) に**抽出**し、`sdk-agent-session.ts`
   が呼ぶ形にした。テスト (`session-core.test.ts`): `('success', false)` のみ `complete`、
   `is_error=true` / 非 success subtype (max_turns / error_during_execution / 未知) は全て `provider-error`。
2. **再ログイン導線** — `labels.test.ts`: `isReloginFailure('provider-error')===true` (他 reason は false)、
   `provider-error` の訳文が認証を案内し空でない、全 `LaunchFailureReason` に非空訳文がある。

→ SDK が認証/接続エラーの `result` を返せば `provider-error` に倒れ、UI は FailureBanner + 「起動し直す」を出す。
実機 logout での end-to-end 目視は環境保護のため deferred。

## 補足 (合否外)
- **Windows フォルダ (`/mnt/c/...`) 起動**は claude の「workspace not trusted」警告が出るが **benign**
  (allow entries を無視するだけで claude は完走する。実測)。ただし `/mnt/c` は DrvFs で遅い。
  WSL ネイティブ folder (`/home/...`) を推奨。UX follow-up: WSL 起動時に WSL folder を区別/優先表示するか。
- 診断: 4 件はいずれも Vitest では捕捉できない実行時 (utilityProcess env / SDK stream / assistant-ui
  レンダリング) の問題で、faithful な SDK repro (plain node) + 一時ファイル診断で切り分けた。

## follow-up 申し送り (pr-gate Round 3。done を妨げないが記録)

- **V-11 の実機 end-to-end は deferred (po M-002)**: provider-error の全結線 (SDK `result(error)` → `classifyResult`
  → `emit failure(provider-error)` → renderer FailureBanner + 再ログイン) は純関数 (classifyResult / isReloginFailure) を
  テスト固定したが、SDK import 境界を跨ぐ統合テストは無い。かつ **AD-020 前提** (認証失敗が stream 例外でなく
  `result(error)` として返る) の実機確認は共有認証保護のため未実施。前提が外れ実失敗が stream 例外に倒れると
  `stream-protocol-error` 分類になり再ログイン導線 (FR-030) が空振りする (SC-010 の「理由つき封じ込め」自体は満たす)。
  **E2E 基盤 feature で実機 `claude logout` 検証 + AD-020 前提確認を回収する。**
- **実機 quickstart P1 (V-2/V-3/V-4/V-5/V-10/V-12) は interim 基準 (po L-001)**: これらは Vitest (fake) で到達済みのため
  interim 計測基準 (Vitest 主 + fake 不到達分のみ quickstart。charter KPI / AD-028 §5) で done。US-2 (承認) / US-3 (中断) の
  **実機目視は E2E 基盤 feature で回収**。SC-001/SC-004/SC-005 の「実機 quickstart」脚は interim 運用中である旨をここに明記。
- **B-4 の自動 regression テスト (po M-003)**: composer 常時表示 + error 時無効化 (isDisabled) は SessionScreen 内の
  useExternalStoreRuntime 設定にあり、assistant-ui Thread の jsdom component テストが必要だが本 feature では未追加
  (useLiveSession.test は「component 描画は quickstart/実機に委ねる」方針)。**X-2 (IME/E2E 基盤) の component テストで
  (a) launching+空 messages で composer 描画 (b) running で停止ボタン (c) error で送信不可 (d) 空白は送信しない を固定する。**

## follow-up 申し送り (pr-gate Round 4-5。Critical/High 収束後の Medium/Low。done を妨げない)

これらは全 4 reviewer が Critical 0 / High 0 に収束したうえで残った polish。**pr-gate は Critical hard gate で PASS 済**のため done を妨げないが、後続で回収する:

- **env allowlist の一本化 (convention M-001 / platform M-501)**: `DETECTION_ENV_ALLOWLIST` (wsl-cli.ts) /
  `LAUNCH_ENV_ALLOWLIST` (launch-spec.ts) / `ENUMERATION_ENV_ALLOWLIST` (config-dir.ts, R-2) が同値の別定数で、
  照合が case-sensitive (検出/起動) と case-insensitive (列挙) に分裂。実機 `process.env` は case-insensitive proxy のため
  現実害なし。**共有 allowlist への統合 + case-insensitive 走査の統一は R-2 を含む cross-feature refactor** のため follow-up。
  最小の歯止めは 3 定数の deepEqual unit test。
- **useLiveSession の kill/failure の hook test (convention M-003 / po H-501)**: `kill()` で `killed===true` + `killSession` 発火、
  `failure` で `pending` が畳まれることを同居 test に追加 (send/interrupt/respond は test 済で kill だけ非対称)。
- **kill 中の承認カード掃除 (po M-501, pr-gate Round 5)**: `useLiveSession.kill()` が `setPending(null)` を欠くため、
  awaiting_permission 中に強制終了すると ApprovalCard が KilledNotice と競合表示になる (M-401 と同一クラスの kill 経路残余)。
  **1 行 (`kill()` に `setPending(null)`) で failure/reset と対称化できる。** recoverable (閉じる/カード押下) のため Round 5 では follow-up。
- **arch L-001 (pr-gate Round 5)**: data-model.md:71 の failure variant field 名 (`reason: FailureReason`) を実装の `reasonKey: LaunchFailureReason` に揃える。
- **arch L-002 / platform L-501-502 (pr-gate Round 5)**: 検出が infra 内で `process.env` を直読 (composition 注入パターンと consistency) /
  検出の裸名フォールバックのコメント失効 (dead branch) / `WSL_FREE_DIRECTORIES` の session-ipc.ts 重複行削除。
- **SessionScreen の killed 終端 UI (convention M-002)**: KilledNotice / killed 無効化 / 状態ラベル分岐の component test は
  上記 po M-003 と同じく X-2 の jsdom component test で回収。
- **Low tidy**: `WSL_FREE_DIRECTORIES` の session-ipc.ts 重複行削除 (platform L-502) / wsl-cli.ts の WSL_BINARY・検出
  フォールバックのコメント整合 (convention L-001 / platform L-501) / claudePath の branded 型化 (platform L-201) /
  requestId の非予測化 (security L-001, X-4/X-5) / transport.ts の platform-ok 慣行統一 (platform L-202, system/pre-existing)。
