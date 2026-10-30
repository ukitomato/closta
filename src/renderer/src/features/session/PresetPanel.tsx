import { useState } from 'react'

import {
  normalizePresetName,
  toPresetConfig,
  type SessionLaunchConfig
} from '@domain/session/launch-config'
import type { PresetDTO } from '@domain/session/preset'

import { EmptyState } from '@/components/assistant-ui/elements/empty-state'
import { Button } from '@/components/ui/button'

import {
  LAUNCH_EMPTY_STATE_LABELS,
  LAUNCH_USAGE_LABELS,
  PRESET_NOTICE_LABELS,
  PRESET_REMOVE_CONFIRM_LABELS,
  PRESET_SAVE_FAILURE_LABELS
} from './labels'
import { useLaunchUsage } from './useLaunchUsage'
import type { PresetsView } from './usePresets'

/**
 * プリセットの一覧・保存・適用・削除 (X-4 FE-010 / FR-009〜011) と、直近 30 日の起動の内訳 (O-3 FE-041 / 012 FR-013)。
 *
 * **適用は起動しない** — 起動設定ダイアログの下書きへ戻し、依存解決 (`resolveLaunchAxes`) に通す (FR-011)。
 * 無効な軸の reset / blocker は、ダイアログが通知する。
 * **`select` を使わない** (起動設定ダイアログの軸 select の並びを E2E が前提にしている)。
 * 外部由来文字列 (名前) は React 既定エスケープで描画する。
 */
export function PresetPanel({
  view,
  current,
  onApply
}: {
  readonly view: PresetsView
  /** 保存対象の起動設定 (folder / runtime が選択済みのときだけ非 null。FR-009)。 */
  readonly current: SessionLaunchConfig | null
  readonly onApply: (preset: PresetDTO) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  /** 削除の確認中のプリセット (po L-001。上書き確認と同じ形)。 */
  const [confirmRemove, setConfirmRemove] = useState<PresetDTO | null>(null)

  const loading = view.presets === null && !view.failed
  const presets = view.presets ?? []
  const normalized = normalizePresetName(name)
  const duplicate = presets.some((p) => p.name === normalized)

  const save = async (overwrite: boolean): Promise<void> => {
    if (current === null) return
    let result
    try {
      // プリセットは名前を持たない (024 FR-010)。main の `checkPreset` は `sessionName` のキーを拒否する。
      result = await view.save(name, toPresetConfig(current), overwrite)
    } catch {
      // 理由キーの無い失敗 (ディスク満杯・権限など)。黙らない (pr-gate M-08)。
      setConfirmOverwrite(false)
      setMessage(PRESET_NOTICE_LABELS.saveFailed)
      return
    }
    if (result.ok) {
      setName('')
      setConfirmOverwrite(false)
      setMessage(PRESET_NOTICE_LABELS.saved)
      return
    }
    if (result.reason === 'name-conflict') {
      setConfirmOverwrite(true)
      setMessage(null)
      return
    }
    setMessage(PRESET_SAVE_FAILURE_LABELS[result.reason])
  }

  const remove = async (preset: PresetDTO): Promise<void> => {
    setConfirmRemove(null)
    let ok = false
    try {
      ok = await view.remove(preset.id)
    } catch {
      ok = false
    }
    setMessage(ok ? PRESET_NOTICE_LABELS.removed : PRESET_NOTICE_LABELS.removeFailed)
  }

  return (
    <section
      aria-label="プリセット"
      className="border-border flex flex-col gap-2 rounded-md border p-3"
    >
      <h3 className="text-sm font-medium">プリセット</h3>

      <LaunchUsageSummary />

      {view.failed ? (
        <p role="alert" className="text-destructive text-xs">
          {LAUNCH_EMPTY_STATE_LABELS.presetsLoadFailed}
        </p>
      ) : loading ? (
        <p className="text-muted-foreground text-xs">{LAUNCH_EMPTY_STATE_LABELS.presetsLoading}</p>
      ) : presets.length === 0 ? (
        <p className="text-muted-foreground text-xs">{LAUNCH_EMPTY_STATE_LABELS.noPresets}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm" data-testid="preset-list">
          {presets.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => onApply(p)}>
                適用
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`${p.name} を削除`}
                onClick={() => {
                  setMessage(null)
                  setConfirmRemove(p)
                }}
              >
                削除
              </Button>
            </li>
          ))}
        </ul>
      )}

      {confirmRemove !== null && (
        <div
          role="alertdialog"
          aria-label={PRESET_REMOVE_CONFIRM_LABELS.dialog}
          className="flex items-center gap-2 text-xs"
        >
          <span className="min-w-0 flex-1">
            {confirmRemove.name} — {PRESET_NOTICE_LABELS.removeConfirm}
          </span>
          <Button type="button" size="sm" onClick={() => void remove(confirmRemove)}>
            {PRESET_REMOVE_CONFIRM_LABELS.confirm}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>
            {PRESET_REMOVE_CONFIRM_LABELS.cancel}
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
          <span>名前を付けて保存</span>
          <input
            className="border-border bg-background rounded-md border px-2 py-1 text-sm"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setConfirmOverwrite(false)
            }}
            data-testid="preset-name"
          />
        </label>
        <Button
          type="button"
          size="sm"
          disabled={current === null || normalized.length === 0}
          onClick={() => void save(false)}
        >
          保存
        </Button>
      </div>
      {current === null && (
        <p className="text-muted-foreground text-xs">
          {LAUNCH_EMPTY_STATE_LABELS.presetSaveUnavailable}
        </p>
      )}

      {confirmOverwrite && duplicate && (
        <div
          role="alertdialog"
          aria-label="上書きの確認"
          className="flex items-center gap-2 text-xs"
        >
          <span className="flex-1">{PRESET_NOTICE_LABELS.overwriteConfirm}</span>
          <Button type="button" size="sm" onClick={() => void save(true)}>
            上書き
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setConfirmOverwrite(false)}
          >
            やめる
          </Button>
        </div>
      )}
      {message !== null && (
        <p role="status" className="text-muted-foreground text-xs">
          {message}
        </p>
      )}
    </section>
  )
}

/**
 * 直近 30 日のプリセット / 手動の起動の回数 (O-3 / 012 spec FR-013 / data-model §4「表示」)。欄を描いたときに 1 回読む。
 * 記録が無い・読めないは、なぜ空かと次の操作を `EmptyState` で示す (FR-008)。読み込み中も含めて live region にしない
 * (開いたときに 1 回読むだけで、ダイアログの告知の live region と重ねない)。
 */
function LaunchUsageSummary(): React.JSX.Element {
  const usage = useLaunchUsage()
  return (
    <div className="flex flex-col gap-1 text-xs" data-testid="launch-usage">
      <h4 className="text-muted-foreground font-medium">{LAUNCH_USAGE_LABELS.usageTitle}</h4>
      {usage.status === 'loading' ? (
        <p className="text-muted-foreground" data-testid="launch-usage-loading">
          {LAUNCH_USAGE_LABELS.usageLoading}
        </p>
      ) : usage.status === 'unreadable' ? (
        <EmptyState className="max-w-none items-start gap-1" data-testid="launch-usage-unreadable">
          <p>{LAUNCH_USAGE_LABELS.usageUnreadable}</p>
          <p className="text-muted-foreground">{LAUNCH_USAGE_LABELS.usageUnreadableHint}</p>
        </EmptyState>
      ) : usage.preset === 0 && usage.manual === 0 ? (
        <EmptyState className="max-w-none items-start gap-1" data-testid="launch-usage-empty">
          <p>{LAUNCH_USAGE_LABELS.usageEmpty}</p>
          <p className="text-muted-foreground">{LAUNCH_USAGE_LABELS.usageEmptyHint}</p>
        </EmptyState>
      ) : (
        <p data-testid="launch-usage-counts">
          {LAUNCH_USAGE_LABELS.usageCounts(usage.preset, usage.manual)}
        </p>
      )}
    </div>
  )
}
