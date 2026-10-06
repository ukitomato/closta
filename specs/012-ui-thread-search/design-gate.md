# Design Gate: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-06T21:57:52+09:00 (Round 4。status=implementing での再実行。R3 の H-04・M-13・M-01 を、利用者の回答 (Clarifications 2026-10-06) に沿って designer が直した後)
**Spec**: specs/012-ui-thread-search/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous gate**: [design-gate.md.20261006T212011](./design-gate.md.20261006T212011) (R3)。R2 は [design-gate.md.20261006T193236](./design-gate.md.20261006T193236)、R1 は [design-gate.md.20261004T050000](./design-gate.md.20261004T050000)

実行の記録:
- [warn: re-run on status=implementing]。PASS なので status は動かさない。
- 5 トラックとも 1 回で結果を返した (retry なし)。
- database-reviewer は起動していない。registry (`.specify/.agents-registry.yaml`) の `invoked_by` に design-gate が無いため。[database-reviewer.design-gate.md](./database-reviewer.design-gate.md) は R1 の出力のまま残る。
- ID は R3 の gate の ID を引き継ぐ。R4 で新しく生じたものだけに新しい番号 (L-32〜L-35) を振った。行番号は R4 の各トラックが示した値に直した。

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 0    | 13     | 21  |
| po-reviewer                | 0        | 0    | 5      | 9   |
| architecture-reviewer      | 0        | 0    | 8      | 6   |
| security-reviewer          | 0        | 0    | 3      | 4   |
| platform-boundary-reviewer | 0        | 0    | 1      | 5   |
| **Total (dedup)**          | **0**    | 0    | 24     | 35  |

|                      | Critical | High | Medium | Low |
| -------------------- | -------- | ---- | ------ | --- |
| Resolved from prev   | 0        | 1    | 2      | 0   |
| Unresolved from prev | 0        | 0    | 24     | 31  |
| New in this run      | 0        | 0    | 0      | 4   |

R3 の High H-04 (起動元が前回の設定に「軸を変えても」付いて回る) は、po・architecture・analyze の 3 トラックが独立に解消と判定した。R3 の案 (a) をそのまま採っている。適用したら `preset`、適用せずに軸を手で変えたら `manual`、どちらも無ければ初期値の設定と組の `lastOrigin` を使う。3 トラックはコードでも次を確かめた。
- 6 つの軸の変更はすべて `update` (`LaunchDialog.tsx:305-320`) を通る。`applyPreset` は別の口で、`update` を通らない。
- ダイアログは拒否・失敗のたびに作り直される (`LivePane.tsx:55-60`)。
- したがって「手で変えた」の印は取りこぼされず、「アプリを閉じるまで `preset` に固定される」偏りは構造の上で起きない。FE-040 のテストがこの規則を固定する。

同じ問いで決めた R3 の M-01 (KPI の判定の期間・最低件数) と M-13 (受け付けの後の失敗の再試行) も解消した。

R3 の残りの Medium 24 件と Low 31 件は、design の該当箇所が変わっておらず、すべて未解消のまま残る (severity はどのトラックも据え置き)。新しい指摘は Low 4 件 (L-32〜L-35) で、うち 3 件は R4 の修正の書き漏れである。

**Status**: PASS
**Next**: Critical=0 のため gate は PASS。status は `implementing` のまま据え置く (再実行のため遷移しない)。`/cl-implement` は起動できる。ただしその前に、利用者の判断なしで直せる次の項目を designer の fix 1 回でまとめて直すことを勧める (`/cl-design --spec-dir specs/012-ui-thread-search --from gate`)。
- M-25 (DOM の id / IDREF に外部の値を入れない) と M-26 (palette で実行した後のフォーカス)。R3 の Next でも同じ fix で直せるとしたが、手が付いていない。
- M-11 (provider の置き場)。analyze によれば、plan の書いてある形のままでは実装できない構造の誤りである。
- L-32〜L-34。R4 の修正 (H-04 / M-13 / M-01) の書き漏れで、spec の SC-005 と US-4 の Independent Test、Clarifications と Assumptions、glossary の「起動元」、quickstart V-2 を直すだけで済む。
- M-23 (`handle()` を通ることの構造のテスト) は R1 から 4 Round 続けて未解消である。
- [ASSUMED] の項目は、まだ利用者の確認を受けていない (L-15)。

## Critical (Total: 0)

なし。

## High (Total: 0)

なし。R3 の H-04 は解消した (上の Verdict を参照)。

## Medium (Total: 24)

| ID | Title | Origin | Where | Action (要旨) | prev |
|---|---|---|---|---|---|
| M-02 | プリセットの欄の文言: 将来版で「読み直します」が事実と違う / 30 日より前の記録しか無いと「まだ記録がありません」 | po M-002, po L-002, analyze I10 | data-model.md:214, :215, :218, :236, :262, :309, :312 / spec.md:177 (AC4) / tasks.md:99 (FE-041) | `newer-version` を分けるか hint を直す。0 件は「直近 30 日の起動はありません」。US-4 AC4 と FE-041 に将来版の行を足す | unresolved |
| M-03 | 過去ログの取得中・失敗の間に、会話内検索が 0 件の文言を出す | po M-003 | data-model.md:106, :109, :150-156 / ChatScreen.tsx:77, :100, :112, :116 | loading / failed の間はボタンを無効にするか状態の文言を出す。US-2 に AC、FE-026 にテストを足す | unresolved |
| M-04 | 会話内検索のバーを開閉したときのフォーカスの行き先が無い | po M-004 | data-model.md:152, :156 / spec.md:139 (US-2 AC6) | 開いたら入力欄、閉じたら開く前の要素 (消えていれば検索のボタン)。US-2 AC6 と FE-026 に足す | unresolved |
| M-05 | palette / 会話内検索の入口がショートカットだけで、画面に手がかりが無い | po M-005 | spec.md:149, :155, :241 / data-model.md:279-312, :290 | ボタン・ツールチップの「(Ctrl+K)」「(Ctrl+F)」・`aria-keyshortcuts` のどれかを §3 / §5 に入れる。入れないなら理由を Out of Scope に書く | unresolved |
| M-06 | US-4 の renderer → preload → main を通しで確かめるテストが無く、記録が黙って 0 になる。preload の更新漏れは型検査も通る (R4 の追加事実) | po M-006 | tasks.md:47, :67, :80, :94-95 / plan.md:216 / spec.md:270, :336 (SC-005) / src/preload/index.ts:58 / src/domain/capability.ts:122 | `e2e/launch-dialog.spec.ts` に適用ありと引き継ぎの 1〜2 ケース。足さないなら preload の構造のテストと、起動元の欠落・未知の理由キーのログの両方 | unresolved |
| M-07 | 過去の区画の最小の高さに固定の要素が 3 つ入り、語を入れるとスクロールの領域がほぼ 0 になる | analyze U1 | data-model.md:64, :322, :331 / spec.md:220 (FR-017) / tasks.md:47 (SH-010) | 件数の置き場を変えるか高さの予算を §6 に書く。SH-010 に語ありの状態を足す | unresolved |
| M-08 | 件数 (データ) と強調 (DOM) で出現の順がずれる (段落の境界・markdown・URL) | analyze U2 | data-model.md:143-144 / research.md:45-46 / plan.md:241 (RK-02) / tasks.md:57-58 (FE-021) | 連結の規則を §2 に書き、数が合わないメッセージでは現在の強調を出さない。FE-021 に足す | unresolved |
| M-09 | 会話内検索の走査: ストリーミング中の再走査の頻度、閉じている間の走査、1 回の全件の走査の上限が決まっていない | analyze U3, arch M-107 | data-model.md:13, :114-117 / spec.md:233-235 (FR-005), :333 (SC-002) / plan.md:26, :28, :248 (RK-09) | 開いていて語があるときだけ走査する。変化による走査をまとめる。全件の走査を分割するか、V-3 で long task 0 を合否にする | unresolved (一部解消のまま) |
| M-10 | `conversationSearchRequest` をマウントした時点で新しい要求とみなすかが無い | analyze U4 | data-model.md:154 / tasks.md:28 (FE-003), :61 (FE-024) | マウント時の値を基準にする。FE-026 に「切り替えても開かない」を足す | unresolved |
| M-11 | provider の置き場が `CenterPane` の構造と合わず、書いてある形では provider が本文を受け取れない | analyze U5 | plan.md:40, :185 / data-model.md:109 / tasks.md:62 (FE-025) / CenterPane.tsx:60-66, :135-168 | `RunningCenter` / `PastCenter` の中に置き、ヘッダと本体を包む、と plan と §2 に書く (M-21 の props の注入と合わせる) | unresolved |
| M-12 | 直書きの基準線の数え方が決まっていない (コメントを数えるか) | analyze A1 | tasks.md:16 (SH-002) / plan.md:205 / AD-045:35 | JSX のテキストと文字列リテラルだけを数え、式と範囲を記録に残す | unresolved |
| M-14 | spec の Key Entities と data-model の形が食い違う (`version` / `schemaVersion`、位置 / 出現の順) | analyze I2 | spec.md:316, :319 / data-model.md:89, :192, :271 | data-model を正本にし、spec では形を繰り返さない | unresolved |
| M-16 | 面の状態を読む集合 (`paletteOpen`) と ui ↔ session の呼び出し (`revealMessage` / `select`) が広がるのに、glossary・ui charter・session charter・U-5 の範囲を直す予定が無い | analyze I4, arch M-101 | spec.md:77 (U-5), :245, :248, :304 (FR-016) / plan.md:36, :42, :84, :187 / data-model.md:129, :182 / tasks.md:15 (SH-001), :104 (SH-041) / glossary.md:865-866 / ui charter:166-170, :173-180 / session charter:171 | SH-001 / SH-041 に 3 か所の更新を足し、U-5 の範囲に session の renderer のモジュールを書く。V-2 に確認の行を足す | unresolved |
| M-17 | accepted の AD-045 の Confirmation に基準線を in-place で書き足すが、これは AD-031 が許す形の外にある | analyze I5, arch M-104 | tasks.md:16 (SH-002) / plan.md:155, :205, :268 / quickstart.md:16 / AD-045:35, :45-48 / AD-031:99-100 / constitution.md:319-323 | 日付つきの「記録」節として Confirmation の後ろに足す。記録節の明文化は system follow-up として roadmap に持ち主つきで登録 | unresolved |
| M-18 | composer で変換中に Ctrl+F を押したときの IME の回帰を見る E2E が無い (AD-037 D1) | analyze G1, arch M-106 | plan.md:216, :245 (RK-06) / tasks.md:67 (SH-020), :80 (SH-030) / quickstart.md:25 / data-model.md:153 | SH-020 に Ctrl+F の 1 ケースを足す。足さないなら逸脱として RK-06 に書く | unresolved (R1 から継続) |
| M-19 | perf の実機計測の起動が、KPI に `manual` として混ざる (最低件数を持たないと決めたので、混ざった数がそのまま判定に効く) | arch M-102 | spec.md:201, :273 / data-model.md:273-275 / perf/real-sessions.spec.ts:12, :166, :179-185 / tasks.md:103-104 | O-8 への義務として roadmap と session charter に書く。または計測の後に記録を除く方法を discovery に書く | unresolved |
| M-20 | XV の改定の中身が design に無い (Decision 3 の例外と Verification が無く、ux-reviewer の観点と対象も合っていない) | arch M-103 | tasks.md:105 (SH-042) / plan.md:70, :234, :282 / AD-045:29, :34 / constitution.md:843-858, :984-986 / reviewers.yml:102-103, :115-117 / ux-reviewer.md:49-51 / target-finder.ts:92, :99 | SH-042 に規則・例外・Verification を書く。UX-6 と reviewers.yml の対象を直す (直さないなら理由) | unresolved |
| M-21 | `features/search` と `revealMessage` の配線で、feature の間に双方向の依存が 2 組できる | arch M-105 | plan.md:36, :180, :185, :187 / data-model.md:39, :129 / tasks.md:26, :61 / AD-023:380-381 | `features/search` は純関数だけにする。`revealMessage` は props で注入する。plan の「レイヤ」に向きを書く | unresolved |
| M-22 | registry の element を採る条件に「外部由来の文字列を HTML として描かない」が無く、palette と検索のバーに注入のテストも無い | security M-001 | research.md:59 / tasks.md:17 (SH-003), :44 (FE-012), :63-66 (FE-026), :77-79 (FE-032) / data-model.md:173 / spec.md:189 | SH-003 / R-04 に条件 (e) を足す。FE-032 (と FE-026) に注入のテストを足す。`react/no-danger` は system の任意項目 | unresolved |
| M-23 | 新チャネルが `handle()` を通ることを自動で確かめる手段が無い | security M-002 | quickstart.md:11 / tasks.md:94-96 (BE-043) / src/main/app/ipc.ts:66-69, :164-172 | BE-043 に構造のテスト (source の照合か、信頼できない送信元で rejected) を足す | unresolved (R1 から 4 Round) |
| M-24 | (scope: system) Principle II の検査が renderer の `navigator.*` を見ていない | platform-boundary M-001 | scripts/constitution/allowlists.mjs:564-579 / check.mjs:382-401 / eslint.config.mjs:55 / data-model.md:153, :183 / roadmap.md:183-184 | `PLATFORM_BRANCH_PATTERNS` に `navigator.platform` などを足し、違反のサンプルで発火を確かめる。入れないなら roadmap (5) に持ち主の feature を書く | unresolved |
| M-25 | 外部由来の値 (区画の鍵・rowKey) から DOM の id / IDREF を作る: 空白を含むパスで `aria-labelledby` が切れる / palette の option の id (`aria-activedescendant`) の作り方が無い | analyze U9, security M-003 | data-model.md:136, :172-173, :184, :328, :333 / research.md:54, :59 / spec.md:221 (FR-017) / tasks.md:17, :41, :44, :75-79 / SessionListScreen.tsx:208-209, :231, :240 / summary.ts:59 / protocol.ts:152-165 | DOM の id は `useId()` と添字から作り、外部の値を id・IDREF・セレクタに入れない、と §3 / §6 に書く (§2 の規則を共有)。SH-003 / R-04 に条件 (f)。FE-012 と FE-030 / FE-032 に特殊文字 (空白・`"`・`]`・`:`・NUL) のテストを足す | unresolved (R3 の Next で fix を勧めたが未着手) |
| M-26 | palette で操作を実行して閉じたときのフォーカスの行き先が操作ごとに決まっていない (会話内検索の入力欄へ移す処理と `useDialogReturnFocus` の順序、セッション切り替えで戻り先が消える) | analyze U10 | data-model.md:152, :177, :185 / useDialogReturnFocus.ts / tasks.md:78-79 (FE-032) | §3 に操作ごとの行き先を表で書く。FE-032 に閉じた後の `document.activeElement` を確かめるケースを足す | unresolved (R3 の Next で fix を勧めたが未着手) |
| M-27 | 新しい基準画像を CI の artifact から取るが、人の目視の承認を記録する手順が無い (AD-038 D5) | arch M-201 | spec.md:308-311 (FR-018) / tasks.md:29 (FE-004), :47 (SH-010) / quickstart.md:5-30 / AD-038:85-88 / constitution.md:613 | quickstart に基準画像の承認の行を足し、quickstart-results に記録する。SH-010 / FE-004 に「承認の後に commit」を足す | unresolved |

R3 から解消した Medium: M-01 (KPI の判定の期間・最低件数。spec.md:100, :303 / data-model.md:263 / plan.md:153)、M-13 (受け付けの後の失敗の再試行。spec.md:99, :271 / data-model.md:223)。

## Low (Total: 35)

| ID | Title | Origin | Where | prev |
|---|---|---|---|---|
| L-01 | AC / SC と文言の表の語が揃っていない (「手動」と「適用なし」、SC-004 の「語を消す操作」)。AC3 の「失敗」は M-13 の結論で 2 つの意味に分かれたが、受け付けの後の再試行を数えることが AC に無い | po L-001, analyze I9 | spec.md:87, :116, :175-181, :255, :271 (FR-010), :335 (SC-004) / data-model.md:307 | unresolved |
| L-02 | palette の候補を上限の 50 件で切ったことが利用者に示されない | po L-003 | spec.md:250 / data-model.md:176 / tasks.md:75 | unresolved |
| L-03 | US-3 の価値を確かめる観測が quickstart に無い | po L-004 | quickstart.md:23-30 | unresolved (R1 から継続) |
| L-04 | 取得の途中の件数が、読み込み済みの範囲であることを示さない | po L-005 | data-model.md:283, :285 | unresolved |
| L-05 | E2E の固定データの変化が、O-8 への「基準の変化」に入っていない | po L-006 | tasks.md:37, :103 / spec.md:64 / plan.md:143 | unresolved |
| L-06 | plan の一覧に `Sidebar.tsx` が無い | analyze I6 | plan.md:40, :284 / tasks.md:41 | unresolved |
| L-07 | completed の 013 spec に結論を書き込む。再検討を design の時点で閉じている | analyze I7, arch L-105 | plan.md:158, :171 / tasks.md:104 / spec.md:306 / 013 spec.md:58 / AD-046:50, :69 | unresolved |
| L-08 | 「依存と順序」の #2 (直列) と #4 (並行の例) が食い違う | analyze I8 | tasks.md:125, :127 | unresolved |
| L-09 | 実名列挙の出所の ADR の引用が不正確 (AD-027 §4 が抜けている) | analyze I11 | plan.md:231 | unresolved |
| L-10 | 機能の呼び名が「セッションの検索」と Thread search で揃っていない | analyze T1 | spec.md:30, :305 / data-model.md:34 | unresolved |
| L-11 | palette の `chat:*` を使える条件 (`shown`) をどう導くかが無い | analyze U6 | data-model.md:170-171 / CenterPane.tsx:39-40 | unresolved |
| L-12 | SH-003 の `npx assistant-ui@latest add` の後に、依存の差分を確かめる手順が無い | analyze U7, security L-002 | tasks.md:17 / plan.md:20 | unresolved |
| L-13 | 会話内検索の n / m と 0 件に live region が無い | analyze U8 | data-model.md:150-156, :292-293 | unresolved |
| L-14 | `::highlight()` を XIII の除外のファイル (main.css) に置くなら注記が要る | analyze C1 | data-model.md:147 / plan.md:43 | unresolved |
| L-15 | [ASSUMED] の項目が利用者の確認を受けていない (情報) | analyze A3 | spec.md:218, :232, :234, :250, :279, :323-327 | unresolved |
| L-16 | 置き場の正本の参照先が spec と tasks で食い違う | analyze D1 | spec.md:213, :267 / tasks.md:7 / data-model.md:60, :241 | unresolved |
| L-17 | `_overview.md` の帰属の判断根拠に、O-3 / O-8 の理由が無い | arch L-101 | docs/domains/_overview.md:80-103 / tasks.md:103 | unresolved |
| L-18 | AD-046 Decision 6 の語彙に無い置き場を使っている (palette・プリセットの欄・検索のバー) | arch L-102 | spec.md:35 / data-model.md:110 / glossary.md:857 | unresolved |
| L-19 | palette を AD-046 Decision 4 のモーダルの列挙に入れる道筋が無い | arch L-103 | data-model.md:184 / plan.md:150 / roadmap.md:377 / prompts.md:312 | unresolved |
| L-20 | R-04 が AD-033 §1「standalone は採らない」との関係を書いていない | arch L-104, analyze I13 | research.md:53-62 / plan.md:91 / AD-033:50 | unresolved |
| L-21 | `handleGetLaunchUsage` が reject しないことが定められていない | security L-001 | data-model.md:225, :239 / tasks.md:95 | unresolved |
| L-22 | BE-042 が手本として指す範囲に、退避先のパスをログに出す行が含まれる | security L-003 | tasks.md:92 / preset-service.ts:77-79 / data-model.md:267 | unresolved |
| L-23 | Ctrl+F / Ctrl+K の修飾キーをどう判定するかが決まっていない (AltGr が `ctrlKey && altKey` で届く点を R4 で追記) | platform-boundary L-001 | spec.md:196-197, :228, :241, :243 / data-model.md:153, :183 / plan.md:57 / research.md:63 / tasks.md:66, :78 | unresolved |
| L-24 | FE-002 のテスト「`cwd.value` にだけある語で一致しない」は、未登録の見出しと両立しない | platform-boundary L-002, analyze I14 | tasks.md:27 / spec.md:210 / data-model.md:39-41 / group-label.ts:51 | unresolved |
| L-25 | (scope: system) 実名列挙の規則に網羅の検査が無く、plan の字面が事実と違う | platform-boundary L-003 | plan.md:232 / scripts/constitution/check.mjs:753 / .dependency-cruiser.js:254 | unresolved |
| L-26 | FR-015 の字面が R-04 の結論 (使わない理由を書くことで満たす) と合っていない | analyze I3 | spec.md:296 / research.md:62 | unresolved |
| L-27 | 所在が読めないときに語を入れると、`search-empty` が `all-unlisted` / `some-unlisted` を隠し、出口が解除になる (既存の `filtered-out` と同じ優先順位であることを po が R4 で確認) | po L-007, analyze U12 | data-model.md:70-77, :311 / SessionListScreen.tsx:811, :816, :847-854 / tasks.md:43 | unresolved |
| L-28 | 時計が先に跳んでから戻ると先の日付の鍵が残る。「90 日分」が 90 暦日を超えうることが FR-012 に無い | analyze U11 | data-model.md:200-205 / spec.md:76 (U-4), :199, :279 (FR-012) | unresolved |
| L-29 | `launch(config, folderLabel, origin)` の `origin` を必須にするか任意にするかが決まっていない | analyze U13 | data-model.md:255-256 / tasks.md:97 (FE-040) | unresolved |
| L-30 | palette の稼働中の候補は、正規化の cache の鍵にランタイムの一覧を含めていない | platform-boundary L-004 | data-model.md:43, :53 / plan.md:180 / tasks.md:26 / RunningSessionsProvider.tsx:54-61 | unresolved |
| L-31 | E2E の固定の索引が、行の `targetKey` と `outcomes` の対応、`cwd` の名前空間を決めていない | platform-boundary L-005 | data-model.md:336-350 / tasks.md:37 (BE-010) / e2e-capability.ts:324-341, :396 / session-ipc.ts:92-94 | unresolved |
| L-32 | spec の US-4 の Independent Test と SC-005 の計測経路に、起動元の規則 (AC6〜AC8) を確かめる起動ダイアログの component テスト (FE-040) が入っていない | analyze G2, po L-008 | spec.md:170, :336 (SC-005) / tasks.md:86, :97-98 (FE-040) / plan.md:215 | new |
| L-33 | 起動元の引き継ぎ (`lastOrigin`) が、Clarifications の「プリセット経由」の定義・表示「プリセットを適用 {p} 回」・SH-001 の glossary の「起動元」・Launch notice の定義・session charter の注記に入っていない。Assumptions:326 は承認済みの規則に [ASSUMED] を付けたまま | analyze T2, arch L-301 | spec.md:78, :86, :266, :303, :305, :326 / data-model.md:246-251, :307 / tasks.md:15 (SH-001) / glossary.md:428 / plan.md:111 / running-session-store.ts:436-446 | new |
| L-34 | quickstart V-2 が、FR-016 で session charter に足す KPI の注記 (判定の期間・最低件数と判定の時期を持たないこと・数える単位) を確かめない | analyze G3, po L-009 | quickstart.md:20 (V-2) / spec.md:303 (FR-016) / plan.md:153 (#14) | new |
| L-35 | 起動の設定の形の検査で拒否された要求 (`invalid-config`) を記録しないことを確かめるテストが無い | security L-004 | src/main/app/session-ipc.ts:141-143 / data-model.md:223, :230 / spec.md:176 (AC3), :271 (FR-010) / tasks.md:95 (BE-043) | new |

## Dedup

| 集約先 | 集約元 | key |
|---|---|---|
| M-02 | po M-002, po L-002, analyze I10 | data-model.md:236, :262, :309, :312 (プリセットの欄の文言) |
| M-09 | analyze U3, arch M-107 | data-model.md:114-117 / SC-002 (spec.md:333) |
| M-16 | analyze I4, arch M-101 | FR-016 (spec.md:304) / SH-041 (tasks.md:104) / ui charter:166-170 |
| M-17 | analyze I5, arch M-104 | tasks.md:16 (SH-002) / AD-031 |
| M-18 | analyze G1, arch M-106 | plan.md:245 (RK-06) / SH-020 (tasks.md:67) |
| M-25 | analyze U9, security M-003 | data-model.md:172-173, :184 (palette の option の id) |
| L-01 | po L-001, analyze I9 | SC-004 (spec.md:335) / AC3 (spec.md:176) |
| L-07 | analyze I7, arch L-105 | plan.md:158 / tasks.md:104 |
| L-12 | analyze U7, security L-002 | tasks.md:17 (SH-003) |
| L-20 | analyze I13, arch L-104 | research.md R-04 / AD-033:50 |
| L-24 | analyze I14, platform-boundary L-002 | tasks.md:27 (FE-002) / spec.md:210 |
| L-27 | po L-007, analyze U12 | data-model.md:70-77 (search-empty の優先順位) |
| L-32 | analyze G2, po L-008 | SC-005 (spec.md:336) / US-4 Independent Test (spec.md:170) |
| L-33 | analyze T2, arch L-301 | SH-001 (tasks.md:15) の「起動元」/ data-model.md:246-251, :307 |
| L-34 | analyze G3, po L-009 | quickstart.md:20 (V-2) / FR-016 (spec.md:303) |

集約前の件数: Critical 0 / High 0 / Medium 30 / Low 45。集約後: Critical 0 / High 0 / Medium 24 / Low 35。

## Viewpoint / cascade

- viewpoint (A〜H): reviewer の 4 トラックはどれも欠けが 0 件。analyze は適用外。
- cascade_enforce: どのトラックでも降格は 0 件 (Critical の申告が 0 件のため)。

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
