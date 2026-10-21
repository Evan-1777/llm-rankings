import type { ReactNode } from "react";
import ui from "./ui.module.css";

export function PageHeading({
  kicker,
  title,
  children,
  className,
  titleClassName,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <header className={`${ui.pageHead} ${className ?? ""}`}>
      <div>
        <p className={ui.kicker}>{kicker}</p>
        <h1 className={`${ui.title} ${titleClassName ?? ""}`}>{title}</h1>
      </div>
      {children ? <div className={ui.headSide}>{children}</div> : null}
    </header>
  );
}
