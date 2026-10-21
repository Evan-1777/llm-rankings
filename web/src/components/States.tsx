import type { ReactNode } from "react";
import { errorMessage } from "../api/client";
import { Button } from "./Button";
import ui from "./ui.module.css";

export function PageLoading({ label = "正在加载" }: { label?: string }) {
  return (
    <div className={ui.loading} aria-busy="true" role="status">
      <span className="sr-only">{label}</span>
      <div className={ui.skeletonTitle} />
      <div className={ui.skeletonRows}>
        {Array.from({ length: 5 }, (_, index) => (
          <div className={ui.skeletonRow} key={index}>
            <div className={ui.skeletonCell} />
            <div className={ui.skeletonCell} />
            <div className={ui.skeletonCell} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <section className={ui.state}>
      <h2 className={ui.stateTitle}>{title}</h2>
      {text ? <p className={ui.stateText}>{text}</p> : null}
      {children ? <div className={ui.stateActions}>{children}</div> : null}
    </section>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <section className={ui.state} role="alert">
      <h2 className={ui.stateTitle}>加载失败</h2>
      <p className={ui.stateText}>{errorMessage(error)}</p>
      {onRetry ? (
        <div className={ui.stateActions}>
          <Button variant="primary" onClick={onRetry}>
            重新加载
          </Button>
        </div>
      ) : null}
    </section>
  );
}
