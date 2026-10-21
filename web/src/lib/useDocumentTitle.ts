import { useEffect } from "react";

export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} / LLM Rank` : "LLM Rank";
  }, [title]);
}
