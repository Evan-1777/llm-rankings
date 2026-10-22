import { useDocumentTitle } from "../lib/useDocumentTitle";
import styles from "./Maintenance.module.css";

export function Maintenance() {
  useDocumentTitle("维护中");
  return (
    <main className={styles.page}>
      <img className={styles.mark} src="/brand-icon.png" alt="LLM Rank" width={96} height={96} />
      <p className={styles.kicker}>LLM RANK</p>
      <h1 className={styles.title}>维护中</h1>
      <p className={styles.note}>站点正在维护，稍后刷新页面再试。</p>
    </main>
  );
}
