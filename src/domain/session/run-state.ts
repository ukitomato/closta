/**
 * 1 セッションの状態機械 (X-1 / data-model §4)。**純粋関数。I/O を持たない。**
 *
 * `SessionRunState` は 7 状態。`launching` は launch invoke〜最初のプロンプト後の初 stream の窓を表す。
 *
 * `nextState(state, action)` の入力 `action` は **control action と agents 由来イベントの
 * 判別 union** であり、描画用の `SessionEvent` (agent-session.ts §SessionEvent) とは**別型**である
 * (design-gate R3 N7。混同しない)。遷移は純粋関数で定義しテストする。
 *
 * **`done` は「応答完了・次のプロンプト待ち」と「強制終了後」の両方を表す。** `claude` が終わったかどうかは
 * run-state では判定しない — 状態通知の生存フラグ (`claudeAlive`。status-update.ts) で判定する (X-5 / FR-005)。
 * X-1 の単一セッション不変 (`isActive`) は X-5 で廃止し、同時実行数の上限 (concurrency.ts) に置き換えた (AD-043)。
 */

export type SessionRunState =
  'idle' | 'launching' | 'running' | 'awaiting_permission' | 'interrupted' | 'error' | 'done'

export const SESSION_RUN_STATES = [
  'idle',
  'launching',
  'running',
  'awaiting_permission',
  'interrupted',
  'error',
  'done'
] as const satisfies readonly SessionRunState[]

export function isSessionRunState(value: unknown): value is SessionRunState {
  return typeof value === 'string' && (SESSION_RUN_STATES as readonly string[]).includes(value)
}

/**
 * 終端状態 (nextState の遷移閉包に使う。error/done から先へは kill で進めない。fail は done からも error へ進む — X-5)。
 *
 * **枠 (同時実行数の上限) の解放には使わない** — 枠は `claudeAlive` で数える (X-5 / FR-005)。
 * 状態通知の畳み込み (`coalesceUpdates`) でも `done` を終端として扱わない (後続の `running` で上書きしてよい)。
 */
export const TERMINAL_STATES = ['error', 'done'] as const satisfies readonly SessionRunState[]

/**
 * 状態機械への入力。`SessionEvent` (renderer へ流す描画データ) とは別で、
 * control action (利用者操作) と agents 由来のライフサイクルイベントを判別する。
 */
export type SessionAction =
  /** launch 検証を通過し spawn を発行した (idle → launching)。 */
  | { readonly kind: 'launch' }
  /** agents: 最初の stream/ready を受けた (launching → running)。 */
  | { readonly kind: 'ready' }
  /** 利用者がプロンプトを送った。running/awaiting_permission では queue に積み状態は変わらない。 */
  | { readonly kind: 'send-prompt' }
  /** agents: canUseTool が発火した (running → awaiting_permission)。 */
  | { readonly kind: 'permission-request' }
  /** 利用者が許可/拒否を返した (awaiting_permission → running)。 */
  | { readonly kind: 'permission-respond' }
  /** agents: 応答が完了した (running → done)。 */
  | { readonly kind: 'complete' }
  /** 利用者が中断した (running → interrupted)。 */
  | { readonly kind: 'interrupt' }
  /** 利用者が強制終了した、または穏当な終了 (`end`) を要求した (非終端 → done)。`end` に専用の action は持たない。 */
  | { readonly kind: 'kill' }
  /** agents: crash / stream・protocol 異常 / provider-error 等 (非終端 → error)。 */
  | { readonly kind: 'fail' }

export function isTerminal(state: SessionRunState): boolean {
  return (TERMINAL_STATES as readonly SessionRunState[]).includes(state)
}

/**
 * 穏当な終了 (`end`) を受け付ける状態 (X-5 / FR-011)。応答待ち (`done`)・中断済み (`interrupted`) と、
 * **最初のプロンプトを待っている `launching`** (プロンプトを 1 度も送っていない) だけ (pr-gate R1 po H-001)。
 * claude は最初のプロンプトまで会話の履歴を書かないので、止めても壊れるものが無い (入力を閉じても自分からは終わらないため、
 * セッションスレッドは期限を待たずに子を止め、破損の警告は出さない)。送信済みの `launching` は応答中と同じく終了を受けない。
 *
 * セッションスレッド・renderer の操作の出し分け・E2E の fake が同じ規則を使う (pr-gate R2 architecture L-104)。
 */
export function canEnd(state: SessionRunState, promptSent: boolean): boolean {
  return state === 'done' || state === 'interrupted' || (state === 'launching' && !promptSent)
}

/**
 * 状態遷移 (data-model §4 の図)。**未定義の (state, action) は現状維持**を返す
 * (不正遷移で例外を投げない。FR-020 の「例外で落とさない」と整合)。
 */
export function nextState(state: SessionRunState, action: SessionAction): SessionRunState {
  // 強制終了は非終端のどの状態からでも受ける。
  if (action.kind === 'kill') return isTerminal(state) ? state : 'done'
  /*
   * 失敗は `error` 以外のどの状態からでも受ける (X-5 / FR-012)。`done` は「応答待ち (claude 生存)」も表すため、
   * 応答待ちの間に子が異常終了したら `error` にする — `done` のままだと失敗が「終了済み」に見える (SH-022 の実機)。
   * 強制終了・終了の後の `done` に `fail` が来る経路は、セッションスレッドが `closing` で塞いでいる。
   */
  if (action.kind === 'fail') return state === 'error' ? state : 'error'

  switch (state) {
    case 'idle':
      return action.kind === 'launch' ? 'launching' : 'idle'
    case 'launching':
      return action.kind === 'ready' ? 'running' : 'launching'
    case 'running':
      switch (action.kind) {
        case 'permission-request':
          return 'awaiting_permission'
        case 'interrupt':
          return 'interrupted'
        case 'complete':
          return 'done'
        // send-prompt は queue に積むだけで状態は変わらない (M-003)。
        case 'send-prompt':
          return 'running'
        default:
          return 'running'
      }
    case 'awaiting_permission':
      switch (action.kind) {
        case 'permission-respond':
          return 'running'
        // 承認待ち中の送信も queue に積む (design-gate R3 C-004)。
        case 'send-prompt':
          return 'awaiting_permission'
        default:
          return 'awaiting_permission'
      }
    case 'interrupted':
      // 中断後は同一セッションで継続できる (FR-015)。
      return action.kind === 'send-prompt' ? 'running' : 'interrupted'
    case 'done':
      // 応答完了後に続けて送ると新しいターンとして running へ。
      return action.kind === 'send-prompt' ? 'running' : 'done'
    case 'error':
      // 終端。続けたいときは新しいセッションを起動する。
      return 'error'
    default:
      return state
  }
}
