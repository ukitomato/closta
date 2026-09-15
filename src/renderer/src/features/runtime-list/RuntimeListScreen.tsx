import { EmptyState } from '@/components/assistant-ui/elements/empty-state'
import { ErrorState } from '@/components/assistant-ui/elements/error-state'
import { GenerationLoader } from '@/components/assistant-ui/elements/loading-state'
import { mono, paper } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { RuntimeDescriptorDTO } from '@domain/runtime/dto'

import {
  AUTO_MODE_LABELS,
  DEPENDENCY_DOC_PATH,
  DEPENDENCY_LABELS,
  ENUMERATION_ISSUE_LABELS,
  PROBE_STATE_LABELS,
  RUN_STATE_LABELS,
  SANDBOX_LABELS,
  SECCOMP_LABELS,
  runtimeTitle
} from './labels'
import { useRuntimes } from './useRuntimes'

/**
 * ランタイム一覧 (FE-010 / FE-011 / FR-009 / FR-047)。
 *
 * **無人実行の可否は表示用の値 (`autoModeStatus`) を使う。**
 * `autoModeAllowed` (真偽) で表示すると未判定が「不可」に潰れ、
 * `sandboxKind` から再導出すると判定失敗を「安全」と読む経路が生まれる (FR-003)。
 *
 * 表示する状態は 5 つ — 判定済み / 未判定 / 判定中 / 判定失敗 (再検出の導線つき) /
 * 列挙不能 (理由つき)。
 */

/** ラベルと値の 1 行。ラベル幅を揃えて全角混在でも崩れないようにする。 */
function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

function MissingDependencies({
  runtime
}: {
  runtime: RuntimeDescriptorDTO
}): React.JSX.Element | null {
  const missing = runtime.capabilities.missingDependencies
  if (missing.length === 0) return null

  return (
    <div className="border-border/60 mt-3 border-t pt-3">
      <p className="text-sm font-medium">不足している必須依存</p>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {missing.map((dependency) => (
          <li key={dependency.name}>
            {DEPENDENCY_LABELS[dependency.name]}
            {/*
              **コマンド文字列を出さない** (FR-009)。
              案内するのは導入手順文書の位置とアンカーだけである。
            */}
            <span className={cn(mono, 'text-muted-foreground ml-2')}>
              {DEPENDENCY_DOC_PATH}#{dependency.docAnchor}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-2 text-xs">
        導入したあと「再検出」を押してください。自動では再判定しません。
      </p>
    </div>
  )
}

function RuntimeCard({
  runtime,
  onReprobe
}: {
  runtime: RuntimeDescriptorDTO
  onReprobe: (id: string) => void
}): React.JSX.Element {
  const { capabilities } = runtime
  const isProbing = capabilities.probeState === 'probing'
  const isFailed = capabilities.probeState === 'failed'

  return (
    <li className={cn(paper, 'rounded-xl px-4 py-3')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {runtimeTitle(runtime.kind, runtime.distroName)}
            {runtime.isDefault ? (
              <span className="text-muted-foreground ml-2 text-xs">(既定)</span>
            ) : null}
          </p>
          <p className={cn(mono, 'text-muted-foreground')}>{runtime.id}</p>
        </div>
        {isProbing ? (
          <GenerationLoader variant="dots" label="判定中" tick={0} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => onReprobe(runtime.id)}>
            再判定
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <Field label="実行状態">{RUN_STATE_LABELS[runtime.state]}</Field>
        {runtime.kind === 'wsl' ? (
          <Field label="WSL バージョン">
            {runtime.wslVersion === null ? '不明 (列挙できませんでした)' : runtime.wslVersion}
          </Field>
        ) : null}
        <Field label="判定">{PROBE_STATE_LABELS[capabilities.probeState]}</Field>
        <Field label="隔離機構">{SANDBOX_LABELS[capabilities.sandboxKind]}</Field>
        {/* **seccomp は 3 値で出す。** 「なし」と「未判定」を潰さない (FR-006 / FR-003)。 */}
        <Field label="seccomp">{SECCOMP_LABELS[capabilities.seccompStatus]}</Field>
        <Field label="無人実行">{AUTO_MODE_LABELS[capabilities.autoModeStatus]}</Field>
        <Field label="パス変換">{runtime.hasPathMapping ? '材料あり' : '材料なし (未取得)'}</Field>
      </div>

      {isFailed ? (
        <p className="border-border/60 mt-3 border-t pt-3 text-sm">
          判定に失敗しました。ディストロが起動しているかを確かめて「再判定」または「再検出」を
          押してください。
        </p>
      ) : null}

      <MissingDependencies runtime={runtime} />
    </li>
  )
}

export function RuntimeListScreen(): React.JSX.Element {
  const { list, loadState, refreshing, refresh, reprobe } = useRuntimes()

  if (loadState === 'failed') {
    return (
      <ErrorState
        title="ランタイムを取得できませんでした"
        detail="アプリの再起動を試してください。"
        retrying={refreshing}
        onRetry={refresh}
      />
    )
  }

  if (list === null) {
    return (
      <div className={cn(paper, 'flex items-center gap-4 rounded-xl px-4 py-3')}>
        <GenerationLoader variant="dots" label="ランタイムを検出中" tick={0} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">ランタイム</h2>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          {refreshing ? '再検出中…' : '再検出'}
        </Button>
      </div>

      {list.runtimes.length === 0 ? (
        <EmptyState>
          <p className="text-sm">ランタイムが見つかりませんでした。</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.runtimes.map((runtime) => (
            <RuntimeCard key={runtime.id} runtime={runtime} onReprobe={reprobe} />
          ))}
        </ul>
      )}

      {/*
        **列挙不能を黙って落とさない** (SC-002)。
        落とすと `wsl -l -v` との 1 対 1 が破れ、原因が名前だと気付けない。
      */}
      {list.enumerationIssues.length > 0 ? (
        <div className={cn(paper, 'rounded-xl px-4 py-3')}>
          <p className="text-sm font-medium">一覧に出せなかったディストロ</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {list.enumerationIssues.map((issue) => (
              <li key={issue.rawName}>
                <span className={cn(mono, 'break-all')}>{issue.rawName}</span>
                <span className="text-muted-foreground ml-2">
                  {ENUMERATION_ISSUE_LABELS[issue.reasonKey]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
