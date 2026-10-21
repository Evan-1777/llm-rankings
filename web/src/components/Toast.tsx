import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "./Icons";
import ui from "./ui.module.css";

type Tone = "success" | "error";
type ToastFn = (message: string, tone?: Tone) => void;

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback<ToastFn>(
    (message, tone = "success") => {
      const id = Date.now() + Math.random();
      setItems((current) => [...current.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className={ui.toastRegion} aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <div key={item.id} className={`${ui.toast} ${item.tone === "error" ? ui.toastError : ui.toastSuccess}`} role="status">
            <span>{item.message}</span>
            <button type="button" className={ui.toastClose} aria-label="关闭提示" onClick={() => dismiss(item.id)}>
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  return useContext(ToastContext);
}
