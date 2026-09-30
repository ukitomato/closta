# Quickstart 実機記録 (SH-022) — X-3 Provider 登録と到達可能性判定

**実施**: 2026-09-30 / **環境**: Windows 11 (実機) / electron-vite dev (renderer @ localhost:5173)
**実施者**: 人間 (アプリ操作) / 記録: 判定表

ProviderScreen をアプリシェルの「プロバイダ」タブに配線 (commit 3d959fd) し、実機で US-1 の登録管理フローを確認した。

## 判定表

| 項目 | 帰属 | 結果 | 備考 |
|---|---|---|---|
| **検出→登録** (US-1) | X-3 | ✅ OK | 「検出」→候補提示 (自動登録なし SC-001)→フォームで明示登録→リスト反映を実機確認 |
| **編集・削除** (US-4) | X-3 | ✅ OK | インライン rename / 削除が効くことを確認 |
| **失敗理由の提示** (FR-007) | X-3 | ✅ OK | 理由キー→日本語ラベルで表示 (秘密混入拒否 / safeStorage 不可 等) |
| **到達可能性で絞る** (US-2 の UI) | **X-4** | N/A (X-3) | 判定エンジン + `listReachableProviders` IPC はバックエンドとして実装済み。**それを消費する起動選択 UI は X-4**。プロバイダ画面には未表示 |
| **helper live 観測** (stub helper 1 度発火) | X-4 | 未検証 | helper 解決は Claude Code 委譲 (AD-039)。deriveEnv は helper パスを settings に載せるところまで。live 観測は X-4 の launch 配線後 |
| **aws-assume-role 期限監視** | N/A | N/A (R-02) | awsCredentialExport 化で期限監視も Claude Code 委譲 (FR-006 / SC-005/008 N/A) |

## 総評

**US-1 (検出・登録・編集・削除) の登録管理 UI は実機で動作 OK** (利用者確認)。X-3 スコープの UI 価値 (Constitution XI の観測可能な垂直スライス) は「プロバイダ」タブで成立。

**X-4 で live 化する項目** (到達可能性フィルタ UI・モデルカタログ切替・helper live 観測) は本 quickstart の対象外 (バックエンドは提供済み、UI 消費は X-4)。

**light pass の限界**: 本記録は基本フローの実機確認であり、SC-009 の「検出の網羅」(ホストに存在する全 config ディレクトリ・全 AWS プロファイルの取りこぼしゼロ) の網羅的検証は、複数 distro / 多プロファイル環境での追加検証が望ましい (charter KPI「検出の網羅」= 継続的手動検証)。
