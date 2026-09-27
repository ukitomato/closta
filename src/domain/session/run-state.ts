/**
 * 単一セッションの状態機械 (X-1 / data-model §4)。**純粋関数。I/O を持たない。**
 *
 * `SessionRunState` は 7 状態。`launching` は launch invoke〜初 stream/ready の窓を表し、
 * 単一セッション不変の判定に使う (FR-019 / design-gate R3 N1・R4)。
 *
 * `nextState(state, action)` の入力 `action` は **control action と agents 由来イベントの
 * 判別 union** であり、描画用の `SessionEvent` (agent-session.ts §SessionEvent) とは**別型**である
 * (design-gate R3 N7。混同しない)。遷移は純粋関数で定義しテストする。
 */

export type SessionRunState =
  'idle' | 'launching' | 'running' | 'awaiting_permission' | 'interrupted' | 'error' | 'done'

/**
 * 終端状態 (nextState の遷移閉包に使う。error/done から先へ進めない)。
 *
 * **registry (session-launch-service の `active`) の解放は run-state ではなく「worker プロセスの生存」基準である**
 * (pr-gate arch M-001)。kill 経路は worker が process.exit するため onExit→除去されるが、terminal error/done では
 * worker は exit せず、UI (reset/kill/dispose) の kill 経路が worker を落として初めて除去される。
 * したがって「この状態に達したら registry から自動除去される」わけではない (contracts C-6 / M-102 は kill 経由の回収)。
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
  /** 利用者が強制終了した (非終端 → done)。 */
  | { readonly kind: 'kill' }
  /** agents: crash / stream・protocol 異常 / provider-error 等 (非終端 → error)。 */
  | { readonly kind: 'fail' }

const NON_TERMINAL_ACTIVE: readonly SessionRunState[] = [
  'launching',
  'running',
  'awaiting_permission',
  'interrupted'
]

/** そのセッションが「稼働中」= 新規 launch を拒否すべき状態か (FR-019 単一セッション不変)。 */
export function isActive(state: SessionRunState): boolean {
  return NON_TERMINAL_ACTIVE.includes(state)
}

export function isTerminal(state: SessionRunState): boolean {
  return (TERMINAL_STATES as readonly SessionRunState[]).includes(state)
}

/**
 * 状態遷移 (data-model §4 の図)。**未定義の (state, action) は現状維持**を返す
 * (不正遷移で例外を投げない。FR-020 の「例外で落とさない」と整合)。
 */
export function nextState(state: SessionRunState, action: SessionAction): SessionRunState {
  // 強制終了と失敗は非終端のどの状態からでも受ける。
  if (action.kind === 'kill') return isTerminal(state) ? state : 'done'
  if (action.kind === 'fail') return isTerminal(state) ? state : 'error'

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
      // 終端。再 launch は registry entry 除去後の新セッションで行う (contracts C-6)。
      return 'error'
    default:
      return state
  }
}
