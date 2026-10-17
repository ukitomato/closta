---
spec_id: 018-session-answer-ui-and-composer-commands
feature_id: O-10
domain: session
domain_selected_by: user
targets: both
targets_selected_by: auto
status: implementing
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Feature Branch**: `018-session-answer-ui-and-composer-commands` (main (1761c32。O-6 の完了の後) から切り、2026-10-17 に O-9 の完了の後の main (886c514) に載せ直した)

**Created**: 2026-10-16 (夜間の自走で起案。利用者は不在。下の「承認の記録」のとおり 2026-10-17 に利用者が承認した)

**Status**: frontmatter の `status:` を正とする

**Input**: roadmap M3 の順 19 の O-10 の行 — `AskUserQuestion` の回答 (承認の応答の `updatedInput` に元の `input` と `answers` だけ)、Elicitation の form / URL (`onElicitation`) と `request_user_dialog` (`onUserDialog`。`supportedDialogKinds` は allowlist)、`elicitation_complete` の表示、composer のスラッシュコマンドの候補 (IME の変換中は出さない)。design の前に AD-036 Decision 4 と AD-041 (g) の読み替えの ADR を起こす。O-5 から: system-scope の composer の 2 項目、O-5 の quickstart V-3 の `AskUserQuestion` の tool_result の中身。O-6 から: モデルの拒否の後の「編集して再試行」。domain は `session` (roadmap の指定)、targets は agents・main・renderer にまたがるので `both` (自動で採用)。

## Summary

Claude Code が利用者に答えを求めたとき、アプリの中で答えられるようにする。あわせて composer でスラッシュコマンドを選べるようにする。

- **`AskUserQuestion` に答える**: 承認カードで問いの選択肢を選んで (または自由に書いて) 送ると、回答が Claude に届く。今は許可しても回答が届かない (O-5 の注記)
- **MCP サーバーの問い (Elicitation) に答える**: form なら入力欄に答え、URL ならブラウザで手続きをして、終わったことが transcript に出る。今は自動で断られる
- **composer のスラッシュコマンドの候補**: `/` で始めると、表示中のセッションの Claude Code が報告したコマンドが候補に出る (O-5 の構成のタブの一覧と同じもの)
- **composer の手入れと拒否の後の再試行**: composer のボタンの名前を日本語にし、ターンの開始で composer がフォーカスを奪わないようにする。モデルが応答を拒否したら、送った文を composer に戻して直して送れる

完了の PR で `docs/ui-coverage.md` の `後続: O-10` の 4 行を、本 feature の表示 (`実装済み`) か `表示不要` に書き換える。M3 の完了の条件の残りから O-10 の Tier A 3 行 (`AskUserQuestion`・`elicitation`・`elicitation_complete`) が消える。

**なぜ今**: M3 の完了の条件の残りは O-10 の 3 行と O-11 の 3 行である。`AskUserQuestion` は Claude Code が判断を利用者に委ねる主な手段で、今は「拒否して本文で答える」しかない。MCP サーバーの認証 (URL) や入力 (form) は、アプリから起こしたセッションでは黙って断られ、tool が失敗した理由が分からない。

## 承認の記録

夜間の自走で推奨案を仮に採用し、**2026-10-17 に利用者がすべてをそのまま承認した** (「それぞれOK」。案は変わらない)。承認を受けて AD-052 / AD-053 の frontmatter を `status: accepted`・`date: 2026-10-17` にした。これで実装 (`/cl-implement`) の着手の条件 (tasks.md「着手の条件」・SH-013) を満たす。

| # | 判断 | 承認 | 箇所 |
|---|---|---|---|
| U-1 | `AskUserQuestion` の回答の返し方 (AD-052) | 承認済み (2026-10-17 利用者) | 下の「判断」の表 |
| U-2 | Elicitation の受け方と経路 (AD-053 Decision 1〜3・5・6) | 承認済み (2026-10-17 利用者) | 同上 |
| U-3 | `request_user_dialog` を今は受けない (AD-053 Decision 4。roadmap の行の「`supportedDialogKinds` は allowlist」を空の allowlist と読む) | 承認済み (2026-10-17 利用者) | 同上 |
| U-4 | 「編集して再試行」の範囲 (composer に戻すだけで巻き戻さない) | 承認済み (2026-10-17 利用者) | 同上 |
| U-5 | 問いを待つ間のセッションの状態 (承認待ちに載せる) | 承認済み (2026-10-17 利用者) | 同上 |
| U-6 | ポジティブリストの外の細部の判断 5 つ | 承認済み (2026-10-17 利用者) | 同上 |
| U-7 | Elicitation の応答を運ぶ IPC のチャネル `respondElicitation` を 1 つ足す (plan で見つけた FR-008 と SC-010 の食い違いの解消。2026-10-16 に main が推奨案で仮採用) | 承認済み (2026-10-17 利用者) | 同上 |
| U-8 | URL の Elicitation の手続きの流れ (リンクを押すことを `accept` にする・`elicitation_complete` ではカードを外さない)。design-gate R1 H-001 / C-001 の解消 | 承認済み (2026-10-17 利用者) | 同上 |
| U-9 | 回答・Elicitation の応答が main の検証に落ちたときの扱い (IPC の戻り値は `Promise<void>` のまま、検証の述語を domain に置いて renderer・main・agents で同じものを使う)。design-gate R1 H-003 の解消 | 承認済み (2026-10-17 利用者) | 同上 |
| U-10 | SDK の側で中断された Elicitation のカードの扱い (知らせるイベントを足さず、残るカードを既知の限界とする)。design-gate R2 H-001 の解消 | 承認済み (2026-10-17 利用者) | 同上 |
| AD-052 | `AskUserQuestion` の回答の制約付き射影 (AD-036 Decision 4 P2 の読み替え) | 承認済み (2026-10-17 利用者)。accepted | [0052](../../docs/decisions/0052-ask-user-question-answer-projection.md) |
| AD-053 | `onElicitation` を足し、`onUserDialog` / `supportedDialogKinds` は渡さない (AD-041 (g) の読み替え) | 承認済み (2026-10-17 利用者)。accepted | [0053](../../docs/decisions/0053-elicitation-callback-and-user-dialog.md) |

## 本 feature の位置づけ

- **domain は `session` で、表示の部品は `ui` が持つ** (roadmap の O-10 の行・015 spec U-1・`_overview.md` の帰属の根拠)。本 feature は session の境界 (承認の応答の形・query の options・`SessionEvent` / `SessionControl` の種類・main の検証) を広げ、ui の部品 (承認カードの中身・問いのカード・composer・transcript の行) を足す
- **境界の変更は 2 つの ADR のとおりにする。** `AskUserQuestion` の回答は承認の応答の `updatedInput` を「元の入力 + `answers`」に限って許し (AD-052)、Elicitation は `onElicitation` を足して要求と応答の種類を 1 つずつ足す (AD-053)。`Query` のメソッドは今どおり `interrupt` だけ、Agent SDK の呼び出しの許可リストも変えない
- **`request_user_dialog` は受けない (U-3)。** payload と結果の形が SDK の型に無く、宣言しなければ CLI が安全側に落ちる。対応表の行 (Tier B) は `表示不要` にする
- **composer の system-scope の 2 項目を扱う。** 持ち主は「O-10 と X-6 の早いほう」で、X-6 は未着手なので O-10 が持つ (roadmap の system-scope の (7) と O-7 pr-gate R2 (1))
- **O-7 / O-4 / O-5 / O-6 の上に書く。** 問いのカードは承認カードと同じ場所 (中央の本体の会話の下) に出し、押したボタンが消えたときのフォーカスは O-4 の `focus-handoff.ts` の規則に従う。コマンドの一覧は O-5 の `meter` (`commands` / `init-report`) の合流の規則 (015 data-model §2「renderer の保持」) をそのまま使う。拒否の行は O-6 のもの

### 義務の扱い

roadmap が O-10 に預けた義務 (O-10 の行と、system-scope の持ち主の記録で O-10 に当たりうるもの) の扱いの正本はこの表である。

| 義務 (roadmap の記録) | 扱い | 正本 / 当たる理由 |
|---|---|---|
| design の前に ADR を 2 つ起こす (AD-036 Decision 4 の読み替え・AD-041 (g) の読み替え) | 入れる。AD-052 / AD-053 を proposed で起こし、2026-10-17 の利用者の承認で accepted にした (U-1 / U-2 / U-3) | 「承認の記録」 |
| (1) `AskUserQuestion` の回答 (元の `input` に `answers` だけ・キーは元の問いの文・値の長さの制限・tool 名は SDK の値・射影の関数は `toPermissionResult` の隣・キーの集合の pin テスト) | 入れる。キーは元の問いの文から agents が決め、renderer は問いの位置で送る (U-1) | US-1 / FR-001〜FR-004 |
| (2) Elicitation の form / URL (`onElicitation`)・入力を永続化しない・ログに出さない・URL は `openExternalIfHttp` だけ | 入れる (U-2) | US-2 / FR-005〜FR-009 |
| (2) `request_user_dialog` (`onUserDialog`。`supportedDialogKinds` は allowlist) | 空の allowlist として入れ、callback は渡さない (U-3) | FR-005 / FR-016。AD-053 Decision 4 |
| (3) `elicitation_complete` の表示 | 入れる | US-2 AC6 / FR-010 |
| (3) composer のスラッシュコマンドの候補 (IME の変換中は出さない。一覧は O-5 の `commands` と `init-report`) | 入れる | US-3 / FR-012 |
| 対応表の割当 (O-5 から): `elicitation_complete`・`AskUserQuestion`・`elicitation`・`request_user_dialog` | 入れる (3 行は `実装済み`、`request_user_dialog` は `表示不要`) | FR-016 / SC-009 |
| O-5 から: system-scope の composer の 2 項目 (英語の名前の残り・ターンの開始のフォーカスの奪取。持ち主 = O-10 と X-6 の早いほう) | 入れる (X-6 は未着手) | US-3 / FR-013 / FR-014 |
| O-5 から: O-5 の quickstart V-3 の `AskUserQuestion` を許可したときの tool_result の中身 | 入れる (回答を送ったときの中身として本 feature の quickstart で記録する) | SC-001 の計測経路・AD-052 Confirmation |
| O-6 から: モデルの拒否 (`model_refusal_no_fallback`) の後の「編集して再試行」(`refused_user_message_uuid`) | 入れる。composer に戻すだけで巻き戻さない (U-4) | US-4 / FR-015 |
| O-8 の行の (c): 観測点 `receivedMessages` の基準の変化を並べて書く | 入れる (記録だけ) | FR-017。`elicitation_complete` の行は `message` なので数え、`elicitation-request` は `message` ではないので数えない |
| system-scope「押したボタンが自分ごと消える」(O-4 が持って閉じた) | 継ぐ (新しい義務はない) | 問いのカードのボタンにも O-4 の `focus-handoff.ts` の規則を当てる (FR-007) |
| system-scope「`runtime-store.ts` の検出を束ねる」・「直近の活動の不可視文字の残り」・「`running-session-store.ts` の切り出し」 | 当たらない | 本 feature は `runtime-store.ts`・`sanitizeBody` の集合・直近の活動の導出を変えない。稼働中のストアには問いの要求の保持を足す (FR-006) が、切り出しは済んでいる |

## 判断 (2026-10-16 の夜間の自走で仮採用。2026-10-17 に利用者が承認)

| # | 判断 | 採用した案 (夜間の推奨案をそのまま承認) | 代わりの案 |
|---|---|---|---|
| U-1 | `AskUserQuestion` の回答を Claude に返す方式 (AD-036 Decision 4 P2 の読み替え。**承認済み (2026-10-17 利用者)**) | AD-052 のとおり。`AskUserQuestion` の許可に限り、承認の応答に `updatedInput` を足す。中身は SDK が渡した元の入力に `answers` だけを足したもの (元の入力は agents に留める)。renderer は問いの**位置**ごとの回答を今の承認の経路 (`respond-permission`) で送り、agents が元の問いの文をキーにする (roadmap の「キーは元の問いの文と照合」を、照合ではなく agents が決める形で満たす。無害化で文が変わっても崩れない)。件数違い・長すぎる値は拒否として返す。`annotations` は送らない | 全 tool に `updatedInput` を許す / renderer から `updatedInput` の全体を受ける / 問いの文をキーとして renderer から受けて照合する (roadmap の字面) / 回答を承認と別の経路で送る |
| U-2 | Elicitation の受け方 (AD-041 (g) の読み替え。**承認済み (2026-10-17 利用者)**) | AD-053 のとおり。`onElicitation` を `QUERY_OPTION_KEYS` に足し (8 → 9)、要求は `SessionEvent` の新しい種類 `elicitation-request` (8 → 9)、応答は `SessionControl` の新しい種類 `respond-elicitation` で main の検証を通す。form は MCP のスキーマの部分集合 (平らな object・文字列・数・真偽・列挙) だけを描き、外れたら断る・取り消すだけ。URL は http(s) だけをリンクで出し、今の `openExternalIfHttp` の経路で開く | 要求を `permission-request` に載せる / URL を開く IPC を足す / 任意のスキーマを描く |
| U-3 | `request_user_dialog` を受けるか (roadmap の行 (2) の範囲。**承認済み (2026-10-17 利用者)**) | 受けない。`supportedDialogKinds` の allowlist は空の固定の定数として置き、空のあいだは `onUserDialog` / `supportedDialogKinds` を options に載せない (AD-053 Decision 4)。payload と結果の形が SDK の型に無く (`payload: Record<string, unknown>`・`result: unknown`)、推測で答えると CLI の流れを誤らせる。宣言しなければ CLI はダイアログの無い振る舞いに落ちる (`refusal_fallback_prompt` は従来の拒否のエラー → O-6 の拒否の行)。対応表の `request_user_dialog` (Tier B) は `表示不要: 宣言する種類が無い (payload の形が SDK に無い。AD-053)` | `refusal_fallback_prompt` を宣言し、payload を実機で観測して形を決める (観測の前に答え方を決められない) / callback を渡して全部 `cancelled` で答える (宣言が空なら届かない) |
| U-4 | 拒否の後の「編集して再試行」の範囲 (**承認済み (2026-10-17 利用者)**) | composer に戻すだけ。`model_refusal_no_fallback` の行で、`refused_user_message_uuid` が null でない (利用者が書いた入力が拒否された) ときだけ「編集して再試行」を出し、押すと拒否されたターンにアプリから送った入力の文が composer に入る (送らない。今の下書きがあれば置き換える前に確かめる)。会話の巻き戻し (拒否された入力より前に戻して送り直す) はしない (`rewind_files` は `表示不要`。会話の分岐は X-6)。agents が読むのは `refused_user_message_uuid` が null でないかだけ (値は運ばない)。`model_refusal_fallback` には出さない (代わりのモデルで応答が済んでいる) | 巻き戻してから送り直す (X-6 の分岐・`resumeSessionAt` の範囲で、Agent SDK の呼び出しか options の追加に ADR が要る) / fallback の行にも出す |
| U-5 | 問いを待つ間のセッションの状態 (session の状態の機械。**承認済み (2026-10-17 利用者)**) | 承認待ち (`awaiting_permission`) に載せる。新しい状態を足さない。監視ビューの承認待ちの強調と件数・読み上げ (O-1) がそのまま当たり、利用者が他のセッションを見ていても気付ける。`AskUserQuestion` は SDK の上でも承認の要求なので今もこの状態に入る | 新しい状態 `awaiting_answer` を足す (状態の列挙・監視ビュー・O-1 の件数の規則を全部直す) / 状態を変えない (他のセッションを見ていると問いに気付けない) |
| U-6 | ポジティブリストの外の細部 (**承認済み (2026-10-17 利用者)**) | (a) `AskUserQuestion` の「回答を送る」は全部の問いに答えるまで押せない (未回答の問いを送ると Claude が空の答えを受ける) (b) 問いのカード (Elicitation) が同じセッションで重なったら、届いた順に 1 枚ずつ出し、残りの数を添える (c) ターンの開始では composer にフォーカスを移さず (`unstable_focusOnRunStart={false}`)、行の選択でセッションを切り替えたときは今どおり移す (`unstable_focusOnThreadSwitched` を保つ。選んだ直後に打てる) (d) コマンドの候補は入力の先頭の `/` のときだけ出す (文の途中の `/` はパスなどと区別できない) (e) form の値がスキーマに合わない・応答が main の検証に落ちたら、送らずにカードに理由を出す (agents で落ちたら断る) | (a) 一部の回答で送れる (b) 全部を並べる (c) 行の選択でも移さない (d) 文の途中でも出す (e) 黙って断る |
| U-7 | Elicitation の応答 (`respond-elicitation`) を renderer から main へ運ぶ経路 (**承認済み (2026-10-17 利用者)**。plan の段で見つけた食い違い: 今の main には `SessionControl` を何でも運ぶ汎用のチャネルが無く、制御の種類ごとに専用のチャネルと capability のメソッドがある) | IPC のチャネル `respondElicitation` を 1 つ足す (`IPC_CHANNELS`・`ClostaCapability.respondElicitation`・preload・main の handler・チャネルの集合の固定テストを +1)。URL を開く IPC は作らない (AD-053 Decision 5 のまま)。AD-053 の Consequences にチャネルが 1 つ増えることを書く | `respondPermission` に相乗りさせ、引数の形で振り分ける (唯一の承認経路が承認でない応答を運び、AD-053 の Alternatives が退けた問題を応答の側に持ち込む) |
| U-8 | URL の Elicitation の手続きの流れ (**承認済み (2026-10-17 利用者)**。design-gate R1 H-001 / C-001) | カードの「ブラウザで手続きをする」(リンク) を押すと、URL を既定のブラウザで開き、**同時に `accept` (content なし) を返してカードを外す**。URL のカードに別の「送る」ボタンは無く、選べるのは「ブラウザで手続きをする」「断る」「取り消す」の 3 つ。MCP の URL モードの `accept` は「利用者が URL に進むことに同意した」の意味で、手続きの完了はサーバーが `elicitation_complete` で知らせる。`elicitation_complete` はカードを外さない (届いた事実の行を出すだけ。`elicitation_id` は行の id にだけ使い、カードと照合しない。AD-053 Decision 6)。開いた後に手続きを済ませずに閉じたときの回復は MCP サーバーの側 (tool の失敗か再要求) に任せる。`openUrl` が null (http(s) でない) の URL への `accept` は agents が `decline` に替える | リンクと「手続きに進む」(`accept`) のボタンを分ける (押す順で状態が 2 つに割れ、リンクだけ押して `accept` を送らないと承認待ちが残る) / `elicitation_complete` で `elicitationId` を照合してカードを外す (カードが残っていれば SDK の callback はまだ待っており、外すと応答が返らない) |
| U-9 | 応答が main の検証に落ちたときの扱い (**承認済み (2026-10-17 利用者)**。design-gate R1 H-003) | IPC の戻り値は今の `respondPermission` と同じ `Promise<void>` のまま。回答 (`isPermissionAnswers`) と Elicitation の応答 (`isElicitationAction` / `isElicitationContent`) の検証の述語を **domain に置き**、renderer (送る前の確かめ)・main (`validate.ts` から呼ぶ)・agents (`decodeSessionControl`) が同じ関数を使う。renderer は述語を通したものだけを送るので、main で落ちる応答は renderer の不具合でしか起きない。その不具合は domain の述語の単体と、renderer の送る前の確かめが同じ述語を呼ぶことの component テストで防ぐ。ストアが送る前にカードを外す今の規則は変えない | 戻り値を `Promise<boolean>` にし、`false` ならカードを戻す (capability・preload・store の非同期の戻しが要り、外した後に戻すとフォーカスと読み上げが揺れる。今の承認の経路の形とも割れる) |
| U-10 | SDK の側で中断された Elicitation (`signal`。MCP 側のタイムアウトなど) のカードの扱い (**承認済み (2026-10-17 利用者)**。design-gate R2 H-001) | 知らせるイベントを足さない。renderer がカードを外すのは US-2 AC7 の場面 (応答を送る・`failure`・強制終了・閉じる・`state` が `interrupted` / `error` / `done` になる) だけ。ターンを続けたまま SDK の側で中断された問いのカードは残る。押すとカードは外れて応答が agents に届くが、registry に無い `requestId` なので何もしない (害は無い)。それが最後の待ちならセッションは `running` に戻り、カードだけが残る。これを既知の限界として記録する | `state` が `awaiting_permission` を出たら `elicitations` を外す (承認と同時に待つ場合と、`state` と要求のイベントの順序を決める必要がある) / 既存のイベントに cancel を載せる (`SESSION_EVENT_KINDS` は 9 のまま。どのイベントに載せるかの契約が要る) / 新しいイベントの種類を足す (9 → 10。AD-053 の範囲を広げる) |

## Clarifications

### Session 2026-10-16 (夜間の自走。利用者は不在)

各項目の末尾に、`/cl-spec` Phase 8 の基準での根拠を書く。ポジティブリストの外の項目は上の「判断」の U-n に入れた。

- Q: `AskUserQuestion` の承認カードの見せ方 → A: O-5 の読み取り専用の表示 (問い・見出しのチップ・選択肢と説明) を答えられる形にし、選択肢ごとに選ぶ部品 (単一はラジオ、`multiSelect` はチェック) と「その他 (自由に書く)」の欄を出す。ボタンは「回答を送る」「拒否」。O-5 の注記は消す [ASSUMED: 既定の表示状態と UI ラベル (ポジティブリスト)]
- Q: `multiSelect` の回答の文字列 → A: 選んだ選択肢の `label` を「, 」でつないだ 1 つの文字列 (`answers` の値は文字列) [ASSUMED: 書式の既定値。V-3 で Claude Code 自身の書式と比べて記録する]。形の正本は data-model
- Q: 回答と Elicitation の文字列の長さの上限 → A: 1 つの値に 1,000 コードポイント、`AskUserQuestion` は問いの数 (1〜4) まで、Elicitation の `content` は 32 項目まで [ASSUMED: 数値の既定値 (ポジティブリスト)]
- Q: 問いのカードの見出しと文言 → A: 見出しは「{サーバー名} からの問い」、URL は「ブラウザで手続きをする」のリンク (押すと開いて `accept` を返す。U-8) と全体の URL (host を強調) と「開くと、手続きに進むことがサーバーに伝わります」の添え書き、ボタンは form が「送る」「断る」「取り消す」、URL が「断る」「取り消す」(リンクが「送る」を兼ねる)、答えられないスキーマは「このアプリでは答えられない形式の問いです。断るか取り消してください」 [ASSUMED: UI ラベル (ポジティブリスト)]
- Q: `elicitation_complete` の行の文言 → A: 「{サーバー名} の URL での手続きが終わりました」 [ASSUMED: UI ラベル (ポジティブリスト)]
- Q: コマンドの候補の並びと件数 → A: 名前の昇順。入力に前方一致するものを 20 件まで出し、超えた数を「ほか N 件」 [ASSUMED: ソート順と表示件数の既定値 (ポジティブリスト)]
- Q: composer のボタンの日本語の名前 → A: 「送信」「生成を止める」「最下部へ」「音声入力を始める」「音声入力を止める」(ツールチップも同じ語) [ASSUMED: UI ラベル (ポジティブリスト)]。文言は `features/chat/labels.ts` に置く (AD-045 Decision 2)
- Q: 「編集して再試行」で composer に下書きがあるとき → A: 置き換える前に「入力中の文を置き換えますか」を確かめる [ASSUMED: 確認の文言と既定の表示状態 (ポジティブリスト)]
- Q: 問いのカードを中断・セッションの終了で閉じたときの見せ方 → A: カードを外し、transcript に「問いは取り消されました」の行は出さない (tool の結果か MCP の結果に出る) [ASSUMED: 既定の表示状態 (ポジティブリスト)]

## User Scenarios & Testing

### User Story 1 - Claude Code の質問 (`AskUserQuestion`) に答える (Priority: P1)

利用者は承認カードで Claude Code の質問の選択肢を選び (または自由に書き)、送る。Claude は回答を受けて作業を続ける。

**Why this priority**: Tier A。`AskUserQuestion` は Claude Code が方針を利用者に委ねる主な手段で、今は拒否して本文で答えるしかない (O-5 の注記)。

**Independent Test**: 射影の純関数と `canUseTool` の単体 (fixture の元の入力と回答から `updatedInput` を確かめる) と、承認カードの component テスト。

**Acceptance Scenarios**:

1. **Given** 承認待ちの `AskUserQuestion` (問い 1〜4 件)、**When** 承認カードを見る、**Then** 問いごとに見出し・問いの文・選択肢 (説明つき) と、選ぶ部品 (単一 / 複数) と「その他」の欄が出る。O-5 の「回答を送れません」の注記は出ない
2. **Given** 全部の問いに答えた、**When** 「回答を送る」を押す、**Then** agents が SDK の元の入力に `answers` (キーは元の問いの文) だけを足した `updatedInput` で許可を返し、カードが外れる。Claude の次の応答が回答を前提に進む (tool_result に回答が入る。V-3 で記録)
3. **Given** 未回答の問いがある、**When** カードを見る、**Then** 「回答を送る」は押せず、未回答の問いが分かる (U-6 (a))。問いに「答えた」とは、その問いの回答の文字列 (data-model §1「回答の文字列」) が前後の空白を除いて 1 コードポイント以上あること: 単一は選択肢を 1 つ選んだか、「その他」を選んで空白以外の文を書いた。`multiSelect` は選択肢を 1 つ以上選んだか、「その他」に空白以外の文を書いた。「その他」を選んで空白だけを書いたのは未回答
4. **Given** 「拒否」を押す、**When** 送る、**Then** 今の拒否と同じ応答 (`{behavior, message}`) が返る
5. **Given** 回答が検証 (件数・型・長さ・前後の空白を除いて空でない) か agents の照合 (問いの数) に落ちる、**When** 送る、**Then** renderer は main と同じ domain の述語 (`isPermissionAnswers`) で送る前に確かめ、落ちたら送らずカードに理由が出る (カードは外れない。U-9)。agents で落ちたら許可ではなく拒否が返る (回答を落として許可しない。AD-052 Decision 2)。空白だけの回答は 3 段 (renderer・main・agents) のどこでも同じく落ちる
6. **Given** tool 名が `AskUserQuestion` でない (MCP の `mcp__x__AskUserQuestion`・無害化で同じ見た目になる名前を含む)、**When** 承認する、**Then** 承認カードは今のままで、応答に `updatedInput` は無い

---

### User Story 2 - MCP サーバーの問い (Elicitation) に答える (Priority: P1)

利用者は、MCP サーバーが求める入力 (form) に答えるか、URL の手続き (認証など) をブラウザで済ませる。手続きが終わると transcript で分かる。

**Why this priority**: Tier A 2 行 (`elicitation`・`elicitation_complete`)。今は自動で断られ、MCP の tool が失敗した理由が利用者に分からない。

**Independent Test**: agents の `onElicitation` の単体 (要求の形の検査・応答の照合・中断)、main の検証の単体、問いのカードと行の component テスト。

**Acceptance Scenarios**:

1. **Given** form の Elicitation (スキーマが部分集合の中)、**When** 届く、**Then** 承認カードと同じ場所に問いのカード (サーバー名・`message`・スキーマの項目ごとの入力欄・必須の印) が出て、セッションは承認待ちになる (U-5)
2. **Given** form に答えた、**When** 「送る」を押す、**Then** `accept` と入力の値が MCP サーバーに返り、カードが外れる。値はアプリのどこにも残らない (永続化・ログ・transcript の `message`・稼働中のストアの保持のどれにも無い)
3. **Given** 「断る」/「取り消す」、**When** 押す、**Then** `decline` / `cancel` が返る
4. **Given** スキーマが部分集合の外 (入れ子・配列の object など)、**When** 届く、**Then** 入力欄は出ず、答えられない形式である旨と「断る」「取り消す」だけが出る
5. **Given** URL の Elicitation (http(s) の URL)、**When** 届く、**Then** カードに host を強調した URL・「ブラウザで手続きをする」のリンク・「開くと、手続きに進むことがサーバーに伝わります」の添え書き・「断る」「取り消す」が出る。リンクを押すと既定のブラウザで開き (main の `openExternalIfHttp` の経路)、同時に `accept` (content なし) が MCP サーバーに返ってカードが外れ、承認待ちが解ける (U-8)。http(s) でない URL は「この URL はアプリから開けません」と出てリンクが無く、断る・取り消すだけ (agents に `accept` が届いても `decline` を返す)
6. **Given** `elicitation_complete`、**When** 届く、**Then** transcript に「{サーバー名} の URL での手続きが終わりました」の行が出る。問いのカードは外さない (カードが残っているのは、まだ応答を返していない要求だけ。U-8)
7. **Given** 問いのカードが出ている、**When** 利用者がターンを中断する・セッションを終了する (終了・強制終了)・閉じる、またはセッションが失敗する、**Then** カードが外れ、入力の値は捨てられる。ターンを続けたまま SDK の側で中断された問い (MCP 側のタイムアウトなど) のカードは残るが、押せば外れ、agents は知らない要求として何もしない (既知の限界。U-10)
8. **Given** 全部の項目が任意の form、**When** 何も入れずに「送る」を押す、**Then** `accept` と空の `content` (`{}`) が返る。任意の項目を空のままにした文字列・数・列挙はキーごと送らない。真偽の項目は常に値を持ち (チェックの無い状態が `false`。初期値はスキーマの `default`、無ければ `false`)、送る (data-model §3「form の値の組み立て」)

---

### User Story 3 - composer でスラッシュコマンドを選び、composer に邪魔されない (Priority: P2)

利用者は composer に `/` と打って、表示中のセッションで使えるコマンドを候補から選ぶ。ボタンの名前は日本語で読め、他の場所を操作している間にターンが始まってもフォーカスを奪われない。

**Why this priority**: Tier A の element (Composer slash commands)。O-5 で一覧は構成のタブに出たが、composer から選べない。名前とフォーカスは a11y の system-scope の宿題 (WCAG 3.1.2 / 2.4.3)。

**Independent Test**: composer の component テストと IME の E2E。

**Acceptance Scenarios**:

1. **Given** 稼働中のセッションの composer の入力の先頭が `/`、**When** 打つ、**Then** 表示中のセッションの Claude Code が報告したコマンド (O-5 の `commands` と `init-report` の合流) のうち前方一致するものが、名前・説明・引数の形つきで候補に出る
2. **Given** 候補が出ている、**When** 上下の矢印で選んで Enter か Tab、**Then** 入力が `/{name} ` になり、送られない。Escape で候補が閉じる
3. **Given** IME の変換中 (`isComposing` / 229)、**When** `/` を含む文字を打つ・矢印・Enter、**Then** 候補は出ず、キーは変換に渡る (Principle VIII)
4. **Given** 一覧が無い (構成が届いていない・0 件)、**When** `/` と打つ、**Then** 候補は出ない (入力はそのまま送れる)
5. **Given** composer、**When** 支援技術で読む、**Then** 送信・生成を止める・最下部へ・音声入力のボタンの名前とツールチップが日本語で読まれる
6. **Given** サイドバーの行にフォーカスがある、**When** 表示中のセッションが idle から running に変わる、**Then** フォーカスは動かない。行の選択でセッションを切り替えたときは今どおり composer に移る (U-6 (c))

---

### User Story 4 - 拒否された文を直して送り直す (Priority: P3)

利用者は、モデルが応答を拒否したとき、送った文を composer に戻して直し、送り直す。

**Why this priority**: O-6 から預かった操作。O-6 の拒否の行は「言い直して送り直せる」と書くだけで、今は自分で書き直すしかない。

**Independent Test**: agents の変換の単体 (`refused_user_message_uuid` の有無) と、拒否の行と composer の component テスト。

**Acceptance Scenarios**:

1. **Given** `model_refusal_no_fallback` で `refused_user_message_uuid` が null でない、**When** 拒否の行を見る、**Then** 「編集して再試行」が出る
2. **Given** 「編集して再試行」を押す、**When** composer が空、**Then** 拒否されたターンにアプリから送った文が composer に入り、フォーカスが composer に移る。送られない
3. **Given** composer に下書きがある、**When** 押す、**Then** 置き換えるかを確かめ、取り消せば下書きはそのまま
4. **Given** `refused_user_message_uuid` が null・無い (古い CLI)・`model_refusal_fallback`、**When** 行を見る、**Then** 「編集して再試行」は出ない

---

### Edge Cases

- `AskUserQuestion` の元の入力に既に `answers` がある → アプリが組んだ値で置き換える (AD-052 Decision 2)
- `AskUserQuestion` の問いの文が同じ問いが 2 つある → キーが重なるので射影せず拒否として返し、カードに本文で答えるよう出す [ASSUMED: エラーメッセージの文言 (ポジティブリスト)]
- 起動の権限モードが `dontAsk` / `plan` のとき `AskUserQuestion` が承認の要求として届くか → 確かめずに、届いたときだけ答えられる規則にする (届かなければ今どおり。V-3 で記録)
- 選択肢の `preview` → O-5 の読み取り専用の表示の扱いのまま (回答には入れない。`annotations` を送らない)
- Elicitation の `message`・サーバー名・項目の名前と説明・URL は未信頼 → 無害化・形の検査・切り詰めを通す (正本は data-model。O-5 の名前の形の検査と同じ考え方)
- Elicitation の URL の資格情報 (`https://user:pass@…`)・クエリの秘密 → カードの表示は O-6 の伏せ字 (`redactSecrets`) を通す。開く URL は伏せない (開けなくなる)
- ターンの途中で SDK の側で中断された Elicitation (MCP 側のタイムアウトなど) → agents は `cancel` を返すが renderer に知らせず、カードは残る。押せば外れ、agents は何もしない (既知の限界。U-10)
- `elicitationId` の無い URL の Elicitation → カードは同じ。`elicitation_complete` とは照合しない (`elicitationId` があっても照合しない。U-8)
- URL のカードが出たまま `elicitation_complete` が届いた (別の経路で手続きを済ませた) → 行を出し、カードは残す。利用者がリンク・断る・取り消すで応答する (SDK の callback が待っているので、応答せずに外さない)
- `elicitation_complete` に対応するカードが無い (別のクライアントが答えた・再起動) → 行だけ出す
- 承認カードと問いのカードが同じセッションで同時に待つ → 両方を出し、承認カードを上に置く [ASSUMED: 既定の表示状態 (ポジティブリスト)]
- 表示していない稼働中のセッションで問いが届いた → 承認待ちの件数と強調 (O-1) で気付ける (U-5)
- 過去ログ・過去のセッション → 問いのカードとコマンドの候補は出ない (稼働中だけ)。過去ログの `AskUserQuestion` は O-5 の表示 (回答があれば選ばれた選択肢)
- コマンドの名前に `/` が付いている・付いていない → O-5 の合流の規則と同じく先頭の `/` を 1 つ外して比べ、入れるときは 1 つ付ける
- 「編集して再試行」の文が見つからない (アプリから送っていない・閉じた後) → ボタンを出さない
- 回答・form の値が検証の範囲の外 → renderer が main と同じ domain の述語で送る前に確かめ、送らずにカードに理由を出す (カードはそのまま。U-6 (e) / U-9)。それでも main の検証で `respond-elicitation` / 回答つきの `respond-permission` が落ちたら (renderer の不具合) supervisor に届けない。IPC の戻り値は `Promise<void>` で renderer に失敗を返さない (今の `respondPermission` と同じ。U-9)

## Requirements

### Functional Requirements

#### `AskUserQuestion` の回答 (US-1)

- **FR-001**: 承認カードは、tool 名 (表示用の名前ではなく、agents が SDK の値で判定した印) が `AskUserQuestion` の要求に、問いごとの答える部品と「回答を送る」「拒否」を出さなければならない。O-5 の注記 (015 data-model §4) を消す。問いの表示は O-5 の部品 (`ask-user-question.aui.tsx`) を元にする
- **FR-002**: renderer は回答を問いの位置ごとの文字列の列として、今の承認の経路 (`respondPermission`) で送り、main は回答の形 (配列・件数 1〜4・文字列・前後の空白を除いて 1 コードポイント以上・1,000 コードポイント以下) を明示の述語で検証しなければならない (AD-052 Decision 3)。述語は domain に置き、renderer の送る前の確かめと agents の decode も同じ述語を使う (U-9)。新しい IPC のチャネルを作らない
- **FR-003**: agents は、SDK の tool 名が `AskUserQuestion` と完全一致し、決定が許可で、回答があるときだけ、`toPermissionResult` の隣の射影の純関数で `updatedInput` (元の入力 + `answers`) を組まなければならない。キーは元の問いの文、件数は問いの数と一致、値は長さの上限内。外れたら拒否として返す (AD-052 Decision 1 / 2)。射影の規則と上限の正本は data-model
- **FR-004**: 承認の応答の境界を固定テストで守らなければならない: tool ごとの出力のキー集合の pin (`AskUserQuestion` の許可は `{behavior, updatedInput}`、それ以外は ⊆ `{behavior, message}`)・`updatedInput` のキー集合 (元の入力のキー ∪ {`answers`})・`updatedPermissions` 0・項目 16 の `updatedInput` の backstop と違反の fixture (AD-052 Decision 4)。`createCanUseTool` の「全 return は `toPermissionResult` を通す」の静的な検査は、射影の関数を通す形も認めるように直す

#### Elicitation と `request_user_dialog` (US-2)

- **FR-005**: agents は query の options に `onElicitation` を足し、`QUERY_OPTION_KEYS` の pin を 9 キーに直さなければならない。`onUserDialog` / `supportedDialogKinds` は載せない。`supportedDialogKinds` の allowlist は domain の空の固定の定数として置き、空であることを pin する (U-3。AD-053 Decision 1 / 4)
- **FR-006**: agents は Elicitation の要求を形の検査 (サーバー名・`message`・`mode`・http(s) の URL・`elicitationId`・スキーマの部分集合への射影) に通し、`SessionEvent` の `elicitation-request` で送らなければならない。renderer は稼働中のストアにセッションごとの待ちの列として持つ (永続化しない)。通すフィールドとスキーマの部分集合の正本は data-model (AD-053 Decision 2)
- **FR-007**: renderer は、問いのカードを承認カードと同じ場所に出さなければならない。form はスキーマの項目ごとの入力欄 (文字列・数・真偽・列挙)、URL はリンク (今の新しいウィンドウの要求 → `openExternalIfHttp` の経路。URL を開く IPC を作らない。押すと同時に content なしの `accept` を返す。U-8)、部分集合の外は「断る」「取り消す」だけ。押したボタンでカードが消えたときのフォーカスは O-4 の `focus-handoff.ts` の規則に従う
- **FR-008**: 応答は `SessionControl` の `respond-elicitation` で main を通さなければならない。main は id の形・`action` の列挙・`content` の件数 (省略可。あれば 0〜32)・値の型と長さを明示の述語 (domain に置き、renderer と agents も同じものを使う。U-9) で検証し、agents は要求の mode とスキーマと照合して、合わなければ `decline` を返す (AD-053 Decision 2)。URL の要求への `accept` は content を捨てて `{action: 'accept'}` を返し (開ける URL のときだけ。開けない URL と答えられない form への `accept` は `decline`)、form への `accept` は content が無ければ空の object として照合する。規則の正本は data-model §3
- **FR-009**: Elicitation の入力は永続化しない・ログに出さない・transcript の `message` に載せない。応答・中断 (`signal`)・セッションの終了・閉じるで、renderer と agents の保持を捨てなければならない。中断・終了のときは `cancel` で返す (返せる場合) (AD-053 Decision 3)。renderer がカードと入力を捨てる場面は US-2 AC7 のとおりで、SDK の側だけの中断を renderer に知らせるイベントは足さない (U-10)
- **FR-010**: agents は `elicitation_complete` を O-2 のシステムイベントの行 (`message`) で送らなければならない。読むのは形の検査を通した `mcp_server_name` と `elicitation_id` だけ (AD-053 Decision 6)
- **FR-011**: 問い (Elicitation) を待つ間、セッションの状態を承認待ち (`awaiting_permission`) にし、全部に答えるか取り消されたら元の状態に戻さなければならない (U-5)。承認の要求と問いが重なっても、どちらかが残る間は承認待ちのまま

#### composer (US-3 / US-4)

- **FR-012**: 稼働中のセッションの composer は、入力の先頭が `/` のとき、表示中のセッションのコマンドの一覧 (015 data-model §2「renderer の保持」の合流の結果) から前方一致の候補を出さなければならない。選ぶと `/{name} ` を入れて送らない。IME の変換中 (`isComposing` / 229) は出さず、キーを奪わない (Principle VIII)。assistant-ui の composer の部品 (トリガーの popover) が使えるならそれを優先する (Principle XIII。採否と registry との照合は plan の research)
- **FR-013**: composer のボタン (送信・生成を止める・最下部へ・音声入力の開始と停止) の名前とツールチップを日本語にし、`features/chat/labels.ts` の文言の表から取らなければならない。E2E・component テスト・perf (文字列だけ。実行しない) の locator を同じ PR で直す
- **FR-014**: composer の入力は、ターンの開始でフォーカスを奪ってはならない (`unstable_focusOnRunStart={false}`)。行の選択でのフォーカスの移動 (`unstable_focusOnThreadSwitched`) は保ち、判断を記録する (U-6 (c))
- **FR-015**: 拒否の行は、`model_refusal_no_fallback` で `refused_user_message_uuid` が null でないとき「編集して再試行」を出し、押すと拒否されたターンにアプリから送った文を composer に入れなければならない (送らない・巻き戻さない)。agents が運ぶのは `refused_user_message_uuid` が null でないかの真偽だけ (U-4)

#### 対応表と記録

- **FR-016**: 完了の PR で `docs/ui-coverage.md` を書き換えなければならない: `AskUserQuestionInput`・`elicitation`・`SDKElicitationCompleteMessage` を `実装済み`、`request_user_dialog` を `表示不要` (AD-053)、F 節の Composer slash commands・Elicitation form・Question flow の使い道、`model_refusal_no_fallback` の行の備考 (「編集して再試行」)。項目 21 の出力で割当先が O-10 の行が 0。書き換え先の正本は data-model
- **FR-017**: 導入した用語と判断を記録に反映しなければならない (Principle XIV): glossary (Question from Claude Code の O-10 の結論・問いのカード・コマンドの候補)・session charter (Related Specs・Related ADRs に AD-052 / AD-053・`SessionEvent` / `SessionControl` の種類と `PermissionDecision` の拡張)・ui charter (composer の slash commands の持ち主の結論)・`_overview.md`・roadmap (O-10 の行の結論・system-scope の composer の 2 項目を閉じた記録・O-8 の行の (c) の注記)・`docs/prompts.md`・005 contracts C-4 / data-model §5 への AD-052 / AD-053 の pointer。対象の一覧の正本は tasks.md

### Key Entities

- **回答の射影**: `AskUserQuestion` の元の入力に `answers` だけを足した `updatedInput`。agents が組み、元の入力は renderer に往復しない。正本は data-model と AD-052
- **問いの要求 (ElicitationRequest の写し)**: `elicitation-request` で運ぶ形の検査済みの要求 (サーバー名・`message`・`mode`・URL・スキーマの部分集合)。永続化しない。正本は data-model
- **問いの応答**: `respond-elicitation` の `action` と `content`。main が形を、agents がスキーマとの一致を確かめる
- **コマンドの候補**: O-5 の構成のコマンドの一覧 (`commands` / `init-report`) の前方一致の絞り込み。新しい保持を持たない

### Assumptions

- **[承認済み (2026-10-17 利用者) U-1〜U-10・AD-052・AD-053]** 上の「判断」の表と「承認の記録」
- **[ASSUMED]** Clarifications の 9 項目と Edge Cases の 2 項目 (UI ラベル・既定の表示状態・数値の既定値・ソート順・エラーメッセージ。ポジティブリスト)
- `AskUserQuestion` の tool_result の中身・`multiSelect` の回答の書式・`dontAsk` / `plan` での届き方・Elicitation (form / URL) と `elicitation_complete` の実機での届き方は未確認として扱い、quickstart の実機の目視で記録する (起こせなければ未確認のまま残す)
- 起動したセッションの MCP サーバーが Elicitation を送るかはサーバー次第で、届く場面は少ない。振る舞いは fixture の単体と component で確かめる

## Success Criteria

- **SC-001**: **`AskUserQuestion` の回答が届く。** US-1 の AC1〜AC5 のとおりになり、fixture の元の入力 (問い 1 件・4 件・`multiSelect`・その他の自由記述) から組んだ `updatedInput` が「元の入力 + `answers` (キーは元の問いの文)」と一致する。計測経路: 射影の純関数と `canUseTool` の単体 + 承認カードの component テスト + quickstart の実機の目視 (tool_result の中身の記録。O-5 V-3 から預かった項目)
- **SC-002**: **回答の経路が承認の意味を変えない。** US-1 AC6 のとおりで、tool ごとの出力のキー集合の pin・`updatedInput` のキー集合・`updatedPermissions` 0 が通り、負の fixture (別の tool 名・似た名前・件数違い・長すぎる値・重なる問いの文・renderer が送った問いの文) で `updatedInput` が出ない。項目 16 の `updatedInput` の backstop の違反 fixture が発火する。計測経路: 固定テスト + 項目 16 の fixture
- **SC-003**: **Elicitation に答えられる。** US-2 の AC1〜AC5・AC7・AC8 のとおりになる。URL の要求への content なしの `accept` と、全部が任意の form への空の `accept` が renderer → main → agents を通って SDK に `{action: 'accept'}` / `{action: 'accept', content: {}}` で届く (URL の `accept` に付いた content は SDK に渡らない)。部分集合の外のスキーマ・http(s) でない URL・main の検証の外れ (列挙の外の `action`・件数の超過・型違い・長すぎる値) で例外が出ず、supervisor に届かないか `decline` になる。計測経路: agents の単体 + main の検証の単体 + 問いのカードの component テスト + 経路の通しのテスト (`tests/elicitation/elicitation-through.test.tsx` の URL の場合)
- **SC-004**: **Elicitation の入力が残らない。** 目印の値を form に入れて送ったあと、目印が永続化のファイル (fake の settings の層)・ログの出力 (agents / main)・`SessionEvent` の `message`・稼働中のストアの保持・DOM のどれにも 0 件。計測経路: 経路の通しのテスト (O-4 の `tests/meter/meter-through.test.tsx` の形) + agents / main の単体
- **SC-005**: **URL の手続きが終わったと分かる。** US-2 AC6 のとおりになり、サーバー名が形の検査を通らなければ「MCP サーバー」とだけ出る。計測経路: agents の変換の単体 + 行の component テスト
- **SC-006**: **コマンドを候補から選べる。** US-3 の AC1〜AC4 のとおりになり、IME の変換中に候補が出ずキーが送信にも選択にも使われない。vitest-axe (O-7 で導入) の違反 0。計測経路: composer の component テスト + IME の E2E (`e2e/ime.spec.ts` に変換中の `/` の場合を足す)
- **SC-007**: **composer の名前とフォーカス。** US-3 の AC5 / AC6 のとおりになり、composer の英語のボタンの名前が DOM に 0 件 (FR-013 の対象)。計測経路: composer の component テスト + E2E の locator (CI の e2e の job)
- **SC-008**: **拒否された文を直して送り直せる。** US-4 の AC1〜AC4 のとおりになり、`refused_user_message_uuid` の値が `SessionEvent` と DOM に 0 件 (真偽だけを運ぶ)。計測経路: agents の変換の単体 + 拒否の行と composer の component テスト
- **SC-009**: **対応表の O-10 の行が無くなる。** 項目 21 が通り、出力で割当先が O-10 の行が 0、M3 の完了の条件の残りが O-10 の前より 3 減る (残りは O-11 の 3 行)。計測経路: `node scripts/constitution/check.mjs`
- **SC-010**: **境界の変更が ADR のとおり。** `QUERY_OPTION_KEYS` は 9 キー (`onElicitation` が増え、`onUserDialog` / `supportedDialogKinds` を含まない)、`SESSION_EVENT_KINDS` は 9 (`elicitation-request`)、`SessionControl` は `respond-elicitation` の 1 種類だけ増える。Agent SDK の呼び出しの許可リスト・`Query` のメソッドの呼び出し (`interrupt` だけ)・`QUERY_MUTATION_METHODS`・`METER_UPDATE_TYPES`・`TRANSCRIPT_PART_FIELDS` の差分が 0。IPC のチャネルは `respondElicitation` の 1 つだけ増え、preload の公開面は `respondElicitation` の追加と `respondPermission` の引数の型だけが変わる (U-7。戻り値はどちらも `Promise<void>`。U-9)。計測経路: 固定テスト + 項目 16 + `git diff` (quickstart V-1)

## Dependencies

- **O-5** ([015](../015-ui-mcp-elicitation-commands/spec.md)。PR #17 で完了): `AskUserQuestion` の読み取り専用の表示と承認カードの注記、構成の `meter` (`init-report` / `commands`) と稼働中のストアのコマンドの合流の規則、`QUERY_MUTATION_METHODS` と集合の固定テスト、名前の形の検査 (AD-048。accepted)
- **O-6** ([016](../016-ui-boundaries-and-tool-displays/spec.md)。PR #19 で完了): モデルの拒否の行 (`live-signals.ts` の `model_refusal_no_fallback` の分岐)、秘密の伏せ字 (`redactSecrets`)、読み上げ (AD-049。accepted)
- **O-4** ([014](../014-ui-metering-and-limits/spec.md)。PR #15 で完了): システムイベントの行を agents で組む形、押したボタンが消えたときのフォーカス (`focus-handoff.ts`) (AD-047。accepted)
- **O-7** ([013](../013-ui-app-shell/spec.md)。PR #13 で完了): 中央の本体の置き場所、vitest-axe (AD-046。accepted)
- **O-3** ([012](../012-ui-thread-search/spec.md)。PR #14 で完了): composer の名前と placeholder の日本語化と `labels.ts` (AD-045。accepted)
- **X-1 / X-2 / X-4 / X-5** (005 / 006 / 008 / 009): 承認の往復と正の構成 (AD-036)、IME の composer と E2E (AD-037 / AD-038)、query の options のキー (AD-041 (g))、セッションスレッドと承認の照合 (AD-043)
- **O-2** ([011](../011-ui-coverage/spec.md)): 対応表とシステムイベントの行の経路

## Out of Scope

- `request_user_dialog` を受けること (U-3。種類の payload の形を確かめた feature が AD-053 を読み替えて足す)
- 会話の巻き戻し・分岐からの再試行 (U-4。X-6)
- `AskUserQuestion` の `annotations` (メモ・選んだ preview) を送ること
- MCP の仕様の部分集合の外のスキーマを描くこと (入れ子・object の配列など)
- 過去のセッションでの問いへの回答・コマンドの候補 (稼働中だけ)
- composer の他の拡張 (mentions・添付の候補・model picker。model picker は X-6)
- MCP サーバー・プラグイン・スキルの操作 (AD-048 Decision 2 のまま)
