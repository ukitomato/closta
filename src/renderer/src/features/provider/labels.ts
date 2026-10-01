import type { CredentialSource, EffortLevel } from '@domain/provider/types'

/**
 * Provider の表示ラベル (Principle XV。**訳出は `ui`**。code identifier は英語)。
 *
 * `CredentialSource` は参照キーであり、日本語表記はここ (renderer) が与える (FR-014)。
 */

export const CREDENTIAL_SOURCE_LABELS: Record<CredentialSource, string> = {
  'config-dir': '設定ディレクトリ (CLAUDE_CONFIG_DIR)',
  'in-app-login': 'アプリ内ログイン',
  'api-key-helper': 'API キー helper スクリプト',
  'api-key': 'API キー (safeStorage に保管)',
  'oauth-token': 'OAuth トークン (safeStorage に保管)',
  'aws-profile': 'AWS プロファイル',
  'aws-credential-export': 'AWS 資格情報 export helper',
  'aws-assume-role': 'AWS AssumeRole (helper 化)',
  'env-passthrough': '既存の環境変数'
}

/** effort の表示ラベル (effort は provider domain の概念。モデルカタログ編集と起動設定ダイアログが共有する)。 */
export const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '最高',
  max: '最大'
}

export const BACKEND_LABELS: Record<'anthropic' | 'bedrock' | 'vertex' | 'foundry', string> = {
  anthropic: 'Claude (Anthropic)',
  bedrock: 'Amazon Bedrock',
  vertex: 'Google Vertex',
  foundry: 'Azure AI Foundry'
}

/** 到達不可の理由 (起動選択肢から外れた Provider に付す。FR-012 / L-05)。 */
export const REACHABILITY_EXCLUDED_LABELS: Record<'unreachable' | 'blocked', string> = {
  unreachable: '選んだランタイムからは届きません',
  blocked: '今は届きません (ディストロを起動して再検出してください)'
}

/**
 * providers.json の読み込みで退避したレコードの件数表示 (X-4 pr-gate R1 M-03)。
 * 件数だけを示す — どの Provider かの詳細と復旧 UI は X-6。
 */
export function skippedOnLoadLabel(count: number): string {
  return `${count} 件の登録を読み込めませんでした (退避済み)`
}

/**
 * providers.json をファイルごと読めなかったときの表示 (pr-gate R2 database M-401 / po M-103)。
 * このとき store の件数は中のレコード数に関わらず 1 なので、**件数を出さない**。
 * 将来版のファイル (`schema-version-unknown`) は登録・編集・削除も拒否されるため、その旨を足す。
 * parse 失敗では登録・編集は続けられるので、以前の登録が戻らないことと次の手を示す (pr-gate R3 po L-202)。
 */
export function wholeFileUnreadableLabel(storeNewerVersion: boolean): string {
  return storeNewerVersion
    ? '保存ファイルを読み込めなかったため、登録を表示できません (退避済み)。新しいバージョンのアプリで保存されたファイルのため、登録・編集・削除もできません。'
    : '保存ファイルを読み込めなかったため、以前の登録は表示されません (退避済み)。必要なら登録し直してください。'
}

/** 登録の失敗理由 (contracts C-3 の理由キー → 日本語)。 */
export const REGISTER_FAILURE_LABELS: Record<string, string> = {
  'safestorage-unavailable':
    'この環境では OS の暗号化 (safeStorage) が使えないため、秘密を安全に保管できません。登録できません。',
  'secret-in-extraenv':
    '追加環境変数に秘密らしい値が含まれています。秘密は認証方式で登録してください。',
  'invalid-path': '設定ディレクトリのパスが不正です。',
  'invalid-record': '入力が不正です。',
  'not-found': '対象の Provider が見つかりません。',
  // 削除の失敗 (store-newer-version 以外。主に対象が既に無い)。汎用文言に落とさない (pr-gate R3 database L-502)。
  // 失敗したときは一覧を読み込み直す (useProviders.remove。R4 po L-301)。
  'remove-failed': '削除できませんでした。一覧を読み込み直しました。',
  'store-newer-version':
    'providers.json が新しいバージョンで保存されています。上書きを避けるため変更できません (退避ファイル .bak を確認してください)。'
}
