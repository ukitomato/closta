# architecture-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-06 (design-gate R4。status=implementing での再実行)
**Reviewer**: architecture-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 4

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-017 / FR-018: Thread search、一致の規則 (`features/search/`)、過去の区画の並び、サイドバーの基準画像
  - FR-003〜FR-005: 会話内検索 (navigator・`revealMessage`・Highlight API・Ctrl+F)
  - FR-006 / FR-007: Command palette (`paletteOpen`・`watchedIdOf`・`select` / `sessions.select`)
  - FR-008: Empty state
  - FR-009〜FR-013: 起動元と `launch-usage.json`。R4 で変わったのは FR-009 (H-04 の手当て。spec.md:265-266)、FR-010 (数える単位。spec.md:271)、FR-016 (KPI の判定期間の注記。spec.md:303)
  - FR-014: AD-045、XV の MINOR 改定、composer の文言
  - FR-015: ui-coverage の F 節
  - FR-016: roadmap / charter / glossary / _overview の追随
  - SC-001〜SC-008: 全件。R4 の差分が当たるのは SC-005 (AC1〜AC8。spec.md:336)
- touched files に該当する charter / Confirmation:
  - session charter: Mission :36、KPI「再利用率」:163-164、Cross-domain dependencies :168-171
  - ui charter: Cross-domain dependencies / 面の状態 :163-180、KPI「スクロールの安定」:157-160
  - `_overview.md`: 帰属の判断根拠 :80-103、依存関係 :122-136、Cross-domain invariants :138-154
  - glossary: Launch notice :424-430、Shell :851-871
  - Constitution: 改定手順 :315-327、VIII :589-615、XIII :789-822、XIV :829-838、XV :843-858、Governance :984-986
  - ADR:
    - AD-045 Decision 2/3・Consequences :34-36・Confirmation :45-48
    - AD-046 Decision 4/6・Alternatives :50・訂正 :57-72
    - AD-041 (h) :148・採択の経緯 :31・記録 :172
    - AD-038 D5 :85-88
    - AD-037 D1 :134-140
    - AD-034 §1 :48-49
    - AD-033 実測結果 §1 :50
    - AD-031 Decision 1 :97-120
    - AD-023 §7 :327-354・Consequences :380-381
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の領域
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の領域
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:2 Low:3
- D. Constitution / ADR drift: Critical:0 High:0 Medium:4 Low:3
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の領域
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の領域。M-105 の循環は `.dependency-cruiser.js:77-81` の `no-circular` (モジュール単位) には掛からないので、lint が拾う指摘ではない
- G. optional reviewer 範囲: 該当なし: 永続化スキーマは database-reviewer、F 節の判断は ui-coverage-reviewer の領域
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

R3 から R4 までに designer が直したのは 3 か所です。どれも利用者の選択によるもので、spec の Clarifications 2026-10-06 (spec.md:96-100) に記録されています。

- gate H-04 (本 reviewer の R3 H-201): 案 (a) を採った。引き継いだ起動元は「適用せず、軸も手で変えずに」起動したときだけ使い、適用せずに軸を手で変えたら `manual` にする
  - 直した箇所: spec.md:181 (AC8)・:265-266 (FR-009)、data-model.md:243-254、research.md:80、plan.md:197、tasks.md:97-98 (FE-040)
- gate M-13: 数える単位を「受け付けた起動の要求」にした (spec.md:271、data-model.md:223)
- gate M-01: KPI の判定期間を「プリセットの欄の直近 30 日」にし、最低件数と判定の時期は持たないことにした (spec.md:303、data-model.md:263)

R3 で本 reviewer が出した Medium 8 件と Low 5 件は、どの文書にも手当てがありません。根拠のコードと docs の事実も今回 Read / Grep で確かめ直しましたが、R3 から変わっていません。

**gate H-04 (本 reviewer の R3 H-201) は解消したと判定します。** 根拠は次の観察事実です。
- 軸を変える経路は `LaunchDialog.tsx:305-320` の `update` 1 つだけ。軸の `onChange` 6 か所 (`:431,:485,:502,:550,:569,:589`) はすべて `update` を呼び、`setDraft` は `update` と `applyPreset` の中 (`:315,:319,:326`) にしか無い。したがって「手で変えた」の印は取りこぼされない。
- `applyPreset` (`:323-327`) は `update` を通らない。適用を「手で変えた」に数えない、という規則と食い違わない。
- ダイアログは拒否・失敗のたびに作り直される (`LivePane.tsx:55-60`。`launching` の間は `<Launching/>` に差し替わる)。2 つの印はダイアログごとの `useState` なので、データモデルの「作り直すと消える」(data-model.md:253) と合っている。
- 帰結: 1 回のアプリの起動の中でも、軸を 1 つ手で変えれば必ず `manual` を作れる。R3 で挙げた「1 度プリセットを適用すると、アプリを閉じるまで `preset` に固定される」偏りは、構造の上で起きなくなった。
- この規則は FE-040 のテストで固定される (tasks.md:98)。対象は「preset → 軸を変えて manual」「preset → manual → 初期値のまま manual → 適用して preset の並び」「変えて元に戻すと manual」「自動の reset だけでは manual にならない」。
- 残るのは「前回の設定を変えずに起動し直すと、前回の起動元を引き継ぐ」ことだけ。これは R2 H-02 の意図どおりで、利用者が選んだ規則である。この規則が KPI と用語の定義の正本に書かれない点だけを、新規の Low (L-301) として挙げる。

accepted ADR は 46 本です。
- 今回全文を読んだもの: AD-023 / 031 / 034 / 037 / 041 / 045 / 046
- 一部を読んだもの:
  - AD-038: D1〜D5
  - AD-033: 実測結果 §1〜§2
  - AD-044: 節の見出し
- R4 で変わった起動元の規則・数える単位・判定期間に関わりうるものは、Grep で決定上の制約が無いことを確かめた。
  - AD-036: 起動の invoke の契約
  - AD-043: 拒否理由。中身は `agent-session.ts:70-79` で確かめた
- 残りの ADR は R3 で概念の Grep をかけ、関わらないことを確かめている。今回の差分はそれらの領域に触れていない。

## Findings

### [Medium] 本 feature は、面の状態を読む集合と、ui と session の間の呼び出しを広げる。それを定義する glossary・ui charter・session charter の 3 か所が、FR-016 の追随の対象に入っていない (M-101) (scope: feature) [unresolved from prev (gate M-16 / arch R3 M-101)]

- **観察**:
  - 本 feature が足すもの:
    - `watchedIdOf` に `!paletteOpen` を足す (data-model.md:182、spec.md:245)
    - chat から `RunningSessionsView.revealMessage` を呼ぶ (data-model.md:129)
    - palette から `select` / `sessions.select` を呼ぶ (spec.md:248)
    - session-list が `features/search` を import する (plan.md:36)
  - 定義が古いまま残る箇所:
    - glossary.md:865-866: 「設定のダイアログも起動ダイアログも開いていないとき」とし、正本を 013 data-model §1 に置く
    - ui charter:166-167: 読む集合は「focus と設定・起動ダイアログの開閉」
    - session charter:171: 逆向きの呼び出しは `dismissLaunchNotice` だけ
  - SH-001 (tasks.md:15) と SH-041 (tasks.md:104) が直すのは、新しい用語と、ui charter「面の状態」の palette の `select` の例外だけである。session charter の逆向きの呼び出し・読む集合の `paletteOpen`・`revealMessage`・ui charter の「依存される domain: なし」(:166) は、R3 から変わっていない。
- **同種事象探索**:
  - `watchedId|見ているセッション` (docs の定義の文): 3 件。glossary.md:865-866 / ui charter:167 / AD-046:63。AD-046:63 は記録なので直す対象外
  - `dismissLaunchNotice` (charter の逆向きの集合): 2 件。session charter:171 / ui charter:179
- **リスク/影響**: Principle XIV の canonical な定義が実装と食い違う。また、ui と session の境界の集合を charter から読めなくなる。
- **推奨アクション**: SH-001 / SH-041 に次を足し、quickstart V-2 に確認の行を足す。
  - glossary: `watchedId` の条件に palette を足し、正本の参照先を ui charter「面の状態」に移す
  - ui charter: 読む集合に `paletteOpen`。依存の行に「session の過去の一覧が ui の一致の規則を使う」。面の状態の例外に chat の `revealMessage`
  - session charter: 読む集合に `paletteOpen`。逆向きの呼び出しに `select` / `sessions.select` と `revealMessage`
- **根拠**: Principle XIV、ui charter Cross-domain dependencies、AD-046 訂正の節 :69-72
- **scope 根拠**: glossary と 2 つの charter は FR-016 の touched files

### [Medium] perf の実機計測が、KPI「再利用率」の計測経路に `manual` の起動を混ぜる (M-102) (scope: feature) [unresolved from prev (gate M-19 / arch R3 M-102)]

- **観察**:
  - 記録から外すのは E2E の偽の capability だけである (spec.md:201, :273、data-model.md:273-275)。
  - `perf/real-sessions.spec.ts` の動き:
    - `CLOSTA_E2E` を拒み、取り除いて (`:12,166,179-185`)、本物の composition で起動する
    - ユーザデータを分ける指定は無い (`setPath` は src/main に 0 件。userData の取得は `composition-root.ts:107` だけ)
  - R4 の FR-009 では、perf の起動 (軸を手で選ぶ) は `manual` に数えられる。
  - SH-040 / SH-041 (tasks.md:103-104) の O-8 の行と session charter の計測経路の注記に、この扱いが無い。
- **同種事象探索**: `CLOSTA_E2E|userData|_electron` を `perf/real-sessions.spec.ts` で検索して 6 件 (`:3,12,23,24,166,179,182,185` のうち起動と env の行)。src/main の `setPath` は 0 件。
- **リスク/影響**: O-8 は perf を繰り返し流す前提の feature である。その計測が、session charter の KPI の判定 (直近 30 日の 2 つの回数) を合成の負荷で汚す。最低件数を持たないと決めたので (spec.md:303)、混ざった数がそのまま判定に効く。
- **推奨アクション**: SH-040 の O-8 の行と SH-041 の session charter の計測経路に、次のどちらかを書く。
  - 「perf の起動は `manual` として数えられる。O-8 は計測用のユーザデータを分けるか、判定から外す手順を持つ」
  - 計測の後に記録を除く方法を discovery に書く
- **根拠**: session charter KPI「再利用率」、AD-041 (h)、ARCH-6
- **scope 根拠**: roadmap / session charter / discovery は FR-016 の touched files

### [Medium] Constitution XV の改定の中身が design に無い。AD-045 Consequences の文案のままだと、Decision 3 の例外と Verification が抜ける (M-103) (scope: feature) [unresolved from prev (gate M-20 / arch R3 M-103)]

- **観察**:
  - SH-042 (tasks.md:105) と plan.md:70 は「AD-045 Decision 2 に合わせて MINOR で改め」とだけ書く。
  - AD-045 Consequences (`0045:34`) の文案には例外が無い。一方で Decision 3 (`0045:29`) は `target-finder.ts:92,99` の 2 本を据え置く。Governance (constitution.md:984-986) は、食い違えば Constitution を正とする。
  - XV (constitution.md:843-858) には Verification 節が無い。AD-045 Decision 2 が委ねる ux-reviewer は、次の理由で働かない。
    - UX-6 (`ux-reviewer.md:49-51`) は「i18n key の命名規約」の観点である。
    - `reviewers.yml:115-117` は設定の画面の 3 ディレクトリをコメントアウトしたままである。
    - `reviewers.yml:102-103` は「新しい手書きの element を足したらここにも足す」と定める。これに対し、plan.md:234 は「reviewers.yml は変えない」とし、plan.md:282 は registry の element を取り込みうるとする。
- **同種事象探索**:
  - `候補 #|\(#\$\{` を `target-finder.ts` で検索して 2 件 (`:92,99`)。`:96` はコメント
  - ux-reviewer の対象外で、設定のダイアログが描く feature: 4 (`reviewers.yml:115-117` と provider)
- **リスク/影響**: 改定した日から、XV に例外の書かれていない違反が 2 本ある状態になる。また、足す規則「直書きを新たに増やさない」は、設定の 4 画面と、取り込んで手を入れた element では検証者が起動しない。
- **推奨アクション**:
  - FR-014 / SH-042 に、XV の改定の文の 3 要素を書く。
    - (1) Decision 2 の規則
    - (2) Exceptions: target-finder の 2 本 (AD-045 Decision 3)
    - (3) Verification: Manual は ux-reviewer。基準線は AD-045 (M-104 の置き場)。Automated は無し
  - UX-6 を文言の表と基準線の規則に合わせる。
  - reviewers.yml に、設定の 4 ディレクトリと、取り込んで手を入れた element を足す。足さないなら理由を書く。
  - quickstart V-2 に確認の行を足す。
- **根拠**: Constitution 改定手順 :315-327・Governance :984-986、AD-045 Decision 2/3・Consequences
- **scope 根拠**: Constitution / reviewer の定義 / reviewers.yml は SH-042 の範囲

### [Medium] AD-045 の `## Confirmation` に基準線を in-place で書き足す計画が、AD-031 の in-place の規則 (「訂正」節) の外にある (M-104) (scope: feature / 一部 system) [unresolved from prev (gate M-17 / arch R3 M-104)]

- **観察**:
  - 件数を AD-045 の Confirmation に書くとしている箇所: SH-002 (tasks.md:16)、plan.md:155 (#16)・:205・:268、quickstart.md:16
  - AD-031 Decision 1 (`0031:99-100`) が in-place で認めるのは、日付つきの「訂正」節だけである。Constitution 改定手順 1 (constitution.md:319-323) は AD-031 に従う、と定める。
  - 先例の AD-041 は「記録」節を別に立てた (`0041:31,172`)。その扱いの明文化は system follow-up とされたが、登録先が無い。
- **同種事象探索**: accepted ADR の、訂正以外の in-place 追記は 3 件 (`0034:95` / `0041:172` / `0046:70`)。どれも別の節か日付つきの追記で、Confirmation の箇条を書き換えたものは 0 件。
- **リスク/影響**: drift の判定の基準 (Confirmation) が、日付も出所も無く後から変わる先例になる。
- **推奨アクション**:
  - SH-002 を次の形に直し、V-2 も合わせる: 「Confirmation の後ろに `## 記録 (2026-10-xx / O-3 SH-002)` を立て、数え方と件数を書く。Confirmation の箇条は変えない」
  - 「記録」節の明文化を、roadmap の system-scope に持ち主つきで登録する。
- **根拠**: Constitution 改定手順 1、AD-031 Decision 1、AD-041 :31
- **scope 根拠**: 置き場の形は本 feature で決められる。AD-031 の明文化は system の範囲

### [Medium] `features/search/` と `revealMessage` の配線で、renderer の feature の間に双方向の依存が 2 組できる (M-105) (scope: feature) [unresolved from prev (gate M-21 / arch R3 M-105)]

- **観察**:
  - (a) search と session-list:
    - `features/search/session-search.ts` は session-list の `groupLabelOf` を使う (data-model.md:39、tasks.md:26)。
    - `SessionListScreen` は `features/search` を import する (plan.md:36,180)。
  - (b) chat と session:
    - chat の provider が `RunningSessionsView.revealMessage` を呼ぶ (data-model.md:129、tasks.md:61)。
    - 注入するのか import するのかは、どこにも書かれていない (plan.md:185,187)。
    - 今の向きは session → chat だけである (本番のファイル 3 件)。
  - AD-023 Consequences (`0023:380-381`) は ui の内部構成を「M3 で肥大したら再検討」としている。新しい共有のディレクトリを作るのは、M3 のこの時点である。
- **同種事象探索**:
  - `from '@/features/(session|shell|session-list|search)/` を `features/chat` で検索して 1 件 (`useTranscript.ts:9` → session-list)
  - `from '@/features/chat/` を `features/session` の本番のファイルで検索して 3 件 (`LivePane.tsx:11` / `running-session-store.ts:10` / `session-event-decoder.ts:8`)
  - `from '@/features/(chat|search|shell)/` を `features/session-list` で検索して 0 件
- **リスク/影響**:
  - 共有の土台 (`features/search`) が、その利用者の 1 つ (session-list) に依存する。
  - モジュール単位の循環にはならないので、depcruise の `no-circular` は検出しない。後から feature の間の向きの規則を入れるときに、規則を緩めて通すことになる。
- **推奨アクション**:
  - `features/search/` は、他の feature を import しない `text-search.ts` だけにする。
  - 行の対象は `features/session-list/session-search.ts` に、稼働中の対象は `features/shell/palette-commands.ts` に置く。
  - `revealMessage` は `RunningCenter` (shell) から provider に props で渡す。
  - plan の「レイヤ」に、この 2 つの向きを書く。
- **根拠**: AD-023 §7・Consequences、ARCH-4
- **scope 根拠**: 置き場と配線は本 feature で決められる

### [Medium] 新しい基準画像 (サイドバーの過去の区画) を CI の artifact から取るが、人が目で見て承認した記録を残す手順が無い (M-201) (scope: feature) [unresolved from prev (gate M-27 / arch R3 M-201)]

- **観察**:
  - FR-018 (spec.md:308-311) と SH-010 (tasks.md:47) は、基準画像を CI の artifact から取るとするが、承認の手順を持たない。FE-004 (tasks.md:29) も取り直して理由を書くだけである。
  - quickstart V-1〜V-3 (quickstart.md:5-30) に、基準画像の承認の行は無い。
  - AD-038 D5 (`0038:85-88`) は「初回基準画像の視覚的妥当性の判断は人間 deferred とし quickstart に記録する」と定める。Constitution VIII (constitution.md:613) も「残るのは人間の最終 aesthetic 承認」とする。
- **同種事象探索**: `基準画像` を `specs/**/quickstart.md` で検索して 4 件。承認を定めた行は 2 件 (`006 quickstart.md:25-26` / `013 quickstart.md:24`)。012 は 0 件。
- **リスク/影響**:
  - CI の最初の描画を誰も見ずに基準にすると、崩れた並びがそのまま固定される (6rem の中に固定の要素があふれる懸念。gate M-07)。
  - SC-008 の「基準画像の比較が CI で通る」が、自分自身を基準にした判定になる。
- **推奨アクション**:
  - quickstart V-3 (または V-4) に次を足す: 「CI の artifact から取ったサイドバーの基準画像を見て、全角の並び・切り詰め・グループの見出し・検索欄を承認し、quickstart-results に記録する」。composer の基準画像を取り直したときも同じにする。
  - SH-010 / FE-004 に「承認の後に commit する」を足す。
- **根拠**: AD-038 D5、Constitution VIII Verification、006 / 013 の先例
- **scope 根拠**: quickstart / tasks / SC は本 feature の文書

### [Medium] window の capture で受ける Ctrl+F には、IME の回帰を見る E2E が無い (M-106) (scope: feature) [unresolved from prev (gate M-18 / arch R3 M-106)]

- **観察**:
  - Ctrl+F は provider が window の capture で受ける (data-model.md:153)。
  - E2E に足すのは次の 2 ケースだけで、R3 から変わっていない。
    - 検索のバーで変換中の Enter (SH-020。tasks.md:67)
    - composer で変換中の Ctrl+K (SH-030。tasks.md:80)
  - plan.md:216,245 (RK-06) は、jsdom では発火の順を再現できないので E2E で確かめるとする。
  - 「composer で変換中の Ctrl+F」を見るのは、jsdom (FE-026) と V-3 の目視 (quickstart.md:25) だけである。
  - AD-037 D1 (`0037:134-140`) は、回帰を E2E で固定するとしている。
- **同種事象探索**:
  - `addEventListener\(['"]keydown` を `src` で検索して 1 件 (`components/image.tsx:298`)。本 feature で window の capture の受け手が 2 つ増え、E2E で覆うのはそのうち 1 つ
  - `ime.spec.ts` の既存のケースは 3 件 (`:56,76,93`)
- **リスク/影響**: 変換中の判定 (229 など) を誤ると、composer の IME を壊しても CI は緑のままになる (Principle VIII は NON-NEGOTIABLE)。
- **推奨アクション**: SH-020 に「composer で変換中に Ctrl+F を押しても検索が開かず、変換が確定できる」を足す。足さないなら、RK-06 に AD-037 D1 からの逸脱として書く。
- **根拠**: Constitution VIII Verification、AD-037 D1
- **scope 根拠**: `e2e/ime.spec.ts` は touched files

### [Medium] 会話内検索の 1 回の全件の走査に、合否の上限が無い (M-107) (scope: feature) [unresolved from prev (gate M-09 のうち本 reviewer の分 / arch R3 M-107)]

- **観察**:
  - 走査の頻度は、SC-002 (spec.md:333) と data-model.md:114-117 の構造の条件で手当て済みである。
  - 一方で、次の 2 つの場面では、書記素ごとに NFKC する走査 (data-model.md:13) が全件を同期で回す。分割の規定も、long task の上限も無い。
    - 最初の語 (cache が空)
    - 過去ログの再取得 (data-model.md:116)
  - 1,000 メッセージの走査の時間は参考値で、合否に使わない (spec.md:333、plan.md:248 RK-09)。想定の規模は数千メッセージである (plan.md:28)。
- **同種事象探索**: 全件の走査の間に処理を譲る規定は 0 件。走査の時間を合否に使わない記述は 2 件 (spec.md:333 / plan.md:248)。
- **リスク/影響**: 長いセッションの最初の検索で、描画スレッドが塞がる。AD-034 §1 (`0034:48-49`「renderer 描画スレッドを重い変換で塞がない」) と ui charter KPI「スクロールの安定」に反しても、gate は通る。
- **推奨アクション**: 次のどちらかを data-model §2 / SC-002 に書く。
  - 全件の走査を N 件ごとに処理を譲る形にし、1 回に処理する件数を呼び出しの回数で判定する
  - quickstart V-3 に「数千メッセージで long task (50ms 超) が 0」を合否として置く
- **根拠**: AD-034 §1、ui charter 業務ルール・KPI「スクロールの安定」
- **scope 根拠**: SC / data-model / quickstart は本 feature の文書

### [Low] `_overview.md` の「帰属の判断根拠」に、O-3 と O-8 の理由を足す予定が無い (L-101) (scope: feature) [unresolved from prev (gate L-17 / arch R3 L-101)]

- **観察**:
  - 足すべき理由は 2 つある。
    - O-3: ui の feature が、session の UI・起動の IPC・永続化を変える (U-2 / U-5)
    - O-8: domain を session にした
  - SH-040 (tasks.md:103) が `_overview.md` で直すのは、申し送り #12 (題と M3 の範囲) だけである。
- **同種事象探索**: `_overview.md:80-103` の見出しの行は 8 件で、O-3 / O-8 / O-9 は 0 件。
- **リスク/影響**: 後から domain の境界を読む人が、例外の理由を spec 012 の U-5 まで辿ることになる。
- **推奨アクション**: SH-040 に、帰属の判断根拠を 2 行足す作業を加える。
- **根拠**: `_overview.md` の運用、AGENTS.md (domain の分解は人間の承認)
- **scope 根拠**: `_overview.md` は FR-016 の touched files

### [Low] spec は「AD-046 Decision 6 の語彙で書く」としながら、その語の集合に無い置き場を使っている (L-102) (scope: feature) [unresolved from prev (gate L-18 / arch R3 L-102)]

- **観察**:
  - spec.md:35 の「アプリ全体のダイアログ」と「起動ダイアログのプリセットの欄」は、Decision 6 (`0046:34`) の集合に無い。
  - 「中央のヘッダの下に検索のバー」(data-model.md:110) が、中央のヘッダと中央の本体のどちらに属するのかが決まっていない。
  - glossary の中央のヘッダ (glossary.md:857) に、検索のボタンが無い。
- **同種事象探索**: Decision 6 の外の置き場の語が 3 件 (spec.md:35 の 2 件、data-model.md:110)。
- **リスク/影響**: O-4〜O-6 が中央のヘッダに表示を足すときに、検索のバーとの帰属が曖昧になる。
- **推奨アクション**:
  - SH-001 で、glossary の Shell に palette (全面のモーダル) と中央のヘッダの検索のボタンを足す。
  - 検索のバーの帰属を data-model §2 に 1 語で書く。
- **根拠**: AD-046 Decision 6、Principle XIV
- **scope 根拠**: glossary / spec / data-model は本 feature の文書

### [Low] palette は新しい全面のモーダルだが、AD-046 Decision 4 の「モーダルの間は外部コンテンツを隠す」の列挙に入る道筋が無い (L-103) (scope: feature) [unresolved from prev (gate L-19 / arch R3 L-103)]

- **観察**:
  - palette は Radix のモーダルである (data-model.md:184)。
  - Decision 4 (`0046:30`) は、隠す対象のモーダルを「設定・起動・承認」と列挙する。
  - plan.md:150 (申し送り #11) は、OPT-panel の行を「該当なし — 変えない」としている。
- **同種事象探索**: `モーダル \(設定・起動・承認\)` を docs で検索して 3 件 (`0046:30` / `roadmap.md:377` / `prompts.md:312`)。
- **リスク/影響**: OPT-panel の実装が列挙を字面どおりに読むと、palette を開いている間もネイティブのビューが DOM の上に描かれる。
- **推奨アクション**: SH-040 で、roadmap:377 と prompts.md:312 に「palette (O-3) も含める (判定は `[aria-modal="true"]`)」と注記する。
- **根拠**: AD-046 Decision 4
- **scope 根拠**: roadmap / prompts は FR-016 の touched files

### [Low] research R-04 は standalone の element を採る案だが、AD-033 の「standalone は採らない」との関係を書いていない (L-104) (scope: feature) [unresolved from prev (gate L-20 / arch R3 L-104)]

- **観察**:
  - research.md:53,59 は、standalone の command-palette / conversation-search を、採る条件を満たせば使うとする。
  - AD-033 (`0033:50`) は「standalone は採らない」と書く。
  - plan.md:91 の AD-033 の行は、仮想化の根拠としてしか挙げていない。
- **同種事象探索**: `standalone は採らない` を docs で検索して 1 件 (`0033:50`)。
- **リスク/影響**: 字面だけを読むと、accepted ADR に反する採用に見える。pr-gate で同じ問いが繰り返される。
- **推奨アクション**: R-04 と plan の AD-033 の行に、次の 1 文を足す: 「AD-033 の答えは Thread を runtime につなぐ部分のもので、props で動く部品は先例 (`empty-state.tsx`) として採っている」
- **根拠**: AD-033 実測結果 §1、AD-019、Principle XIII
- **scope 根拠**: research / plan は本 feature の文書

### [Low] AD-046 の「稼働中と過去を混ぜるかは O-3 の Thread search の後に再検討」を design の時点で閉じ、completed の 013 spec に結論を書く (L-105) (scope: feature) [unresolved from prev (gate L-07 / arch R3 L-105)]

- **観察**:
  - spec.md:306、plan.md:158 (#19)、SH-041 (tasks.md:104) は、結論「混ぜない」を 013 spec に書く。
  - AD-046 は、運用上の正本を ui charter とする (`0046:69`)。
- **同種事象探索**: `O-3 の (Thread search の)?後に再検討` で 2 件 (`0046:50` / `013 spec.md:58`)。
- **リスク/影響**: 結論が、ADR を読む人の辿らない completed の spec に入る。再検討の時機も「Thread search の後」から design の時点に前倒しになる。
- **推奨アクション**:
  - 結論は ui charter か roadmap に置き、013 には日付つきの参照だけを書く。
  - V-3 の 50 件以上の行 (quickstart.md:28) で確かめた後に確定する、と書き添える。
- **根拠**: AD-046 Alternatives・訂正の節 :69、AD-031
- **scope 根拠**: ui charter / roadmap / 013 の参照は FR-016 の範囲

### [Low] 起動元の引き継ぎ (`lastOrigin`) が、glossary と session charter の定義に入る予定が無い (L-301) (scope: feature) [new]

- **観察**:
  - data-model.md:246-251 と FR-009 (spec.md:266) の規則: 前回の設定を初期値のまま起動した起動は、その設定と組の起動元 (`lastOrigin`) に数える。
  - KPI の正本 (session charter) について:
    - FR-016 (spec.md:303) が session charter の計測経路の注記に書くのは、判定期間と数える単位だけである。
    - この引き継ぎを書く項目は無い。
    - KPI の文言は「プリセットを適用した起動が、適用しない起動を上回る」(U-6。spec.md:78) で、表示も「プリセットを適用 {p} 回」(data-model.md:307) である。
  - 用語 (glossary) について:
    - SH-001 (tasks.md:15) が glossary に足す「起動元」は `preset` / `manual` の 2 値だけである。
    - 既存の Launch notice (glossary.md:428。plan.md:111 も同じ) は「起動の初期値 (`launch.lastConfig`) は含まない (告知を消しても残る)」と書く。
    - 本 feature で起動の初期値に加わる `lastOrigin` は、ここに無い。
    - 実装の上では、`dismissLaunchNotice` (`running-session-store.ts:436-446`) が spread で状態を写すので、`lastOrigin` も残る。
- **同種事象探索**:
  - `lastConfig` を glossary で検索して 1 件 (`:428`)
  - `Launch notice|起動の告知|lastOrigin` を spec / plan / tasks で検索して、定義の更新を予定する行は 0 件。該当はすべて実装の項目 (plan.md:42,148、spec.md:266,356、tasks.md:97)
- **リスク/影響**:
  - KPI の文言を字面どおりに読む人は「そのダイアログで適用した起動」と解釈する。実際の回数には、変えずに起動し直した起動が前回の起動元のまま入る。判定の正本 (session charter) から、この数え方を読めない。
  - Launch notice の定義は、初期値の片方しか名指さない。
- **推奨アクション**:
  - SH-001 の「起動元」に、次の文を足す: 「前回の設定を初期値のまま起動した起動は、その設定と組の起動元を引き継ぐ (正本は 012 data-model §4)」
  - Launch notice を「起動の初期値 (`launch.lastConfig` と `launch.lastOrigin`) は含まない」に直す。
  - FR-016 / SH-041 の session charter の計測経路の注記に、「前回の設定を変えずに起動し直した起動は、前回の起動元に数える」を 1 文足す。
- **根拠**: Principle XIV、session charter KPI「再利用率」、ARCH-7
- **scope 根拠**: glossary / session charter は FR-016 の touched files

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | `watchedId\|見ているセッション` (docs の定義の文) / `dismissLaunchNotice` (charter) | 3 / 2 | glossary.md:865-866, ui charter:167, 0046:63 (記録なので対象外) / session charter:171, ui charter:179 |
| M-102 | `CLOSTA_E2E\|userData\|_electron` (perf/real-sessions.spec.ts) / `setPath` (src/main) | 起動と env の行 6 / 0 | real-sessions.spec.ts:12,166,179,182,185 / composition-root.ts:107 (userData の取得) |
| M-103 | `候補 #\|\(#\$\{` (target-finder.ts) / ux-reviewer の対象外で設定のダイアログが描く feature | 2 / 4 | target-finder.ts:92,99 / reviewers.yml:115-117 と provider |
| M-104 | accepted ADR の、訂正以外の in-place 追記 | 3 | 0034:95, 0041:172, 0046:70 |
| M-105 | `from '@/features/(session\|shell\|session-list\|search)/` (chat) / `from '@/features/chat/` (session の本番) / `from '@/features/(chat\|search\|shell)/` (session-list) | 1 / 3 / 0 | useTranscript.ts:9 / LivePane.tsx:11, running-session-store.ts:10, session-event-decoder.ts:8 / — |
| M-201 | `基準画像` (specs/**/quickstart.md) | 4 (承認の行 2。012 は 0) | 006 quickstart.md:25-26, 013 quickstart.md:24 |
| M-106 | `addEventListener\(['"]keydown` (src) / `test\('` (ime.spec.ts) | 1 / 3 | components/image.tsx:298 / e2e/ime.spec.ts:56,76,93 |
| M-107 | 全件の走査を分割する規定 / 走査の時間を合否に使わない記述 | 0 / 2 | — / spec.md:333, plan.md:248 |
| L-101 | `_overview.md` の帰属の判断根拠の見出し | 8 (O-3 / O-8 / O-9 は 0) | _overview.md:80-103 |
| L-102 | Decision 6 の外の置き場の語 | 3 | spec.md:35 (2), data-model.md:110 |
| L-103 | `モーダル \(設定・起動・承認\)` (docs) | 3 | 0046:30, roadmap.md:377, prompts.md:312 |
| L-104 | `standalone は採らない` (docs) | 1 | 0033:50 |
| L-105 | `O-3 の (Thread search の)?後に再検討` | 2 | 0046:50, 013 spec.md:58 |
| L-301 | `lastConfig` (glossary) / `Launch notice\|起動の告知\|lastOrigin` (spec / plan / tasks の定義の更新) | 1 / 0 | glossary.md:428 / — |

## Verdict

- Critical: 0
- High: 0
- Medium: 8
- Low: 6
- Round inheritance: resolved from R3: 1 / unresolved: 13 / new: 1
  - resolved:
    - arch R3 H-201 (= gate H-04)
    - 解消の根拠は「スコープ要約」に書いた観察事実
      - 軸を変える経路は `LaunchDialog.tsx:305-320` の `update` 1 つで、`setDraft` はそこと `applyPreset` にしか無い
      - 拒否・失敗のたびにダイアログが作り直される (`LivePane.tsx:55-60`)
      - FE-040 のテストが規則を固定する (tasks.md:98)
  - unresolved (重大度は変えていない):
    - Medium: M-101 (gate M-16)、M-102 (M-19)、M-103 (M-20)、M-104 (M-17)、M-105 (M-21)、M-201 (M-27)、M-106 (M-18)、M-107 (M-09 のうち本 reviewer の分)
    - Low: L-101 (L-17)、L-102 (L-18)、L-103 (L-19)、L-104 (L-20)、L-105 (L-07)
  - new: L-301 (起動元の引き継ぎが、glossary と session charter の定義に入らない)
  - R4 で直った gate M-13 (数える単位) と M-01 (判定期間) は、本 reviewer の観点で accepted ADR と Constitution に反していない。AD-041 (h) は計測経路の持ち主を指名するだけで、数え方を縛らない (`0041:148`)。
