import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { RankingModel } from "../api/types";
import { Button } from "../components/Button";
import { Coverage } from "../components/Coverage";
import { Icon } from "../components/Icons";
import { ModelDialog } from "../components/ModelDialog";
import { PageHeading } from "../components/PageHeading";
import { ScoreDialog } from "../components/ScoreDialog";
import { EmptyState, ErrorState, PageLoading } from "../components/States";
import ui from "../components/ui.module.css";
import { formatScore } from "../domain/ranking";
import { useAsyncData } from "../hooks/useAsyncData";
import { monthKicker, rankLabel } from "../lib/format";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useSession } from "../session/SessionProvider";
import styles from "./Workbench.module.css";

export function Workbench() {
  useDocumentTitle("评分工作台");
  const { data, loading, error, reload } = useAsyncData((signal) => api.rankings(signal), []);
  const session = useSession();
  const navigate = useNavigate();
  const [scoreTarget, setScoreTarget] = useState<RankingModel | null>(null);
  const [modelOpen, setModelOpen] = useState(false);

  const dimensions = data?.dimensions ?? [];
  const models = data?.models ?? [];
  const rows = useMemo(() => {
    return [...models].sort((a, b) => {
      if ((a.score == null) !== (b.score == null)) return a.score == null ? -1 : 1;
      if (a.coverage !== b.coverage) return a.coverage - b.coverage;
      if (a.rank == null || b.rank == null) {
        if (a.rank == null && b.rank == null) return a.name.localeCompare(b.name, "zh-CN");
        return a.rank == null ? 1 : -1;
      }
      return a.rank - b.rank;
    });
  }, [models]);

  const scored = models.filter((model) => model.score != null).length;
  const refreshAll = () => {
    reload();
    void session.refresh();
  };

  let content: ReactNode;
  if ((loading && !data) || session.loading) {
    content = <PageLoading label="正在加载工作台" />;
  } else if (error) {
    content = <ErrorState error={error} onRetry={reload} />;
  } else if (data && dimensions.length === 0) {
    content = (
      <EmptyState title="尚未创建维度" text="评分需要维度与权重，先在设置中创建维度。">
        <Button variant="primary" onClick={() => navigate("/settings?tab=dimensions")}>
          前往维度设置
        </Button>
      </EmptyState>
    );
  } else if (data && data.totalWeight === 0) {
    content = (
      <EmptyState title="尚未设置权重" text="所有启用维度的权重均为 0，评分不会计入排行。">
        <Button variant="primary" onClick={() => navigate("/settings?tab=dimensions")}>
          设置权重
        </Button>
        <Button onClick={() => setModelOpen(true)}>新增模型</Button>
      </EmptyState>
    );
  } else if (models.length === 0) {
    content = (
      <EmptyState title="尚无模型" text="创建模型后即可开始录入评分。">
        <Button variant="primary" onClick={() => setModelOpen(true)}>
          新增模型
        </Button>
      </EmptyState>
    );
  } else {
    content = (
      <div className={styles.list}>
        <div className={styles.listHead}>
          <span>模型</span>
          <span>综合分</span>
          <span>排名</span>
          <span>已评分</span>
          <span>覆盖率</span>
          <span className={styles.actionHead}>操作</span>
        </div>
        {rows.map((model) => {
          const scoredDimensions = Object.keys(model.scores).length;
          return (
            <div className={styles.row} key={model.slug}>
              <div className={styles.model}>
                <Link to={`/models/${model.slug}`} className={styles.modelName}>
                  {model.name}
                </Link>
                <span className={styles.vendor}>{model.vendor || "—"}</span>
              </div>
              <div className={styles.score}>{formatScore(model.score)}</div>
              <div className={styles.rank}>{rankLabel(model.rank)}</div>
              <div className={styles.scored}>
                {scoredDimensions} / {dimensions.length}
              </div>
              <div className={styles.coverage}>
                <Coverage coverage={model.coverage} provisional={model.provisional} />
              </div>
              <div className={styles.action}>
                <Button compact onClick={() => setScoreTarget(model)}>
                  <Icon name={model.score != null ? "edit" : "plus"} size={13} />
                  {model.score != null ? "编辑评分" : "添加评分"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="shell page-enter">
      <PageHeading kicker={monthKicker(session.now, "工作台")} title="评分工作台">
        <div className={ui.stats}>
          <div className={ui.statsTop}>
            <span>{models.length} 个模型</span>
            <span>
              权重合计 <strong className={ui.statStrong}>{data?.totalWeight ?? 0}</strong>
            </span>
          </div>
          <div className={ui.statsBottom}>
            <span>{scored} 已评分</span>
            <span>{dimensions.length} 个维度</span>
          </div>
        </div>
      </PageHeading>

      <div className={styles.toolbar}>
        <Button onClick={() => navigate("/settings?tab=dimensions")}>
          <Icon name="settings" size={14} />
          维度设置
        </Button>
        <Button variant="primary" onClick={() => setModelOpen(true)}>
          <Icon name="plus" size={14} />
          新增模型
        </Button>
      </div>

      {content}

      {scoreTarget && data ? (
        <ScoreDialog open model={scoreTarget} rankings={data} onClose={() => setScoreTarget(null)} onSaved={refreshAll} />
      ) : null}
      {modelOpen ? <ModelDialog open models={models} onClose={() => setModelOpen(false)} onSaved={refreshAll} /> : null}
    </div>
  );
}
