---
domain: session
status: needs-human-review
owner: ukitomato
generated_by: human (PLAN.md を素案として再導出)
last_reviewed: 2026-10-05
related_adrs:
  - docs/decisions/0002-use-agent-sdk-not-cli.md
  - docs/decisions/0006-supervisor-in-utility-process.md
  - docs/decisions/0007-session-source-of-truth-is-claude-code.md
  - docs/decisions/0010-supervisor-runs-standalone.md
  - docs/decisions/0023-application-architecture.md
  - docs/decisions/0034-transcript-read-path-and-process-boundary.md
  - docs/decisions/0036-single-session-launch-process-and-live-stream.md
  - docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md
  - docs/decisions/0043-single-supervisor-session-threads-and-session-limit.md
  - docs/decisions/0044-ui-coverage-assignment.md
related_specs:
  - specs/002-session-cross-folder-session-enumeration/spec.md
  - specs/005-session-launch-and-streaming/spec.md
  - specs/008-session-launch-settings-dialog-and-presets/spec.md
  - specs/009-session-supervisor-and-multi-session/spec.md
  - specs/010-session-monitoring-view/spec.md
  - specs/011-ui-coverage/spec.md
  - specs/013-ui-app-shell/spec.md
---

# Domain Charter: session

## Mission

`session` domain は、**複数フォルダ・複数ランタイムにまたがって存在する Claude Code の
セッションを、一箇所から走査・起動・監視・差配できるようにする**ことを担う。

Closta の出発点にある課題「並行して走らせたセッションの所在が分からない」
「同じ起動条件を毎回打ち直している」に直接答える domain である。

## Scope

### In scope

- 登録フォルダを横断したセッションの列挙（複数 Provider / 複数ランタイム分）。
  **登録の有無によらず config ディレクトリ配下の全件**を対象とし、
  登録フォルダに紐づかないものは「未登録フォルダ」として示す（R-2）。
  登録済みだけを出すと、探す手段がないから登録できず、登録していないから見つからない、
  という循環に落ちる
- セッションの起動、応答のストリーミング、中断、再開、分岐（`forkSession`）
- `SessionLaunchConfig` の解決と、軸どうしの依存関係の解決
  （作業フォルダ ↔ ランタイム → Provider → モデル → effort。権限モードは独立した軸。glossary の Axis resolution）
- プリセットの保存・適用
- `canUseTool` の permission 往復の配管
- セッション supervisor（単一の `utilityProcess` + セッションスレッド、同時実行数の上限 (10・超過は拒否。待ち行列は持たない)、状態通知のバッチ化。AD-043）
- セッション状態の管理（idle / running / awaiting_permission / error）と監視ビュー

### Out of scope

- transcript や tool 出力の**描画** → `ui` domain（本 domain はデータを供給するところまで）
- 承認カードと transcript の**見た目と element 選定** → `ui` domain
  （本 domain は「何を承認待ちとするか」の状態を持つ）。
  **稼働中セッション一覧 (監視ビュー) は本 domain の操作 UI** であり、行の形と強調の出し方は本 domain が決める
  （ui charter の「他 domain の一覧・操作 UI は各 domain」に揃えた。O-1 USER 決定 2026-10-02）
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

1. ユーザはセッション一覧を開く
2. システムは各 Provider の config ディレクトリからセッションを列挙する
   （**所在ディストロが実行中のものに限る**。停止中は「停止中のため未列挙」として示す）
3. 登録済みフォルダに紐づくものはフォルダごとに、**紐づかないものは
   「未登録フォルダ」として作業ディレクトリごとに**示される。
   後者にはその場で作業フォルダとして登録する導線が付く（R-2）
4. ユーザは一覧から目的のセッションを選び、内容を読む

### Journey 2: 起動条件を決めてセッションを開始する

1. ユーザは作業フォルダを選ぶ
2. ランタイムを選ぶ。以降の選択肢が capability に応じて絞られる
3. Provider・モデル・effort・権限モード・上限を選ぶ（X-4 時点で上限は未対応。X-6 が扱う）
4. 起動する。応答がストリーミングで表示され、permission 要求には承認で応じる
5. 同じ組み合わせを名前付きプリセットとして保存する

### Journey 3: 10 セッションを並列で差配する

1. ユーザは監視ビューで実行中セッションの状態を一覧する
2. 承認待ちのセッションが目立つ形で示される
3. 1 つを選んで没入ビューに切り替え、対応後に一覧へ戻る

O-1 では、監視ビュー = セッション画面のサイドバーの稼働中セッション一覧 (強調・件数・経過時間・直近の活動・密度を持つ)、
没入ビュー = 表示中セッションのペイン (transcript と composer) と読み替えた。全面の監視画面は持たない (USER 決定 2026-10-02)。
「一覧へ戻る」は別の行を選ぶことに当たる。承認待ちと失敗の件数はセッション画面以外でもナビに出る

O-7 ([AD-046](../../decisions/0046-app-shell-layout.md)) でタブのビューが無くなり、監視ビュー = シェルのサイドバーの稼働中の区画、
没入ビュー = 中央の本体の実行中の Chat になった。承認待ちと失敗の件数は稼働中の区画の見出しに出て、サイドバーを畳んでも帯に残る。
稼働中の一覧の中身と行の形は今どおり session が持ち、どちらの一覧の行を中央に出すかはシェル (ui) が選択を購読して決める

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
- **supervisor**: 全セッションのプロセスとストリームを持つ**単一の** `utilityProcess`。調停役スレッドが
  セッションスレッド (`worker_threads`。1 セッション 1 本) を束ね、本文は文字列のまま renderer へ中継する。
  Electron 非依存で、worker のパスを引数で渡せば `node` で単独起動できる（X-5 / AD-043）
- **同時実行数の上限**: 枠を占めるセッションは 10 本まで。11 本目は `session-limit` で拒否する（X-5）
- **transcript**: セッションの会話ログ

詳細は [docs/glossary.md](../../glossary.md) を参照。

## 業務ルール / 不変条件

- セッションの正本は Claude Code 側にある。アプリのストアはキャッシュ / インデックスであり、
  矛盾したときは Claude Code 側を正とする（Principle X）
- Claude Code との通信は Agent SDK 経由に限定する（Principle IV）
- stream の逐次パースは supervisor で行い、main process をブロックしない（Principle IX）
- 権限モードの選択肢はランタイムの capability に従う（Principle III。判定は `isolation`）。
  **X-4 時点では安全 3 値（`default` / `plan` / `dontAsk`）だけを提示する**。capability に連動する昇格モードは I-3
  （[AD-041](../../decisions/0041-x4-launch-config-on-x1-launch-gate.md) (a)(c)）
- プリセットに長期資格情報の値を含めない（Principle V）
- 再開時、フォルダ / ランタイム / Provider は引き継ぐ。変更したい場合は分岐として扱う
- 上流の軸を変更したとき、無効になった下流の値は既定に戻し、UI で通知する

## KPI / Success metrics

- **並列時の滑らかさ**: 10 セッション同時実行で UI の入力応答が保たれる — 計測経路: E2E (偽の supervisor 接続で
  10 本 × 20 件/秒の負荷。`e2e/multi-session.spec.ts`。X-5 SC-003 / O-1 SC-004) + **実機計測** (ビルドした実アプリと
  実 `claude` 10 本。`perf/real-sessions.spec.ts`。CI では実行しない。O-1 SC-005)。指標は入力遅延 p95 と long task の最大。
  **O-1 の実機計測 (2026-10-02)** は、実 `claude` が窓の途中で応答を終えるため有効な回を得られず、利用者判断で締めた
  (手順を直した後の 4 回は p95 13.6〜14.9ms・long task 0 件。ただし測ったのは打鍵の間だけで、**行の切り替え (Journey 3 の
  手順 3) は実負荷の下で測っていない** — 1〜3 回目では切り替えの直後に 100〜275ms の long task が出た)。E2E の 50ms 超の
  long task は X-5 の 0〜10 件から O-1 で 33 件に増えた (原因は未切り分け)。10 本が窓の全期間で応答を流し続ける負荷の作り方・
  窓の終わりの行の状態の内訳・行の切り替えの計測は、**持ち主 = O-3** ([roadmap の O-3 の「義務 (O-1 から)」](../../roadmap.md#o3-kpi-smoothness)。
  経緯は [quickstart-results](../../../specs/010-session-monitoring-view/quickstart-results.md) V-3)
- **列挙の網羅**: **実行中のディストロについて**、その中の config ディレクトリを
  Windows 側から取りこぼさず列挙できる — 計測経路: **当面は Vitest + quickstart**。
  **本来は E2E だが、E2E 基盤の構築は M4 完了後に再検討する**（R-2 の `[USER]` 判断 /
  [AD-028](../decisions/0028-session-enumeration-process-and-unc-handoff.md) §5）。
  **再開条件**: E2E 基盤が入った時点で計測経路を E2E に戻す。
  持ち主 feature は M4 完了後に `docs/roadmap.md` へ登録する。
  **停止中ディストロ内のセッションは R-2 では原理的に列挙できない** —
  R-1 が検出のためにディストロを起動しないと決めたためである（SC-005 / `runtime` charter）。
  停止中を含めた列挙を KPI に掲げると、達成する唯一の道が SC-005 違反になる
- **依存解決の正しさ**: 上流の軸を変えたとき無効値が既定に戻り通知される — 計測経路: E2E
- **再利用率**: プリセット経由の起動が、全軸を手で選ぶ起動を上回る — 計測経路: ローカル利用ログ。
  **計測経路は O-3 (observability) が作る。X-4 では未計測**（本 domain に計測基盤が無いため。AD-041 (h)）

## Cross-domain dependencies

- 依存する domain: `runtime`（起動とパス解決）、`provider`（環境変数とモデルカタログの導出）。
  操作 UI は ui の `stores/ui.ts` の面の状態を**読む** (監視ビューの承認待ちの件数のボタンと読み上げが「見ているセッション」を
  導く。O-7)。書くのは設定を「作業フォルダ」で開く 2 つの導線だけ ([ui charter](../ui/charter.md) の「面の状態」)。
  逆向きに、ui のシェルが本 domain のストアの起動の告知を消す操作 (`dismissLaunchNotice`) を呼ぶ (O-7。下の Related Specs)
- 依存される domain: `ui`, `isolation`
- 共有 invariant: Principle III / IV / V / VII / IX / X / XII (X-6 は `docs/ui-coverage.md` の `後続: X-6` の行を完了の PR で書き換える。SDK の版を上げる PR は対応表を同じ PR で直す)。詳細は [docs/domains/_overview.md](../_overview.md)
  (VII = supervisor は Electron 非依存で単独起動できる。R-2 で `agents` を持つ feature が実装され実体を持った)

## Related ADRs

- [AD-002](../../decisions/0002-use-agent-sdk-not-cli.md) — Agent SDK を使う
- [AD-006](../../decisions/0006-supervisor-in-utility-process.md) — supervisor は `utilityProcess` に置く
- [AD-007](../../decisions/0007-session-source-of-truth-is-claude-code.md) — 正本は Claude Code 側
- [AD-010](../../decisions/0010-supervisor-runs-standalone.md) — supervisor は単独起動可能
- [AD-036](../../decisions/0036-single-session-launch-process-and-live-stream.md) — 単一セッション起動とライブストリーム (X-1)
- [AD-041](../../decisions/0041-x4-launch-config-on-x1-launch-gate.md) — X-4 の起動設定を X-1 の起動ゲートに載せる（権限モード安全 3 値・env の WSL 配送・`--exec`）
- [AD-023](../../decisions/0023-application-architecture.md) — アプリケーションアーキテクチャ（agents の寿命と単位は AD-043 が読み替える）
- [AD-034](../../decisions/0034-transcript-read-path-and-process-boundary.md) — transcript の読み取り経路とプロセス境界
- [AD-043](../../decisions/0043-single-supervisor-session-threads-and-session-limit.md) — 単一 supervisor・セッションスレッド・同時実行数の上限 (X-5)

## Related Specs

- **R-2** — [セッション列挙](../../../specs/002-session-cross-folder-session-enumeration/spec.md)
  （読み取り専用。全件列挙 + 未登録フォルダ。実装中）
- **X-1** — [単一セッション起動とストリーミング](../../../specs/005-session-launch-and-streaming/spec.md)
  （作業フォルダ + 実行中 WslRuntime で起動、live stream、承認カード、中断/強制終了。実装中）
- **X-4** — [起動設定ダイアログとプリセット](../../../specs/008-session-launch-settings-dialog-and-presets/spec.md)
  （6 軸の起動設定・依存解決・プリセット・越境警告・導出 env の WSL 配送。実装中。
  [AD-041](../../decisions/0041-x4-launch-config-on-x1-launch-gate.md)）
- **X-5** — [supervisor 分離とマルチセッション](../../../specs/009-session-supervisor-and-multi-session/spec.md)
  （単一 supervisor + セッションスレッド、上限 10 の並行起動、状態通知のバッチ、稼働中セッションの一覧と切り替え・
  終了・停止・閉じる。実装中。[AD-043](../../decisions/0043-single-supervisor-session-threads-and-session-limit.md)）

- **O-1** — [セッション監視ビュー](../../../specs/010-session-monitoring-view/spec.md)
  （稼働中セッション一覧の拡張: 承認待ち・失敗の強調と件数、ナビの件数と読み上げ (O-7 からは稼働中の区画の見出し)、枠の使用数、経過時間と直近の活動、
  compact / comfortable、charter KPI「並列時の滑らかさ」の実機計測。実装中）
- **O-7 (ui)** — [アプリのシェル](../../../specs/013-ui-app-shell/spec.md)
  （本 domain の feature ではない。稼働中と過去のセッションの一覧をサイドバーに置き、起動の面をダイアログに移した。
  session のストアには選択の操作の通知 `selectionSeq` を足し、`nextAwaiting` に「見ているセッション」の引数を足した。
  起動の告知 (拒否の理由と前回の失敗) を消す公開の操作 `dismissLaunchNotice` を足し、**呼ぶのは ui のシェル** (起動ダイアログを起動せずに
  閉じたとき・中央に出していない失敗したセッションを閉じたとき。起動中は何もせず `lastConfig` は残す)。X-4 US-1 AC7 の「失敗したセッションを
  閉じたら前回の設定と理由つきで起動ダイアログを開く」は、**中央に出していた失敗したセッションを閉じたときだけ**になった (ui の面の状態
  `focus === 'running'` に依存する。[013 data-model §1](../../../specs/013-ui-app-shell/data-model.md))。起動の状態の遷移のロジックは
  ストアの中のまま (pr-gate R2 architecture M-101)。**シェルは「`launch` が変わり・`previousFailure` が立ち・`order` が減る」組み合わせを
  失敗した close として読む** — `close` 以外の操作でこの組み合わせを作らない (作るなら明示の通知を足して shell と合わせて直す。
  `running-session-store.ts` の `close` の注記。pr-gate R3 architecture L-202)。
  稼働中の一覧の行の部品 (状態の印・経過時間・直近の活動) と派生値の追跡は変えていない）

X-6 は未着手。

## Open Questions

- [x] ~~SPIKE-1: `listSessions()` と `CLAUDE_CONFIG_DIR`~~ →
      [AD-021](../../decisions/0021-session-store-and-enumeration.md)。config dir は引数で取れず、
      **子プロセスに環境変数で渡す**方式に決まった。
      当初の「Provider ごとの短命プロセス」は
      [AD-030](../../decisions/0030-enumeration-runs-in-one-resident-process.md) §1 で
      **1 プロセス常駐 + 要求の直列処理**に差し替わっている —
      実測で費用のほぼ全部がプロセス起動だった (起動 2,704 ms に対して列挙 36〜83 ms)。
      config ディレクトリは起動時の環境変数ではなく**要求 1 件ごとに行に載せる** (AD-030 §2)
- [x] ~~`sessionStore` の実現手段~~ → **SDK の公式インタフェース**だった。自作しない。
      `append` は「ローカル書き込み成功後」に呼ばれ、Principle X と構造的に整合する
- [x] ~~SPIKE-5: `wsl.exe` 越しの stdin/stdout 往復、中断、大きな tool_result~~ →
      [AD-018](../../decisions/0018-wsl-process-control.md)。疎通は完全（5MB ハッシュ一致 / 50,000 行欠落なし /
      往復 0〜9ms）。**SIGINT は伝播しないが、SDK の interrupt は stdin 越しの control_request** なので
      中断は成立する。stdin を閉じると制御経路が失われる点に注意
- [ ] `wsl.exe` 強制終了時に書きかけの JSONL transcript が壊れないか（AD-018 の Open Question）
- [x] ~~SPIKE-6: `PermissionMode` / `effort` の正確な列挙値と Auto モードの指定方法~~ →
      [AD-020](../../decisions/0020-sdk-emitted-message-inventory.md)。X-4 は安全 3 値と `EffortLevel` 5 値を使う
      （[AD-041](../../decisions/0041-x4-launch-config-on-x1-launch-gate.md)）。Auto モードの指定は I-3
- [ ] transcript ミラーの保持期限と削除経路（AD-007 の blocking gap）を本 domain が持つか
- [x] ~~Hook / Background task の状態管理を本 domain の責務に含めるか ([AD-020](../../decisions/0020-sdk-emitted-message-inventory.md) Consequences「O-1 着手時に判断する」)~~ →
      **含めない** (O-1 USER 決定 2026-10-02)。表示の割当と、状態の保持が要る場合の持ち主 domain の判断は O-2 に送った
      (ui charter の Open Questions / roadmap の O-2 行)。**O-2 の結論 (USER 決定 2026-10-03)**: 状態は保持しない。
      本 domain が持つのは、agents のセッションスレッドで Hook / Background task のシステムメッセージを無害化して既存の
      `message` の経路で通すことだけ (`system-event.ts`。許可リストは O-2 data-model §2)。実行中の task の一覧は持たない。
      tool の結果の対応づけ (tool_use の id → 結果待ちのメッセージ) はセッションスレッドの中で一時的に持つ
      (上限 256 件、セッションの終了で破棄。O-2 data-model §3) が、表示の状態ではない
- [x] 監視ビューの直近の活動の tool ごとの整形 (O-1 の義務 (4)) → O-2。規則の正本は O-2 data-model §4 と `session-view.ts`
      の `summarizeToolInput`: ファイルを扱う tool はファイル名だけ、`Bash` はコマンドの名前だけ (クォート・`$`・backtick・`(`・
      環境変数の代入・秘密の接頭辞があれば出さない)、`Agent` / `Task` は subagent の種類、それ以外は tool 名だけ。
      `deriveActivity` は Hook / task の行と結果だけのメッセージを読み飛ばす (O-1 FR-006 を保つ)
- [x] ~~終了済みセッションの行の件数の上限・自動で閉じる (X-5 Out of Scope「O-1 で再検討」)~~ → **持たない** (O-1 で再検討した結論)。
      枠を占めるのは最大 10 本で、終了済みの行は compact で 1 行に縮むので俯瞰を妨げない。利用者が「閉じる」で外す
