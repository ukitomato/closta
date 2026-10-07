## Specification Analysis Report (012-ui-thread-search / Track A / design-gate R4: R3 の H-04・M-13・M-01 の修正の後)

**実行メモ**
- 前提スクリプト (`check-prerequisites.ps1`) は実行していない。FEATURE_DIR は `specs/012-ui-thread-search` に固定した。spec.md / plan.md / tasks.md の 3 ファイルはどれもある。contracts/ と checklists/ は無い (plan:260 の方針どおり)。
- `.specify/extensions.yml` には `before_analyze` / `after_analyze` の hook が登録されていない。
- 手順 8 (修正案を出すかを利用者に問う) は省いた。このトラックからは利用者に問えないため。修正案は表の Recommendation 列に書いた。
- 「前回 gate」列の ID は `design-gate.md.20261006T212011` (R3) の ID (H-xx / M-xx / L-xx) を指す。未解消のものには、R3 の analyze と同じ ID (U1, I2 など) をそのまま使った。
- 今回 design が変わったのは R3 の H-04・M-13・M-01 の 3 件だけである。spec の Clarifications / US-4 AC8 / FR-009 / FR-010 / FR-016、data-model §4、research R-05、plan の #14 と :197、FE-040 が対象。それ以外の箇所は R3 から変わっていない。
- コードの参照はいくつか確かめた。`LaunchDialog.tsx:178-180, :305-320, :323-327, :347-355`、軸の変更がすべて `update` を通ること (`:431, :485, :502, :550, :569, :589`)、`LivePane.tsx:55-91`、`running-session-store.ts:57, :97, :362, :556`、`CenterPane.tsx:60-66, :135-168`、`thread.aui.tsx:580, :585`、`image.tsx:298`、`RunningSessionList.tsx:156`、`e2e/ime.spec.ts` の既存の 3 ケース、constitution v1.3.0 (`:1050`)・XV (`:849`)。

| ID | Category | Severity | Location(s) | Summary | Recommendation | 前回 gate |
|---|---|---|---|---|---|---|
| U9 | Underspecification (a11y / 外部の値の扱い) | MEDIUM | data-model.md:172-173, :184, :328, :333 / spec.md:221 (FR-017) / tasks.md:41 (FE-011), :44 (FE-012), :76-79 (FE-031 / FE-032) / SessionListScreen.tsx:208-209, :231, :240 / summary.ts:59 | 外部由来の値から DOM の id と IDREF を作っている。区画の id は `section.key` から作り、未登録の区画の鍵は `cwdKey` (`JSON.stringify([namespace, path])`) を含む。このためパスに空白があると、`aria-labelledby` (空白区切りの IDREFS) が id を途中で切る。FR-017 は `role="group"` の名前をこの IDREF で付ける。palette の option の id (`aria-activedescendant` の参照先) の作り方も決まっていない。rowKey は U+0000 を含む | §3 / §6 に次を書く: DOM の id は `useId()` と添字から作り、`section.key`・rowKey・session id を id・IDREF・セレクタに入れない。FE-012 と FE-032 に、空白・`"`・NUL を含む値のテストを足す | unresolved from prev (M-25) |
| U10 | Underspecification (フォーカス) | MEDIUM | data-model.md:152, :177, :185 / tasks.md:78-79 (FE-032) | palette で操作を実行して閉じた後のフォーカスの行き先が、操作ごとに決まっていない。「会話内を検索」の後に検索のバーの入力欄へ移す処理と `useDialogReturnFocus` のどちらが先に動くかが無い。セッションの候補で中央が切り替わると、戻り先の要素が消える | §3 に操作ごとの行き先を表で書く。FE-032 に、閉じた後の `document.activeElement` を確かめるケースを足す | unresolved from prev (M-26) |
| U1 | Underspecification | MEDIUM | data-model.md:64, :322, :331 / spec.md:220 (FR-017) / tasks.md:47 (SH-010) | 過去の区画の最小の高さ 6rem の中に、固定の要素として h2・検索欄・件数の行が入る。語を入れている間は、スクロールできる領域がほぼ 0 になりうる。SH-010 は語の無い状態しか確かめない | 件数を検索欄の内側かスクロールの領域に移すか、固定の領域の高さの予算を §6 に書く。SH-010 に語を入れた状態を足す | unresolved from prev (M-07) |
| U2 | Underspecification | MEDIUM | data-model.md:143-144 / research.md:45-46 / plan.md:241 (RK-02) / tasks.md:57-58 (FE-021) | 件数は本文のデータで数え、強調は DOM を連結した文字列で数える。段落の境界・markdown の記号・URL があると、両者で出現の順がずれる。k 番目が別の出現を指してしまう場合の規則が無い | ブロックの境界に空白を入れて連結する、と書く。出現の数が合わないメッセージでは現在の強調を出さない、と書く。FE-021 に段落をまたぐ出現と URL のテストを足す | unresolved from prev (M-08) |
| U3 | Underspecification (性能) | MEDIUM | data-model.md:114-117 / spec.md:233-235 (FR-005), :333 (SC-002) / plan.md:26 | 入力 1 回あたりの頻度は SC-002 で決まった。残っているのは 2 点: ストリーミング中の走査し直しに頻度の上限が無いこと、閉じている間や語が空の間に走査するかが書かれていないこと | 「開いていて、正規化した語が空でない間だけ走査する」と書く。変化による走査はフレームか 150ms ごとにまとめる | unresolved from prev (M-09。一部解消のまま) |
| U4 | Underspecification | MEDIUM | data-model.md:154 / tasks.md:28 (FE-003), :61 (FE-024) | provider がマウントした時点の `conversationSearchRequest` の値を、新しい要求とみなすかが無い。みなすと、一度 palette から検索を開いた後、セッションを切り替えるたびに検索が勝手に開く | マウント時の値を基準にする、と書く。FE-026 に「切り替えても開かない」を足す | unresolved from prev (M-10) |
| U5 | Underspecification | MEDIUM | plan.md:40, :185 / data-model.md:109 / tasks.md:62 (FE-025) / CenterPane.tsx:60-66, :135-168 | provider を `CenterPane` に置くと書いてある。しかし過去の本文は子の `PastCenter` が `useTranscript()` で取り、`CenterHeader` も子の中にある。React では値が子から親へ渡らないので、書いてある形では provider が本文を受け取れない | provider を `RunningCenter` / `PastCenter` の中に置き、ヘッダと本体を包む (`key` もそこで付ける)、と plan と §2 に書く | unresolved from prev (M-11) |
| A1 | Ambiguity | MEDIUM | tasks.md:16 (SH-002) / plan.md:205 / AD-045:35 | 直書きの基準線の数え方 (コメントを数えるか) が決まっていない | JSX のテキストと文字列リテラルだけを数え、使った式と範囲を記録する | unresolved from prev (M-12) |
| I2 | Inconsistency | MEDIUM | spec.md:316, :319 vs data-model.md:89, :192, :271 | spec の Key Entities は版のキーを `version`、一致を「本文の位置」と書く。data-model はそれぞれ `schemaVersion` と `occurrence` である。SC-005 の固定のキー集合のテストは、このキーの名前に依存する | Key Entities を data-model に合わせ、正本は data-model §2 / §4 と書く | unresolved from prev (M-14) |
| I4 | Inconsistency (charter の範囲) | MEDIUM | spec.md:77 (U-5), :304 (FR-016) / plan.md:42, :84, :187 / tasks.md:104 (SH-041) / ui charter:166-170, :173-180 | 次の 2 つが U-5 にも SH-041 にも入っていない。(1) ui の chat が session の `revealMessage` を呼ぶこと。(2) session の `watchedIdOf` が `paletteOpen` を読むこと。ui charter:167 は、session が読む面の状態を「focus と設定・起動ダイアログの開閉」と列挙している | SH-041 に ui charter の 2 行の更新を足し、U-5 の範囲に session の renderer のモジュールを書く | unresolved from prev (M-16) |
| I5 | Inconsistency (governance) | MEDIUM | tasks.md:16 (SH-002) / plan.md:155 / quickstart.md:16 / AD-045:35, :45 / constitution.md:320-323 | accepted の AD-045 の `## Confirmation` に基準線を in-place で書き足す。しかし AD-031 が in-place で許すのは、日付つきの「訂正」節だけである | Confirmation の後ろに、日付つきの「記録」節として足す | unresolved from prev (M-17) |
| G1 | Coverage Gap | MEDIUM | plan.md:216, :245 (RK-06) / tasks.md:67 (SH-020), :80 (SH-030) / quickstart.md:25 | composer で変換中に Ctrl+F を押したときの IME の回帰を見る E2E が無い。RK-06 は jsdom では確かめられないと書いている | SH-020 に Ctrl+F の 1 ケースを足すか、RK-06 を「残りは V-3 で見る」に直す | unresolved from prev (M-18) |
| I10 | Inconsistency (文言) | MEDIUM | data-model.md:214, :236, :262, :309, :312 / spec.md:177 (AC4) / tasks.md:99 (FE-041) | `usageUnreadableHint` (「次に…読み直します」) は将来版では事実と違う。`usageEmpty` (「まだ記録がありません」) は、30 日より前の記録しか無いときにも出る | `unreadable` を理由ごとに分けるか、hint を直す。0 件の文言は「直近 30 日の起動はありません」にする。FE-041 に将来版のケースを足す | unresolved from prev (M-02) |
| G2 | Coverage (計測経路の記述) | LOW | spec.md:170 (US-4 Independent Test), :336 (SC-005) vs tasks.md:97-98 (FE-040) / plan.md:215 | H-04 の修正 (AC6〜AC8 の起動元の規則) は renderer だけの振る舞いである。それなのに、US-4 の Independent Test と SC-005 の計測経路は、起動ダイアログと稼働中のストアのテストを名指さない (挙げているのは store / service / `handleLaunchSession` / プリセットの欄だけ)。テストは FE-040 にあるので、実装の漏れではない | SC-005 と US-4 の Independent Test の計測経路に「起動ダイアログの component テストと稼働中のストアの単体 (起動元の表の各行)」を足す | new |
| T2 | Terminology | LOW | spec.md:86 (Clarifications 2026-10-04), :326 (Assumptions) / data-model.md:307 (`usageCounts`) / tasks.md:15 (SH-001) / spec.md:305 (FR-016 glossary) | 「プリセット経由の起動」の定義 (このダイアログで適用してから起動) と表示「プリセットを適用 {p} 回」は、引き継いだ場合を含んでいない。AC6 / AC7 の、このダイアログで適用せず前回の設定のまま起動した場合を `preset` に数えることが入っていない。SH-001 で足す glossary の「起動元」の定義の出所も無い。また Assumptions:326 は U-6 で承認済みの規則に [ASSUMED] を付けたままである | Clarifications の答えに「前回の設定を初期値のまま起動したら前回の起動元を引き継ぐ (FR-009)」を足す。SH-001 の「起動元」は FR-009 / data-model §4 の表を正本として引く。Assumptions:326 の [ASSUMED] を外す | new |
| G3 | Coverage (検証) | LOW | quickstart.md:20 (V-2) / spec.md:303 (FR-016) / plan.md:153 (#14) | M-01 / M-13 の結論として、session charter に注記を書く (判定の期間は直近 30 日・最低件数と判定の時期を持たない・数える単位は受け付けた起動の要求)。しかし V-2 が確かめるのは KPI の文言と計測経路だけで、この注記を見ない | V-2 の再利用率の行に、注記の 3 点を確かめる項目を足す | new |
| I3 | Inconsistency | LOW | spec.md:296 (FR-015) / research.md:62 | FR-015 の字面と R-04 の読み替え (使わない理由を書くことで満たす) が合っていない | FR-015 を「本 feature の結論 (使わないなら理由)」に改める | unresolved from prev (L-26) |
| I6 | Inconsistency | LOW | plan.md:40, :284 / tasks.md:41 (FE-011) | plan のレイヤと Project Structure に `features/shell/Sidebar.tsx` が無い | 2 か所に足す | unresolved from prev (L-06) |
| I7 | Inconsistency | LOW | plan.md:158 (#19), :171 (#32) / tasks.md:104 / spec.md:306 | #32 は「013 は変えない」と書くが、#19 と SH-041 は completed の 013 spec に結論を書き込む | 013 には日付つきの追記だけを書く、と書く | unresolved from prev (L-07) |
| I8 | Inconsistency | LOW | tasks.md:125, :127 | #2 は BE-043 → FE-041 を直列にしているが、#4 は「BE-040 と FE-041」を並行の例に挙げている | #4 を「FE-040 と FE-041 (BE-043 の後)」に直す | unresolved from prev (L-08) |
| I9 | Inconsistency | LOW | spec.md:335 (SC-004) vs :212, :255 / spec.md:176 (AC3) vs :271 (FR-010) | SC-004 の「語を消す操作」は、FR では「語と絞り込みをすべて解除する」操作である。AC3 の「失敗」は、M-13 の結論で 2 つの意味に分かれた。受け付けの前の失敗は数えず、受け付けた後のセッションの失敗とその再試行は数える | SC-004 の語を揃える。AC3 を「起動ゲートで拒否された・受け付けられなかった」にし、受け付けた後の失敗を数えることを AC に 1 つ足す | unresolved from prev (L-01) |
| I11 | Inconsistency (ADR の引用) | LOW | plan.md:231 | 実名列挙の出所の引用から AD-027 §4 が抜けている | 「AD-025 §9 / AD-027 §4」と併記する (任意) | unresolved from prev (L-09) |
| T1 | Terminology | LOW | spec.md:30, :305 / data-model.md:34 | 機能の名前が「セッションの検索」と Thread search で揃っていない | 機能は「セッションの検索」と書き、Thread search は element を指すときだけに使う | unresolved from prev (L-10) |
| U6 | Underspecification | LOW | data-model.md:170-171 / CenterPane.tsx:39-40 | palette の `chat:*` を使える条件 (`shown`) をどう導くかが無い | `shown` の導出を 1 つの関数にし、`CenterPane` と palette で共有する | unresolved from prev (L-11) |
| U7 | Underspecification | LOW | tasks.md:17 (SH-003) / plan.md:20 | `npx assistant-ui add` の後に、依存の差分を確かめる手順が無い | `package.json` と lockfile の差分を確かめる、と書く | unresolved from prev (L-12) |
| U8 | Underspecification (a11y) | LOW | data-model.md:150-156, :292-293 | 会話内検索の n / m と 0 件の表示に live region が無い | `role="status"` で出す、と書く | unresolved from prev (L-13) |
| C1 | Constitution (XIII の検証) | LOW | data-model.md:147 / plan.md:43 | `::highlight()` を、XIII の検査から除外されている `main.css` に置く | main.css の注記に、足した規則とその理由を書く | unresolved from prev (L-14) |
| A3 | Ambiguity (未承認の仮定) | LOW | spec.md:218, :232, :234, :250, :279, :323-327 | [ASSUMED] の項目を、利用者がまだ確かめていない (情報) | まとめて確かめるか、[ASSUMED] のまま進めると記録する (T2 の :326 は外せる) | unresolved from prev (L-15) |
| D1 | Duplication | LOW | spec.md:213, :267 / tasks.md:7 / data-model.md:60, :241 | 置き場の正本を、spec は plan、tasks は data-model としている | spec の参照先を data-model §1 / §4 に直す | unresolved from prev (L-16) |
| U11 | Underspecification | LOW | data-model.md:200-205 / spec.md:76 (U-4), :199, :279 (FR-012) | 時計が先に跳んでから戻ると、先の日付の鍵が残る。実際の日付がその日に届くと、30 日の合計に入る。また「90 日分」は 90 暦日を超えうる | 先の日付の鍵の扱いを §4 に決める。FR-012 に「90 個の日の鍵」と書く | unresolved from prev (L-28) |
| U12 | Underspecification | LOW | data-model.md:70-77 / SessionListScreen.tsx:847-854 | `search-empty` が `all-unlisted` / `some-unlisted` より先に出る。このため、所在が読めていないこと (「無い」ではなく「分からない」) が空の表示から消える | 「読めていない所在がある」ことを優先するか、文言に足す | unresolved from prev (L-27) |
| U13 | Underspecification | LOW | data-model.md:255-256 / tasks.md:97 (FE-040) | `launch(config, folderLabel, origin)` の `origin` を必須にするか任意にするかが無い。H-04 の規則で renderer の判定が増えたので、渡し忘れが黙って `manual` になるかどうかの影響が大きくなった | 必須にし、既存の呼び出しを FE-040 の対象に足す | unresolved from prev (L-29) |
| I13 | Inconsistency (ADR の引用) | LOW | research.md:53-62 (R-04) / AD-033:50 | R-04 は standalone の element を採りうるとするが、AD-033 §1「standalone は採らない」との関係を書いていない | 読み方を R-04 に 1 行書く | unresolved from prev (L-20) |
| I14 | Inconsistency (テスト) | LOW | tasks.md:27 (FE-002) / spec.md:210 / data-model.md:39-41 | 「`cwd.value` にだけある語で一致しない」というテストは、未登録の行では成り立たない | テストを登録フォルダの行に限る | unresolved from prev (L-24) |

### 前回 gate (R3) の Critical / High の状態

前回の Critical は 0 件、High は 1 件 (H-04) だった。

| 前回 | 状態 | 根拠 |
|---|---|---|
| H-04 起動元が、前回の設定に軸を変えても付いて回る (analyze I12) | **解消** | R3 の案 (a) どおりになった。起動元は、適用したら `preset`、適用せずに軸を手で変えたら `manual`、どちらも無ければ初期値の設定と組の `lastOrigin` になる。この規則が次のすべてに揃っている: spec の FR-009 (:265-266)、US-4 AC8 (:181)、Clarifications 2026-10-06 (:96-98)、data-model §4 の表と規則 (:245-254)、research R-05 (:80)、plan (:197)、FE-040 (:97-98)。FE-040 のテストには AC8 と「preset → 軸を変えて manual → 初期値のまま manual → 適用して preset」の並び、変えてから戻した場合、依存解決による自動の reset が入っている。引き換え (拒否の後に軸を直して再試行すると `manual`) は FR-009 と data-model:254 に書いてあり、U-6 は変えていない。「手で変えた」の判定は `update` を通ったかで行う。コードでは 6 軸の変更がすべて `update` を通り、`applyPreset` は別の口なので、この判定はそのまま実装できる。引き継ぎがアプリを閉じるまで続く連鎖は無くなった |

R3 の Medium のうち、H-04 と同じ問いで決めた 2 件も解消した。
- **M-13 (analyze A2) — 解消。** 数える単位は受け付けた起動の要求で、受け付けた後の失敗の再試行は別の 1 回に数える。FR-010 (:271)、data-model §4「書き込み」(:223)、FR-016 の session charter の注記 (:303)、plan #14 (:153) に書いた。AC3 の語の揺れは I9 に残る。
- **M-01 (po) — 解消。** 判定の期間は直近 30 日で、最低件数と判定の時期は持たない。FR-016 (:303) と data-model:263 に書いた。V-2 で確かめる項目は G3 に残る。

### 前回 gate (R3) の Medium / Low のうち、上の表に無いもの (他のトラックの指摘)

次の箇所の design は R3 から変わっていない。どれも未解消である。
- Medium: M-03 (過去ログの取得中・失敗の間の 0 件の表示)、M-04 (検索のバーの開閉のフォーカス)、M-05 (ショートカットの手がかり)、M-06 (US-4 の配線の E2E。H-04 の規則で renderer の判定が増えたので、重みは増した)、M-19 (perf の起動が `manual` に混ざる)、M-20 (XV の改定の中身)、M-21 (`features/search` と `features/session-list` の双方向の依存)、M-22 (element を採る条件に「HTML として描かない」が無い)、M-23 (`handle()` を通ることの構造のテスト)、M-24 (system scope)、M-27 (基準画像の目視の承認の記録)
- Low: L-02〜L-05、L-17〜L-19、L-21〜L-23、L-25、L-30、L-31

### Coverage Summary Table

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 Thread search | Yes | FE-001, FE-002, FE-010, FE-012 | D1, U12, I14 |
| FR-002 一致の規則の共有 | Yes | FE-001, FE-002, FE-030 | A3 |
| FR-003 会話内検索の UI | Yes | FE-022, FE-024, FE-025, FE-026, SH-020 | U4, U5, G1 |
| FR-004 対象は text part | Yes | FE-020, FE-026 | A3 |
| FR-005 間引き・差分の走査・強調 | Yes | FE-020, FE-021, FE-024 | U2, U3, C1 |
| FR-006 palette の開閉・IME・modal | Yes | FE-003, FE-031, FE-032, SH-030 | U9, U10, G1 |
| FR-007 palette の候補 | Yes | FE-002, FE-030, FE-031, FE-032, SH-041 | U6, U10 |
| FR-008 Empty state | Yes | FE-010, FE-012, FE-024, FE-026, FE-031, FE-032, FE-041 | I9, I10, U12 |
| FR-009 renderer の起動元 | Yes | FE-040, BE-043 | I12 は解消。U13, D1, T2 |
| FR-010 main の検証と記録 | Yes | BE-043 | A2 は解消。I9 (AC3) |
| FR-011 記録の内容 | Yes | BE-040, BE-041 | I2 |
| FR-012 置き場と保持 | Yes | BE-040, BE-041, BE-042 | U11 |
| FR-013 プリセットの欄 | Yes | BE-043, FE-041, SH-041 | I10, T2 |
| FR-014 AD-045・XV・composer の文言 | Yes | SH-002, SH-042, FE-004, SH-040 | A1, I5 |
| FR-015 ui-coverage F 節 | Yes | SH-003, SH-041 | I3, I13 |
| FR-016 記録の追随 | Yes | SH-001, SH-040, SH-041 | I4, I7, T1, T2, G3 |
| FR-017 過去の区画の並び | Yes | FE-011, FE-012 | U1, U9, I6 |
| FR-018 基準画像 | Yes | BE-010, SH-010 | — |
| SC-001 | Yes | FE-001, FE-002, FE-012 | — |
| SC-002 | Yes | FE-020, FE-021, FE-022, FE-026, SH-020 | U3 |
| SC-003 | Yes | FE-032, SH-030 | U9, U10 |
| SC-004 | Yes | FE-012, FE-026, FE-032, FE-041 | I9 |
| SC-005 | Yes | BE-040, BE-041, BE-042, BE-043, FE-040, FE-041 | G2, I2, U11 |
| SC-006 | Yes | BE-043 (`capability.test.ts`), SH-043 (V-1) | — |
| SC-007 | Yes | SH-040, SH-041, SH-042, SH-043 | I5, G3 |
| SC-008 | Yes | FE-004, FE-011, FE-012, SH-010 | U1, U9 |

**Constitution Alignment Issues:**
- NON-NEGOTIABLE の原則 (I〜VIII) の MUST に違反する箇所は無い。
  - III: H-04 の修正の後も、起動元は計測にだけ使う。どの起動元でも `deps.launchSession` に同じ `config` が 1 回渡る (FR-009 / FR-010・BE-043)。
  - V: 記録は日付と 2 つの回数だけで、M-13 の結論でもキー集合は変わらない。
  - VIII: 新しいキーの処理は、どれも変換中に動かず `preventDefault` もしない。E2E の範囲が足りない点は G1 に書いた。
- XV: 改定は SH-042 で同じ PR に入る (v1.3.0 → v1.4.0。constitution.md:1050 の現行版と plan の Constitution Check は合っている)。基準線を書く形 (I5) と数え方 (A1) はまだ決まっていない。
- XIII: 除外のファイル (C1) と AD-033 §1 との関係 (I13) が残る。
- XII / XIV: 対応表 (SH-041) と glossary (SH-001) は同じ PR に入る。glossary の「起動元」の定義の出所は T2 に書いた。

**Unmapped Tasks:** なし。SH-003 は FR-015 / XIII に、BE-010 は FR-018 に、SH-043 は SC-006 / SC-007 の検証に対応する。

**Metrics:**
- Total Requirements: 26 (FR 18 + SC 8。SC はどれも作業を要する)
- Total Tasks: 34 (BE 5 / FE 19 / SH 10)
- Coverage %: 100% (26 / 26)
- Ambiguity Count: 2 (A1, A3。A2 は解消)
- Duplication Count: 1 (D1)
- Critical Issues Count: 0
- 重大度の内訳: CRITICAL 0 / HIGH 0 / MEDIUM 13 / LOW 21 (計 34)
- 前回との関係: resolved from prev 2 (I12 = H-04、A2 = M-13。ほかのトラックの M-01 も解消) / unresolved from prev 31 / new 3 (G2, T2, G3。どれも LOW)

### Next Actions

- CRITICAL も HIGH も 0 件で、gate は PASS にできる。R3 の H-04 は案 (a) で解消し、新しい High は生じていない。
- `/cl-implement` の前に、利用者の判断なしで直せる MEDIUM をまとめて直すことを勧める (`/cl-design --spec-dir specs/012-ui-thread-search --from gate` で designer の fix に渡す)。
  - data-model §3 / §6 と FE-012 / FE-032: U9 (DOM の id に外部の値を入れない)、U10 (palette の実行後のフォーカス)
  - data-model §2 / §6、plan:185、FE-021 / FE-025 / FE-026: U1〜U5 (U5 は書いてある形では実装できない構造の誤り)
  - SH-002: A1 / I5
  - SH-041 と U-5: I4
  - spec の Key Entities: I2
  - SH-020 か RK-06: G1
  - data-model §5 と FE-041: I10
- 今回の新しい LOW (G2 / T2 / G3) は、H-04・M-13・M-01 の修正の書き漏れである。spec の SC-005 と US-4 の Independent Test、Clarifications と Assumptions、quickstart V-2 を直すだけで済む。同じ fix に入れるとよい。
- 他の LOW は実装を止める理由にならない。
