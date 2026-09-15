---
domain: session
status: needs-human-review
owner: ukitomato
generated_by: human (PLAN.md を素案として再導出)
last_reviewed: 2026-09-15
related_adrs:
  - docs/decisions/0002-use-agent-sdk-not-cli.md
  - docs/decisions/0006-supervisor-in-utility-process.md
  - docs/decisions/0007-session-source-of-truth-is-claude-code.md
  - docs/decisions/0010-supervisor-runs-standalone.md
related_specs: []
---

# Domain Charter: session

## Mission

`session` domain は、**複数フォルダ・複数ランタイムにまたがって存在する Claude Code の
セッションを、一箇所から走査・起動・監視・差配できるようにする**ことを担う。

Closta の出発点にある課題「並行して走らせたセッションの所在が分からない」
「同じ起動条件を毎回打ち直している」に直接答える domain である。

## Scope

### In scope

- 登録フォルダを横断したセッションの列挙（複数 Provider / 複数ランタイム分）
- セッションの起動、応答のストリーミング、中断、再開、分岐（`forkSession`）
- `SessionLaunchConfig` の解決と、軸どうしの依存関係の解決
  （ランタイム → Provider → モデル → 権限モード）
- プリセットの保存・適用
- `canUseTool` の permission 往復の配管
- セッション supervisor（`utilityProcess` 分離、semaphore 制御、IPC バッチ化）
- セッション状態の管理（idle / running / awaiting_permission / error）と監視ビュー

### Out of scope

- transcript や tool 出力の**描画** → `ui` domain（本 domain はデータを供給するところまで）
- 承認カードや監視ビューの**見た目と element 選定** → `ui` domain
  （本 domain は「何を承認待ちとするか」の状態を持つ）
- Provider の登録と認証方式の管理 → `provider` domain
- コンテナの起動・破棄と権限モードのゲート → `isolation` domain
- ランタイムの検出とパス変換 → `runtime` domain
- stream-json の自前パース → **禁止**（Principle IV）

## Actors / Personas

- **エンドユーザ（開発者）**: 複数リポジトリで並行してセッションを走らせ、所在を把握し、
  起動条件を選び、同じ組み合わせを再利用したい
- **システム（supervisor）**: 複数セッションのプロセスを保持し、ストリームを捌き、
  main process をブロックせずに renderer へ届ける

## User Journey

### Journey 1: 過去セッションを横断して探す

1. ユーザは登録済みフォルダの一覧を開く
2. システムは各フォルダ・各 Provider の config ディレクトリからセッションを列挙する
   （**所在ディストロが実行中のものに限る**。停止中は「停止中のため未列挙」として示す）
3. ユーザは一覧から目的のセッションを選び、内容を読む

### Journey 2: 起動条件を決めてセッションを開始する

1. ユーザは作業フォルダを選ぶ
2. ランタイムを選ぶ。以降の選択肢が capability に応じて絞られる
3. Provider・モデル・effort・権限モード・上限を選ぶ
4. 起動する。応答がストリーミングで表示され、permission 要求には承認で応じる
5. 同じ組み合わせを名前付きプリセットとして保存する

### Journey 3: 10 セッションを並列で差配する

1. ユーザは監視ビューで実行中セッションの状態を一覧する
2. 承認待ちのセッションが目立つ形で示される
3. 1 つを選んで没入ビューに切り替え、対応後に一覧へ戻る

### Journey 4: 中断と再開

1. ユーザは実行中のセッションを中断する。途中出力は残る
2. 後で再開する。フォルダ / ランタイム / Provider は引き継がれ、
   モデル / effort / 権限モード / 上限は選び直せる
3. 引き継ぐ軸を変えたい場合は分岐（`forkSession`）として扱う

## Key concepts

- **セッション**: Claude Code の 1 会話。UUID で識別され
  `<config-dir>/projects/<encoded-cwd>/<uuid>.jsonl` に永続化される
- **SessionLaunchConfig**: セッション起動時に選択される設定の組
- **プリセット**: 名前付きで保存された `SessionLaunchConfig`。資格情報の値は含まない
- **supervisor**: セッションのプロセスとストリームを持つ `utilityProcess`。Electron 非依存
- **transcript**: セッションの会話ログ

詳細は [docs/glossary.md](../../glossary.md) を参照。

## 業務ルール / 不変条件

- セッションの正本は Claude Code 側にある。アプリのストアはキャッシュ / インデックスであり、
  矛盾したときは Claude Code 側を正とする（Principle X）
- Claude Code との通信は Agent SDK 経由に限定する（Principle IV）
- stream の逐次パースは supervisor で行い、main process をブロックしない（Principle IX）
- 権限モードの選択肢はランタイムの capability に従う（Principle III。判定は `isolation`）
- プリセットに長期資格情報の値を含めない（Principle V）
- 再開時、フォルダ / ランタイム / Provider は引き継ぐ。変更したい場合は分岐として扱う
- 上流の軸を変更したとき、無効になった下流の値は既定に戻し、UI で通知する

## KPI / Success metrics

- **並列時の滑らかさ**: 10 セッション同時実行で UI の入力応答が保たれる — 計測経路: 手動検証 + フレーム計測
- **列挙の網羅**: **実行中のディストロについて**、その中の config ディレクトリを
  Windows 側から取りこぼさず列挙できる — 計測経路: E2E。
  **停止中ディストロ内のセッションは R-2 では原理的に列挙できない** —
  R-1 が検出のためにディストロを起動しないと決めたためである（SC-005 / `runtime` charter）。
  停止中を含めた列挙を KPI に掲げると、達成する唯一の道が SC-005 違反になる
- **依存解決の正しさ**: 上流の軸を変えたとき無効値が既定に戻り通知される — 計測経路: E2E
- **再利用率**: プリセット経由の起動が、全軸を手で選ぶ起動を上回る — 計測経路: ローカル利用ログ

## Cross-domain dependencies

- 依存する domain: `runtime`（起動とパス解決）、`provider`（環境変数とモデルカタログの導出）
- 依存される domain: `ui`, `isolation`
- 共有 invariant: Principle III / IV / V / IX / X。詳細は [docs/domains/_overview.md](../_overview.md)

## Related ADRs

- [AD-002](../../decisions/0002-use-agent-sdk-not-cli.md) — Agent SDK を使う
- [AD-006](../../decisions/0006-supervisor-in-utility-process.md) — supervisor は `utilityProcess` に置く
- [AD-007](../../decisions/0007-session-source-of-truth-is-claude-code.md) — 正本は Claude Code 側
- [AD-010](../../decisions/0010-supervisor-runs-standalone.md) — supervisor は単独起動可能

## Related Specs

（未着手。R-2 / X-1 / X-4 / X-5 / O-1 が本 domain に属する）

## Open Questions

- [x] ~~SPIKE-1: `listSessions()` と `CLAUDE_CONFIG_DIR`~~ →
      [AD-021](../../decisions/0021-session-store-and-enumeration.md)。config dir は引数で取れず、
      **Provider ごとの短命 child process 方式が本線**に決まった
- [x] ~~`sessionStore` の実現手段~~ → **SDK の公式インタフェース**だった。自作しない。
      `append` は「ローカル書き込み成功後」に呼ばれ、Principle X と構造的に整合する
- [x] ~~SPIKE-5: `wsl.exe` 越しの stdin/stdout 往復、中断、大きな tool_result~~ →
      [AD-018](../../decisions/0018-wsl-process-control.md)。疎通は完全（5MB ハッシュ一致 / 50,000 行欠落なし /
      往復 0〜9ms）。**SIGINT は伝播しないが、SDK の interrupt は stdin 越しの control_request** なので
      中断は成立する。stdin を閉じると制御経路が失われる点に注意
- [ ] `wsl.exe` 強制終了時に書きかけの JSONL transcript が壊れないか（AD-018 の Open Question）
- [ ] SPIKE-6: `PermissionMode` / `effort` の正確な列挙値と Auto モードの指定方法
- [ ] transcript ミラーの保持期限と削除経路（AD-007 の blocking gap）を本 domain が持つか
