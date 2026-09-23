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
  if (retrying) {
    return (
      <div
        data-slot="error-state"
        key="retrying"
        role="status"
        className={cn(
          "fade-in animate-in flex w-full max-w-sm items-center gap-2.5 text-sm duration-300 motion-reduce:animate-none",
          className,
        )}

        {...props}
      >
        <RefreshCwIcon className="text-foreground/45 size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
        <ShimmerLabel className="text-foreground/70 relative inline-block">
          {retryingLabel}
        </ShimmerLabel>
      </div>
    );
  }

  return (
    <div
      data-slot="error-state"
      key="error"
      role="alert"
      className={cn(
        "fade-in animate-in flex w-full max-w-sm items-start gap-2.5 rounded-2xl bg-red-500/[0.06] px-4 py-3 text-sm duration-300 motion-reduce:animate-none dark:bg-red-500/10",
        className,
      )}

      {...props}
    >
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-red-500/80" />
      <div>
        <p className="font-medium text-red-700 dark:text-red-300">{title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-red-700 dark:text-red-300">
          {detail}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="ms-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-500/10 dark:text-red-300"
      >
        <RefreshCwIcon className="size-3" />
        {retryLabel}
      </button>
    </div>
  );
}
