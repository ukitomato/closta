import { useState } from 'react'

import { isValidModelEntry } from '@domain/provider/model-catalog'
import { EFFORT_LEVELS, type EffortLevel, type ModelEntry } from '@domain/provider/types'

import { Button } from '@/components/ui/button'

import { EFFORT_LABELS } from './labels'

/**
 * Provider のモデルカタログの手入力編集 (X-4 FE-003 / FR-017)。
 *
 * 項目: モデル ID / 表示名 / inference profile ID (Bedrock の pin) / 対応 effort。
 * **入力の検証は main と同じ domain 述語 (`isValidModelEntry`)** を使い、main が拒否する値を送らない
 * (write/read 対称の三者目。拒否理由は main が理由キーで返す)。外部由来文字列は React 既定エスケープで描画する。
 */
export function ModelCatalogEditor({
  models,
  onSave
}: {
  readonly models: readonly ModelEntry[]
  readonly onSave: (next: readonly ModelEntry[]) => Promise<unknown>
}): React.JSX.Element {
  const [id, setId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [profileId, setProfileId] = useState('')
  const [efforts, setEfforts] = useState<readonly EffortLevel[]>([])

  const candidate: ModelEntry = {
    id: id.trim(),
    displayName: displayName.trim(),
    ...(profileId.trim() !== '' ? { inferenceProfileId: profileId.trim() } : {}),
    ...(efforts.length > 0 ? { supportedEffortLevels: efforts } : {})
  }
  const duplicate = models.some((m) => m.id === candidate.id)
  const valid = isValidModelEntry(candidate) && !duplicate

  const add = async (): Promise<void> => {
    if (!valid) return
    await onSave([...models, candidate])
    setId('')
    setDisplayName('')
    setProfileId('')
    setEfforts([])
  }

  const toggle = (level: EffortLevel): void =>
    setEfforts((prev) =>
      prev.includes(level)
        ? prev.filter((l) => l !== level)
        : EFFORT_LEVELS.filter((l) => l === level || prev.includes(l))
    )

  return (
    <div className="mt-2 flex flex-col gap-2 text-sm" data-testid="model-catalog-editor">
      <p className="font-medium">モデルカタログ</p>
      {models.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          モデルが登録されていません。空のときは起動時のモデル・effort は「既定」のみになります。
        </p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="model-catalog-list">
          {models.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {m.displayName}{' '}
                <span className="text-muted-foreground text-xs">
                  ({m.inferenceProfileId ?? m.id})
                </span>
                {m.supportedEffortLevels !== undefined && m.supportedEffortLevels.length > 0 && (
                  <span className="text-muted-foreground text-xs">
                    {' '}
                    effort: {m.supportedEffortLevels.map((l) => EFFORT_LABELS[l]).join(' / ')}
                  </span>
                )}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`${m.displayName} を削除`}
                onClick={() => void onSave(models.filter((x) => x.id !== m.id))}
              >
                削除
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          モデル ID
          <input
            className="rounded border px-2 py-1"
            value={id}
            onChange={(e) => setId(e.target.value)}
            data-testid="model-id"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          表示名
          <input
            className="rounded border px-2 py-1"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            data-testid="model-display-name"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs">
          inference profile ID (Bedrock。任意)
          <input
            className="rounded border px-2 py-1"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            data-testid="model-profile-id"
          />
        </label>
      </div>
      <fieldset className="flex flex-wrap items-center gap-2 text-xs">
        <legend className="mb-1">対応 effort (選ばなければ起動時は「既定」のみ)</legend>
        {EFFORT_LEVELS.map((level) => (
          <label key={level} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={efforts.includes(level)}
              onChange={() => toggle(level)}
            />
            {EFFORT_LABELS[level]}
          </label>
        ))}
      </fieldset>
      {id !== '' && !valid && (
        <p role="alert" className="text-destructive text-xs">
          {duplicate
            ? '同じモデル ID が既にあります。'
            : 'モデル ID と inference profile ID は英数字と . _ : / @ - [ ] だけを使えます (先頭は英数字)。表示名は必須です。'}
        </p>
      )}
      <div>
        <Button type="button" size="sm" disabled={!valid} onClick={() => void add()}>
          モデルを追加
        </Button>
      </div>
    </div>
  )
}
