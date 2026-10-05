import { TranscriptDensityToggle } from '@/features/chat/TranscriptDensityToggle'

/**
 * **中央のヘッダ** (O-7 / FR-005 / data-model §5。AD-046 Decision 6 の置き場所の語)。稼働中と過去の会話で同じ部品を使う。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 題・補足・状態と、transcript の密度の切り替えを 1 行に並べる。長い題と補足は 1 行に切り詰める | FR-005 / Principle VIII |
 * | 値は DTO・ストアの時点で正規化済みの表示用の値を**テキストとして**描く (HTML として解釈しない) | US-1 / US-4 AC5 |
 * | 操作 (停止・閉じる) は置かない。一覧の行に一本化する — 同名のボタンを 2 か所に出さない | X-5 / O-1 |
 * | 後続 feature がヘッダに表示を足すときはここに足す (稼働中と過去で別々に直さない) | code-gate convention M-003 |
 */
export function CenterHeader({
  title,
  detail,
  status,
  titleTestId
}: {
  readonly title: string
  /** 補足 (稼働中はランタイムと起動時刻、過去はグループの表示)。空なら出さない。 */
  readonly detail: string | null
  /** 状態 (稼働中は一覧の行と同じ状態のラベル、過去は「読み取り専用」)。 */
  readonly status: string
  /** 稼働中 (`session-title`) と過去 (`past-title`) の題をテストが見分けるための id。 */
  readonly titleTestId: string
}): React.JSX.Element {
  return (
    <div
      className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-2"
      data-testid="center-header"
    >
      {/* 1 行に切り詰めた全文は title で出す (pr-gate R1 a11y M-006)。 */}
      <span
        className="min-w-0 truncate text-xs font-medium"
        title={title}
        data-testid={titleTestId}
      >
        {title}
      </span>
      {detail !== null && detail !== '' && (
        <span className="text-muted-foreground min-w-0 truncate text-xs" title={detail}>
          {detail}
        </span>
      )}
      <span className="text-muted-foreground ms-auto shrink-0 text-xs">{status}</span>
      {/* transcript の密度 (O-2 / FR-012)。監視ビューの行の密度 (一覧の見出し) とは別の位置・文言。 */}
      <TranscriptDensityToggle />
    </div>
  )
}
