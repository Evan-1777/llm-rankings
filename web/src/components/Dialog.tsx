import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icons";
import { IconButton } from "./Button";
import ui from "./ui.module.css";

type Width = "narrow" | "model" | "wide" | "default";

interface DialogProps {
  open: boolean;
  onRequestClose: () => void;
  labelledBy: string;
  width?: Width;
  children: ReactNode;
}

export function Dialog({ open, onRequestClose, labelledBy, width = "default", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => restoreFocus.current?.focus();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      const frame = window.requestAnimationFrame(() => {
        const target =
          dialog.querySelector<HTMLElement>("[data-autofocus]") ??
          dialog.querySelector<HTMLElement>("input, textarea, select, button, a[href]");
        target?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onRequestClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onRequestClose]);

  const widthClass = width === "narrow" ? ui.dialogNarrow : width === "wide" ? ui.dialogWide : width === "model" ? ui.dialogModel : "";

  return (
    <dialog
      ref={ref}
      className={`${ui.dialog} ${widthClass}`}
      aria-labelledby={labelledBy}
      onClick={(event) => {
        if (event.target === ref.current) onRequestClose();
      }}
    >
      <div className={ui.dialogInner}>{children}</div>
    </dialog>
  );
}

export function DialogHeader({
  titleId,
  kicker,
  title,
  onClose,
}: {
  titleId: string;
  kicker?: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <header className={ui.dialogHead}>
      <div>
        {kicker ? <p className={ui.dialogKicker}>{kicker}</p> : null}
        <h2 className={ui.dialogTitle} id={titleId}>
          {title}
        </h2>
      </div>
      <IconButton label="关闭" onClick={onClose}>
        <Icon name="close" />
      </IconButton>
    </header>
  );
}