"use client";

import type { ComponentProps } from "react";
import { CircleAlertIcon, RefreshCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShimmerLabel } from "./surfaces";

export interface ErrorStateProps extends Omit<
  ComponentProps<"div">,
  "children" | "role"
> {
  title: string;
  detail: string;
  retrying: boolean;
  onRetry: () => void;
  /*
   * registry の写しからの逸脱 (Closta 側の追加)。
   *
   * 原本はボタンの文字列を "Retry" / "Retrying" でハードコードしている。
   * この部品は**最上位のエラー画面**に使われるため、日本語の title / detail の隣に
   * 英語ボタンが並ぶ。FR-047 は UI のラベルを日本語第一言語と定めており、
   * **回復手段のラベルだけが未訳**という形は最も理解が要る場面に集中する。
   *
   * 文言を差し替えるのではなく **prop で受ける**形にした理由:
   * 原本をそのまま書き換えると registry の更新と毎回衝突する。
   * 既定値を原文のままにしてあるので、原本の挙動は保たれる。
   */
  retryLabel?: string;
  retryingLabel?: string;
}

/*
 * registry の写しからの逸脱 2 件目 (Closta 側の色の差し替え。code-gate iteration 1 / a11y C-001)。
 *
 * **原本の赤は alpha 付きで、light 既定テーマで WCAG AA に届かない。**
 * 実測 (計算で確認): 本文 `text-red-600/60` を `bg-red-500/[0.06]` over white に合成すると
 * 相対輝度 0.281 / 背景 0.914 → **コントラスト比 2.91:1**。AA は通常サイズ本文に 4.5:1 を要求する。
 * `text-[13px]` なので large text の例外も効かない。
 * 見出し (`text-red-600` / 14px) と再試行ボタン (`text-xs`) も 4.4:1 で届かない。
 *
 * **不足しているのは「何をすれば復帰できるか」を書いている行である。** この部品は
 * 4 画面の最後の出口に使われており (session-list / workspace-folders / runtime-list /
 * folder-runtime-resolution)、色以外の手がかりが無いため回避手段が無い。
 *
 * **独自トークンを足さず、既存パレットの段を選び直すだけにした** (Principle XIII)。
 * `WorkspaceFoldersScreen.tsx` の `ReachabilityBadge` が同じ判断を先例として記録している。
 */

export function ErrorState({
  title,
  detail,
  retrying,
  onRetry,
  retryLabel = "Retry",
  retryingLabel = "Retrying",
  className,
  ...props
}: ErrorStateProps) {
  /*
   * registry の写しからの逸脱 3 件目 (pr-gate Round 1 / a11y H-205)。
   *
   * **原本は `retrying` で `key` の違う別要素を返し、器ごと差し替える。**
   * React は前者を unmount して後者を mount するため、
   * キーボードで再試行を押した瞬間に**押したボタン自身が DOM から消え、
   * フォーカスが `document.body` に落ちる**。取得が終わっても戻らない。
   *
   * これは本 PR が MUST_FIX として直した「`disabled` でフォーカスを奪う」と
   * **同型の欠陥**であり、しかも **IPC 自体が通らなかったときの最後の出口**に残っていた。
   * 4 画面すべてがこの部品を通る。
   *
   * **器を 1 つに保ち、中身だけを差し替える。**
   * ボタンは DOM から消さず `aria-disabled` + ガードにする。
   * 器が 1 つなので `aria-live` の連続性も得られ、
   * 「再取得 → 失敗」が同じ region の内容変化として読まれる。
   *
   * `role` は状態で切り替える — 失敗は `alert` (割り込んでよい)、
   * 再試行中は `status` (作業を止めない)。
   */
  return (
    <div
      data-slot="error-state"
      role={retrying ? "status" : "alert"}
      aria-busy={retrying}
      className={cn(
        "fade-in animate-in flex w-full max-w-sm items-start gap-2.5 rounded-2xl bg-red-500/[0.06] px-4 py-3 text-sm duration-300 motion-reduce:animate-none dark:bg-red-500/10",
        className,
      )}
      {...props}
    >
      {retrying ? (
        <RefreshCwIcon className="text-foreground/45 mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" />
      ) : (
        <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-red-500/80" />
      )}
      <div>
        <p className="font-medium text-red-700 dark:text-red-300">{title}</p>
        {/*
          **再試行中も理由を残す。** 原本は本文ごと消していたが、
          「なぜ再取得しているのか」が画面から消えると次の判断ができない。
        */}
        <p className="mt-0.5 text-[13px] leading-snug text-red-700 dark:text-red-300">
          {retrying ? (
            <ShimmerLabel className="relative inline-block">{retryingLabel}</ShimmerLabel>
          ) : (
            detail
          )}
        </p>
      </div>
      <button
        type="button"
        /* **消さない。** 押した要素が DOM に残ることがフォーカス保持の条件である。 */
        aria-disabled={retrying}
        onClick={() => {
          if (retrying) return;
          onRetry();
        }}
        className={cn(
          "focus-visible:ring-ring ms-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-700 transition-colors outline-none hover:bg-red-500/10 focus-visible:ring-2 dark:text-red-300",
          retrying && "[&_svg]:opacity-50",
        )}
      >
        <RefreshCwIcon className={cn("size-3", retrying && "animate-spin motion-reduce:animate-none")} />
        {retrying ? retryingLabel : retryLabel}
      </button>
    </div>
  );
}
