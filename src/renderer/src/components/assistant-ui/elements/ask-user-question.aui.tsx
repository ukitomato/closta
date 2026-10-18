"use client";

import { memo, useMemo } from "react";
import { CheckIcon } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

import { Badge } from "@/components/ui/badge";
import {
  parseAskUserQuestionArgs,
  type Question,
  type QuestionOption,
} from "@/features/chat/ask-user-question-args";
import { ASK_USER_QUESTION_LABELS } from "@/features/chat/labels";
import { useToolResultState } from "@/features/chat/transcript-context";
import { cn } from "@/lib/utils";
import { codeScroll, codeSurface, mono } from "./surfaces";
import {
  isCancelledToolStatus,
  ToolFallback,
  ToolFallbackDuration,
  ToolFallbackStatusIcon,
} from "./tool-fallback.aui";
import { isTruncatedArgs, ToolResultMarks } from "./tool-result-marks";

/**
 * `AskUserQuestion` の読み取り専用の表示 (O-5 / FE-013 / 015 spec FR-005 / US-1 AC7・AC9。
 * [data-model](../../../../../../specs/015-ui-mcp-elicitation-commands/data-model.md) §1)。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | 問いごとに `header` のチップ・`question`・選択肢の `label` と `description`・`multiSelect` の印を出す。`preview` は出さない | data-model §1 |
 * | 入力に `answers` があれば (過去ログ)、問いの文をキーに `Map` で引いて選ばれた選択肢を強調する (prototype のキーに依らない) | data-model §1 |
 * | 入力は domain で無害化した `argsText` を JSON として読む。形が合わなければ ToolFallback に倒す | data-model §1 / FR-009 |
 * | 状態の印 (状態のアイコン・中断の印・経過時間・エラーと切り詰めの印) は ToolFallback と同じ部品で出す | data-model §1「状態の印」 |
 * | **回答の入力 (ボタン・入力欄) は出さない** — 回答を Claude に返すのは O-10 | U-1 / AD-048 Decision 1 |
 *
 * 文字列は会話由来の untrusted text として plain text で描く (React が escape する)。
 *
 * registry 照合 (Principle XIII / research R-03): Question flow は回答の操作が中心で、読み取り専用の形でも `header` の
 * チップ・`multiSelect` の印を持たず、選ばれなかった選択肢を消すので採らない。
 */


/** 選択肢が回答で選ばれたか。複数選択の回答は `,` で区切った label の並びとしても照合する。 */
function isSelected(
  option: QuestionOption,
  answer: string | undefined,
  multiSelect: boolean,
): boolean {
  if (answer === undefined) return false;
  if (answer === option.label) return true;
  return (
    multiSelect &&
    answer
      .split(",")
      .map((part) => part.trim())
      .includes(option.label)
  );
}

function QuestionView({
  question,
  answer,
}: {
  question: Question;
  answer: string | undefined;
}): React.JSX.Element {
  const anySelected = question.options.some((o) =>
    isSelected(o, answer, question.multiSelect),
  );
  return (
    <li data-slot="ask-user-question-item" className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {question.header !== "" ? (
          <Badge
            data-slot="ask-user-question-header"
            variant="secondary"
            className="max-w-full truncate"
          >
            {question.header}
          </Badge>
        ) : null}
        {question.multiSelect ? (
          <span
            data-slot="ask-user-question-multi"
            className="text-muted-foreground text-xs"
          >
            {ASK_USER_QUESTION_LABELS.multiSelect}
          </span>
        ) : null}
      </div>
      <p data-slot="ask-user-question-text" className="text-foreground">
        {question.question}
      </p>
      <ul className="flex flex-col gap-1">
        {question.options.map((option, i) => {
          const selected = isSelected(option, answer, question.multiSelect);
          return (
            <li
              key={i}
              data-slot="ask-user-question-option"
              data-selected={selected ? "true" : undefined}
              className={cn(
                "rounded-md border px-2.5 py-1.5",
                selected
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/60",
              )}
            >
              <div className="flex items-center gap-2">
                {selected ? (
                  <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
                ) : null}
                <span className="font-medium">{option.label}</span>
                {selected ? (
                  <Badge variant="outline" className="text-xs">
                    {ASK_USER_QUESTION_LABELS.selectedAnswer}
                  </Badge>
                ) : null}
              </div>
              {option.description !== "" ? (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {option.description}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {/* 回答が選択肢のどれにも当たらない (自由記述など) ときは回答の文をそのまま出す。 */}
      {answer !== undefined && !anySelected ? (
        <p
          data-slot="ask-user-question-answer"
          className="text-muted-foreground text-xs"
        >
          {ASK_USER_QUESTION_LABELS.selectedAnswer}: {answer}
        </p>
      ) : null}
    </li>
  );
}

const AskUserQuestionImpl: ToolCallMessagePartComponent = (props) => {
  const { toolCallId, toolName, args, argsText, result, isError } = props;
  const parsed = useMemo(() => parseAskUserQuestionArgs(argsText), [argsText]);
  const resultState = useToolResultState({ toolCallId, result, isError });
  if (parsed === null) return <ToolFallback {...props} />;

  const status = resultState.status;
  const isCancelled = isCancelledToolStatus(status);
  const isRunning = status?.type === "running";
  const resultText = typeof result === "string" ? result : null;

  return (
    <div
      data-slot="aui_ask-user-question"
      className="aui-ask-user-question border-border/60 dark:bg-popover bg-background my-1 overflow-hidden rounded-lg border text-sm"
    >
      <div className="text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-sm">
        <ToolFallbackStatusIcon status={status} />
        <span
          data-slot="ask-user-question-heading"
          className={cn(
            "text-foreground font-medium leading-none",
            isCancelled && "text-muted-foreground line-through",
            isRunning && "shimmer motion-reduce:animate-none",
          )}
        >
          {toolName}
        </span>
        <ToolFallbackDuration />
        <ToolResultMarks
          toolCallId={toolCallId}
          pending={resultState.pending}
          state={resultState.state}
          isError={isError}
          truncated={isTruncatedArgs(args)}
          className="ms-auto text-xs"
        />
      </div>
      <ol className="border-border/40 flex flex-col gap-3 border-t px-3 py-2">
        {parsed.questions.map((question, i) => (
          <QuestionView
            key={i}
            question={question}
            answer={parsed.answers.get(question.question)}
          />
        ))}
      </ol>
      {!isCancelled && resultText !== null && resultText.length > 0 ? (
        <div
          data-slot="ask-user-question-result"
          className={cn(codeScroll, "border-border/40 border-t")}
        >
          <p className="text-muted-foreground px-3 pt-2 text-xs font-medium">
            {ASK_USER_QUESTION_LABELS.result}
          </p>
          <pre
            className={cn(
              codeSurface,
              mono,
              "whitespace-pre-wrap px-3 py-2",
              isError ? "text-destructive/90" : "text-foreground/75",
            )}
          >
            {resultText}
          </pre>
        </div>
      ) : null}
    </div>
  );
};

export const AskUserQuestion = memo(AskUserQuestionImpl) as ToolCallMessagePartComponent;
(AskUserQuestion as { displayName?: string }).displayName = "AskUserQuestion";
