import type { LiveSettingKind, LiveSettingRow } from '@domain/session/live-settings'

import {
  ConversationSearchBar,
  ConversationSearchButton
} from '@/features/chat/ConversationSearchBar'
import { TranscriptDensityToggle } from '@/features/chat/TranscriptDensityToggle'
import { EditableSessionTitle, LiveSettingError } from '@/features/session/LiveSettingsControls'

import { CenterBanners } from './CenterBanners'
import { ContextCostMeter } from './ContextCostMeter'

/** 中央のヘッダに稼働中のセッションだけが渡す値 (O-4 / 014 data-model §4 の冒頭)。 */
export interface CenterHeaderLive {
  readonly sessionId: string
  /** 起動の設定のランタイム (警告の帯の隔離の文言が `autoModeStatus` を引く)。 */
  readonly runtimeId: string
  /** 起動の設定のモデル id (既定なら null)。目盛りの主モデルの照合に使う。 */
  readonly modelId: string | null
  /** 送信できない終端か (`LiveSession.terminal`)。Quota banner が待つ案内と `role` を決める (014 data-model §4)。 */
  readonly terminal: boolean
  /** 名前の変更の受け付けの判定の入力 (`liveSettingBlocker`。023 data-model §5.1)。選択は composer の周りへ移った (025)。 */
  readonly settingRow: LiveSettingRow
  /** 直前の変更の失敗 (1 行の表示。023)。 */
  readonly settingError: LiveSettingKind | null
  /** 成功したモデルの変更の値 (無ければ null で `modelId` を出す。目盛りの主モデルの照合に使う。023)。 */
  readonly currentModelId: string | null
  /** 付けた名前 (見出しの編集の初期値。無ければ null。023)。 */
  readonly name: string | null
  /** 名前の変更の操作 (成功なら `true`。023)。 */
  readonly onRename: (name: string) => Promise<boolean>
}

/**
 * **中央のヘッダ** (O-7 / FR-005 / data-model §5。AD-046 Decision 6 の置き場所の語)。稼働中と過去の会話で同じ部品を使う。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 題・補足・状態と、transcript の密度の切り替えを 1 行に並べる。長い題と補足は 1 行に切り詰める | FR-005 / Principle VIII |
 * | 値は DTO・ストアの時点で正規化済みの表示用の値を**テキストとして**描く (HTML として解釈しない) | US-1 / US-4 AC5 |
 * | 停止・閉じるは置かない。実行中の設定の変更のうち名前の変更と失敗の 1 行は置く。権限モード・モデルの選択は composer の周りに置く (025)。一覧の行に一本化する操作と同名のボタンを 2 か所に出さない | X-5 / O-1 / 023 / 025 |
 * | 後続 feature がヘッダに表示を足すときはここに足す (稼働中と過去で別々に直さない) | code-gate convention M-003 |
 * | 会話内検索のボタンを行に置き、開くとヘッダの下に検索のバーを出す (会話内検索の provider の内側でだけ描く) | O-3 / 012 spec FR-003 |
 * | 稼働中だけの表示 (行の右の目盛り、行と会話内検索のバーの間の帯) は `live` があるときだけ描く。`live` は `RunningCenter` だけが渡す (過去の会話は渡さない) | O-4 / 014 data-model §4 |
 */
export function CenterHeader({
  title,
  detail,
  status,
  titleTestId,
  live
}: {
  readonly title: string
  /** 補足 (稼働中はランタイムと起動時刻、過去はグループの表示)。空なら出さない。 */
  readonly detail: string | null
  /** 状態 (稼働中は一覧の行と同じ状態のラベル、過去は「読み取り専用」)。 */
  readonly status: string
  /** 稼働中 (`session-title`) と過去 (`past-title`) の題をテストが見分けるための id。 */
  readonly titleTestId: string
  /**
   * 稼働中のセッションの口 (O-4)。計量の目盛り・Quota banner・権限モードの警告の帯が読む。過去の会話では渡さない。
   * 帯 (権限モードの警告の帯と Quota banner) は 014 tasks FE-040 / FE-020、目盛り (コンテキストと費用) は FE-032 が足した。
   */
  readonly live?: CenterHeaderLive
}): React.JSX.Element {
  return (
    <>
      <CenterHeaderRow
        title={title}
        detail={detail}
        status={status}
        titleTestId={titleTestId}
        live={live}
      />
      {/* 実行中の設定の変更の失敗の 1 行 (023)。稼働中だけ。 */}
      {live !== undefined && <LiveSettingError settingError={live.settingError} />}
      {/* 稼働中だけの帯 (O-4 / 014 data-model §4)。ヘッダの行と会話内検索のバーの間に置く。 */}
      {live !== undefined && (
        <CenterBanners
          sessionId={live.sessionId}
          runtimeId={live.runtimeId}
          terminal={live.terminal}
        />
      )}
      {/* 会話内検索のバー (O-3 / 012 data-model §2)。閉じている間は描かない。 */}
      <ConversationSearchBar />
    </>
  )
}

function CenterHeaderRow({
  title,
  detail,
  status,
  titleTestId,
  live
}: {
  readonly title: string
  readonly detail: string | null
  readonly status: string
  readonly titleTestId: string
  readonly live: CenterHeaderLive | undefined
}): React.JSX.Element {
  return (
    <div
      className="border-border flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2"
      data-testid="center-header"
    >
      {/*
       * 1 行に切り詰めた全文は title で出す (pr-gate R1 a11y M-006)。題は中央 (`main`) の見出し — 見出しで移動する
       * 支援技術の利用者が中央に何を出しているかを読める (pr-gate R3 a11y L-001)。
       */}
      {live !== undefined ? (
        <EditableSessionTitle
          title={title}
          name={live.name}
          titleTestId={titleTestId}
          row={live.settingRow}
          onRename={live.onRename}
        />
      ) : (
        <h2
          className="min-w-0 truncate text-xs font-medium"
          title={title}
          data-testid={titleTestId}
        >
          {title}
        </h2>
      )}
      {detail !== null && detail !== '' && (
        <span className="text-muted-foreground min-w-0 truncate text-xs" title={detail}>
          {detail}
        </span>
      )}
      <span className="text-muted-foreground ms-auto shrink-0 text-xs">{status}</span>
      {/* コンテキストと費用の目盛り (O-4 / 014 data-model §4)。稼働中だけ。右のペインを畳んでいても見える。 */}
      {live !== undefined && (
        <ContextCostMeter
          sessionId={live.sessionId}
          modelId={live.currentModelId ?? live.modelId}
        />
      )}
      {/* 会話内検索を開く (O-3 / 012 spec FR-003。Ctrl+F でも開く)。 */}
      <ConversationSearchButton />
      {/* transcript の密度 (O-2 / FR-012)。監視ビューの行の密度 (一覧の見出し) とは別の位置・文言。 */}
      <TranscriptDensityToggle />
    </div>
  )
}
