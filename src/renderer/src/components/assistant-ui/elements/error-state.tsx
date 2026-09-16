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
        <ShimmerLabel className="text-foreground/55 relative inline-block">
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
        <p className="font-medium text-red-600 dark:text-red-400">{title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-red-600/60 dark:text-red-400/60">
          {detail}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="ms-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
      >
        <RefreshCwIcon className="size-3" />
        {retryLabel}
      </button>
    </div>
  );
}
