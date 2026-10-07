## Specification Analysis Report — 014-ui-metering-and-limits (Track A / design-gate R2。2026-10-07 の再開版)

対象: spec.md / plan.md / tasks.md / data-model.md / research.md / quickstart.md。照合先: constitution v1.4.0、ui charter、_overview、glossary、AD-044 / AD-046 / AD-047、およびコードの事実 (`sdk-agent-session.ts`、`agent-session.ts`、`system-event.ts`、`transcript-dto.ts`、`transcript-guard.ts`、`session/labels.ts`、`running-session-store.ts`、`RunningSessionList.tsx`、`LivePane.tsx`、`CenterHeader.tsx`、`model-catalog.ts`、`check.mjs` 項目 16、`reviewers.yml`)。非破壊で、ファイルは書いていない。拡張の hook (`before_analyze` / `after_analyze`) は登録されていない。

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|---|---|---|---|---|---|
| D1 | Duplication / 規則の衝突 | HIGH | data-model §2「値の検証」`modelId` (L82) / §4 主モデル (L188) / BE-001 / FE-032 vs `src/domain/provider/model-catalog.ts:26` (`MODEL_ID_PATTERN`) | `meter` の modelId の規則 `^[A-Za-z0-9.:@/-]{1,128}$` は、既存の domain の述語 `isValidModelId` (`._:/@-[]` を許す。`[1m]` と Bedrock の ARN を通すと明記) とは別の、より狭い規則になっている。`claude-sonnet-4-5[1m]` (このアプリのカタログと起動設定が受け付ける形) や `_` を含む id は内訳から落ちる。落ちた行が主モデルなら、主モデルの選び方 (完全一致 → 出力トークン最多) が別のモデル (subagent や圧縮の haiku など) を選び、その `contextWindow` で割るので割合を誤る (「100% 以上」と誤表示しうる)。`modelUsage` の key に `[1m]` が付くかは誰も観測していない | 正本を `isValidModelId` に一本化し、`//` と `mayCarrySecret` の追加条件だけを `meter.ts` に置く。BE-001 と FE-032 に `[1m]` の fixture を足す。起動設定の id (alias / `[1m]` 付き) と `modelUsage` の key の照合規則 (完全一致か正規化か) を §4 に書く。V-4 #2 / #3 で実際の key の形を記録する |
| I1 | Inconsistency (accepted ADR) | HIGH | AD-047 Decision 5 (L37) vs data-model §2 (L56)・§5 `PERMISSION_MODE_NAMES` (L220) / plan「機械強制の変更」(L263) / research R-15 / FE-040 | AD-047 は「昇格値のリテラルは **domain だけ** に置く」と決めている。一方で設計は `features/chat/labels.ts` (renderer) に `acceptEdits` / `bypassPermissions` / `auto` を key にした表示名の表を置き、plan は「domain と renderer だけ」と書く。今の renderer には昇格値の綴りが 0 件で、本 feature が初めて持ち込む。plan の ADR 節はこの差に触れていない (Decision 4 の差には触れている) | 利用者が判断する。(a) ADR の意図が「`src/agents/` に置かない」(項目 16 の範囲) であれば字面の誤りとして扱い、AD-031 に従って訂正節で直す。(b) 決定の変更とみなすなら後続の ADR を起こす。少なくとも plan の ADR 節に、この差と採った扱いを 1 行書く |
| I2 | Inconsistency (accepted ADR) | MEDIUM | AD-047 Decision 4 (L38)・Consequences (L48) vs spec Clarifications (L79) / FR-009 / research R-04 / plan ADR 節 (L253) | ADR は Context display を「result の値 (`usage` を含む)」から出すと書いている。設計は主ループの最後の assistant の `usage` (入力側) と result の `contextWindow` から出す。plan は「決定は変わらない、本文は書き換えない」とするだけで、ADR の字面との差は残ったまま | 「result の `usage` はターン内の往復の合算」という事実を、AD-031 の訂正節として AD-047 に記録する。FR-014 の備考と session charter (SH-013) は新しい式の字面に揃える |
| U1 | Underspec / AC と導出の不一致 | MEDIUM | spec US-3 AC2 (L133) vs data-model §4「目盛り」(L188-190) / FE-032 のテスト | AC2 は「assistant の応答が届いた」ら割合と費用の目盛りが出るとする。しかし `contextWindow` も費用も `lastTurn` (result) からしか得られない。最初のターンは result が届くまで何も出ない。`contextUsed` があって `lastTurn` が無い場合の振る舞いは §4 に無く、FE-032 のテストの観点にも無い | AC2 の Given を「最初の result の後」に直す (以降は assistant ごとに更新)。§4 と FE-032 に「`contextUsed` あり・`lastTurn` 無し → 出さない」を足す |
| I3 | Inconsistency (置き場所) | MEDIUM | spec FR-012 (L209)・US-4 AC4 (L154)・SC-003 (L260)「Reasoning の表示に」 vs research R-07 / data-model §4「進み具合」(L196) / FE-044 | spec は思考のトークン数を「Reasoning の表示」に出すと書く。設計は viewport の footer の composer の上に出す (Reasoning の part はまだ無いので「Reasoning の語彙」で描く)。plan が書き足したのは FR-018 だけで、FR-012 は直していない | FR-012・AC4・SC-003 を「実行中の transcript の末尾の思考の印 (Reasoning の語彙)」に直す |
| U2 | Underspec (間引き) | MEDIUM | data-model §2「間引きと後始末」(L107-110) / BE-041 / SC-004 | 鍵の上限「同時に追う鍵は 64 まで」に、枠から外れる条件が無い。task の鍵は `finish()` まで取り消されない。tool の鍵の「取り消し」も保留を捨てるだけで、枠を空けるかは書かれていない。外れる条件が無いと、長いセッションで 65 個目以降の tool / task の経過時間が黙って出なくなる。また、保留が 20 件を超えたときにどの鍵から送るか (公平性) が無いので、飢餓が起こりうる | 鍵の寿命 (送った後に間隔が空いたら外す・取り消しで外す) と、保留から送る順 (古い順 / 巡回) を §2 に書く。BE-041 に「先の鍵が外れた後の 65 個目は受ける」「20 件を超える鍵も最後にはすべて送られる」のテストを足す |
| E1 | Edge case | MEDIUM | data-model §4「Quota banner」(L153-164) / FE-020 | 帯は `allowed` の event でだけ消える。`rejected` のまま `resetsAtSec` を過ぎると、過去の時刻を示した「上限に達しました」が次の要求まで残る | 現在時刻が `resetsAtSec` を過ぎたときの扱い (帯を消す、または文言を「解除の時刻を過ぎました」にする) を決め、FE-020 にテストを足す |
| E2 | Edge case | MEDIUM | data-model §3 `compaction` (L137) / BE-042 / research R-02 (`compact_result?` は省略可) | 圧縮の行は `compact_result` でしか閉じない。結果が来ないまま `status` が null / `requesting` に戻ると、行は稼働中ずっと「圧縮中」のまま残る | 次の非 `compacting` の `status`、または主ループの assistant で閉じる規則 (状態は `succeeded` か結果不明) を決める。BE-042 にテスト、V-4 #7 で実機の形を記録する |
| I4 | Inconsistency (charter) | MEDIUM | FR-016 (L225) / SH-013 vs ui charter In scope (L53-59。O-3 の U-5 の例外の書き方) | U-1 (ui の feature が session の契約と操作 UI を変える) の例外を、session charter だけに記録する。ui charter には Related Specs を足すだけになる。O-3 の前例は、例外を ui charter の In scope に書いている | ui charter の In scope (observability 系の表示の項) に、O-4 の U-1 の例外を 1 行書き足す (SH-013) |
| I5 | Inconsistency (字面) | LOW | spec FR-013 (L210)「task ごとの状態をセッションスレッドにも持たない」 vs data-model §2 の間引きの鍵 `task:<taskId>` | 間引きの緩衝 (鍵ごとの最新値。最長 1 秒) は task ごとの状態と読めてしまう | FR-013 か §2 に「間引きの緩衝は task の状態 (種類・状態の一覧) ではない」と 1 行書く |
| T1 | Terminology | LOW | spec FR-019 (L239)「表示を増やす」 vs data-model §8・FE-050・UI の文言 `showMore`「さらに表示」 | 同じ操作に 2 つの呼び名がある | spec を「さらに表示」に揃える |
| I6 | Inconsistency (計測範囲) | LOW | SC-007 (L263)「renderer の文言の表に 0 件」/ quickstart V-3「文言の表とテストの期待値」/ FE-051「`src/renderer` と `e2e` に 0 件」 | 計測の範囲が 3 通りある。`features/provider/useProviders.ts:153` のコメントの「プロバイダ」は FE-051 の対象一覧に無いので、FE-051 の完了の条件 (src/renderer に 0 件) を満たせない | 範囲を 1 つに決め、FE-051 の対象にそのコメントを足す |
| C1 | Coverage (残り) | LOW | BE-011 (L60) / plan 申し送り #20 | 存在しない「FR-030」への参照が、BE-011 の対象の外に残る: `session-core.test.ts:379,389` の describe と、`session/labels.ts:80` の `isReloginFailure` のコメント (FE-010 が関数を変えるが、コメントの直しは書いていない) | BE-011 / FE-010 の対象に足す |
| S1 | Style (行番号) | LOW | research R-01 / R-12 / R-11、plan、tasks FE-002 / FE-030 / SH-011 | 同じ範囲を文書ごとに違う行番号で引いている: AppShell.test の setup `:43-303` と `:59-303`、`session-view.monitor.test.ts:342-380` と `:345-380`、eslint の一覧 `:582-598` と `:582-589`、reviewers.yml `:42-64,92-114` と `:54-64/:104-114` | tasks の「Grep で引き直す」があるので実害は小さい。どちらかに揃える |
| S2 | Style (順序) | LOW | spec の SC の並び (SC-005 → SC-007 → SC-006)、AD-047 の Decision の並び (1, 2, 3, 5, 4) | 番号の順に並んでいない | spec の並びを直す。AD-047 は accepted なので触れない (I1 / I2 の訂正の折に検討する) |
| A1 | Ambiguity (承認の状態) | LOW | spec Clarifications (L77) / Assumptions (L252) | 承認済みのものに [ASSUMED] が残っている。「`errors` を出さない」は承認済みの U-5 と同じで、「間引きは 1 秒に 1 回」は accepted の AD-047 Decision 2 にある。未承認の仮定と見分けにくい | 承認済みのものから [ASSUMED] を外し、残る未承認の仮定 (費用の指標・式・帯の条件・タブの自動選択・「現在の権限モード」の行) だけを並べる |
| U3 | Underspec | LOW | data-model §3 `api-retry` (L136) / BE-020 | assistant で `succeeded` に閉じたときに `openRetryRowId` を消すかが書かれていない。消さないと、主ループの assistant ごとに `succeeded` の更新が流れ、`receivedMessages` に数えられる。同じターンの後の再試行は、transcript の上の方にある既存の行を書き換えるので見えにくい | 閉じたら消すと明記する。同じ行に合成する仕様 (AC4) で見えにくくなることを UX 側で確かめる |
| E3 | Edge case | LOW | data-model §8 (L264) / FE-050 | 承認の要求が続けて来たとき、「許可」の後にフォーカスが composer に移り、同じ位置に出る次の承認カードを飛ばす | 次の pending があればそのカードへ移すか、composer で良い理由を §8 に書く |
| T2 | Terminology | LOW | data-model §4 / research R-07 / SH-001 | 新しく使う語「思考の印」「目盛り」「使用量のタブ」が、SH-001 で glossary に足す語の一覧に入っていない | 足すか、既存の語 (Reasoning・Panel tab) の言い換えで済むと SH-001 に書く |
| A2 | Ambiguity | LOW | spec SC-004 (L261) | 「セッションあたり 1 秒に 20 件以下」がすべての event を指すのか、間引きの対象 (data-model §2) だけを指すのかが書かれていない | SC-004 に「間引きの対象の合計」と書く |

### 前回 (R1) の High / Critical の扱い

前回の Critical は 0 件。

| 前回 ID | 内容 | 判定 | 根拠 |
|---|---|---|---|
| H-01 (arch H-001) | X-1 FR-020 / US-4 AC6 を記録なしで上書きし、存在しない FR-030 を根拠にした。クレジットの案内が消える | **resolved from prev** | spec U-1 と data-model の冒頭に「読み替える先行の決定」、AD-047 に「読み替える箇所」がある。理由のキーに `billing` を足し AC3a を置いた。BE-011 でコメントの根拠を直し、SH-013 で 005 に AD-047 への参照を置く。FR-030 の残りは C1 (LOW, new) |
| H-02 (arch H-002) | task ごとの状態を持ち、AD-044 Decision 6 に反する | **resolved from prev** | task の進み具合は既存の行の更新 (`opens: false`) にし、`mergeSystemEvent` の合成の規則で扱う (data-model §3 / research R-06)。間引きの緩衝の字面は I5 (LOW, new) |
| H-03 (pb H-001) | 昇格を観測しても注意の見た目だけで、AD-041 との関係が無い | **resolved from prev** | U-6 (警告の帯 `role="alert"`・隔離の文言・強制の持ち主は I-3)、AC1a を P1、BE-040 / FE-040 を先に置いた。ただし手当ての字面「昇格値は domain だけ」と設計が食い違う → I1 (HIGH, new) |
| H-04 (analyze I1) | 再ログインの導線の規則が spec と data-model で食い違う | **resolved from prev** | 正本を data-model §1 (`auth-failed` と `provider-error`) にし、FR-002 / SC-001 / FE-010 / FE-011 はそれを参照する。実機の形は RK-06 / V-4 #1 (利用者の作業。実装は止めない) |
| H-05 (po H-003 / analyze U1) | コンテキストの推定に result の `usage` を使い、100% を超えうる | **resolved from prev** | 主ループの最後の assistant の入力側 3 つの和に替え、100% 超の表示と V-3 / V-4 #3 の比較を足した。ADR の字面の差は I2 (MEDIUM, new)。最初のターンの扱いは U1 (MEDIUM, new) |
| H-06 (po H-001) | US-1 AC3 と data-model §1 で、状態が無いときの理由が食い違う | **resolved from prev** | AC3 が「状態が無いときは汎用の理由 (正本は data-model §1)」になり、表の最終行と一致する |
| H-07 (po H-002 / analyze C2) | SC-004 の E2E は計量を流さず、何も測っていない | **resolved from prev** | SC-004 を agents の単体 (偽の時計・並列・上限・取り消し) に絞り、E2E を計測経路から外した (plan / tasks BE-041 / BE-042) |

前回の analyze の Medium / Low (U2・U3・U4・I2・U5・C1・C2・U6・E1・E2・I3・I4・I5・D1・S1・N1) は、どれも data-model §1〜§5、tasks (`[P]` を含む)、AD-047 Consequences、SH-001 / SH-013 で手当て済み (resolved from prev)。

### Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 失敗の理由の分類 | Yes | BE-011, BE-012 | |
| FR-002 理由のキーと文言・導線 | Yes | BE-010, FE-010, FE-011 | |
| FR-003 `meter` | Yes | BE-001, BE-002, BE-004, BE-020, BE-030, BE-040, BE-042, FE-004 | D1 |
| FR-004 行の経路 | Yes | BE-003, BE-020, BE-040, BE-042 | E2, U3 |
| FR-005 稼働中のストアの `meters` | Yes | FE-004 | |
| FR-006 Quota banner | Yes | FE-005, FE-020 | E1 |
| FR-007 再試行の行 | Yes | BE-020, FE-021 | |
| FR-008 使用量のタブ | Yes | FE-031 | |
| FR-009 目盛り | Yes | BE-030, FE-005, FE-032 | U1, D1 |
| FR-010 権限モード | Yes | BE-040, FE-040, FE-041, FE-042 | I1 |
| FR-011 圧縮 | Yes | BE-042, FE-042 | E2 |
| FR-012 経過時間・思考 | Yes | BE-041, BE-042, FE-043, FE-044 | I3, U2 |
| FR-013 task の進み具合 | Yes | BE-003, BE-042, FE-042 | I5 |
| FR-014 対応表 | Yes | SH-012 | |
| FR-015 ADR・固定テスト | Yes | BE-002, BE-010 | I1, I2 |
| FR-016 記録の追随 | Yes | SH-001, SH-013, FE-051 | I4, I6, T2 |
| FR-017 タブのキー操作とテストの分割 | Yes | FE-030 (FE-031) | |
| FR-018 切り出し | Yes | FE-001, FE-002, FE-003 | |
| FR-019 消えるボタンのフォーカス | Yes | FE-050 | E3, T1 |
| SC-001 | Yes | BE-011, FE-010, FE-011 | |
| SC-002 | Yes | BE-001, BE-020, BE-030, BE-042, SH-010 | |
| SC-003 | Yes | FE-011, FE-020, FE-021, FE-031, FE-032, FE-040〜FE-044 | I3 |
| SC-004 | Yes | BE-041, BE-042 | U2, A2 |
| SC-005 | Yes | SH-012, SH-014 | |
| SC-006 | Yes | BE-002, BE-010, SH-014 (V-1) | |
| SC-007 | Yes | FE-001〜FE-003, FE-030, FE-050, FE-051 | I6 |

### Constitution Alignment Issues

MUST (I〜VIII) への違反は無い。
- III: 権限モードの選択肢は増やさず、警告の帯だけを出す。
- IV: SDK の呼び出しと query の options のキーの差分は 0。
- V: 許可リストで秘密・パス・会話由来の文字列を運ばない。
- VII: 新しい agents のモジュールは SDK と Electron に依存しない。
- 項目 16: 昇格値の綴りを `src/agents/` の非テストのファイルに置かない。`launchPermissionMode` と `message.permissionMode` の参照の形は `check.mjs:874-915` の正規表現に掛からない。

Standard (IX〜XV) にも違反は無い (XII は SH-012 を同じ PR で行う。XIII は SH-002、XIV は SH-001 が先行する)。

ただし accepted の ADR と設計の字面が 2 件食い違う (I1 = AD-047 Decision 5、I2 = AD-047 Decision 4)。ADR drift の最終判断は architecture-reviewer の範囲。

### Unmapped Tasks

無い。FR / SC に直接は対応しない次の 3 件も、それぞれ根拠がある。
- SH-002: Principle XIII の照合
- SH-011: plan「機械強制の変更」
- FE-005: FR-006 / FR-009 の受け口

### Metrics

- Total Requirements: 26 (FR 19 / SC 7)
- Total Tasks: 38 (BE 12 / FE 19 / SH 7)
- Coverage: 100% (26/26)
- Ambiguity / Underspec Count: 5 (U1, U2, U3, A1, A2)
- Duplication Count: 1 (D1)
- Critical Issues Count: **0** / High 2 / Medium 7 / Low 11 (計 20)

### Next Actions

- CRITICAL は 0 件なので gate を止める指摘は無い。
- `/cl-implement` の前に、HIGH の 2 件を直すことを勧める。
  - D1: data-model §2 / §4 と BE-001 / FE-032 を `Agent(designer)` で直す。modelId は `isValidModelId` に一本化し、`[1m]` の fixture と主モデルの照合規則を足す。
  - I1: AD-047 Decision 5 の「domain だけ」と renderer の表示名の表の扱いを、利用者が判断する (AD-031 の訂正節か後続の ADR)。I2 (Decision 4 の字面) も同じ機会に扱える。
- MEDIUM の 5 件 (U1, I3, U2, E1, E2) は spec / data-model / tasks の追記で済む。I4 は SH-013 に 1 行足す。
- LOW の 11 件は実装の中で拾える (C1 と I6 は FE-010 / BE-011 / FE-051 の対象に足すだけ)。
- 直した後は `/cl-design --spec-dir specs/014-ui-metering-and-limits --from gate` で再開する。
