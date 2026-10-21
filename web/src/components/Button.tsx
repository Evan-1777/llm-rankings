import type { ButtonHTMLAttributes, ReactNode } from "react";
import ui from "./ui.module.css";

type Variant = "primary" | "quiet" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  compact?: boolean;
  children: ReactNode;
}

export function Button({ variant = "quiet", compact = false, className, type = "button", children, ...rest }: ButtonProps) {
  const classes = [ui.btn, variant === "primary" ? ui.primary : variant === "danger" ? ui.danger : "", compact ? ui.compact : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  danger?: boolean;
  children: ReactNode;
}

export function IconButton({ label, active = false, danger = false, className, type = "button", children, ...rest }: IconButtonProps) {
  const classes = [ui.iconBtn, active ? ui.iconBtnActive : "", danger ? ui.iconBtnDanger : "", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={classes} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}
