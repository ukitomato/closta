# architecture-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-27T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/023-session-launch-axes-and-operations/spec.md

## 初回読了 viewpoint

- FR/SC: この設計は FR-001〜FR-018 と SC-001〜SC-009 のすべてに当たる。この観点で特に関係が深いのは FR-002 / FR-005 / FR-010 / FR-011 / FR-012 / FR-017 / FR-018、SC-002 / SC-004。
- touched files に該当する charter / Confirmation:
  - session charter: Scope In「起動・ストリーミング・中断・再開」「軸の依存解決」「permission 往復の配管」、業務ルール (Principle III / X)、Out of scope「操作 UI」、Related ADRs / Specs、`:347`「X-6 は未着手」
  - ui charter: `:110`「他 domain の操作 UI → 各 domain」、`:94` 中央のヘッダ
  - _overview: Cross-domain invariants III / IV / VII / IX / X / XII、`:58` X-6 の行
  - AD-062 Confirmation 全項目
  - AD-036 §4 P3 / §5 (AD-062 が読み替える)
  - AD-034 決定 2 / 3 (AD-062 が形を流用し、読み替える)
  - AD-041 (a) / (g) / (h)
  - AD-043 (message の種類)
  - AD-059 Decision 2 / 4
  - AD-046 Decision 3 (中央のヘッダ)
  - AD-031 (accepted ADR の扱い)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:4 Low:1
- D. Constitution / ADR drift: Critical:0 High:1 Medium:1 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner。module の置き場は charter の責務境界として C で扱う
- G. optional reviewer 範囲: 該当なし: database / a11y / ux / ui-coverage の各 optional reviewer の owner
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

023 は動いているセッションに 3 つの操作を足す。
- 権限モードの切り替え: 安全 3 値の中だけで、`Query.setPermissionMode` を使う。
- モデルの切り替え: Provider のカタログの中だけで、`Query.setModel` を使う。
- 改名: SDK の `renameSession()` で transcript に custom-title を 1 行足す。env を固定した短命の `utilityProcess` で行う。

そのために新設の AD-062 (accepted) で、次の 4 つを読み替える。
- AD-036 §4 P3 / §5
- AD-034 決定 3
- X-1 SC-006(a)
- AD-043 の message の種類

主な変更点は次のとおり。
- `QUERY_MUTATION_METHODS` 22 → 20
- `AGENT_SDK_ALLOWED_CALLS` 5 → 6
- `control-result` の経路を足す
- IPC を 3 つ足す
- 中央のヘッダに操作を置く

Constitution の NON-NEGOTIABLE (III / IV / VI / VII) については、正の構成 (allowlist) を保ったまま広げる設計で、読み替えの手続きは AD-031 に沿っている。ただし次の 3 点が欠けている。
- AD-062 Decision 4 は「AD-034 決定 2 と同じ形」と書いているのに、短命プロセスの後始末 (dispose / before-quit) が抜けている。
- 改名を受け付けた後、結果が出るまでの間にターンが始まるのを防いでいない。U-6 / FR-010 の「ターンの追記と重ねない」はこの間に破れる。
- charter・glossary との境界に揺れがいくつかある。

## Findings

### [High] 改名の短命の子が dispose / before-quit の後始末に入っておらず、AD-062 Decision 4 が依拠する AD-034 決定 2 の形を満たさない (H-001) (scope: feature)

- **観察**:
  - AD-062 Decision 4 (`docs/decisions/0062-live-session-permission-mode-model-and-rename.md:39`) は、改名の子を「AD-034 決定 2 と同じ形」で起こすと書いている。
  - AD-034 決定 2 (`docs/decisions/0034-transcript-read-path-and-process-boundary.md:67-70`) は、その形の条件として次を求めている。
    - クラッシュの封じ込め
    - window close / before-quit での終了
    - 孤児の UNC ハンドルを残さないこと
    - 同時数の上限
  - 今の `composition-root.ts:504-509` の `dispose` は supervisor・列挙・transcript だけを片付けている。
  - 023 の設計では次のとおりになっている。
    - `session-rename-service.ts` は「状態を持たない」(plan.md:242・tasks.md BE-034)
    - `rename-spawner.ts` が子を止めるのは期限 (10 秒) のときだけ (tasks.md BE-033、contracts C-5)
    - 動いている改名の子の一覧も、`dispose` への結線も、どこにも書かれていない
  - contracts C-5:72 は、全体の上限を「同時実行数の上限 (10) と同じで足りる」と書いているが、それを強制する箇所が無い。
- **同種事象探索**: `Grep "dispose|before-quit|孤児"` を `specs/023-…/` に掛けると 3 件出る。`data-model.md:89` は制御の結果の待ちだけ、`tasks.md:37-38` は BE-008 の待ちの表だけで、改名の子に触れるものは 0 件。比較のため `src/main/app/` を見ると、`transcript-service.ts:14` / `:106` / `:131` が上限・kill・dispose を持っている。
- **リスク/影響**: アプリの終了中に改名の子が UNC 越しに JSONL を追記していると、終わり方が保証されない。AD-034 が後始末を義務にした理由 (孤児の UNC ハンドル。AD-030 §7) が、改名の経路でだけ外れる。また AD-062 の「同じ形」という記述が事実と合わなくなる。
- **推奨アクション**:
  - `rename-spawner.ts` か `session-rename-service.ts` のどちらかに、動いている子の集合を持たせる。
  - その集合に `dispose(): number` を付け、`composition-root.ts:507-509` の合計に足す。
  - 全体の上限は、`changing` に任せずに数えて強制する。
  - BE-033 / BE-034 のテストに「dispose で kill が呼ばれ、結果が `write-failed` になる」を足す。
  - AD-062 は accepted なので、決定を変えずに data-model §6.1 と contracts C-5 に書き足す (下の M-004 も参照)。
- **根拠**: AD-034 決定 2、AD-062 Decision 4
- **scope 根拠**: touched files (contracts C-5、data-model §6、tasks BE-033 / BE-034、`composition-root.ts`) の中で直せる

### [High] 改名を受け付けてから子が終わるまでの間にターンが始まるのを防いでおらず、U-6 / FR-010 の目的 (ターンの追記と重ねない) が破れる (H-002) (scope: feature)

- **観察**:
  - spec U-6 (`spec.md:86`) と FR-010 (`:185`) は、ターンの実行中を除く理由を「`claude` が書いている同じ JSONL に追記するので、ターンの実行中の追記と重ならないようにする」としている。
  - ところが受け付けの判定は data-model §5.1 (`data-model.md:103-112`) の 1 回だけで、`changing` が止めるのは 3 つの設定の変更だけ。
  - composer の送信 (`send-prompt`) は止めない。tasks FE-030 は「composer に触れない」と書いている。
  - 改名の子の起動には、本機では 0.4〜2.4 秒かかる (plan.md:38)。期限は 10 秒。その間に利用者が送信すれば、ターンが始まり、`claude` の追記と custom-title の追記が並ぶ。
- **同種事象探索**: `Grep "send-prompt|プロンプトを送|composer"` を spec_dir に掛けると 12 件 / 5 ファイル出るが、すべて「composer に触れない」の記述。`changing` の間に `send-prompt` を止める規則は 0 件。AD-062 Consequences (`0062-…md:47`) が残余として認めているのは「応答待ちに入った直後」の重なりだけで、受け付けた後のターンの開始は挙げていない。
- **リスク/影響**: RK-03 (JSONL が壊れる) を防ぐ前提が、この間だけ成り立たない。特に UNC (9P) 越しでは原子性を確かめていない (research R-13)。transcript は Claude Code の正本 (Principle X) なので、壊れると取り戻せない。
- **推奨アクション**: 最小案は次の 2 つ。
  - main の `requestControl` / `send-prompt` の経路で、`changing === 'name'` の行への `send-prompt` を拒否するか、改名の結果が出るまで待たせる。判定の正本は main とする。
  - renderer は送信ボタンを押せない形にする。composer の中身は変えず、`isDisabled` の条件に足すだけにする。
  - 上を採らない場合は、spec Edge Cases と AD-062 Consequences に、この間の重なりを残余として明記する。そして quickstart V-5 に「保存の直後に送信する」手順を足す。
- **根拠**: spec U-6 / FR-010、Principle X、AD-062 Consequences
- **scope 根拠**: touched files (data-model §5.1、tasks BE-008 / BE-034 / FE-030) の中で直せる

### [Medium] 実行中のモデルの選択肢の規則は、charter の軸の依存解決と向きが逆なのに「起動の規則と同じ」と書かれ、provider の domain に置かれる (M-001) (scope: feature)

- **観察**:
  - 起動の規則 `launch-resolution.ts:141-149` は、モデル (上流) が先に決まり、効かない effort (下流) を既定に戻す (`effort-unsupported`)。
  - data-model §2 (`data-model.md:35`) と research R-03 の `switchableModels` は逆向きで、effort を固定してモデルを絞る。それなのに「起動の規則と同じ」と書いている。
  - session charter の業務ルール `charter.md:188` は「上流の軸を変更したとき、無効になった下流の値は既定に戻し、UI で通知する」としている。
  - 軸の依存解決は session の Scope In (`charter.md:65`) に入っている。一方 plan.md:108 は、`switchableModels` を「provider の domain の純関数」と書いている。
  - tasks BE-004 は「起動の側が同じ関数を使える形なら寄せてよい」と書いている。起動を逆向きの関数に寄せると、起動の振る舞いが変わる。
- **同種事象探索**: `Grep "起動の規則と同じ"` 相当の記述が data-model.md:35 / research.md:26 / tasks.md:29 の 3 か所にある。
- **リスク/影響**: charter の依存解決の規則から外れていることが記録に残らない。後続の feature (X-6 の残り・I-3) が「同じ規則」と読み誤る。BE-004 の寄せ方次第で、起動の既存の振る舞いが壊れる。
- **推奨アクション**:
  - data-model §2 の記述を「起動の述語は同じだが、実行中は effort を変えられないので向きが逆 (モデルを絞る)」に直す。
  - BE-004 の「寄せてよい」は消す。
  - 置き場を `src/domain/session/` (例: `live-settings.ts`) にするか、provider に置くならその理由を plan の Domain charter の整合に書く。
- **根拠**: session charter Scope / 業務ルール
- **scope 根拠**: 設計の文書の中で直せる

### [Medium] session の操作 UI (`LiveSettingsControls.tsx`) を ui のシェルのディレクトリに置いている (M-002) (scope: feature)

- **観察**:
  - plan.md:99 は「操作 (選択肢・押せる条件・文言) は session が持つ (稼働中の一覧の行と同じ session の操作 UI)」と宣言している。
  - しかし新しい部品の置き場は `src/renderer/src/features/shell/LiveSettingsControls.tsx` になっている (tasks FE-011 / SH-011)。
  - ui charter `:110` は「他 domain の操作 UI → 各 domain が持つ」としている。先例の稼働中の行 (`RunningSessionRow.tsx`) は `features/session/` にある。
- **同種事象探索**: `Glob features/session/RunningSessionRow.tsx` は 1 件で、session の操作 UI の先例。新しい部品の置き場は `features/shell/` の 1 か所。
- **リスク/影響**: 宣言 (session が持つ) と置き場 (ui の shell) が食い違い、持ち主の判定 (charter・reviewer の発火 glob) が揺れる。
- **推奨アクション**: 部品を `features/session/LiveSettingsControls.tsx` に置き、`CenterHeader.tsx` (ui) はそれを描くだけにする。tasks FE-011 / FE-020 / FE-030 / SH-011 のパスを直す。
- **根拠**: ui charter「他 domain の操作 UI」、_overview「O-1 は session、見た目も含めて」
- **scope 根拠**: touched files の中で直せる

### [Medium] 稼働中の行の名前を Closta が持つ値だけで決めており、Claude Code の正本と食い違う 2 つの場合を扱っていない (M-003) (scope: feature)

- **観察**:
  - Registry の `name` の初期値は `null` (data-model §4.1)。表示は `name ?? フォルダ名` (§8.3)。
  - そのため、既に custom-title を持つ会話を X-9 で再開した行は、Claude Code の名前を持つのにフォルダ名で出る。編集の初期値も「無ければ空」になる (spec Clarifications)。
  - Closta の外で改名された場合も、稼働中の行は Closta の値のまま出る (spec Edge Cases、research R-13)。
  - Principle X は「矛盾したときは Claude Code 側を正とする」としている。
- **同種事象探索**: `Grep "name: null"` で、data-model.md:78 / tasks.md:37 の 2 件 (起動の初期値)。再開のときに `customTitle` を引き継ぐ記述は 0 件。
- **リスク/影響**: 過去の一覧と稼働中の行で、同じ会話の名前が違って見える。
- **推奨アクション**:
  - 過去の行からの再開では、要約行の `customTitle` (main の列挙のキャッシュにある) を registry の `name` の初期値にする。
  - それをしないなら、Principle X の Exceptions に当たる理由を spec の Edge Cases に明記する。
- **根拠**: Principle X、AD-007
- **scope 根拠**: touched files の中で直せる

### [Medium] `/clear` の後の改名は前の会話に名前を付けてしまうが、agents は既に `conversation_reset` を観測しており、塞げるのに受けている (M-005) (scope: feature)

- **観察**:
  - spec Edge Cases (`spec.md:156`) は、`/clear` の後の改名が前の会話に付くことを認めて、X-6 の後続に送っている。
  - しかし agents は O-6 から最上位の `conversation_reset` を分岐で受けている (session charter `:167-171`)。
  - 改名の受け付けの条件 (FR-010) に「リセットの後は `no-conversation`」を足すだけで、名前を別の会話に付けて利用者に見せる経路を消せる。
- **同種事象探索**: `Grep "conversation_reset"` を spec_dir に掛けると 0 件。charter:167 に既存の分岐がある。
- **リスク/影響**: 稼働中の行には名前が出るのに、その名前は表示中の会話ではなく前の会話の transcript に書かれる。業務の上で意図と異なる書き込みになる。
- **推奨アクション**: セッションスレッドが `conversation_reset` を見たら、`conversation` の message で「id 不明」を通知する。main は `hasConversation = false` にする。この feature で足すのが最小案。足さないなら、AD-062 Consequences に残余として書く。
- **根拠**: spec U-6 / FR-010、Principle X
- **scope 根拠**: touched files の中で直せる

### [Medium] AD-062 を design-gate の前に accepted にしたため、この gate の指摘で決定を直すと AD-031 の「決定の変更は後続 ADR」に当たる (M-004) (scope: feature)

- **観察**:
  - AD-062 は 2026-10-27 に夜間の規則で accepted になっている (`0062-…md:2`、`:13`)。
  - 先例の AD-036 は、design-gate の PASS の後に accepted に上げている (`0036-…md:15-19`)。
  - AD-041 には、main に入る前の ADR を再採択し、決定を本文に畳み込んだ先例がある (`0041-…md:31`)。ただしその扱いを AD-031 で明文化する件は「system follow-up」のまま残っている。
  - H-001 / H-002 を直すと、AD-062 Decision 4 (改名の子の形) と Consequences に触れる。
- **同種事象探索**: `Grep "status: accepted"` を AD-062 に掛けると 1 件。accepted を gate の後にした先例は AD-036:15 にある。
- **リスク/影響**: 指摘を直すたびに後続 ADR が要るか、AD-031 の規則を曖昧なまま運用することになる。
- **推奨アクション**: 次のどちらかを plan の「判断の承認」に明記する。
  - AD-062 の status を `proposed` に戻し、design-gate の PASS で accepted にする。
  - AD-041 の先例 (未マージの ADR の再採択) に倣う。
- **根拠**: AD-031、AD-036 の採択の経緯、AD-041:31
- **scope 根拠**: touched files (AD-062、plan) の中で直せる

### [Medium] 改名の失敗の経路と後始末に、検出するテストと観測点が足りない (M-006) (scope: feature)

- **観察**:
  - H-001 (dispose) と H-002 (改名の間の送信) を検出するテストが、tasks のどこにも無い。BE-033 / BE-034 のテストの観点に dispose も send-prompt との競合も含まれていない。
  - ログは `[session] rename ok` / `failed` だけ (§6.1 の 7)。期限・子の終わり・列挙対象が決まらない (RK-05) の区別が無く、失敗したときに原因を切り分けられない。
- **同種事象探索**: `Grep "rename failed"` で data-model.md:145 / tasks.md:84 の 2 件。どちらも理由の区別なし。
- **リスク/影響**: RK-03 / RK-05 が実機で起きたときに、原因を特定できない。
- **推奨アクション**:
  - ログに理由のキーだけを足す (例: `[session] rename failed: timeout|no-target|child-exit|rejected`)。会話の id・名前・パスは出さない。
  - BE-033 / BE-034 / BE-008 に、H-001 / H-002 を検出するテストを足す。
- **根拠**: reviewer-base H の観点、AD-034 決定 2
- **scope 根拠**: touched files の中で直せる

### [Low] AD-062 の「読み替える箇所」の表に AD-043 の行が無い (Decision 6 は AD-043 の message の種類を変えている) (L-001) (scope: feature)

- **観察**: AD-062 Decision 6 (`0062-…md:41`) は `control-result` を足す。しかし読み替えの表 (`:26-32`) には AD-043 の行が無い。先例の AD-059 は表に AD-043 の行を持っている (`0059-…md:29`)。plan.md:274 には「AD-043 の message の種類」を読み替えると書いてある。
- **推奨アクション**: 表に AD-043 の行を足す。
- **根拠**: AD-031、AD-059 の形

### [Low] `resolveLiveTranscriptTarget(record)` の記述が、移す元の関数の実体と合わない (L-002) (scope: feature)

- **観察**:
  - 移す元の `resume-service.ts:136-166` の `liveTranscriptTargetKey` は async で、注入された 4 つの依存 (`runtimes` / `enumerationTargets` / `pastResumeSource` / `providers`) を閉じ込めた関数である。
  - data-model §6.1 の 3 と tasks BE-031 は、`resolveLiveTranscriptTarget(record)` を「純粋な関数で I/O を持たない」としており、引数が record 1 つの形になっている。
- **推奨アクション**: 公開する形を `(deps, record) => Promise<string | null>` (依存を明示的に受ける) と書き直す。`services-not-to-io` から外す理由は、注入で受けることに置く。

### [Low] I-3 が昇格モードを足すときに、実行中の切り替えも capability で絞る、という前方注記が無い (L-003) (scope: system)

- **観察**: 実行中の選択肢は `SAFE_PERMISSION_MODES` の定数に固定されている (data-model §8.2)。AD-041 (c) はプリセットについて「I-3 が昇格モードを足したら再検証する」という前方注記を持つ。一方 AD-062 と charter の業務ルール (`charter.md:183-185`) には、実行中の切り替えについての同じ注記が無い。
- **推奨アクション**: 次の 2 つを足す。
  - AD-062 Consequences に「I-3 で実行中の選択肢も `isAutoModeAllowed` を通す」の 1 文。
  - FR-018 の charter の直しに、業務ルールの「X-4 時点では安全 3 値だけ」を実行中の切り替えにも広げること。

### [Low] glossary の「セッション名 (起動の軸)」と新設の「Session name (セッションの名前)」は、同じ custom-title を指す 2 つの語になる (L-004) (scope: feature)

- **観察**:
  - SH-001 と data-model §9 は、Session name を「起動のときに名前を付ける軸 (`glossary.md:1083`) とは別」と定義している。
  - しかし spec の義務の表 (`spec.md:64`) によれば、起動の軸は `title` の option で同じ custom-title を書く。
  - 識別子もばらばらで、`renameSession` (IPC)・`name` (store)・`customTitle` (SDK) が混在している。
- **推奨アクション**:
  - 正本の語を 1 つ (Session name) にする。起動の軸は「Session name を起動のときに与える軸」として相互参照させる。
  - glossary に、識別子との対応 (`name` / `customTitle`) を 1 行で書く。
- **根拠**: Principle XIV

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `dispose\|before-quit\|孤児` in specs/023 | 3 (改名の子への言及は 0) | data-model.md:89, tasks.md:37-38。比較: src/main/app/composition-root.ts:504-509, transcript-service.ts:14/106/131 |
| H-002 | `send-prompt\|プロンプトを送\|composer` in specs/023 | 12 / 5 files (`changing` の間に送信を止める規則は 0) | spec.md, plan.md, data-model.md, tasks.md (すべて「composer に触れない」) |
| M-001 | 「起動の規則と同じ」 | 3 | data-model.md:35, research.md:26, tasks.md:29 (BE-004) |
| M-002 | `features/shell/LiveSettingsControls` | 新設 1。先例 features/session/RunningSessionRow.tsx | tasks.md FE-011 / FE-020 / FE-030 / SH-011 |
| M-003 | `name: null` | 2 | data-model.md:78, tasks.md:37 |
| M-005 | `conversation_reset` in specs/023 | 0 | docs/domains/session/charter.md:167 (既存の分岐) |
| M-006 | `rename failed` | 2 | data-model.md:145, tasks.md:84 |

## Verdict

- Critical: 0
- High: 2
- Medium: 6
- Low: 4
