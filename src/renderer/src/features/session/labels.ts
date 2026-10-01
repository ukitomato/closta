import type { LaunchFailureReason, SessionLaunchRejectReason } from '@domain/session/agent-session'
import { MAX_PRESETS, type SafePermissionMode } from '@domain/session/launch-config'
import type { AxisResetReason, LaunchBlocker } from '@domain/session/launch-resolution'
import type { SavePresetResult } from '@domain/session/preset'
import type { SessionRunState } from '@domain/session/run-state'

/**
 * X-1 セッション起動 + ストリーミングの日本語ラベル (FE-030 / FR-020 / Principle XV)。
 *
 * **理由キーは `session`/`infra` が保持し、訳出は `ui`** (Principle XV。R-2 と同じ分担)。
 * `LaunchFailureReason` (9 種) + 調停由来 (`session-active` / `unknown-target`) + X-4 の起動前段
 * (`invalid-config` / `provider-unavailable` / `needs-confirmation`) の計 14 種を網羅する。
 */

const LAUNCH_REJECT_LABELS: Record<SessionLaunchRejectReason, string> = {
  'distro-not-running': '所在 (WSL ディストロ) が停止しています。起動してから再度お試しください。',
  'not-verified-running':
    '所在の実行中確認が取れませんでした。ランタイムを再検出してから起動してください。',
  'distro-mismatch':
    '作業フォルダの所在と選んだランタイムのディストロが一致しません。組み合わせを見直してください。',
  'claude-not-found':
    'ディストロ内に claude が見つかりませんでした。WSL 内に Claude Code を導入してください。',
  'launch-failed': '起動に失敗しました。もう一度お試しください。',
  'process-crashed': 'セッションのプロセスが異常終了しました。',
  'stream-protocol-error': '応答ストリームが壊れました。セッションを開き直してください。',
  'provider-error':
    'Provider の認証/接続でエラーが発生しました。ログイン状態やクレジットを確認してください。',
  'interrupt-unavailable': 'このセッションは中断に対応していないため強制終了に切り替えました。',
  // 稼働中に加え、reset 直後の kill 完了前 (競合窓) にも出る。「停止してから起動」だと直前に停止した利用者に
  // 矛盾して映るため、停止処理中も含めて「少し待って再試行」に寄せる (pr-gate po M-001)。
  'session-active':
    '別のセッションが稼働中、または停止処理中です。少し待ってから再度お試しください。',
  'unknown-target': '選んだ作業フォルダまたはランタイムが見つかりませんでした。',
  // X-4 の起動前段 (spec US-1 AC7)。値 (パス・モデル ID) は含めない。
  'invalid-config':
    '起動設定が現在の状態と合いません (カタログに無いモデル・非対応の effort・組み合わせの不一致など)。設定を見直してください。',
  'provider-unavailable':
    '選んだ Provider はこのランタイムから使えません (到達できない・設定を解決できない)。別の Provider を選んでください。',
  'needs-confirmation':
    '選んだ Provider が使えなくなっていたため起動を止めました。Provider を選び直すか、既定 Provider での起動を確認してください。'
}

export function launchRejectLabel(reason: SessionLaunchRejectReason): string {
  return LAUNCH_REJECT_LABELS[reason]
}

export function launchFailureLabel(reason: LaunchFailureReason): string {
  return LAUNCH_REJECT_LABELS[reason]
}

/** `provider-error` だけ「再ログイン」導線を出す (FR-030)。他は再起動導線。 */
export function isReloginFailure(reason: LaunchFailureReason | null): boolean {
  return reason === 'provider-error'
}

const RUN_STATE_LABELS: Record<SessionRunState, string> = {
  idle: '待機中',
  // claude は最初のプロンプトを受け取るまで会話を始めない。起動直後はこの状態で入力を待つ (X-4 quickstart)。
  launching: '準備完了 — プロンプトを送ると始まります',
  running: '応答中…',
  awaiting_permission: '承認待ち',
  interrupted: '中断しました',
  error: 'エラー',
  done: '完了'
}

export function runStateLabel(state: SessionRunState): string {
  return RUN_STATE_LABELS[state]
}

/* ── 起動設定ダイアログ (X-4 FE-004 / Principle XV) ─────────────────── */

export const PERMISSION_MODE_LABELS: Record<SafePermissionMode, string> = {
  default: '通常 (操作ごとに承認)',
  plan: '計画のみ (実行しない)',
  dontAsk: '事前承認のみ (承認カードを出さない)'
}

/** 権限モードの意味の説明 (`dontAsk` は承認カードが出ず、事前承認の無い操作は拒否される。plan R-03)。 */
export const PERMISSION_MODE_DESCRIPTIONS: Record<SafePermissionMode, string> = {
  default: 'ファイル編集やコマンド実行のたびに承認カードで確認します。',
  plan: '変更を加えずに計画だけを立てます。',
  dontAsk:
    '承認カードは出ません。事前に許可した操作だけが実行され、それ以外は自動的に拒否されて理由が表示されます。'
}

/** 起動設定ダイアログの軸ラベル (select の見出しと aria-label を兼ねる。FE-004)。 */
export const LAUNCH_AXIS_LABELS = {
  folder: '作業フォルダ',
  runtime: 'ランタイム (WSL)',
  provider: 'Provider',
  model: 'モデル',
  effort: 'effort',
  permissionMode: '権限モード'
} as const

/** 空状態と次の一手 (FE-004 / spec Edge Cases)。 */
export const LAUNCH_EMPTY_STATE_LABELS = {
  noFolders: '作業フォルダが登録されていません。「作業フォルダ」画面で登録してください。',
  noWslRuntimes: 'WSL ランタイムが見つかりません。「ランタイム」画面で再検出してください。',
  allRuntimesStopped:
    'WSL ランタイムがすべて停止しています。WSL ディストロを起動してから「再評価」を押してください (アプリはディストロを起動しません)。',
  noProviders: '既定 Provider で起動できます。Provider の登録はプロバイダ画面から行えます。',
  /** 一覧の読み込み中・失敗は空状態と分ける (読み込み中に「登録してください」と案内しない。po M-102)。 */
  foldersLoading: '作業フォルダを読み込んでいます…',
  foldersLoadFailed: '作業フォルダを読み込めませんでした。',
  runtimesLoading: 'ランタイムを読み込んでいます…',
  runtimesLoadFailed: 'ランタイムを読み込めませんでした。',
  retry: '再試行',
  presetsLoading: 'プリセットを読み込んでいます…',
  presetsLoadFailed: 'プリセットを読み込めませんでした。',
  noPresets:
    '保存したプリセットはまだありません。軸を選んで名前を付けて保存すると、次回から選ぶだけで起動設定を復元できます。',
  presetSaveUnavailable: '作業フォルダとランタイムを選ぶと保存できます。'
} as const

export const AXIS_RESET_LABELS: Record<AxisResetReason, string> = {
  'provider-removed': '選んでいた Provider が削除されていたため、既定に戻しました。',
  'provider-unreachable':
    'このランタイムからは選んでいた Provider に到達できないため、既定に戻しました。',
  'model-not-in-catalog': 'Provider のモデルカタログに無いモデルだったため、既定に戻しました。',
  'effort-unsupported': 'このモデルが対応しない effort だったため、既定に戻しました。'
}

/**
 * 到達可能性の取得に失敗したときの Provider の reset 通知 (po M-101)。domain の `AxisResetReason` は
 * `provider-unreachable` のままで、表示側が `reachable.status === 'failed'` を見て差し替える
 * (確認できていないことを「到達できない」と断定しない)。
 * 同時に出る status 行 (`REACHABILITY_STATUS_LABELS.failed`) は選択肢の話、こちらは**選んでいた Provider が
 * 既定に置き換わった**ことの話であり、内容を重ねない (po L-204)。
 */
export const PROVIDER_RESET_UNVERIFIED_LABEL =
  '選んでいた Provider に到達できるかを確認できなかったため、いまは既定 Provider になっています (再試行で戻せます)。'

/** 「再評価」ボタンの状態と失敗 (po M-102。再評価の失敗を黙らない)。 */
export const REEVALUATE_LABELS = {
  idle: '再評価',
  running: '再評価中…',
  failed: 'ランタイムの再評価に失敗しました。もう一度お試しください。'
} as const

/** blocker の理由と次の一手 (spec Edge Cases / L-103)。 */
export const LAUNCH_BLOCKER_LABELS: Record<LaunchBlocker, string> = {
  'folder-unselected': '作業フォルダを選んでください。',
  'folder-missing':
    '選んでいた作業フォルダは登録が解除されています。作業フォルダを選び直してください。',
  'runtime-unselected': 'ランタイムを選んでください。',
  'runtime-missing': '選んでいたランタイムが見つかりません。ランタイムを選び直してください。',
  'runtime-stopped':
    'ランタイムが停止しています。WSL ディストロを起動してから「再評価」を押してください (アプリはディストロを起動しません)。',
  'distro-mismatch':
    '作業フォルダの所在とランタイムのディストロが一致しません。同じディストロのランタイムを選んでください。'
}

/** 選択肢から除外した Provider の理由 (X-3 `listReachableProviders` の reason。FR-002)。 */
export const REACHABILITY_EXCLUDED_LABELS: Record<'unreachable' | 'blocked', string> = {
  unreachable: 'このランタイムからは到達できません',
  blocked: 'ランタイムの準備待ち (停止中・パス変換の取得前など)'
}

/**
 * 到達可能性の取得状態 (pr-gate H-004)。取得中・失敗の間は Provider の選択肢を「既定」だけにする
 * (fail-open にしない。SC-001)。
 */
export const REACHABILITY_STATUS_LABELS = {
  loading: 'このランタイムから使える Provider を確認しています…',
  failed:
    'このランタイムから使える Provider を確認できませんでした。確認できるまで既定 Provider だけを選べます。',
  retry: '再試行'
} as const

/**
 * 越境の警告 (FR-008 / AD-016)。判定は既存の解決結果 DTO の `boundary` だけで行う (pr-gate C-001)。
 * `unknown` は**解決結果の取得 (IPC) に失敗したときだけ**出す (越境かどうかを示せないことを黙らない)。
 * DTO の `reachability === 'blocked'` は `boundary: 'unknown'` を持つが「判定できない」ではないので
 * この注記を出さない (`FOLDER_RUNTIME_BLOCKED_LABELS`。R3 po M-201)。
 * `checking` は取得中 (起動を保留する)。`unreachable` は DTO の `reachability === 'unreachable'`
 * (別ディストロの所在・パスを変換できない) で、起動しても失敗するため起動を止める (architecture M-001)。
 * main の resolveCwd が null になるのは `unreachable` だけではない — `blocked` (PathMapping 未取得) の
 * Windows フォルダも null になる (R3 platform-boundary L-502)。
 */
export const CROSS_BOUNDARY_LABELS = {
  lead: '作業フォルダとランタイムがファイルシステムの境界をまたいでいます。',
  fallbackImpact: 'ファイル操作が遅くなることがあります。',
  launchable: '起動はできます。',
  unknown:
    '作業フォルダとランタイムの組み合わせを判定できませんでした。ファイルシステムの境界をまたぐ場合はファイル操作が遅くなることがあります。起動はできます。',
  checking: '作業フォルダとランタイムの組み合わせを確認しています…',
  unreachable:
    '選んだランタイムからはこの作業フォルダに到達できません (別のディストロの所在、またはパスを変換できません)。組み合わせを見直してください。'
} as const

/**
 * 解決結果 DTO が `blocked` のときの行 (R3 po M-201 / architecture L-002 / platform-boundary L-502)。
 * `blockedReason` で分ける:
 * - `capabilities-not-probed`: probe の完了を待つ (起動を保留。probe 完了または再評価で DTO を取り直すと
 *   解ける。probe が始まらないこともあるため再評価の導線も出す。R4 platform-boundary L-601)
 * - `probe-failed`: 起動不可。再評価 (再検出) の導線を出す
 * - `distro-not-running`: 行を出さない (runtime-stopped の blocker が次の一手を示す)
 */
export const FOLDER_RUNTIME_BLOCKED_LABELS = {
  waitingProbe: 'ランタイムの準備 (パス変換の取得) を待っています…',
  probeFailed:
    'ランタイムの能力確認に失敗しました。再評価してください。繰り返し失敗する場合はランタイム画面で状態を確認してください。'
} as const

/** 前回のセッションが失敗して起動設定ダイアログに戻ったときの理由 (US-1 AC7 / pr-gate M-07)。 */
export function previousFailureLabel(reason: LaunchFailureReason): string {
  return `前回のセッションは失敗しました。${launchFailureLabel(reason)}`
}

/** Provider が既定に戻った状態で起動するときの確認文言 (US-2 AC3)。 */
export const PROVIDER_RESET_CONFIRMATION =
  '選んでいた Provider が使えないため、既定 Provider で起動します。既定 Provider ではディストロ内の claude の既定の資格情報と課金先が使われます。よろしいですか？'

/**
 * 到達可能性の取得に失敗した状態で起動するときの確認文言 (po M-101)。使えないと断定せず、
 * 先に「再試行」できることを示す (確認ダイアログの中に再試行を置く)。
 */
export const PROVIDER_RESET_CONFIRMATION_UNVERIFIED =
  '選んでいた Provider に到達できるかを確認できなかったため、このまま起動すると既定 Provider で起動します。既定 Provider ではディストロ内の claude の既定の資格情報と課金先が使われます。先に「再試行」で確認し直すこともできます。'

export const PRESET_SAVE_FAILURE_LABELS: Record<
  Extract<SavePresetResult, { ok: false }>['reason'],
  string
> = {
  'invalid-preset': 'プリセットを保存できませんでした。名前と設定を見直してください。',
  'name-conflict': '同じ名前のプリセットがあります。',
  'limit-reached': `プリセットは ${MAX_PRESETS} 件まで保存できます。不要なプリセットを削除してください。`,
  'store-newer-version':
    'プリセットの保存ファイルが新しい版のため変更できません (ファイルは退避済みです)。',
  'store-read-failed':
    'プリセットの保存ファイルを読み込めなかったため、上書きを止めました。しばらくしてから再度お試しください。'
}

/** プリセットの保存成功の通知と上書き確認 (plan.md:61)。上書き確認は `name-conflict` の文言から組み立てる。 */
export const PRESET_NOTICE_LABELS = {
  saved: 'プリセットを保存しました。',
  overwriteConfirm: `${PRESET_SAVE_FAILURE_LABELS['name-conflict']}上書きしますか？`,
  /** 保存で例外が起きたとき (理由キーが無い。ディスク満杯・権限など。pr-gate M-08)。 */
  saveFailed: '保存できませんでした。',
  /** 削除の確認 (上書き確認と同じ形。po L-001)。 */
  removeConfirm: 'このプリセットを削除しますか？元に戻せません。',
  removed: 'プリセットを削除しました。',
  /**
   * 削除の失敗 (`{ok:false}` は理由キーを持たない。例外も同じ文言。pr-gate M-08)。`{ok:false}` は
   * 未知 id (既に無い) と保存ファイルの不調の両方から来るので、原因を断定しない (po L-102)。
   * usePresets は結果に関わらず一覧を取り直す。
   */
  removeFailed: 'プリセットを削除できませんでした。一覧を読み込み直しました。'
} as const

/** 削除確認の見出しとボタン (po L-001)。 */
export const PRESET_REMOVE_CONFIRM_LABELS = {
  dialog: '削除の確認',
  confirm: '削除する',
  cancel: 'やめる'
} as const
