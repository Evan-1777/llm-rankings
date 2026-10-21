import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PageLoading } from "../components/States";
import { useSession } from "./SessionProvider";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { authenticated, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <div className="shell page-enter">
        <PageLoading label="正在验证会话" />
      </div>
    );
  }
  if (!authenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}
