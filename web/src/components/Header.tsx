import { Link, NavLink, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { useSession } from "../session/SessionProvider";
import { Icon } from "./Icons";
import { useToast } from "./Toast";
import styles from "./Header.module.css";

export function Header() {
  const { authenticated, loading, logout } = useSession();
  const navigate = useNavigate();
  const toast = useToast();

  const onLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <header className={styles.header}>
      <div className={`shell ${styles.inner}`}>
        <Link to="/" className={styles.brand} aria-label="LLM Rank 首页">
          <img className={styles.mark} src="/brand-icon.png" alt="" width={32} height={32} />
          <span className={styles.wordmark}>LLM RANK</span>
        </Link>

        <nav className={styles.nav} aria-label="主导航">
          <NavLink to="/" end className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}>
            排行
          </NavLink>
          {authenticated ? (
            <>
              <NavLink to="/workbench" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}>
                评分
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}>
                设置
              </NavLink>
            </>
          ) : null}
        </nav>

        <div className={styles.session}>
          {loading ? (
            <span className={styles.sessionPlaceholder} aria-hidden="true" />
          ) : authenticated ? (
            <>
              <span className={styles.admin}>
                <span className={styles.adminMark} aria-hidden="true" />
                管理员
              </span>
              <button type="button" className={styles.logout} onClick={onLogout}>
                退出
                <Icon name="logout" size={13} />
              </button>
            </>
          ) : (
            <Link to="/login" className={styles.login}>
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
