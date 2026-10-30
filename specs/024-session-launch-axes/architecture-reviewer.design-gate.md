# architecture-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/024-session-launch-axes/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-017 と SC-001〜SC-009 が全部対象。設計の層で効くのは、FR-002 / FR-003 (依存解決と起動ゲートの変換)、FR-007 / FR-008 (名前と registry)、FR-011 (presets 版 2)、FR-012 (再開)、FR-015 (AD-064 と pin)、FR-017 (glossary / charter)
- touched files に該当する charter / Confirmation:
  - session charter In scope `:67-70`・Journey 2 手順 3 `:110`・Journey 4 手順 2 `:133-134`・Key concepts「プリセット」`:142`・業務ルール `:190-191`・KPI「依存解決の正しさ (計測経路: E2E)」`:214`
  - AD-064 Confirmation (pin 16・起動ゲートの invalid-config・preset-store の版の表・V-1)
  - AD-041 (g)/(h)、AD-042 Decision 4、AD-059 Decision 1/4、AD-062 Decision 4
  - `_overview.md` の Cross-domain invariants I / III / IV / V / X
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (main / agents の値の検査は同 reviewer が見る)
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:1 Low:1
- D. Constitution / ADR drift: Critical:0 High:1 Medium:2 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: presets.json の版の互換は database-reviewer、文言と表示は ux / a11y-reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

`SessionLaunchConfig` に 4 キーを足し 6 キーから 10 キーにする (追加ディレクトリの folder id・ターン数の上限・費用の上限・セッション名)。`QUERY_OPTION_KEYS` は 12 から 16 にする。`additionalDirectories` は AD-041 (g) の escalation-neutral の例外で、AD-064 Decision 2 の 2 条件 (登録フォルダに限る・main が変換した値に限る) で許す。ほかに `presets.json` 版 2・再開の選び直せる軸 3 から 6・registry の名前を起動の値で初期化、を足す。

設計は domain → agents → main (infra/app) → renderer の既存のレイヤに収まっている。新しいモジュールは renderer の 2 ファイルだけ。plan / tasks / data-model / contracts は AD-064 の Decision 1〜5 と一致している。Constitution の NON-NEGOTIABLE (I〜VIII) への直接の違反は見つからなかった。以下の指摘は 3 種類: spec の FR の文面と ADR の食い違い、glossary / charter の更新の漏れ、変換の経路についての事実の誤り。

## Findings

### [High] FR-017 / data-model §10 / SH-001 / SH-010 の更新の一覧が、024 で事実と食い違う glossary と charter の記述 5 か所を漏らしている (H-001) (scope: feature)

- **観察**: data-model §10 と SH-001 / SH-010 が直すのは次の箇所だけ。
  - glossary: SessionLaunchConfig / Preset / Session name / Concurrency limit / Axis resolution
  - charter: Journey 2 / Journey 4 / Related

  一方、次の記述は 024 の後に事実と合わなくなる。
  - `docs/glossary.md:546` Launch axis「作業フォルダ / ランタイム / Provider / モデル / effort / 権限モードの 6 つ (X-4)」— 024 で 9 軸になる
  - `docs/glossary.md:949` Resume「モデル / effort / 権限モードは選び直せる」— FR-012 で追加ディレクトリと上限も選び直せる
  - `docs/glossary.md:960` Resume dialog「モデル / effort / 権限モードは今の部品と依存解決のまま」— 6 軸と名前の非表示 (§7.2) が反映されない
  - `docs/glossary.md:586` LaunchInput「options の中身は `permissionMode` と、任意の `model` / `effort` / `settings`」— 4 キーが増える
  - `docs/domains/session/charter.md:142` Key concepts「プリセット: 名前付きで保存された `SessionLaunchConfig`」— AD-064 Decision 3 で `PresetLaunchConfig` (名前を含まない 9 キー) になる
- **同種事象探索**: Grep `6 つ|6 軸|前 6|選び直せる|名前付きで保存された` を `docs/` で実行し、関係する行は 9 件。
  - 更新の一覧にあるもの: glossary.md:818 / :1107 / :1109、charter.md:134
  - 更新の一覧に無いもの: glossary.md:546 / :949、charter.md:142
  - 時点の記録で直さないもの: charter.md:273

  このほか、目視で glossary.md:960 / :586 を見つけた。
- **リスク/影響**: Principle XIV では glossary が Ubiquitous Language の正本になる。同じ PR の中で、コードの 10 キー・9 軸・再開の 6 軸と glossary の定義 (6 つ・3 つ) が食い違ったまま main に入る。後続の X-6 の分割と I-3 が glossary を読んで軸の数を誤る。
- **推奨アクション**: data-model §10 の表と SH-001 / SH-010 に次を足す。
  - glossary Launch axis を 9 軸の列挙にし、024 を Ref に足す
  - Resume と Resume dialog の選び直せる軸を 6 つ (追加ディレクトリと上限) にする。再開の形では名前を出さないことも書く
  - LaunchInput の options に `additionalDirectories` / `maxTurns` / `maxBudgetUsd` / `title` を足す (既存の漏れの `resume` も合わせて直す)
  - charter Key concepts のプリセットを「名前付きで保存された起動設定 (`PresetLaunchConfig`。セッション名を含まない)」にする
- **根拠**: Constitution Principle XIV、spec FR-017、AD-064 Decision 3 / 5
- **scope 根拠**: FR-017 が本 PR で glossary / charter を直すと定めており、touched files の範囲で直せる

### [High] FR-003 の「FR-002 を再評価し、残った folder id を変換」が、AD-064 Decision 2 / contracts C-1 / US-1 AC6 の「外す項目が 1 つでもあれば拒否」と食い違う (H-002) (scope: feature)

- **観察**: `specs/024-session-launch-axes/spec.md:188` FR-003 は「main は起動ゲートで FR-002 を再評価し、残った folder id を…変換して agents に渡さなければならない」とする。FR-002 は「通らない項目を外して通知し、起動は止めない」規則なので、FR-003 をそのまま読むと「main も黙って外して起動を続ける」になる。他の文書はすべて拒否で揃っている。
  - `docs/decisions/0064-…md:37` (Decision 2)「外す項目が 1 つでもあれば拒否」
  - `data-model.md:142`「`directoryResets.length > 0` → `invalid-config`」
  - `contracts/launch-config-v2.md:27`「未登録・変換できない → `invalid-config`」
  - spec 自身の US-1 AC6「起動は拒否され、`query()` は呼ばれない」
- **同種事象探索**: Grep `残った|外す項目が|directoryResets.length` を spec_dir で実行し、4 件。
  - 食い違うもの: spec.md:188 (FR-003)
  - 拒否で揃っているもの: data-model.md:142、plan.md:17、tasks.md:48 (BE-011)
- **リスク/影響**: 振る舞いの正本は spec の FR である (tasks の「規則の正本」)。FR-003 の文面のままでは、code-gate / pr-gate の reviewer と implementer が accepted ADR の Decision 2 に反する実装 (黙って外す) を FR に適合と判断できてしまう。main が黙って外すと、renderer で外した項目と main で外した項目が区別できない。AD-064 Decision 2 は「main は黙って外さない」ことで改ざんと状態の変化を拒否にしている。
- **推奨アクション**: FR-003 を「main は起動ゲートで FR-002 を再評価し、外れる項目が 1 つでもあれば `invalid-config` で拒否する (黙って外さない)。全項目が通れば各 folder id を選択ランタイムのパスに変換して agents に渡す」に直す。同じ文の「作業フォルダ (cwd) と同じ経路で」も M-001 に合わせて直す。
- **根拠**: AD-064 Decision 2、contracts C-1、spec US-1 AC6
- **scope 根拠**: spec.md の 1 行で直せる (feature)

### [Medium] data-model §4.2 / research R-06 の「cwd が通った起動では同じランタイムの PathMapping は確定している」は、WSL のフォルダについては事実でない (M-001) (scope: feature)

- **観察**:
  - WSL の作業フォルダの cwd は、`resolveCwd` (`src/main/app/composition-root.ts:558-559`) が WSL のフォルダなら `pathMapping` を見ずに `folder.path.value` を返して決まる。`launch-preparation.ts:232` はこの値を使う
  - 追加ディレクトリの変換は `resolveFolderRuntime` を使う (data-model §4.2)。これは第 2 段 (`src/domain/workspace/resolution.ts:140-151`) で、`hasConversionMaterial` (`src/domain/runtime/descriptor.ts:78-81`。WSL では `pathMapping !== null`) が偽のとき、WSL のフォルダでも `blocked` を返す
  - したがって次の 3 つは成り立たない: data-model §4.2 の「作業フォルダの cwd が通った起動では、同じランタイムの PathMapping は確定している」、research R-06 の「`resolveCwd` と同じ値を返す」、FR-003 の「作業フォルダ (cwd) と同じ経路」
- **同種事象探索**: Grep `resolveCwd|resolveFolderRuntime` を `src/main` で実行し、起動ゲートの経路は 2 件。WSL の cwd は `launch-preparation.ts:232` (`resolveCwd`)、Win32 の cwd は `:126` (`resolveFolderRuntime`)。設計上の食い違いは WSL の段だけにある
- **リスク/影響**: `pathMapping` が null の WSL のランタイム (probe の失敗・再検出の途中) では、作業フォルダだけなら通る起動が、WSL のフォルダの追加ディレクトリを 1 つ足すと main で `invalid-config` になる。通常は renderer 側が `probe-failed` を外し、取得中は起動を保留するので、拒否は安全側に倒れる。ただし理由は区別できない (L-004)。また BE-011 のテストの表に、この行 (WSL のランタイムの `pathMapping === null` × WSL のフォルダ) が無い。
- **推奨アクション**: 次のどちらかを data-model §4.2 に明記する。
  - (a) WSL の段は追加ディレクトリにも注入済みの `resolveCwd` を使い、名前空間はランタイムの id とする (cwd と同じ経路になる)
  - (b) `resolveFolderRuntime` を使い、`pathMapping === null` で拒否することを規則として書く

  どちらでも、BE-011 のテストの表に「WSL のランタイムの `pathMapping` が null × WSL のフォルダ」の行を足す。research R-06 と FR-003 の「同じ経路」の記述も合わせて直す。
- **根拠**: AD-064 Decision 2 (変換の経路)、Principle I (パスの生成は domain の API)
- **scope 根拠**: data-model / research / tasks の範囲で直せる

### [Medium] agents の POSIX のパスの述語が `makeRuntimePath` の規則を写しており、パスの規則の正本が 2 つになる (M-002) (scope: feature)

- **観察**:
  - data-model §5.2 と research R-07 は、`isLaunchDirectoryValue('posix', v)` の条件 (`/` 始まり・`\` なし・`.` / `..` の成分なし・制御文字なし・4096 文字以下) について「`makeRuntimePath` の規則。namespace を agents は持たないので値の規則だけを写す」とする
  - 正本は `src/domain/runtime/path-types.ts:60` (`MAX_PATH_LENGTH = 4096`) と `:106` (`makeRuntimePath`) で、`src/domain/validation.ts:96` (`MAX_PATH_VALUE_LENGTH`) にも同じ値がある
- **同種事象探索**: Grep `makeRuntimePath|4096|PATH_MAX` を `src/domain` で実行し、正本の定義は path-types.ts:60 / :106 の 2 件。値の規則の写しはまだ 0 件 (024 で新しく作られる)
- **リスク/影響**: AD-004 / Principle I は、ランタイムの名前空間のパスを `makeRuntimePath` で作ることを求めている。規則を写すと、`makeRuntimePath` の規則が変わったとき agents の再検査だけが古いまま残り、main が作った値を agents が誤って拒否する (またはその逆の) 食い違いが黙って生じる。
- **推奨アクション**: `path-types.ts` から名前空間を取らない値の述語 (例 `isRuntimePathValue(raw)`) を出し、`makeRuntimePath` 自身もそれを使う形にする。`isLaunchDirectoryValue('posix', …)` はその述語を呼ぶ。もう 1 つの方法として、WSL の spec の distro から `wslNamespace` を作って `makeRuntimePath` をそのまま呼んでもよい。BE-003 のテストには、`makeRuntimePath` と同じ入力表を両方に通す往復の行を足す。
- **根拠**: Constitution Principle I、AD-004
- **scope 根拠**: domain の 2 ファイルの範囲

### [Medium] charter KPI「依存解決の正しさ」の計測経路は E2E だが、新しい軸の reset (追加ディレクトリを外して通知) が E2E に載らない (M-003) (scope: feature)

- **観察**: `docs/domains/session/charter.md:214` は「依存解決の正しさ: 上流の軸を変えたとき無効値が既定に戻り通知される — 計測経路: E2E」とする。024 は依存解決に `directoryResets` を足す (FR-002)。しかし E2E のタスクは成功の経路だけを見ている (tasks.md:54 の FE-012、:67 の FE-022、:80 の FE-031、:93 の FE-042)。reset の通知は component テスト (FE-010) と表のテスト (SC-002) だけで確かめる。
- **同種事象探索**: Grep `通知` を tasks.md の E2E のタスク 4 件で見て、reset の通知を E2E で確かめる行は 0 件
- **リスク/影響**: charter の KPI の計測経路に、本 feature で足す依存解決の分岐が入らない。KPI を E2E で測ると決めた charter の不変条件 (ARCH-2) が新しい軸の分だけ崩れる。
- **推奨アクション**: FE-012 に 1 本足す。WSL のフォルダを追加ディレクトリに選んでからランタイムを Win32 に切り替え、通知が出て起動が押せることを確かめる (US-1 AC3 の E2E)。偽の capability が `resolveFolderRuntime` に null を返す (`src/main/app/e2e-capability.ts:695`) なら、step 3 (distroName の不一致) で判定できる組み合わせを使う。
- **根拠**: session charter KPI「依存解決の正しさ」
- **scope 根拠**: tasks の E2E の範囲

### [Low] plan の基準のコミット (main 7f6ef94) と作業ツリー (O-13 / AD-065 を含む 97f4b86 の上) が食い違い、行番号が古い。AD-065 が Related ADRs に無い (L-001) (scope: feature)

- **観察**:
  - plan.md:3 と plan.md:43 は「main 7f6ef94 の上」で行番号を引いている。しかし枝は 461cef8 (O-13 #32) と 97f4b86 の上にある
  - 例: plan と tasks BE-030 の `session-launch-service.ts` `name: null` `:454` は、今は `:531`
  - AD-065 は `session-launch-service` の `Entry` (`liveModels`) と起動ダイアログ (`PERMISSION_MODE_DESCRIPTIONS` の削除) に触れたが、plan の Related ADRs と申し送りの照合に入っていない
- **同種事象探索**: Grep `name: null` を session-launch-service.ts で実行し、1 件 (:531)
- **リスク/影響**: tasks は「ずれていたら Grep で引き直す」としているので実害は小さい。ただし申し送りの照合 (plan の #1〜#44) は 025 の差分を見ていない。
- **推奨アクション**: plan の基準を 97f4b86 に直し、Related ADRs に AD-065 (関係なし・触れる箇所の確認だけ) を 1 行足す。
- **根拠**: AD-065
- **scope 根拠**: plan の範囲

### [Low] AD-064 に、I-3 で昇格モードが入ったときの追加ディレクトリの書き込みの範囲についての前方注記が無い (L-002) (scope: out-of-scope)

- **観察**: AD-064 Decision 2 (`docs/decisions/0064-…md:37`) は「書き込みは今どおり権限モードと承認で決まる」で閉じている。しかし `acceptEdits` などの昇格モード (I-3) では、Claude Code の作業ディレクトリの扱いにより、追加ディレクトリの中の編集も承認なしで通る。AD-041 (c) はプリセットについて同じ形の前方注記を置いている (`0041-…md:64`)。
- **同種事象探索**: Grep `additionalDirector|追加ディレクトリ` を `docs/decisions` で実行し、AD-041:136 と AD-064 の複数行が当たる。I-3 への言及は 0 件
- **リスク/影響**: 将来の仮定の経路なので Low。I-3 の design で見落とすと、昇格モードの有効範囲が作業フォルダの外に広がることが評価されない。
- **推奨アクション**: AD-064 の Consequences に「I-3 が昇格モードを足すときは、追加ディレクトリを含めた範囲で capability の判定を見直す」を 1 文足す (accepted の後なので、AD-031 に照らして決定の変更ではない注記として扱えるか確認する。扱えなければ I-3 の ADR に預ける)。roadmap の I-3 の行にも申し送る。
- **根拠**: Principle III、AD-041 (c)
- **scope 根拠**: I-3 の ADR で扱う領域

### [Low] 新しい概念 (`DirectoryReset`・`PresetLaunchConfig`・追加ディレクトリ) が glossary の独立した項になっていない (L-003) (scope: feature)

- **観察**: SH-001 は Axis resolution と Preset に追記するだけである。`DirectoryReset` (既存の `AxisReset`「軸の reset」と別の型) と `PresetLaunchConfig` が canonical term として glossary に入らない。
- **同種事象探索**: Grep `DirectoryReset|PresetLaunchConfig` を `docs/glossary.md` で実行し、0 件
- **リスク/影響**: 「軸の reset」と「追加ディレクトリの項目の除外」が同義語のように使われる余地が残る (Principle XIV「新規用語は glossary 追記」)。
- **推奨アクション**: SH-001 で Launch blocker の Counterexamples の隣に「Directory reset (追加ディレクトリの除外)」の項を足す。Preset の項には型名 `PresetLaunchConfig` を書く。
- **根拠**: Principle XIV
- **scope 根拠**: glossary の範囲

### [Low] 追加ディレクトリの拒否がすべて `invalid-config` の 1 キーに畳まれ、原因を区別する観測点が無い (L-004) (scope: feature)

- **観察**: data-model §4.1 / §4.2 と BE-011 では、未登録・到達不可・名前空間の不一致・`directoryResets` のどれも `invalid-config` を返す。ログも `logRejection` が理由のキーだけを出す (`launch-preparation.ts:99-101`)。M-001 の経路もここに落ちる。
- **同種事象探索**: Grep `reject('invalid-config')` を launch-preparation.ts で実行し、既存は 7 件 (:121 / :123 / :132 / :163 / :210 (分岐) / :224 / :258)。024 で少なくとも 2 件増える
- **リスク/影響**: 実機 (quickstart V-1) で起動が拒否されたとき、追加ディレクトリが原因か、ほかの軸の不一致かを切り分けられない。
- **推奨アクション**: 値を出さない内部の理由キー (例 `additional-directory-unresolved`) をログにだけ出す。IPC の理由のキーは `invalid-config` のまま。`logRejection` の注入は値を渡さない形を保つ。テストで、ログにパスの目印が 0 件であることと内部キーが出ることを確かめる。
- **根拠**: reviewer-base H (observability)
- **scope 根拠**: launch-preparation.ts の範囲

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `6 つ\|6 軸\|前 6\|選び直せる\|名前付きで保存された` (docs/) | 9 (関係分) | docs/glossary.md:546, :818, :949, :1107, :1109; docs/domains/session/charter.md:134, :142, :273; ほかに目視で glossary.md:960, :586 |
| H-002 | `残った\|外す項目が\|directoryResets.length` (spec_dir) | 4 | spec.md:188 (食い違い); data-model.md:142; plan.md:17; tasks.md:48 |
| M-001 | `resolveCwd\|resolveFolderRuntime` (src/main) | 2 (起動ゲート) | src/main/app/launch-preparation.ts:126, :232; composition-root.ts:558 |
| M-002 | `makeRuntimePath\|4096\|PATH_MAX` (src/domain) | 2 (正本) | src/domain/runtime/path-types.ts:60, :106 |
| M-003 | E2E タスクの reset 通知 | 0 | tasks.md:54, :67, :80, :93 |
| L-001 | `name: null` (session-launch-service.ts) | 1 | src/main/app/session-launch-service.ts:531 |
| L-002 | `additionalDirector\|追加ディレクトリ` (docs/decisions) | I-3 への言及 0 | docs/decisions/0064-…md:37, :46 |
| L-003 | `DirectoryReset\|PresetLaunchConfig` (glossary) | 0 | — |
| L-004 | `reject('invalid-config')` (launch-preparation.ts) | 7 | src/main/app/launch-preparation.ts:121, :123, :132, :163, :210, :224, :258 |

## Verdict

- Critical: 0
- High: 2
- Medium: 3
- Low: 4
