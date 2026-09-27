# Track C — architecture-reviewer

**Run**: 2026-09-25 · **Gate**: design · **Verdict**: Critical 0 / High 1 / Medium 4 / Low 2

## viewpoint coverage
- A/B: 該当なし (security owner)
- C 業務不変条件/Charter・Glossary drift/cross-domain: Medium 2
- D Constitution/ADR drift/layering: High 1 / Medium 1 / Low 2
- E/F/G: 該当なし (各 owner)
- H テスト/observability/regression: Medium 1

## caller 質問への回答 (要点)
- 新規 ADR (SH-001) 起票は妥当。AD-034 の port2 は read-only・inbound 封じ込め・単一 sessionId 固定であり、X-1 の「長寿命 per-session + control plane inbound + canUseTool 往復」は別構成。ただし「第 4 のプロセス形態」枠付けは L-001 参照
- `query` の AGENT_SDK_ALLOWED_CALLS 追加 / spawner の PROCESS_SPAWN_MODULES 追加を ADR に紐づける処理は正しい (AD-034 §3/§4 先例)。`interrupt`=query 戻り値メソッド・`canUseTool`=option key で項目 14 対象外という plan の分析も check.mjs と整合し妥当
- Principle IX (main 非経路) の担保方式 (構造検査 + 走査 + 手動レビュー、到達集合検査未構築) は AD-034 §5 / Constitution IX 現状の制約と整合、drift なし
- services-not-to-io (A-1) の扱い (新規調停クラスなら from 実名+fixture、既存拡張なら不要、SH-021 で確定) は AD-025 §9 / AD-027 規範どおり

## Findings

### [High] H-001 — WSL-free 起動配線の中核メカニズムが未確認の SDK 仮定に依存し確定事項として記述されている (scope: feature)
- **Where**: data-model §8 (120-134「agents は SDK の pathToClaudeCodeExecutable/spawnClaudeCodeProcess に渡すのみ — wsl.exe も spawn API も持たない」と確定記述) / contracts C-7 / plan A-4 vs research R-03 (31-32「実装時に再確認」と繰り延べ)
- **Issue**: `query()` は AGENT_SDK_IMPORT_DIRECTORIES=['src/agents/'] に限られ agents の per-session プロセスで走る → `spawnClaudeCodeProcess` の実体も agents 内で評価される。AD-018 §4 は SPIKE-5 で spawnClaudeCodeProcess を**実際に spawn を行うカスタマイズ点**として使い wsl.exe を起動している。もし spawn を行う関数なら agents が spawn API を持ち check.mjs 項目 7 が違反を出す (SH-007 は agents を PROCESS_SPAWN_MODULES に追加していない → code-gate で落ちる)。spawn を agents の外へ出そうにも infra↔agents 不可 + spawn 関数は structured-clone 不可で IPC 越し不可。**配線の成立は「SDK が純粋な値だけから wsl.exe を起動できるか」に懸かり、それが research で未確認のまま plan/data-model/contracts が確定と記述**
- **Action**: SH-001 の ADR で sdk.d.ts 0.3.270 の実型から次のいずれかを先に確定し data-model §8 / C-7 に反映: (1) spawnClaudeCodeProcess が純粋 spawn spec を受け取り SDK 内部が spawn する形なら型シグネチャ引用を ADR に残す。(2) agents 側で spawn が要るなら PROCESS_SPAWN_MODULES に agents を ADR 付き追加 + Principle VI/VII 影響を Consequences に明記。design-gate 通過前に (1)/(2) が確定しないと SH-006/007 の内容が決まらない
- 根拠: AD-023 §6/§7 / AD-018 §4 / AD-002 / Principle VI・VII / check.mjs 項目 7 / Investigation≠implementation
- **platform-boundary-reviewer と重複 owner 見込み。dedup 対象**

### [Medium] M-001 — 機械強制の履行義務テーブル (A-1〜A-5) が検証項目 3 (WSL_CALLER_MODULES) の追加義務を取りこぼしている (scope: feature)
- **Where**: BE-002 / data-model §8 (「wsl.exe argv はここに閉じる」) vs WSL_CALLER_MODULES=['src/main/infra/runtime/wsl-cli.ts'] 単一ファイル固定 (allowlists.mjs:186)。SH-007 の対象は PROCESS_SPAWN_MODULES / WSL_FREE_DIRECTORIES のみで WSL_CALLER_MODULES 追加 task が無い
- **Issue**: argv 構築を新規ファイルに置くと項目 3 が違反。plan A-table は「履行義務を全件割り当てる」と宣言しつつ 1 件欠落
- **Action**: A-table に行追加。「argv 構築は既存 wsl-cli.ts に収める (変更なし)」か「新規 infra/runtime モジュールを WSL_CALLER_MODULES に ADR 付き実名追加」を design-gate 時点で確定、後者なら SH-007 に WSL_CALLER_MODULES を明記
- 根拠: Principle VI / AD-025 申し送り / check.mjs 項目 3

### [Medium] M-002 — Principle XIV: 新規 domain 概念の一部しか glossary 追記対象になっていない (scope: feature)
- **Where**: 新規導入は SessionEvent/PermissionDecision/RuntimeLaunchSpec/LaunchInput/FailureReason/SessionControl だが SH-004/plan は AgentSession/SessionRunState/PermissionRequest の 3 語のみ。PermissionRequest を追記しつつ対概念 PermissionDecision を追記しないのは非対称。glossary 全読了で上記 6 語は未収載
- **Action**: SH-004 の対象に少なくとも SessionEvent/PermissionDecision/RuntimeLaunchSpec を追加。汎用語除外の複合語のうち固有意味を持つものは収載する方針 (Provider 例外の前例) に沿って取捨明示
- 根拠: Principle XIV / AD-024 #16

### [Medium] M-003 — 「実行単位」が glossary canonical supervisor/agents プロセスの第 3 の同義語になっている (scope: feature)
- **Where**: spec_dir で「実行単位」21 件。glossary supervisor 定義 (utilityProcess/src/agents) と同一指示対象。Detected synonyms 表は既に supervisor/agents を要統一
- **Action**: (a) canonical supervisor に統一、または (b)「実行単位」を X-1 固有概念 (単一セッションの per-session。X-5 の分離 supervisor と別段階) として Counterexample 付き追記 + synonyms 表更新。SH-004 で確定
- 根拠: Principle XIV / glossary Detected synonyms

### [Medium] M-004 — WSL 起動経路が「agents は spawn しない」を積極的に証明する in-scope 自動テストを持たない (scope: feature)
- **Where**: SC-003/006 は port 構造検査 + 純粋関数 (プロセス起こさず) / 孤児 0 は quickstart V-8 (人間 deferred)。WSL-free の自動検査は check.mjs 項目 7/15 の否定的検査のみ
- **Issue**: 項目 7/15 は「禁止パターンが出たら落とす」であり「WSL 内起動しつつ agents が spawn しない」肯定的性質は証明しない。AD-030 §Consequences の「ユニットテスト/単独起動では出なかった」と同型リスク
- **Action**: SH-020 に「spawn 主体モジュール実名 (session-spawner.ts) を固定する構造テスト」+「agents を node で起こし SDK fake でも起動フローが agents 内 spawn を持たないと assert」を追加。quickstart 依存を最小化
- 根拠: Principle IX/VII / AD-030 §Consequences / AD-034 §5

### [Low] L-001 — 「第 4 のプロセス形態」枠付けが per-session (AD-023 §6) の再適用を新形態と誤読させる (scope: feature)
- **Where**: research R-04 (41-42「第 4 の位置づけ」) vs AD-023 §6 が per-session を最初に定義、AD-034 §2 が per-request を「第 3 のプロセス形態」と数える
- **Action**: SH-001 の ADR で「新しいのは per-session という寿命でなく、per-session 長寿命 + AD-034 の port transfer + control plane inbound の組み合わせ」と正確に位置づけ。data-model §1「AD-023 §3 をそのまま採る」も実際は signature 変更+2 メソッド追加なので「§3 を土台に拡張」と改める (I2 と同旨)

### [Low] L-002 — 起動経路の CLAUDE_CONFIG_DIR の置き場が未決で AD-030 §2「綴りは 1 箇所」と整合するか不明 (scope: feature)
- **Where**: data-model §7 (「起動経路なので扱いを実装で確認」) vs AD-030 §2 (綴りは enumerate-sessions.ts の 1 つだけ = 列挙経路限定)
- **Action**: SH-001 か data-model §7 で「X-1 起動経路が config dir 指定を要するか / 要する場合の綴りの置き場 (infra の env 組み立て純粋関数か)」を明記し、AD-030 §2 が列挙経路限定である旨を併記

## Verdict
Critical 0 / High 1 / Medium 4 / Low 2。Critical 級の accepted-ADR Decision Outcome 違反なし。AD-018/023/034/020/011 追随・Principle IX 担保方式・許可リストガバナンス・services-not-to-io・新規 ADR 起票はいずれも整合。ブロッキング主眼は H-001 (WSL-free 起動配線が未確認 SDK 仮定を確定記述)。design-gate 通過前に sdk.d.ts 実型で確定し data-model §8/C-7/SH-007 (WSL_CALLER_MODULES 含む) に反映を推奨。
