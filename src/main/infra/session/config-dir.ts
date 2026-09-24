import { hostPathOps, runtimePathOps } from '@domain/runtime/path-api'
import type { HostPath, PathResult, RuntimePath } from '@domain/runtime/path-types'

/**
 * config ディレクトリの組み立てと、列挙プロセスへの受け渡し (BE-020)。
 *
 * 本モジュールが持つ知識は 3 つだけである。
 *
 * | 知識 | 根拠 |
 * |---|---|
 * | config ディレクトリの名前 (`.claude`) | FR-009 / FR-010 |
 * | 所在ごとに**どの綴りで**子プロセスへ渡すか (ホストは素の値 / WSL は UNC 形式) | research R-01 |
 * | 環境変数の名前と**許可リスト** | FR-050 / SC-016 / contracts C-2 |
 *
 * **UNC の文字列リテラルを持たない。** 組み立ても綴りの知識も
 * `src/domain/runtime/` のパス API に委ね、その戻り値を受け取るだけにする
 * ([AD-028](../../../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md) §3 規則 1)。
 *
 * **share 配下への封じ込め検査を二重化しない。** `runtimePathOps.toUnc()` が
 * 合成後に再正規化して `outside-share` を返す。ここで同じ検査を書くと、
 * 規則が 2 箇所に分かれて必ず片方だけが更新される (FR-006 / FR-042 / research R-05)。
 *
 * **`os` / `process` / `electron` を import しない** (R-1 の許可行列)。
 * ホームディレクトリと親環境はいずれも**引数で受け取る** — グローバルの `process` は
 * import を伴わないため、参照しても lint も検証スクリプトも素通りする。
 */

/**
 * config ディレクトリの名前。
 *
 * **Claude Code 側が決めている名前**であり、アプリが選べる値ではない。
 * 定義をここ 1 箇所に置く (research R-01)。
 */
export const CONFIG_DIR_NAME = '.claude'

/*
 * **`CLAUDE_CONFIG_DIR` の綴りと R-2 / R-3 の置き場の違い。**
 *
 * R-2 の列挙は [AD-030](../../../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md) §2 で
 * **config ディレクトリを要求ごとに渡す**常駐プロセス方式であり、綴りは
 * `src/agents/enumerate-sessions.ts` が持つ (起動時 env に載せない)。
 *
 * R-3 の transcript 取得は [AD-034](../../../../docs/decisions/0034-transcript-read-path-and-process-boundary.md)
 * 決定 2 で **target ごとに env 固定の専用短命プロセス**にしたため、`CLAUDE_CONFIG_DIR` を
 * **spawn 時に env で渡す**。その綴りと env 組み立てを下の `CLAUDE_CONFIG_DIR_ENV` /
 * `buildTranscriptEnv` に持つ (config ディレクトリの SSoT である本モジュールに置く)。
 * **モデルが違うので置き場が分かれる** — read-transcript は env を読むだけで綴りを持たない。
 */

/** transcript 取得プロセスに渡す config ディレクトリの環境変数名 (R-3 / AD-034)。 */
export const CLAUDE_CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR'

/**
 * 常駐する列挙プロセスに渡してよい親環境のキー。
 *
 * **親環境を継承させない** ([AD-028](../../../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md) Consequences)。
 * X-3 で Provider の資格情報が main の環境に入ったとき、
 * 流れ込む経路を**最初から作らない**ためである (Principle V / FR-050)。
 *
 * `PATH` を入れていない — 子プロセスは絶対パスで起動され、
 * 列挙は SDK 呼び出しだけで外部コマンドを起こさないため不要である。
 * 不足が判明した場合は**このリストに追記する**形でしか増やせない (SC-016)。
 *
 * **config ディレクトリはここに含まれない** (AD-030 §2)。要求ごとに渡す。
 */
export const ENUMERATION_ENV_ALLOWLIST: readonly string[] = ['SystemRoot', 'windir', 'TEMP', 'TMP']

/** ホスト名前空間の config ディレクトリ (FR-009)。 */
export function hostConfigDir(home: HostPath): PathResult<HostPath> {
  return hostPathOps.join(home, CONFIG_DIR_NAME)
}

/** ランタイム名前空間の config ディレクトリ (FR-010)。 */
export function runtimeConfigDir(home: RuntimePath): PathResult<RuntimePath> {
  return runtimePathOps.join(home, CONFIG_DIR_NAME)
}

/**
 * 子プロセスへ渡す綴りを決める。
 *
 * 所在の判別は **`namespace` の値**で行う。`'wsl'` の文字列リテラルを条件に書かない —
 * 書くと同じ判別が 2 つの表現を持ち、名前空間の追加時に片方だけが残る。
 *
 * 失敗を `null` に落とさず理由を返す。呼び出し側は所在ごとの失敗として記録する (FR-030)。
 */
export function configDirEnvValue(configDir: HostPath | RuntimePath): PathResult<string> {
  if (configDir.namespace === 'host') {
    return { ok: true, path: configDir.value }
  }

  // **UNC 形式への変換はパス API の戻り値を受け取るだけ。**
  const unc = runtimePathOps.toUnc(configDir)
  if (!unc.ok) return unc
  return { ok: true, path: unc.path.value }
}

/**
 * 常駐する列挙プロセスの環境変数を組み立てる (FR-050 / SC-016)。
 *
 * **純粋関数として切り出してある** — プロセスを起こさずに
 * 「許可リスト外のキーが 0 件」を assert できる形にするためである。
 *
 * Windows の環境変数名は**大小を区別しない**ため、親環境の走査は
 * 大小を無視した照合で行い、**出力は許可リストの綴りに正規化する**。
 * 完全一致で引くと `Temp` しか持たない親環境から `TEMP` を取り落とす。
 *
 * **config ディレクトリを載せない** (AD-030 §2)。要求ごとに渡すため、
 * 1 つのプロセスが複数の config ディレクトリを扱える。
 */
export function buildWorkerEnv(
  parentEnv: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const env: Record<string, string> = {}

  for (const allowed of ENUMERATION_ENV_ALLOWLIST) {
    const lower = allowed.toLowerCase()
    for (const [key, value] of Object.entries(parentEnv)) {
      if (key.toLowerCase() !== lower || value === undefined) continue
      env[allowed] = value
      break
    }
  }

  return env
}

/**
 * transcript 取得プロセスの環境変数を組み立てる (R-3 / AD-034 / FR-050 / SC-016)。
 *
 * **列挙と同じ許可リスト** (`buildWorkerEnv`) に加え、**`CLAUDE_CONFIG_DIR` を spawn 時に固定**する。
 * これにより取得プロセスは env を読むだけで済み、共有可変 env の並行レースが構造的に無くなる
 * (AD-034 決定 2)。親環境を丸ごと継承させない。
 */
export function buildTranscriptEnv(
  parentEnv: Readonly<Record<string, string | undefined>>,
  configDirEnv: string
): Record<string, string> {
  return { ...buildWorkerEnv(parentEnv), [CLAUDE_CONFIG_DIR_ENV]: configDirEnv }
}
