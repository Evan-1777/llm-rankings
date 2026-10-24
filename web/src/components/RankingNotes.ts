import { createElement, type ComponentProps } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";

interface RankingNotesProps {
  /** Raw Markdown saved by the administrator; whitespace-only content renders nothing. */
  content: string;
  className?: string;
}

function Pre({ node, ...props }: ComponentProps<"pre"> & ExtraProps) {
  void node;
  return createElement("pre", { ...props, tabIndex: 0 });
}

// Raw HTML stays off; images are outside the "text only" contract and render nothing.
const components: Components = {
  img: () => null,
  pre: Pre,
};

export function RankingNotes({ content, className }: RankingNotesProps) {
  if (content.trim() === "") return null;
  return createElement(
    "section",
    { className, "aria-label": "排行榜备注" },
    createElement(Markdown, { skipHtml: true, components }, content),
  );
}
