import { useState } from 'react'

import type { CredentialDraft, ProviderDraft, ProviderSummaryDTO } from '@domain/provider/dto'
import type { CredentialSource } from '@domain/provider/types'

import { EmptyState } from '@/components/assistant-ui/elements/empty-state'
import { ErrorState } from '@/components/assistant-ui/elements/error-state'
import { GenerationLoader } from '@/components/assistant-ui/elements/loading-state'
import { paper } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { BACKEND_LABELS, CREDENTIAL_SOURCE_LABELS, REGISTER_FAILURE_LABELS } from './labels'
import { useProviders } from './useProviders'

/**
 * Provider 登録・検出・管理の画面 (FE-001 / FE-010 / FE-030。X-3)。
 *
 * **検出候補は提示のみ・自動登録しない** (SC-001)。登録は明示操作を要する。
 * **外部由来文字列 (displayName / 検出候補) は React 既定エスケープで描画**し `dangerouslySetInnerHTML` を使わない (L-08)。
 * assistant-ui の element は chat surface 用であり Provider 設定フォームに適合するものが無いため、
 * 状態表示 (EmptyState / ErrorState / GenerationLoader / paper) のみ流用し、フォーム/一覧は素の要素で組む
 * (Principle XIII。候補: none / 不適合理由: element は chat 用 primitive)。
 */

const SOURCES: readonly CredentialSource[] = [
  'config-dir',
  'in-app-login',
  'api-key-helper',
  'api-key',
  'oauth-token',
  'aws-profile',
  'aws-credential-export',
  'aws-assume-role',
  'env-passthrough'
]

const BACKENDS: readonly ('anthropic' | 'bedrock' | 'vertex' | 'foundry')[] = [
  'anthropic',
  'bedrock',
  'vertex',
  'foundry'
]

/** フォーム入力から `credential` draft を組む (`api-key`/`oauth-token` は平文秘密を 1 回だけ載せる)。 */
function toCredentialDraft(
  source: CredentialSource,
  secret: string,
  text: string
): CredentialDraft {
  switch (source) {
    case 'api-key':
    case 'oauth-token':
      return { source, secret }
    case 'api-key-helper':
    case 'aws-credential-export':
    case 'aws-assume-role':
      return { source, helperPath: text }
    case 'aws-profile':
      return { source, profileName: text }
    case 'env-passthrough':
      return {
        source,
        varNames: text
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      }
    case 'config-dir':
    case 'in-app-login':
      return { source }
  }
}

function RegisterForm({
  onRegister
}: {
  onRegister: (draft: ProviderDraft) => Promise<{ readonly ok: boolean }>
}): React.JSX.Element {
  const [displayName, setDisplayName] = useState('')
  const [backend, setBackend] = useState<'anthropic' | 'bedrock' | 'vertex' | 'foundry'>(
    'anthropic'
  )
  const [source, setSource] = useState<CredentialSource>('api-key')
  const [secret, setSecret] = useState('')
  const [text, setText] = useState('')

  const needsSecret = source === 'api-key' || source === 'oauth-token'

  const submit = async (): Promise<void> => {
    const draft: ProviderDraft = {
      displayName,
      backend,
      credential: toCredentialDraft(source, secret, text),
      models: { models: [] }
    }
    const result = await onRegister(draft)
    // **秘密を renderer 状態に残さない** — 送信後に必ずクリアする (FR-004 / L-08)。
    setSecret('')
    if (result.ok) {
      setDisplayName('')
      setText('')
    }
  }

  return (
    <form
      className={cn(paper, 'flex flex-col gap-2 rounded-xl px-4 py-3')}
      data-testid="provider-register-form"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <p className="text-sm font-medium">手動で登録</p>
      <label className="flex flex-col gap-1 text-sm">
        表示名
        <input
          className="rounded border px-2 py-1"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          data-testid="provider-displayname"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        バックエンド
        <select
          className="rounded border px-2 py-1"
          value={backend}
          onChange={(e) => setBackend(e.target.value as typeof backend)}
        >
          {BACKENDS.map((b) => (
            <option key={b} value={b}>
              {BACKEND_LABELS[b]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        認証方式
        <select
          className="rounded border px-2 py-1"
          value={source}
          onChange={(e) => setSource(e.target.value as CredentialSource)}
          data-testid="provider-source"
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {CREDENTIAL_SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      {needsSecret ? (
        <label className="flex flex-col gap-1 text-sm">
          秘密 (safeStorage に保管され、アプリは参照値のみ持ちます)
          <input
            type="password"
            className="rounded border px-2 py-1"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            data-testid="provider-secret"
          />
        </label>
      ) : source === 'config-dir' || source === 'in-app-login' ? null : (
        <label className="flex flex-col gap-1 text-sm">
          {source === 'aws-profile'
            ? 'プロファイル名'
            : source === 'env-passthrough'
              ? '変数名 (カンマ区切り)'
              : 'helper スクリプトのパス'}
          <input
            className="rounded border px-2 py-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-testid="provider-text"
          />
        </label>
      )}
      <Button type="submit" size="sm" disabled={displayName.length === 0}>
        登録
      </Button>
    </form>
  )
}

/** 一覧の 1 行。表示名の**インライン編集 (rename)** を持つ (US-4。認証方式は編集不可)。 */
function ProviderRow({
  provider,
  onRename,
  onRemove
}: {
  provider: ProviderSummaryDTO
  onRename: (id: string, displayName: string) => Promise<unknown>
  onRemove: (id: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(provider.displayName)

  const save = async (): Promise<void> => {
    await onRename(provider.id, name)
    setEditing(false)
  }

  return (
    <li className={cn(paper, 'flex items-start justify-between gap-3 rounded-xl px-4 py-3')}>
      <div className="min-w-0">
        {editing ? (
          <input
            className="rounded border px-2 py-1 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="provider-edit-name"
          />
        ) : (
          <p className="font-medium break-words">{provider.displayName}</p>
        )}
        <p className="text-muted-foreground text-sm">
          {BACKEND_LABELS[provider.backend]} · {CREDENTIAL_SOURCE_LABELS[provider.source]}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {editing ? (
          <Button size="sm" onClick={() => void save()} disabled={name.length === 0}>
            保存
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            編集
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => onRemove(provider.id)}>
          削除
        </Button>
      </div>
    </li>
  )
}

export function ProviderScreen(): React.JSX.Element {
  const {
    providers,
    candidates,
    loadState,
    lastError,
    detecting,
    detect,
    register,
    update,
    remove
  } = useProviders()

  if (loadState === 'failed') {
    return (
      <ErrorState
        title="Provider を取得できませんでした"
        detail="アプリの再起動を試してください。"
        retryLabel="再試行"
        retryingLabel="再試行中"
        retrying={false}
        onRetry={() => undefined}
      />
    )
  }

  if (providers === null) {
    return (
      <div className={cn(paper, 'flex items-center gap-4 rounded-xl px-4 py-3')}>
        <GenerationLoader variant="dots" label="Provider を読み込み中" tick={0} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Provider</h2>
        <Button variant="outline" size="sm" onClick={() => void detect()} disabled={detecting}>
          {detecting ? '検出中…' : '検出'}
        </Button>
      </div>

      {lastError !== null ? (
        <div
          className={cn(paper, 'rounded-xl px-4 py-3 text-sm')}
          role="alert"
          data-testid="provider-error"
        >
          {REGISTER_FAILURE_LABELS[lastError] ?? '操作に失敗しました。'}
        </div>
      ) : null}

      {/* 検出候補: **提示のみ・自動登録しない** (SC-001)。明示操作の「登録」を要する。 */}
      {candidates !== null ? (
        <div className={cn(paper, 'rounded-xl px-4 py-3')} data-testid="provider-candidates">
          <p className="text-sm font-medium">検出された候補</p>
          {candidates.length === 0 ? (
            <p className="text-muted-foreground mt-1 text-sm">
              候補は見つかりませんでした。下のフォームから手動で登録してください。
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {candidates.map((c, i) => (
                <li key={`${c.kind}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 break-words">{c.displayLabel}</span>
                  {c.alreadyRegistered ? (
                    <span className="text-muted-foreground text-xs">登録済み</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      未登録 (下のフォームで登録)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {providers.length === 0 ? (
        <EmptyState>
          <p className="text-sm">まだ Provider が登録されていません。</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="provider-list">
          {providers.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              onRename={(id, displayName) => update(id, { displayName })}
              onRemove={(id) => void remove(id)}
            />
          ))}
        </ul>
      )}

      <RegisterForm onRegister={register} />
    </div>
  )
}
