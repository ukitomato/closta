## Specification Analysis Report — `specs/016-ui-boundaries-and-tool-displays` (O-6)

対象: spec.md / plan.md / tasks.md / data-model.md / research.md / quickstart.md / AD-049。依存 (011 / 013 / 014 / 015、AD-035 / 041 / 044 / 046 / 047 / 048)、constitution、charter、glossary、`_overview.md`、roadmap、ui-coverage.md と、実コード・SDK 型 (0.3.270) の参照先を突き合わせた。

**参照先の確認結果:**
- 実在を確認したもの: `transcript.ts:207` (divider)、`transcript-dto.ts:44,134`、`tool-registry.aui.tsx:22-38`、`SessionAttentionAnnouncer`、`sanitizeBody`、`mayCarrySecret` (`system-event.ts:47`)、`isTerminalSystemEventStatus` (`system-event.ts:193`)、`TRANSCRIPT_PART_FIELDS`
- SDK 型の行番号 14 個はすべて一致した (`sdk.d.ts` の 3457 / 4749 / 4855 / 5022 / 5059、`sdk-tools.d.ts` の 812 / 840 / 850 / 1034 / 1044 / 2724 / 2744 / 2750 / 2790)
- 対応表の `後続: O-6` は 30 行 (Tier A 14) で、research R-01 の数と一致した

ID の接頭辞: U=仕様の不足、I=不整合、S=セキュリティ、K=Constitution / ADR との整合、C=カバレッジの欠落、A=曖昧さ、D=重複。

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| U1 | Underspecification / 要件どうしの衝突 | High | data-model.md:52, spec.md:159 (FR-011), spec.md:187 (SC-005), src/domain/session/agent-session.ts:137-146, running-session-store.ts:284-292, sdk.d.ts:258 | 「承認待ち」は「承認の要求の `toolUseId` が一致」で判定すると定めている。しかし `PermissionRequest` は `requestId` / `toolName` / `input` / `scope` だけで、`toolUseId` を運んでいない。SDK は `canUseTool` に `toolUseID` を渡しているが、アプリが捨てている。足せば session の契約 (X-1 / AD-036) が変わり、SC-005「境界を広げない」と衝突する | 次のどちらかを選び、spec・ADR・SC-005 に書く。(a) `PermissionRequest` に `toolUseId` を足す (ADR と SC-005 の例外)。(b) 承認待ちを「toolName と argsText が一致」で近似し、並列で同じ tool が走ったときの曖昧さを Edge Cases に書く |
| U2 | Underspecification (実現できるか) | High | spec.md:154 (FR-009), AD-049:30, agent-plan.aui.tsx:16-17, AD-035:85-87, research.md (該当する R が無い) | Agent plan が plain text のままだった理由は、コードにも ADR にも「`MarkdownText` は text-part の context に依存し、任意の文字列を安全に受けられない」と書いてある。O-6 はこの技術的な制約に触れず「MarkdownText で描く」とだけ定めている | research に「任意の文字列を MarkdownText に渡す方法」の項を足す (`TextMessagePartProvider` などで包むか、plan を text part にする。後者は convert.ts / DTO の変更)。`safe-url.ts` の `urlTransform` が効くことを確かめ、FE-023 に具体的な手順を書く |
| U3 | Underspecification | High | data-model.md:17, 014 data-model.md:81,83, 015 data-model.md:76, AD-048:36 | `retraction` は O-4 の `meter` の上限 (セッションあたり 1 秒に 20 件で、超えた分は捨てる) と `finish()` での保留の破棄を受ける。落ちれば取り消しは二度と届かない (SDK の指示に反し、SC-001 も満たさない)。O-5 は `init-report` / `commands` をこの上限から外すと明記したが、O-6 は何も書いていない | `retraction` は上限と間引きに掛けず、即時に送ることを data-model §1 と AD-049 に書く。BE-001 / BE-010 に「負荷が高いときも落ちない」テストを足す |
| U4 | Underspecification (正しさ) | High | plan.md:96 (RK-02), tasks.md:22 (FE-010), src/agents/live-tool-results.ts:98-123, sdk-agent-session.ts:524-525, sdk.d.ts:5044 | 取り消したメッセージに結果待ちの tool があると、agents の `lastMessages` が結果の到着時に同じ id で送り直す。ストアは upsert するので、取り消したメッセージが戻る。追跡から外れていれば `result:<id>` の孤児の行として出る。RK-02 の「表示だけを外す」と FE-010 の「結果待ちを壊さない」は、この復活を許す形になっている | 取り消しのとき、agents の tracker からその id の `pendingToolCalls` / `lastMessages` を落とし、後から届く結果を捨てる。ストア側でも取り消した id を上限付きで覚え、後の upsert を無視する。復活しないことを FE-010 / BE-010 で固定する |
| S1 | Security | High | data-model.md:15, spec.md:54 (U-3), AD-049:29, system-event.ts:47-51, 011 data-model.md:88, plan.md:28, sdk.d.ts:4853 | `informational` の本文が出してよいかを `mayCarrySecret` だけで決めている。この判定はコマンドの文字列向けで、O-2 自身が「URL の資格情報・`Bearer`・`-p<pw>` を通す」と記録している。逆に、括弧や引用符を含む普通の文 (止まった理由の大半) は全部隠れる。また SDK は `informational` を「Hook の feedback」と説明しているので、O-2 の「Hook の出力本文を出さない」の読み替えでもある | 文章向けの伏せ字の規則 (URL の userinfo・`Bearer\s+\S+`・`-p\S+`・既知の秘密の接頭辞を `[redacted]` に置き換える) を data-model §1 に定め、fixture で固定する。AD-049 Decision 3 に O-2 の決定の読み替えと理由を書く |
| K1 | Constitution (Principle I) | High | spec.md:130, data-model.md:33-35, plan.md:26, 002 spec.md:365 (FR-042), constitution.md:344,957 | 「UNC の接頭辞を出さない (R-2 FR-042 の規則を使う)」としているが、FR-042 は IPC の境界の規則で、表示の関数は存在しない。接頭辞の除去と、Glob / Grep の結果の文字列から File tree の階層を組むことは renderer でのパスの操作になる。constitution はこれを機械検査で捕まらない残余として挙げている。plan の Principle I ✅ は、この誤った引用に乗っている | 除去と分解の関数を domain のパス API (または表示専用の純関数) に置き、置き場と規則を data-model §2 に書く。FR-042 の引用を直す。architecture-reviewer / platform-boundary-reviewer の判断を求める (表示専用でも NON-NEGOTIABLE なので Critical になりうる) |
| U5 | Underspecification | Medium | data-model.md:13,15, system-event.ts:184-186 | 隠した本文は `detail: ''` にするとしている。しかし `mergeSystemEvent` は空の `detail` を「前の値を保つ」と扱うので、同じ `tool_use_id` の後の知らせを隠すと、前の本文がそのまま残って見える。本文が空なのか隠したのかも renderer から区別できない | 隠したことを表す別の値 (専用の status か、決まった印の値) を定め、merge の規則に例外を書く |
| I1 | Inconsistency | Medium | data-model.md:15 (300 コードポイント), 011 data-model.md:62 (120), transcript-dto.ts:54, research.md:27, thread.aui.tsx:963-972 | O-2 の正本は name / detail を 120 コードポイントとしているのに、`informational` の detail は 300 にしている。research R-04 は「120 で切るので id の列を運べない」を理由にしており、これとも食い違う。今の SystemEventRow は detail を `max-w-40 truncate` で描くので、止まった理由はほぼ読めない | 例外を正本 1 か所に書き、DTO の注記を直す。長い本文を折り返して描く見た目を data-model §1 の「見た目」に書く |
| I2 | Inconsistency | Medium | tasks.md:17 (BE-001), tasks.md:23 (FE-011), plan.md:78, data-model.md:9-13 | tasks と plan は「category 5 つ」と書くが、data-model の category は `compact-boundary` / `conversation-reset` / `refusal` / `informational` の 4 つしかない | 4 に直すか、5 つ目を data-model に足す |
| I3 | Inconsistency | Medium | data-model.md:13,18,65-66, transcript-dto.ts:76, system-event.ts:200, labels.ts:29 | `stopped` は既に status と終わりの値にあり、文言は「停止」(task 用)。それを「足す」と書いている。`informational` の「ここで止まりました」と文言の表を共有することになり、読み上げの §4 でも task の `stopped` と知らせの `stopped` が混ざる | 別の status (例: `prevented`) を使うか、文言を category ごとに引く規則にする |
| U6 | Underspecification / 置き場の誤り | Medium | data-model.md:7-13, system-event.ts:178, plan.md:17, tasks.md:17, transcript-dto.ts:62,66-78 | §1 の表に `opens` の列が無い。`mergeSystemEvent` は前の行が無く `opens` が false の行を捨てる。BE-001 は category / status の追加先を `system-event.ts` としているが、定数の正本は `transcript-dto.ts` (O-5 data-model §4 はそう書いている) | §1 に `opens` の列 (全部 true か) を足し、BE-001 の対象に `transcript-dto.ts` と `transcript-schema.test.ts` を加える |
| I4 | Inconsistency | Medium | spec.md:84 (US-1 AC6), data-model.md:12 | AC6 は「拒否のカテゴリを出す」としているが、no-fallback の行は `name` が空で `detail` が本文なので、カテゴリを入れる場所が無い | no-fallback の行の詰め方を定め直す (例: detail を `<category>` にし、本文を別の行か name に) |
| I5 | Inconsistency (前提の誤り) | Medium | data-model.md:68, spec.md:160 (FR-012), SessionAttentionAnnouncer.tsx:13,28, 013 spec.md:79,172, ApprovalCard.tsx:25 | 「承認待ちと失敗は既存の `SessionAttentionAnnouncer` が読むので重ねない」としている。しかし同部品が読むのは見ていないセッションだけ。表示中のセッションの承認待ちは ApprovalCard の `alertdialog` が担い、失敗は誰も読まない | 前提を事実に直し、表示中のセッションの失敗を TranscriptAnnouncer で読むかどうかを決める |
| U7 | Underspecification (a11y) | Medium | data-model.md:60-68, spec.md:65,119, SessionAttentionAnnouncer.tsx:15 | 次が決まっていない。最初の描画・過去ログを開いたとき・セッションを切り替えたときに読み上げないこと。「結果不明」(セッションが終わると一斉に起きる) を何をきっかけに読むか。tool 名 (MCP は未信頼) や知らせの本文のような会話由来の文字列を読むか (O-1 は入れない規則) | 読み上げの基準 (描画の最初の状態は読まない)・過去ログは対象外・終了時の結果不明は 1 文にまとめる・読む文字列の許可リストを data-model §4 に書く |
| U8 | Underspecification (edge case) | Medium | data-model.md:53, SessionScreen.tsx:358, quickstart.md:21 | 結果待ちの判定は「セッションが終了・失敗でない」ことだけ。中断 (X-1 FR-015。セッションは続く) で切れた tool は、動く印と `aria-busy` のまま永久に「結果待ち」になる | 中断の後とターンの完了の後の扱い (結果不明にする) を §3 と Edge Cases に足し、V-3 に中断の確認を足す |
| A1 | Ambiguity | Medium | data-model.md:34-35, plan.md:98 (RK-04), spec.md:56 (U-5) | Glob / Grep の結果の text から File tree を組むには結果の形 (「Found N files」の見出し・0 件の文言・切り詰めの注記) を推測する必要がある。WebSearch では「結果の形を推測しない」を理由に Sources を組まないとしており、判断の基準が食い違う。どう読み取るかも書いていない | 読み取りの規則 (パスでない行は捨てる・読めなければ text に倒す) を §2 に書き、U-5 との違いの理由を書く |
| C1 | Coverage Gap | Medium | tasks.md:17,22, plan.md:101-111, src/renderer/src/features/session/session-event-decoder.ts | renderer の decoder (`session-event-decoder.ts`) が `retraction` を受けて検証するタスクが無く、plan の Project Structure にも無い。decoder が知らない `meter` の種類を落とせば、取り消しはストアに届かない | FE-010 か BE-001 に decoder の検証と、port → decoder → ストアを通すテストを足す |
| C2 | Coverage Gap | Medium | data-model.md:17, AD-049:35, plan.md:110, spec.md:168 (FR-017), tasks.md:40, 015 spec.md:190 | 次の更新にタスクが無い。O-4 data-model §2 の検証の表への `messageIds` の行、AD-047 の許可リストの追記。plan は session charter を変更対象に挙げているのに FR-017 / SH-010 に無い (O-5 は session charter を明記している) | SH-010 に O-4 data-model §2・AD-047 の参照・session charter (`meter` の `retraction`) を足す |
| K2 | ADR 整合 (改定手順 / AD-031) | Medium | AD-049:13-23, AD-044:66,84, AD-047:35, AD-048:26-30 | accepted の AD-044 は Decision 4 (B 節の照合を O-6 に) と Decision 6 (task の一覧の要否を O-6 で) で持ち主を O-6 と書いている。AD-047 Decision 2 は `meter` で運ぶものを数・列挙・モデルの id に限っている。AD-049 はどちらの読み替えも書いていない (AD-048 には「読み替える箇所」の節がある) | AD-049 に「読み替える箇所」の節を設け、AD-044 D4 / D6 の持ち主を O-11 に、AD-047 D2 の範囲を取り消しの id の列に広げることを書く |
| I6 | Inconsistency (依存) | Medium | plan.md:29,74, data-model.md:16, tasks.md:9,40, spec.md:189-196, AD-046:21 | SH-010 は「AD-045 の例外の一覧に `transcript.ts:207` を足す」とするが、AD-045 はこのブランチに無い (O-3 の未マージのブランチにある)。spec の Dependencies にも着手の条件にも O-3 / AD-045 が無い | Dependencies と着手の条件に O-3 (AD-045) を足すか、注記を O-3 側の義務として roadmap に送る |
| K3 | Charter / domain の境界 | Medium | plan.md:17-19, tasks.md:22, AD-049:6, 014 spec.md:50 (O-4 U-1), _overview.md:88 | 稼働中のストア (session の操作 UI) と、session の契約の `meter` の種類を ui の feature が変える。O-4 はこれを U-1 として人間の承認に掛けたが、O-6 には未承認の判断として挙がっておらず、AD-049 の tags にも `session` が無い | 未承認の判断に U-6 として足す (または O-4 の U-1 の範囲に入ると明記する)。AD-049 の tags に session を足す |
| K4 | Constitution (Principle XIV) | Medium | glossary.md:827-830, spec.md:168 (FR-017), tasks.md:15 (SH-001), 014 spec.md:204 | glossary の「システムイベントの行」は「Hook / Background task を 1 行で」「行を作れるのは Hook と task の開始だけ」と定義している。O-6 で境界・拒否・知らせが加わるのに、定義を直すタスクが無い (O-4 は FR-016 で明記した) | SH-001 に定義の改訂を足す |
| I7 | Inconsistency (SDK の指示) | Medium | sdk.d.ts:4747, data-model.md:10, spec.md:53 (U-2) | U-2 は「SDK の指示どおり」を根拠にしている。一方で `conversation_reset` について SDK は「`new_conversation_id` で新しい transcript を出し、題を消せ」と指示しているが、O-6 は境界を描くだけで、この逸脱を判断として記録していない (再開の id への影響も触れていない) | 未承認の判断か Clarifications に「境界だけにする理由」と、再開の id に触れないことを書く |
| I8 | Inconsistency | Low | spec.md:128, data-model.md:11-12 | Edge Cases は `original_model` の形を検査するとしているが、data-model は `original_model` を読まないフィールドにしている | Edge Cases を `fallback_model` だけにする |
| C3 | Coverage Gap | Low | spec.md:168, plan.md:64-74, 014 data-model.md:102, 015 spec.md:192 | 観測点 `receivedMessages` の基準の変化 (新しい行は数え、`retraction` は数えない) を roadmap の O-3 (O-8) の義務 (c) に注記していない。O-4 と O-5 は注記している | SH-010 と plan の申し送りの表に足す |
| C4 | Coverage Gap | Low | _overview.md:65,94,96,108, roadmap.md:258, spec.md:166,168 | `_overview.md` は O-11 を足すだけになっている。O-6 の行の説明・帰属の判断根拠 (94 行・96 行)・Milestone の M3 の列 (O-1〜O-6) を直すことが書かれていない。roadmap の O-6 の依存の列 (O-2 → O-4 / O-5 / O-7) も同じ | FR-015 / FR-017 / SH-010 に明記する |
| I9 | Inconsistency | Low | plan.md:3 vs spec.md:16, plan.md:41-48, AD-049:23 | plan のブランチの積み方の記述に 015 が抜けている (spec は 015 → 014 → 013)。plan の Related ADRs に AD-048 / AD-045 / AD-041 が無い。AD-049 の前提に AD-048 が無い (FR-005 / FR-010 は AD-048 に依る) | 揃える |
| I10 | Inconsistency | Low | plan.md:60,71, docs/decisions/0020-sdk-emitted-message-inventory.md | 申し送りの表は AD-020 に「O-6」の記述があるとしているが、AD-020 には無い | 申し送りの #2 / #6 から AD-020 を外す |
| C5 | Coverage Gap | Low | data-model.md:91-100, ui-coverage.md:63,80-86,93,341 | §5 の書き換え先から次が漏れている。B 節の冒頭の「照合は O-6」(93 行)、`background_tasks_changed` の備考 (63 行)、`active_goal` が A' 節であること (§5 は A と書く)、F 節の Todo list の行の使い道 (TaskCreate などの追加) | §5 に行を足す |
| A2 | Ambiguity | Low | spec.md:184 (SC-002), agent-plan.aui.tsx:27 | 「9 つの tool が ToolFallback で描かれない」は、入力が読めないときに ToolFallback に倒す既存の作りと矛盾する | 「入力が正しいとき」と条件を付ける |
| I11 | Inconsistency (引用) | Low | AD-049:21, AD-035:87,98 | 「D6 の Trade-off」と書いているが、「将来課題」は D6 の本文にあり、Trade-off は Consequences の節にある | 「D6 と Consequences の Trade-off」と引用を直す |
| D1 | Duplication | Low | spec.md:54, data-model.md:15, AD-049:29, spec.md:131, data-model.md:34 | U-3 の本文の規則を、数値まで 3 か所に書いている (FR-004 は「U-3」を参照し、data-model も自分を正本としている)。File tree の 200 件の上限も 2 か所にある | 正本を data-model §1 / §2 に寄せ、他は参照する形にする |
| D2 | Duplication (spec をまたぐ) | Low | data-model.md:33,36, 015 data-model.md:22, 011 data-model.md:126 | WebFetch の URL の縮め方は O-5 の URI の要約と、ファイル名 (パスの末尾) の取り方は O-2 §4 と、同じ規則を別に書いている | 共有の関数と正本 1 か所を参照する |
| U9 | Underspecification | Low | spec.md:186 (SC-003), package.json | vitest-axe はまだ入っていない。O-7 が入れる前提を書いていない | Dependencies に「O-7 で導入」と書く |
| U10 | Underspecification | Low | data-model.md:11,13,17, sdk.d.ts:5028, 014 data-model.md:70 | 次が決まっていない。取り消しの id が 128 件を超えたときの扱い。行の id に使う `tool_use_id` / `uuid` の形の検査 (O-4 の `toolUseId` の正規表現を使うか)。`scope` が無いとき (SDK は session として扱えと言う)。fallback の行の `content` を読むのか読まないのか | §1 に書く |
| U11 | Underspecification | Low | subagent.aui.tsx:101-102, spec.md:143 (FR-001) | subagent の入れ子の中の divider は今の `── label ──` のまま残り、「同じ専用の表示」にならない | 範囲に入れるか、Out of Scope に書く |
| A3 | Ambiguity | Low | AD-049:36, spec.md:53 | 「過去ログは取り消されたメッセージが記録どおり残る」は確かめていない仮定なのに、[ASSUMED] の印が無い (SDK は取り消しの後に送ると言う) | [ASSUMED] を付け、V-3 で確かめる |
| K5 | Constitution (Principle XIII) | Low | tasks.md:16 (SH-002), plan.md:109, todo-list.aui.tsx | `task-tool.aui.tsx` を新しく作るのに、SH-002 の照合の候補に既存の Todo list の element が入っていない | SH-002 に Todo list を足し、作り直すなら理由を PR に書く |

### Coverage Summary Table

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 圧縮の境界 (両方) | Yes | BE-010, FE-011 | subagent の入れ子の中は外れる (U11) |
| FR-002 conversation_reset | Yes | BE-010, FE-011 | SDK の指示からの逸脱を記録していない (I7) |
| FR-003 拒否と取り消し | Yes | BE-001, BE-010, FE-010, FE-011 | 間引き (U3)・復活 (U4)・decoder (C1) |
| FR-004 informational | Yes | BE-010, FE-011 | S1 / U5 / I1 |
| FR-005 経路と境界 | Yes | BE-001, BE-010, SH-011 | |
| FR-006 Read / Glob / Grep | Yes | FE-020, FE-023 | K1 / A1 |
| FR-007 WebFetch / WebSearch | Yes | FE-021, FE-023 | |
| FR-008 Task* | Yes | FE-022, FE-023 | K5 |
| FR-009 Agent plan の markdown | Yes | FE-023 | 実現できるか未確認 (U2) |
| FR-010 振り分けの登録 | Yes | FE-023 | |
| FR-011 結果の状態の印 | Yes | FE-030, FE-031 | 承認待ちは今の契約では作れない (U1)。中断の扱い (U8) |
| FR-012 読み上げ | Yes | FE-032 | I5 / U7 |
| FR-013 ToolFallback の見出し | Yes | FE-031 | |
| FR-014 対応表 | Yes | SH-010 | 漏れ (C5) |
| FR-015 roadmap に O-11 | Yes | SH-010 | 依存の列 (C4) |
| FR-016 AD-049 | 部分的 | (design で起草済み。タスク無し) | 読み替えの節が無い (K2) |
| FR-017 記録の反映 | Yes | SH-001, SH-010 | session charter・glossary の定義・`_overview.md` (C2 / K4 / C4) |
| SC-001 | Yes | BE-010, FE-010, FE-011 | |
| SC-002 | Yes | FE-020〜FE-023 | A2 |
| SC-003 | Yes | FE-030〜FE-032 | U9 |
| SC-004 | Yes | SH-010, SH-011 | |
| SC-005 | Yes | SH-011 (quickstart V-1) | U1 を直すと衝突する |

### Constitution Alignment Issues

- **Principle I (NON-NEGOTIABLE) — K1**: UNC の接頭辞の除去と File tree の分解は renderer でのパスの操作になる。plan の ✅ は FR-042 の誤った引用に乗っている。今は High としたが、reviewer の判断で Critical になりうる。
- **Principle XIV — K4**: glossary の「システムイベントの行」の定義を改訂する作業が無い。
- **Principle XIII — K5**: 照合の候補から Todo list が漏れている。
- **改定手順 / AD-031 (accepted の ADR の読み替えは後続の ADR で) — K2**: AD-049 が AD-044 D4 / D6 と AD-047 D2 の読み替えを書いていない。
- **domain の境界 — K3**: session の契約とストアを変えるのに、未承認の判断に挙がっていない。
- Constitution の MUST に正面から反するもの (Critical) は見つからなかった。

### Unmapped Tasks

- **SH-002** (element の照合): FR ではなく Principle XIII の作業 (plan の Constitution Check の XIII)。妥当
- **SH-011** (検証): 横断の作業。妥当
- 要件に結び付かないタスクは無い。逆に、FR-016 を受け持つタスクは無い (ADR は起草済み)

### Metrics

- Total Functional Requirements: 17 (上限の目安 20 以内)
- Total Success Criteria: 5 (上限の目安 10 以内。すべて作業を要する)
- Total Requirements: 22
- Total Tasks: 15 (SH 4 / BE 2 / FE 9)
- Coverage %: タスクの付いた FR は 16 / 17 (94.1%)、SC は 5 / 5 (100%)、合計 21 / 22 (95.5%)
- Ambiguity Count: 3 (A1〜A3)
- Duplication Count: 2 (D1〜D2)
- Critical Issues Count: 0
- 重大度の内訳: Critical 0 / High 6 (U1, U2, U3, U4, S1, K1) / Medium 17 / Low 15 (計 38)

### Next Actions

- Critical は 0 なので、gate の判定上は通せる。ただし High の 6 件は設計の前提を崩す (承認待ちの判定に使う id が無い、MarkdownText を使えるか未確認、取り消しが落ちる・復活する、秘密の判定が弱い、Principle I)。/cl-implement の前に spec / data-model / research / AD-049 を直すことを勧める。
- 直し方の目安:
  - U1 / K3 / I7 は未承認の判断の表に U-6 / U-7 として足し、利用者の承認に回す
  - U2 は research に新しい項 (R-06) を足して検証する
  - U3 / U4 / C1 は data-model §1 と BE-001 / BE-010 / FE-010 に規則とテストを足す
  - S1 は文章向けの伏せ字の規則を data-model §1 に定め、AD-049 Decision 3 に読み替えを書く
  - K1 はパスの表示の関数を domain に置くことを決め、FR-042 の引用を直す
- Medium は tasks.md の SH-001 / SH-010 / BE-001 の対象を足す形で、手で直せる (I2, I3, U6, C2, K4, C4, C5)。
