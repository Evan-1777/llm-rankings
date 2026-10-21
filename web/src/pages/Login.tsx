import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, errorMessage } from "../api/client";
import { Button } from "../components/Button";
import { TextField } from "../components/Field";
import { PageLoading } from "../components/States";
import ui from "../components/ui.module.css";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useSession } from "../session/SessionProvider";
import styles from "./Login.module.css";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export function Login() {
  useDocumentTitle("登录");
  const { authenticated, loading, refresh } = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const next = safeNext(params.get("next"));

  if (loading) {
    return (
      <div className="shell page-enter">
        <PageLoading label="正在验证会话" />
      </div>
    );
  }
  if (authenticated) return <Navigate to={next} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError("请填写密码");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.login(password);
      await refresh();
      navigate(next, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 429) setError("登录尝试过于频繁，请稍后再试");
      else if (caught instanceof ApiError && caught.status === 401) setError("密码不正确");
      else setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`shell page-enter ${styles.page}`}>
      <section className={styles.intro}>
        <img className={styles.mark} src="/brand-icon.png" alt="" width={56} height={56} />
        <p className={`${ui.kicker} ${styles.kicker}`}>LLM RANK / 管理员</p>
        <h1 className={styles.title}>登录</h1>
        <p className={styles.note}>会话有效期 24 小时。评分与设置仅对管理员开放。</p>
      </section>

      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <TextField
          id="password"
          label="密码"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          error={error}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" variant="primary" disabled={submitting || !password} className={styles.submit}>
          {submitting ? "登录中…" : "登录"}
        </Button>
      </form>
    </div>
  );
}
