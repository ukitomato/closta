---
spec_id: 023-session-launch-axes-and-operations
feature_id: X-6
domain: session
domain_selected_by: auto
targets: both
targets_selected_by: auto
status: completed
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: 実行中のセッションの操作 (X-6 の最初の分割)

**Feature Branch**: `023-session-launch-axes-and-operations`

**Created**: 2026-10-27 (夜間の自走で起案。人間の判断が要る点は推奨案で採用した — 下の「判断の一覧」)

**Status**: frontmatter の `status:` を正とする

**Input**: roadmap「M2 の後続」の X-6 の行 (範囲と義務の正本)。X-6 の行のうち「対応表の割当 (O-2 から)」の実行中のセッションの操作 — 制御要求 `set_permission_mode` / `set_model` / `set_max_thinking_tokens` / `rename_session` (`docs/ui-coverage.md` E 節で `後続: X-6` の 4 行) だけを本 spec の範囲にする (U-1)。X-6 の残りは X-6 の行に残す。依存の X-5 と、会話の id を持つ X-9 (021) は main にマージ済み。

## Summary

動いているセッションの設定を、止めずに変えられるようにする。今は権限モードとモデルは起動ダイアログで選んだきりで、変えるにはセッションを終えて起動し直すしかない。名前も Claude Code の自動の題のままで変えられない。

- **権限モードの切り替え**: 中央のヘッダで、動いているセッションの権限モードを安全 3 値 (`default` / `plan` / `dontAsk`。AD-041 (a)) の中で切り替える。安全 3 値の外へは切り替えられない
- **モデルの切り替え**: 中央のヘッダで、そのセッションの Provider で選べるモデルに切り替える。次の応答から効く
- **名前を付ける**: 動いているセッションに名前を付ける。名前は Claude Code の transcript に記録され、過去のセッションの一覧にも同じ名前で出る
- **対応表**: E 節の `後続: X-6` の 4 行を `実装済み` / `表示不要` に書き換える (Constitution 検証の項目 21)。`set_max_thinking_tokens` は呼ばず `表示不要` にする (U-4)

## 判断の一覧 (2026-10-27 夜間の規則で推奨案を採用)

| 判断 | 1 行の要約 | 記録 |
|---|---|---|
| U-1 | 本 spec は X-6 の行のうち実行中のセッションの操作 (E 節の 4 行と、その照合を預かった F 節の 3 行) だけを扱う。残りは X-6 の行に残す (依頼で決めた範囲) | 「義務の扱い」 |
| U-2 | 権限モードは `Query.setPermissionMode` を安全 3 値だけで呼ぶ。main の検証と agents の `assertSafePermissionMode` の 2 段で閉じる | FR-001〜FR-004 |
| U-3 | モデルは `Query.setModel` を、そのセッションの Provider のモデルカタログの値だけで呼ぶ。effort は変えない。既定に戻す (`undefined`) は渡さない | FR-005〜FR-007 |
| U-4 | `set_max_thinking_tokens` (`setMaxThinkingTokens`) は呼ばず `表示不要` にする。SDK が deprecated とし、Closta の思考量の軸は起動時の effort (AD-041 (g)) | FR-008 |
| U-5 | 名前は Agent SDK の `renameSession()` で transcript に custom-title を足して付ける。呼ぶ場所は 1 ファイルに縛り、列挙と同じ列挙対象 (config ディレクトリ × 所在) で書く | FR-009〜FR-012 |
| U-6 | 名前を付けられるのは、会話の id を持ち、`claude` が動いていてターンを実行していない行 (応答待ち・中断済み) だけ | FR-010 |
| U-7 | 操作は中央のヘッダに置く。composer には置かない。registry の element (Model selector / Composer model picker / Settings) は取り込まず、既存の選択の部品で組む | FR-013 / FR-016 |
| U-8 | 変更は永続化しない。プリセットにも X-9 の再開の初期値 (021 FR-007 の「元の起動設定」) にも書き戻さない | FR-014 |
| U-9 | 改名を受け付けてから結果が出るまで (`changing` が名前) の間に届いたプロンプトの送信は、main が保留し、改名の結果 (成否・期限を問わない) の後に届いた順で送る。拒否はしない (composer に触れずにプロンプトを失わないため)。design-gate H-005 | FR-010 / Edge Cases |
| U-10 | モデルの切り替えは、モデルのカタログを持つ Provider のセッションだけが対象。Provider が既定 (null)・Provider が消えた・起動の effort を満たすモデルが 0 のセッションでは、選択を理由つきで押せない形で出す (既定の Provider のモデルの切り替えは X-6 の後続)。design-gate H-002 | US-2 AC6 / Out of Scope |
| ADR | AD-062 (plan で起こし、夜間の規則で推奨案を採用して accepted にする): AD-036 §4 P3 / §5 の読み替え (`setPermissionMode` / `setModel` を許す。`QUERY_MUTATION_METHODS` 22 → 20)・`AGENT_SDK_ALLOWED_CALLS` に `renameSession` を足す (5 → 6。`AGENT_SDK_CALL_FILES` で 1 ファイルに縛る)・AD-034 と R-3 (003) FR-001 の「transcript は読み取り専用」の読み替え (custom-title の追記だけ)・X-1 SC-006(a) の「実行時の昇格面」の読み替え (安全 3 値の中の遷移は昇格でない) | `docs/decisions/` |
| ADR | AD-063 (code-gate platform-boundary H-001 で起こし、2026-10-28 夜間の規則で推奨案を採用して accepted にする): 改名の子の起動の単体テスト `rename-spawner.test.ts` を `PROCESS_SPAWN_MODULES` に実名で足す (項目 7 だけ。1 ファイルに限り、走査範囲は変えない) | `docs/decisions/` |

各 U-n の検討した案・採った案は「Clarifications」の節に置く。

## 本 feature の位置づけ

- **session の feature で、agents (セッションスレッドと改名)・main (検証済み IPC と registry)・renderer (中央のヘッダ)・Constitution 検証のスクリプトに触れる** (targets は both)。`QUERY_OPTION_KEYS` (起動の options) は変えない
- **権限モードは安全 3 値を越えない。** 実行中の切り替えは安全 3 値の中の遷移だけで、昇格値 (`acceptEdits` / `auto` / `bypassPermissions`) へは型・main の検証・agents の実行時 assert・項目 16 の backstop の 4 重で届かない。Claude Code 自身が安全 3 値の外へ移ったときの表示は O-4 の `UnsafeModeBanner` のまま
- **Principle X のまま。** 名前の正本は Claude Code の transcript (custom-title)。Closta は名前を永続化せず、稼働中の行の表示はメモリの registry にだけ持つ。Constitution Principle IV は `renameSession()` をセッションの書き込みの手段として既に挙げているので、Constitution は改めない
- **先行 ADR の読み替えを伴う。** 下の AD-062 が、AD-036 §4 P3 (`Query` は `interrupt` だけ)・§5 (実行時に権限モードを変えない) と AD-034 (書き込み系 API を許可しない) を読み替える

### 義務の扱い

roadmap の X-6 の行が預けた範囲と義務のうち、本 spec の扱いの正本はこの表である。

| 義務 (roadmap の X-6 の行ほか) | 扱い | 正本 / 当たる理由 |
|---|---|---|
| 制御要求 `set_permission_mode` / `set_model` / `set_max_thinking_tokens` / `rename_session` と、対応表の `後続: X-6` の行の書き換え (項目 21) | 扱う | US-1〜US-3、FR-001〜FR-012 / FR-015 |
| `docs/ui-coverage.md` F 節の Settings / Model selector / Composer model picker の照合 (「X-6 で照合する」。O-7 pr-gate R1 ui-coverage L-001) | 扱う | FR-016 |
| `SessionLaunchConfig` の残りの軸 (追加ディレクトリ / 上限 / セッション名) | 扱わない (理由: X-6 の後続の分割に残す)。起動のときに名前を付ける軸 (`title` の option) も残す。本 spec の名前は動いているセッションの改名だけ | roadmap の X-6 の行 |
| fork・rename・tag・delete | rename は動いているセッションの分だけ扱う。過去のセッションの rename と fork / tag / delete は扱わない (理由: X-6 の後続の分割に残す) | US-3、Out of Scope |
| providers.json・presets.json の退避ファイルの一覧・復元・版不一致の UI | 扱わない (理由: X-6 の後続の分割に残す) | roadmap の X-6 の行 |
| 同一内容の `.bak` の重複抑止 | 扱わない (理由: X-6 の後続の分割に残す) | 同上 |
| claudePath の形の判定 (shebang 形の案内。AD-041 記録 2) | 扱わない (理由: X-6 の後続の分割に残す) | 同上 |
| settings store 3 種の読み取り失敗・非配列 root・mutation 直列化の是正 | 扱わない (理由: X-6 の後続の分割に残す) | 同上 |
| セッションスレッド内のプロンプトキューが上限を超えたときの通知 | 扱わない (理由: X-6 の後続の分割に残す) | 同上 |
| /clear の後の会話の id の扱い | 扱わない (理由: X-6 の後続の分割に残す)。改名は registry の会話の id (X-9 の最初の `system/init`) を使う (Edge Cases) | 同上 |
| ツール実行中に Worker だけが異常終了したときの孤児の実機観測 | 扱わない (理由: X-6 の後続の分割に残す) | 同上 |
| composer の英語の名前の残り・ターンの開始のフォーカスの奪取 (持ち主 = O-10 と X-6 の早いほう) | 扱わない (O-10 で閉じた。018 FR-013)。本 spec は composer に触れない (U-7) | roadmap の O-7 pr-gate の項目 |
| X-8 の V-4 で孫が残れば X-6 の行に足す (020 RK-02)・X-9 の V-7 の記録を X-6 の申し送りにする | 扱わない (理由: どちらも実機の確認が未実施で、申し送る中身がまだ無い。X-6 の後続の分割に残す) | roadmap の X-8 / X-9 の行 |
| 対応表の Message branches / Regenerate menu / Edit message の fork の照合 | 扱わない (理由: fork と一緒に X-6 の後続の分割に残す) | `docs/ui-coverage.md` |

## Clarifications

### Session 2026-10-27 (夜間の規則で推奨案を採用)

- **U-1** Q: X-6 の行のどこまでを本 spec にするか → 依頼で「実行中のセッションの操作」(E 節の `後続: X-6` の 4 行) に決まっている。E 節に `後続: X-6` の行は 4 つだけで、他に範囲に入れる行は無い。F 節の Settings / Model selector / Composer model picker の 3 行は備考で「X-6 で照合する」と預かっており、モデルの切り替えの置き場所の判断と同じなので含める。採用 (2026-10-27 依頼と夜間の規則による)
- **U-2** Q: 権限モードの切り替えをどう閉じるか → 検討した案: (a) `setPermissionMode` を呼び、値を main の検証 (`validate.ts`) と agents の `assertSafePermissionMode` の 2 段で安全 3 値に閉じる。項目 16 の backstop で `.setPermissionMode(` の引数が `assertSafePermissionMode(` を通らなければ違反にする (b) 権限モードを変えたいときはセッションを終えて同じ会話を X-9 の再開で起動し直す (c) `表示不要` にする → **採った案: (a)**。(b) は変えるたびに `claude` を起こし直し、実行中の tool と承認待ちを失う。(c) は roadmap の義務を満たさない。値の検査は起動の権限モード (AD-041 (a)) と同じ関数を使い、新しい判定を作らない。採用 (2026-10-27 夜間の規則で推奨案を採用)
- **U-3** Q: モデルの切り替えの値の範囲 → 検討した案: (a) そのセッションの Provider のモデルカタログ (起動ダイアログの依存解決と同じ一覧) の値だけ。effort は起動の値のまま (b) 任意の文字列 (c) 既定に戻す (`setModel()` の引数なし) も出す → **採った案: (a)**。(b) は Provider で使えないモデルを渡せる。(c) の「既定」は Provider と CLI の設定で決まり、利用者から何のモデルか見えない。effort を実行中に変える口は `Query` に無い (`applyFlagSettings` は項目 16 の禁止のまま)。採用 (2026-10-27 夜間の規則で推奨案を採用)
- **U-4** Q: `set_max_thinking_tokens` を作るか → 検討した案: (a) 呼ばず `表示不要` (b) 思考の on / off の切り替えとして作る → **採った案: (a)**。sdk.d.ts は `setMaxThinkingTokens` を deprecated とし、起動の `thinking` の option を使えとする。Opus 4.6 では on / off としてしか効かない。Closta の思考量の軸は起動時の effort (AD-041 (g)) で、同じものを 2 つの口で持たない。`QUERY_MUTATION_METHODS` に残す。採用 (2026-10-27 夜間の規則で推奨案を採用)
- **U-5** Q: 名前をどう付けるか → 検討した案: (a) Agent SDK の `renameSession(会話の id, 名前)` で transcript に custom-title を足す。列挙と同じ列挙対象 (config ディレクトリ × 所在) で書く (plan で `dir` を渡さない形に決めた。research R-06) (b) composer から `/rename <名前>` のスラッシュコマンドを送る (c) Closta の中だけの表示名にする (d) `表示不要` → **採った案: (a)**。`Query` には `rename_session` を送るメソッドが無く、SDK が公開する改名の手段は `renameSession()` だけ。Constitution Principle IV が既に挙げる API で、名前の正本が Claude Code に残り、過去の一覧 (`customTitle`) にそのまま出る。(b) は SDK のヘッドレスで `/rename` が効くかが分からず、ターンとプロンプトのキューに混ざる。(c) は過去の一覧に出ず、起動の名前の軸 (X-6 の後続) と重なる。(d) は義務を満たさない。採用 (2026-10-27 夜間の規則で推奨案を採用)
- **U-6** Q: いつ名前を付けられるか → 検討した案: (a) 会話の id を持ち、`claude` が動いていてターンを実行していない行だけ (b) いつでも (c) 終わった行にも → **採った案: (a)**。`renameSession()` は `claude` が書いている同じ JSONL に 1 行を足すので、ターンの実行中の追記と重ならないようにする (重ならないことの実機の確認は quickstart)。会話の id は最初の `system/init` で決まる (X-9 FR-003)。終わった行と過去の行の改名は過去のセッションの rename (X-6 の後続) に残す。採用 (2026-10-27 夜間の規則で推奨案を採用)
- **U-7** Q: 操作をどこに置くか → 検討した案: (a) 中央のヘッダ (権限モードとモデルの選択、名前の編集) (b) composer の横 (Composer model picker) (c) 右のペインのタブ → **採った案: (a)**。中央のヘッダは表示中のセッションの状態を既に出す場所で (O-7 / O-4)、右のペインを畳んでいても見える。composer は IME の扱いが要る部品で、触らない (O-10 で閉じた義務を開き直さない)。registry の element は取り込まず、起動ダイアログと同じ選択の部品で組む (O-10 research SH-002 と同じ結論)。採用 (2026-10-27 夜間の規則で推奨案を採用)
- **U-8** Q: 変えた値をどこまで残すか → 検討した案: (a) 永続化せず、稼働中の行の registry にだけ今の値を持つ。プリセットにも X-9 の再開の初期値にも書き戻さない (b) 再開の初期値を今の値にする → **採った案: (a)**。(b) は 021 FR-007 の読み替えになり、本 spec の範囲を広げる。採用 (2026-10-27 夜間の規則で推奨案を採用)
- **U-9** Q: 改名を受け付けてから子が書き終えるまで (本機では 0.4〜2.4 秒、期限 10 秒) の間に利用者がプロンプトを送ったらどうするか (design-gate H-005) → 検討した案: (a) main がそのセッションの `send-prompt` を保留し、改名の結果 (成功・失敗・期限) の後に届いた順でセッションスレッドへ送る (b) main が `send-prompt` を拒否し、renderer の送信ボタンを押せない形にする (c) 窓を残るリスクとして明記するだけにする → **採った案: (a)**。U-6 の「ターンの追記と重ねない」を main の判定だけで閉じられる。(b) は `sendPrompt` が結果を返さない (`void`) ので、拒否するとプロンプトが黙って消える。押せない形にするには composer に触れる (U-7 で触らないと決めた)。(c) は RK-03 (JSONL が壊れる) の窓を残す。保留は最長で改名の期限 (10 秒) で、セッションが終わったら捨てる。採用 (2026-10-27 夜間の規則で推奨案を採用)
- **U-10** Q: カタログを持たないセッションで US-2 をどう扱うか (design-gate H-002) → 検討した案: (a) モデルの切り替えはカタログを持つ Provider のセッションだけを対象にし、Provider が既定 (null)・起動の後に消えた・起動の effort を満たすモデルが 0 のセッションでは選択を理由つきで押せない形にする (b) 既定の Provider のセッションでは任意のモデル名を入力させる (c) 既定の Provider 向けの組み込みの一覧を持つ → **採った案: (a)**。(b) は U-3 の「Provider で使えないモデルを渡せない」に反する。(c) はカタログが Provider ごとの手入力の静的データ (glossary Model catalog) という前提を変え、本 spec の範囲を広げる。既定の Provider のセッションのモデルの切り替えは X-6 の後続に残す。採用 (2026-10-27 夜間の規則で推奨案を採用)
- Q: 操作の文言 → A: 権限モードの選択の名前「権限モード」、モデルの選択の名前「モデル」、名前の編集のボタン「名前を変更」、確定「保存」、取り消し「キャンセル」。選択肢の表示は起動ダイアログの `PERMISSION_MODE_LABELS` とモデルの表示名を使う [ASSUMED: UI ラベル・ボタン文言]
- Q: 変更が失敗したときの文言 → A: 「権限モードを変更できませんでした」「モデルを変更できませんでした」「名前を変更できませんでした」を中央のヘッダの下に 1 行で出す [ASSUMED: エラーメッセージ文言]
- Q: 名前の入力の制限 → A: 前後の空白を除いて 1〜100 文字。改行と制御文字は不可。満たさなければ保存を押せず「1〜100 文字で、改行を含めずに入力してください」と出す [ASSUMED: 数値デフォルト値・入力フォームのバリデーションメッセージ文言]
- Q: 名前の編集の既定の表示 → A: 中央のヘッダの見出しをボタンにし、押すと 1 行の入力に変わる。入力の初期値は今の名前 (無ければ空) [ASSUMED: デフォルト表示状態]

## User Scenarios & Testing

### User Story 1 - 動いているセッションの権限モードを切り替えられる (Priority: P1)

利用者は `default` で起動したセッションで、調べ物の間だけ `plan` に切り替え、方針が決まったら `default` に戻して作業させる。セッションは止まらない。

**Why this priority**: 本題。今は権限モードを変えるには起動し直すしかなく、実行中の文脈と承認待ちを失う。

**Independent Test**: `default` で起動したセッションの中央のヘッダで `plan` に切り替え、次のターンで書き込みの tool が実行されないことと、ヘッダと概要のタブの権限モードが `plan` になることを確かめる。選択肢に安全 3 値の外が出ないことを確かめる。

**Acceptance Scenarios**:

1. **Given** `claude` が動いているセッション、**When** 中央のヘッダの「権限モード」を見る、**Then** 選択肢は安全 3 値 (`default` / `plan` / `dontAsk`) だけで、今の値が選ばれている
2. **Given** 上のセッション、**When** `plan` を選ぶ、**Then** セッションは止まらず、次の tool の呼び出しから `plan` で扱われ、ヘッダの値が `plan` になる
3. **Given** ターンの実行中、**When** 権限モードを切り替える、**Then** ターンは中断されず、切り替えは受け付けられる
4. **Given** 切り替えが失敗した (SDK が拒否した)、**When** 結果が返る、**Then** ヘッダの値は元のままで、失敗が 1 行で出る。セッションは続く
5. **Given** 終わった行・失敗した行・`claude` の起動前の行、**When** ヘッダを見る、**Then** 権限モードの選択は押せない
6. **Given** renderer から安全 3 値の外の値を送った (改ざん)、**When** main と agents が受ける、**Then** どちらかで拒否され、`setPermissionMode` は呼ばれない

---

### User Story 2 - 動いているセッションのモデルを切り替えられる (Priority: P1)

利用者は軽いモデルで始めたセッションで、難しい箇所に来たら同じ Provider の強いモデルに切り替えて続ける。

**Why this priority**: 起動し直さずにモデルを変えられると、費用と品質を会話の途中で調整できる。session charter Journey 4 の「モデルを選び直せる」を実行中にも広げる。対象はモデルのカタログを持つ Provider のセッションで、既定の Provider (null) のセッションは対象外 (U-10。AC6)。

**Independent Test**: Provider のモデルカタログに 2 つ以上のモデルがあるセッションで、ヘッダのモデルを切り替え、次の応答の assistant のモデルが選んだものになることを確かめる。

**Acceptance Scenarios**:

1. **Given** `claude` が動いているセッション、**When** 中央のヘッダの「モデル」を見る、**Then** 選択肢はそのセッションの Provider で選べるモデル (起動ダイアログと同じ一覧) で、今の値が選ばれている
2. **Given** 上のセッション、**When** 別のモデルを選ぶ、**Then** セッションは止まらず、次の応答から選んだモデルが使われ、ヘッダの値が変わる
3. **Given** Provider のカタログに無いモデルを renderer から送った (改ざん)、**When** main が受ける、**Then** 拒否され、`setModel` は呼ばれない
4. **Given** 切り替えが失敗した、**When** 結果が返る、**Then** ヘッダの値は元のままで、失敗が 1 行で出る
5. **Given** モデルを切り替えた後、**When** 利用者が effort を見る、**Then** effort は起動の値のまま (実行中は変えられない)
6. **Given** Provider が既定 (null) のセッション・起動の後に Provider が消えたセッション・起動の effort を満たすモデルがカタログに無いセッション、**When** 中央のヘッダの「モデル」を見る、**Then** 選択は理由 (「この Provider にはモデルの一覧がありません」) つきで押せない (U-10)

---

### User Story 3 - 動いているセッションに名前を付けられる (Priority: P2)

利用者は並べて回しているセッションに「ログインの API 修正」のような名前を付け、サイドバーの稼働中の行と、後で過去のセッションの一覧で見分ける。

**Why this priority**: 10 本を並べると自動の題では見分けにくい。名前が transcript に残れば、終わった後も過去の一覧で同じ名前で探せる。

**Independent Test**: 1 ターン話したセッションで「名前を変更」から名前を保存し、稼働中の行と中央のヘッダに名前が出ることと、セッションを終えた後に過去の区画の行に同じ名前が出る (検索でも当たる) ことを確かめる。

**Acceptance Scenarios**:

1. **Given** 会話の id を持ち、応答待ちのセッション、**When** 「名前を変更」から名前を保存する、**Then** 中央のヘッダと稼働中の行に名前が出る
2. **Given** 上で名前を付けたセッション、**When** 終了して過去の区画を見る、**Then** 行に同じ名前が出て、検索で当たる
3. **Given** ターンの実行中・会話の id がまだ無い・`claude` が終わった行、**When** ヘッダを見る、**Then** 「名前を変更」は理由つきで押せない
4. **Given** 名前の入力が空・100 文字を超える・改行を含む、**When** 保存しようとする、**Then** 保存は押せず、制限の文言が出る
5. **Given** 書き込みが失敗した、**When** 結果が返る、**Then** 名前は元のままで、失敗が 1 行で出る。セッションは続く
6. **Given** WSL のセッションと Win32 のセッション、**When** それぞれに名前を付ける、**Then** どちらも自分の config ディレクトリの transcript に記録される

### Edge Cases

- 承認待ちの承認カードがある間に権限モードを切り替えた — 承認カードは残り、利用者の応答は今どおり返る。切り替えは次の tool の呼び出しから効く
- `plan` に切り替えた後に Claude Code が `ExitPlanMode` で自分で権限モードを変えた — ヘッダは Claude Code が報告した値 (`meters.permissionMode`) を出す。安全 3 値の外なら O-4 の `UnsafeModeBanner` が出る (本 spec で扱いを変えない)
- 権限モードやモデルの切り替えを連打した — 同じセッションの変更は 1 つずつ送り、前の結果が返るまで選択を押せなくする
- 切り替えの要求の後、結果が返る前にセッションが終わった — 結果は捨て、終わりの表示を優先する
- `/clear` の後に名前を付けた — registry の会話の id は最初の `system/init` のものなので、`/clear` の前の会話に名前が付く。`/clear` の後の id の扱いは X-6 の後続の分割に残す
- Closta の外で同じ会話に名前を付けた — custom-title は最後のものが効く (sdk.d.ts の last-wins)。Closta の稼働中の行の表示は自分が付けた名前のままで、過去の一覧は次の列挙で Claude Code の値を出す
- モデルを切り替えた後に X-9 で再開した — 再開のダイアログの初期値は元の起動設定 (021 FR-007 のまま。U-8)
- 起動時の権限モードが `plan` で、Claude Code の報告がまだ無い — ヘッダは起動の値を出す
- 名前を保存した直後 (改名の結果が出る前) にプロンプトを送った — main がプロンプトを保留し、改名の結果の後に送る。ターンは改名の追記の後に始まる (U-9)。セッションが先に終わったら保留したプロンプトは捨てる

## Requirements

### Functional Requirements

#### 権限モードの切り替え (US-1)

- **FR-001**: renderer → main の制御要求に「権限モードの変更」を足し、main の検証 (`validate.ts`) は値が安全 3 値 (`isSafePermissionMode`) でなければ拒否しなければならない
- **FR-002**: セッションスレッドは、受けた値を `assertSafePermissionMode` に通してから `Query.setPermissionMode` を呼ばなければならない。項目 16 の backstop は、SDK を保持するファイルの `.setPermissionMode(` の引数が `assertSafePermissionMode(` を通らない形を違反にする
- **FR-003**: 中央のヘッダの今の権限モードは、Claude Code の報告と最後に成功した変更のうち新しい方 (どちらも `meters.permissionMode` に入る。plan research R-02) を、どちらも無ければ起動の値を出さなければならない
- **FR-004**: 変更の失敗 (SDK の Promise の reject・セッションの終了) はセッションを止めてはならない。表示を元の値に戻し、失敗を 1 行で出す

#### モデルの切り替え (US-2)

- **FR-005**: 制御要求に「モデルの変更」を足し、main はそのセッションの起動設定の Provider のモデルカタログに値が無ければ拒否しなければならない。カタログは起動ダイアログの依存解決 (AD-041) と同じものを使う
- **FR-006**: セッションスレッドは、起動の `model` と同じ文字種の検査を通してから `Query.setModel(model)` を呼ばなければならない。引数なし (既定に戻す) で呼ばない。effort は変えない
- **FR-007**: 中央のヘッダの今のモデルは、最後に成功した変更の値 (無ければ起動の値) を出さなければならない。失敗の扱いは FR-004 と同じ

#### 思考量 (U-4)

- **FR-008**: `setMaxThinkingTokens` を呼んではならない。`QUERY_MUTATION_METHODS` に残し、対応表の `set_max_thinking_tokens` の行は `表示不要` (理由: SDK が deprecated。思考量は起動時の effort の軸) にする

#### 名前 (US-3)

- **FR-009**: 制御要求に「名前の変更」を足し、main は名前を前後の空白を除いて 1〜100 文字・改行と制御文字なしで検証しなければならない。名前をログに出さない
- **FR-010**: 名前の変更は、registry の行が会話の id を持ち、`claude` が動いていてターンを実行していない (応答待ち・中断済み) ときだけ受け付けなければならない (U-6)。判定は main の registry で行う (renderer の表示に頼らない)。受け付けてから改名の結果が出るまでの間に届いたそのセッションのプロンプトの送信は、main が保留し、結果の後に届いた順で送らなければならない (U-9)
- **FR-011**: 名前は Agent SDK の `renameSession(会話の id, 名前)` で書かなければならない。config ディレクトリはその行の起動の値 (Provider の config ディレクトリ・ランタイムの所在) から、列挙と同じ列挙対象の形 (AD-028) で決め、`CLAUDE_CONFIG_DIR` の env として固定して与える。`dir` (ホストのプロジェクトのパス) は渡さない (plan research R-06)。`renameSession` を呼べるファイルは `AGENT_SDK_CALL_FILES` で 1 つに縛る
- **FR-012**: 書き込みが成功したら、main は registry の行に名前を持ち、稼働中の行と中央のヘッダに出さなければならない。名前は永続化しない (正本は transcript)。失敗はセッションを止めず、名前を元のままにして 1 行で出す

#### 置き場所・残し方・記録

- **FR-013**: 権限モードとモデルの選択と「名前を変更」は、表示中のセッションの中央のヘッダに置かなければならない (U-7)。`claude` が動いていない行では押せない形で出し、名前は FR-010 の条件を満たさない理由を出す。同じセッションの変更は前の結果が返るまで押せない
- **FR-014**: 変更した権限モード・モデルは永続化せず、プリセット・起動の記録 (`launch-usage.json`)・X-9 の再開の初期値に書き戻してはならない (U-8)
- **FR-015**: `docs/ui-coverage.md` E 節の `後続: X-6` の 4 行を書き換えなければならない — `set_permission_mode` / `set_model` / `rename_session` は `実装済み` (経路は実行中)、`set_max_thinking_tokens` は `表示不要`。書き換えた後、項目 21 の出力で割当が `後続: X-6` の行が 0 であること
- **FR-016**: F 節の Model selector / Composer model picker / Settings の行の備考に照合の結果 (中央のヘッダの選択で実装し、element は取り込まない。U-7) を書かなければならない
- **FR-017**: AD-036 §4 P3 / §5 と AD-034 の読み替え・`QUERY_MUTATION_METHODS` から `setPermissionMode` / `setModel` を外すこと (22 → 20)・`AGENT_SDK_ALLOWED_CALLS` に `renameSession` を足すこと (5 → 6) は ADR (AD-062) に書き、`allowlists.mjs`・`sdk-agent-session.ts` の `QueryMutationMethod`・`tests/docs/query-mutation-methods.test.ts`・rule fixture (今 `renameSession` / `setPermissionMode` を違反の例に使うもの) を同じ PR で直さなければならない
- **FR-018**: session charter の Related Specs / Related ADRs と「X-6 は未着手」の記述を直し、導入した用語 (実行中の権限モードの変更・モデルの変更・セッションの名前) を glossary に反映しなければならない。完了の PR で roadmap の X-6 の行に 023 の結論を書く (Principle XII / XIV)

### Key Entities

- **実行中の変更の要求**: 対象の Closta の `sessionId` と、種類 (権限モード / モデル / 名前) ごとの値の組。`SessionControl` に種類を足すか別の型にするかは plan で決める
- **稼働中の行の registry**: X-9 の registry (sessionId → セッション・会話の id) に、名前 (無ければ null) と受け付けの判定の値 (起動の effort・変更中か) を足したもの。今の権限モード・今のモデルは renderer の稼働中のストアに持つ (plan research R-07)。どれもメモリにだけ持つ
- **セッションの名前**: Claude Code の transcript の custom-title。過去の一覧の `SessionSummaryDTO.customTitle` と同じもの

### Assumptions

- `Query.setPermissionMode` / `setModel` はストリーミング入力のセッション (Closta の起動の形) で効き、ターンの実行中に呼んでも中断しない。実機で quickstart で確かめる
- `setPermissionMode` の後、Claude Code は `status` か `init` で新しい権限モードを報告する (O-4 の quickstart V-4 #5 は未確認)。報告が無くても FR-003 の「最後に成功した変更の値」で表示は成り立つ
- `renameSession()` は、`claude` が動いている間に同じ JSONL に custom-title の 1 行を足しても transcript を壊さず、ターンの実行中でなければ追記が重ならない。実機で quickstart で確かめる
- WSL のセッションの transcript には、列挙と同じく UNC の config ディレクトリでホストから書ける (AD-028 の実測は読み取り。書き込みは quickstart で確かめる)

## Success Criteria

### Measurable Outcomes

- **SC-001**: 権限モードの変更の値が、main の検証 (安全 3 値の外・型の違う値・未知のセッション) と agents の assert の両方で FR-001 / FR-002 のとおり拒否・受理される — 計測経路: `validate.ts` の検証表のテスト + セッションスレッドの制御の単体テスト (偽の `Query` で `setPermissionMode` の呼び出しの有無と引数を見る)
- **SC-002**: 項目 16 が、`.setPermissionMode(` の引数が `assertSafePermissionMode(` を通らない形と、`setMaxThinkingTokens` ほか `QUERY_MUTATION_METHODS` の 20 の呼び出しを違反にし、`renameSession` を許可のファイルの外で呼ぶ形を違反にする — 計測経路: rule fixture (`tests/rule-fixtures/`) と `tests/docs/query-mutation-methods.test.ts`
- **SC-003**: モデルの変更が、Provider のカタログの値だけを受け、カタログの外・文字種の外・引数なしを拒否する — 計測経路: main の検証の単体テスト + セッションスレッドの制御の単体テスト
- **SC-004**: 名前の変更が、行の状態 (応答待ち・中断済み・ターンの実行中・会話の id なし・終わった) の全部と、名前の制限 (空・101 文字・改行・制御文字) の全部で FR-009 / FR-010 のとおりになり (改名の結果の前に届いたプロンプトが結果の後に送られることを含む)、改名の子に渡す config ディレクトリの env がランタイムの種類 (WSL / Win32) ごとに FR-011 のとおりになる — 計測経路: main の registry と検証の単体テスト (表で回す) + 改名の呼び出しの単体テスト
- **SC-005**: 中央のヘッダの選択と名前の編集が、FR-003 / FR-007 / FR-013 の表示 (今の値・押せない形と理由・変更中の無効化・失敗の 1 行) になる — 計測経路: 中央のヘッダのコンポーネントテスト
- **SC-006**: 偽の capability で、権限モードの変更・モデルの変更・名前の変更を流し、ヘッダと稼働中の行に反映される — 計測経路: E2E (`e2e-capability.ts`)
- **SC-007**: 項目 21 の出力で、対応表の割当が `後続: X-6` の行が 0 で、E 節の 4 行が FR-015 のとおりである — 計測経路: Constitution 検証 (`scripts/constitution/check.mjs`)
- **SC-008**: 既存の起動・承認・再開・列挙のテストと Constitution 検証が通る — 計測経路: `docs/discovery.md` の verify (CI と同じコマンド)
- **SC-009**: WSL と Win32 のそれぞれで、実行中に権限モードを `plan` に切り替えると書き込みの tool が実行されず、モデルを切り替えると次の応答のモデルが変わり、名前を付けると終了後の過去の区画に同じ名前が出て transcript が壊れていない — 計測経路: quickstart の実機 (本番ビルド)。合否は下の「合否の扱い」

**合否の扱い**: 2 つの条件を分ける。

- **マージの条件** — SC-001〜SC-008 が緑であること
- **実機の確認の条件** — SC-009 が実機で通ること。実機を行えたら結果を `quickstart-results.md` と roadmap の X-6 の行に書く。行えなかったときは `quickstart-results.md` に「未実施」と書いてマージし、X-6 の行に未確認の項目として残して利用者の実機に送る (2026-10-21 夜間の規則)。実機で通らなかったときは利用者に返す

## Dependencies

- X-1 (005) の起動の契約・承認の経路・権限ゲートの正の構成 (AD-036 §4 P1 / P2) を継承する。P3 と §5 は AD-062 で読み替える
- X-4 (008) の安全 3 値の権限モード・Provider のモデルカタログと依存解決・`assertSafePermissionMode` (AD-041 (a) / (g)) を継承する
- X-5 (009) の単一 supervisor・セッションスレッド・制御の中継 (AD-043) を継承する
- X-8 (020) / X-9 (021) の Win32 の起動の値と、registry の会話の id (021 FR-003) を継承する
- R-2 (002) の列挙対象 (config ディレクトリ × 所在) と UNC の受け渡し (AD-028)、過去の一覧の `customTitle` の表示を継承する
- O-4 (014) の `meters.permissionMode` と `UnsafeModeBanner`、O-7 (013) の中央のヘッダを継承する

## Out of Scope

- `SessionLaunchConfig` の残りの軸 (追加ディレクトリ / 上限 / 起動のときのセッション名) — X-6 の後続の分割
- 過去のセッション・終わった行の rename、fork / tag / delete — X-6 の後続の分割
- 実行中の effort の変更と `setMaxThinkingTokens` (U-4)
- 既定の Provider (null) のセッションと、起動の effort を満たすモデルがカタログに無いセッションのモデルの切り替え (カタログを持たないため。U-10) — X-6 の後続の分割
- 安全 3 値の外の権限モード (昇格モード) — I-3
- 退避ファイルの UI・`.bak` の重複抑止・claudePath の形の判定・settings store の是正・プロンプトキューの上限の通知・/clear の後の会話の id・Worker の異常終了の孤児の観測 — X-6 の後続の分割
- composer の変更 (Composer model picker を含む)
