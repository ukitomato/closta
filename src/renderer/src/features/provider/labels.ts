import type { CredentialSource } from '@domain/provider/types'

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

/** 登録の失敗理由 (contracts C-3 の理由キー → 日本語)。 */
export const REGISTER_FAILURE_LABELS: Record<string, string> = {
  'safestorage-unavailable':
    'この環境では OS の暗号化 (safeStorage) が使えないため、秘密を安全に保管できません。登録できません。',
  'secret-in-extraenv':
    '追加環境変数に秘密らしい値が含まれています。秘密は認証方式で登録してください。',
  'invalid-path': '設定ディレクトリのパスが不正です。',
  'invalid-record': '入力が不正です。',
  'not-found': '対象の Provider が見つかりません。',
  'store-newer-version':
    'providers.json が新しいバージョンで保存されています。上書きを避けるため変更できません (退避ファイル .bak を確認してください)。'
}
