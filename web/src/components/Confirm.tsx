import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Dialog, DialogHeader } from "./Dialog";
import ui from "./ui.module.css";

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(next);
    });
  }, []);

  const finish = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? (
        <Dialog open labelledBy="confirm-title" width="narrow" onRequestClose={() => finish(false)}>
          <DialogHeader titleId="confirm-title" title={options.title} onClose={() => finish(false)} />
          <div className={ui.dialogBody}>
            <p className={ui.confirmBody}>{options.body}</p>
          </div>
          <div className={ui.dialogFoot}>
            <span />
            <div className={ui.actions}>
              <Button data-autofocus onClick={() => finish(false)}>
                {options.cancelLabel ?? "取消"}
              </Button>
              <Button variant={options.danger ? "danger" : "primary"} onClick={() => finish(true)}>
                {options.confirmLabel ?? "确认"}
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}
