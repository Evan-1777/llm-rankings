import { useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Dimension, ModelSummary } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { useConfirm } from "../components/Confirm";
import { DimensionDialog } from "../components/DimensionDialog";
import { Icon } from "../components/Icons";
import { ModelDialog } from "../components/ModelDialog";
import { PageHeading } from "../components/PageHeading";
import { EmptyState, ErrorState, PageLoading } from "../components/States";
import { useToast } from "../components/Toast";
import ui from "../components/ui.module.css";
import { useAsyncData } from "../hooks/useAsyncData";
import { monthKicker } from "../lib/format";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useSession } from "../session/SessionProvider";
import styles from "./Settings.module.css";

type Tab = "dimensions" | "models" | "data";

const tabLabels: Record<Tab, string> = {
  dimensions: "维度",
  models: "模型",
  data: "数据",
};

function resolveTab(raw: string | null): Tab {
  return raw === "models" || raw === "data" ? raw : "dimensions";
}

export function Settings() {
  useDocumentTitle("设置");
  const { data, loading, error, reload } = useAsyncData(async (signal) => {
    const [dimensions, models] = await Promise.all([api.dimensions(true, signal), api.models(signal)]);
    return { dimensions: dimensions.dimensions, models: models.models };
  }, []);
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const [dimensionOpen, setDimensionOpen] = useState(false);
  const [dimensionEdit, setDimensionEdit] = useState<Dimension | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelEdit, setModelEdit] = useState<ModelSummary | null>(null);
  const [exporting, setExporting] = useState(false);

  const tab = resolveTab(params.get("tab"));
  const dimensions = data?.dimensions ?? [];
  const models = data?.models ?? [];
  const activeDimensions = dimensions.filter((dimension) => !dimension.archivedAt);
  const archivedDimensions = dimensions.filter((dimension) => dimension.archivedAt);
  const visibleDimensions = showArchived ? dimensions : activeDimensions;
  const totalScores = models.reduce((sum, model) => sum + model.scoreCount, 0);
  const totalWeight = activeDimensions.reduce((sum, dimension) => sum + dimension.weight, 0);

  const setTab = (next: Tab) => {
    const nextParams = new URLSearchParams(params);
    if (next === "dimensions") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setParams(nextParams);
  };

  const refreshAll = () => {
    reload();
    void session.refresh();
  };

  const openNewDimension = () => {
    setDimensionEdit(null);
    setDimensionOpen(true);
  };

  const openDimension = (dimension: Dimension) => {
    setDimensionEdit(dimension);
    setDimensionOpen(true);
  };

  const archiveDimension = async (dimension: Dimension) => {
    try {
      await api.setDimensionArchived(dimension.id, !dimension.archivedAt);
      toast(dimension.archivedAt ? "维度已恢复" : "维度已归档");
      refreshAll();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    }
  };

  const deleteDimension = async (dimension: Dimension) => {
    const confirmed = await confirm({
      title: `删除维度「${dimension.name}」？`,
      body: "该维度的全部评分会一并删除，且无法恢复。",
      confirmLabel: "永久删除",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.deleteDimension(dimension.id);
      toast("维度已删除");
      refreshAll();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    }
  };

  const openNewModel = () => {
    setModelEdit(null);
    setModelOpen(true);
  };

  const openModel = (model: ModelSummary) => {
    setModelEdit(model);
    setModelOpen(true);
  };

  const deleteModel = async (model: ModelSummary) => {
    const confirmed = await confirm({
      title: `删除模型「${model.name}」？`,
      body: "该模型及其全部评分会被永久删除，无法恢复。",
      confirmLabel: "永久删除",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.deleteModel(model.slug);
      toast("模型已删除");
      refreshAll();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    }
  };

  const exportJSON = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/export", { credentials: "same-origin" });
      if (response.status === 401) {
        window.dispatchEvent(new Event("llmrank:unauthorized"));
        toast("会话已过期，请重新登录", "error");
        return;
      }
      if (!response.ok) throw new Error("导出失败");
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename=([^;]+)/);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = match?.[1]?.replaceAll('"', "").trim() || `llm-rank-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast("导出已开始");
    } catch (caught) {
      toast(errorMessage(caught), "error");
    } finally {
      setExporting(false);
    }
  };

  let panel: ReactNode;
  if (loading && !data) {
    panel = <PageLoading label="正在加载设置" />;
  } else if (error) {
    panel = <ErrorState error={error} onRetry={reload} />;
  } else if (tab === "dimensions") {
    panel = (
      <section role="tabpanel" id="panel-dimensions" aria-labelledby="tab-dimensions" className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.panelIntro}>
            <p className={ui.sectionLabel}>维度</p>
            <span className={ui.sectionMeta}>
              {activeDimensions.length} 启用 / {archivedDimensions.length} 归档
            </span>
            <label className={ui.checkboxRow}>
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              显示已归档
            </label>
          </div>
          <Button variant="primary" onClick={openNewDimension}>
            <Icon name="plus" size={14} />
            新增维度
          </Button>
        </div>

        {visibleDimensions.length === 0 ? (
          <EmptyState title={archivedDimensions.length > 0 ? "没有启用的维度" : "尚未创建维度"} text="维度决定排行与评分弹窗中的评分项。">
            <Button variant="primary" onClick={openNewDimension}>
              创建第一个维度
            </Button>
          </EmptyState>
        ) : (
          <div className={styles.list}>
            <div className={`${styles.listHead} ${styles.dimCols}`}>
              <span>#</span>
              <span>维度</span>
              <span>权重</span>
              <span>状态</span>
              <span className={styles.actionsHead}>操作</span>
            </div>
            {visibleDimensions.map((dimension, index) => (
              <div className={`${styles.dimRow} ${dimension.archivedAt ? styles.archived : ""}`} key={dimension.id}>
                <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                <div className={styles.nameBlock}>
                  <span className={styles.itemName}>{dimension.name}</span>
                  {dimension.description ? <span className={styles.itemMeta}>{dimension.description}</span> : null}
                </div>
                <span className={styles.weight}>{dimension.weight}</span>
                <span className={styles.status}>
                  {dimension.archivedAt ? (
                    <span className={ui.tag}>已归档</span>
                  ) : dimension.weight === 0 ? (
                    <span className={`${styles.statusTag} ${styles.statusIdle}`}>不参与</span>
                  ) : (
                    <span className={styles.statusLive}>参与排行</span>
                  )}
                </span>
                <div className={styles.rowActions}>
                  {!dimension.archivedAt ? (
                    <IconButton label={`编辑维度：${dimension.name}`} onClick={() => openDimension(dimension)}>
                      <Icon name="edit" />
                    </IconButton>
                  ) : null}
                  <IconButton
                    label={dimension.archivedAt ? `恢复维度：${dimension.name}` : `归档维度：${dimension.name}`}
                    onClick={() => void archiveDimension(dimension)}
                  >
                    <Icon name={dimension.archivedAt ? "restore" : "archive"} />
                  </IconButton>
                  <IconButton label={`删除维度：${dimension.name}`} danger onClick={() => void deleteDimension(dimension)}>
                    <Icon name="trash" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  } else if (tab === "models") {
    panel = (
      <section role="tabpanel" id="panel-models" aria-labelledby="tab-models" className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.panelIntro}>
            <p className={ui.sectionLabel}>模型</p>
            <span className={ui.sectionMeta}>{models.length} 个模型</span>
          </div>
          <Button variant="primary" onClick={openNewModel}>
            <Icon name="plus" size={14} />
            新增模型
          </Button>
        </div>

        {models.length === 0 ? (
          <EmptyState title="尚未创建模型" text="模型档案不含评分；评分仍由排行、详情或工作台的评分弹窗写入。">
            <Button variant="primary" onClick={openNewModel}>
              创建第一个模型
            </Button>
          </EmptyState>
        ) : (
          <div className={styles.list}>
            <div className={`${styles.listHead} ${styles.modelCols}`}>
              <span>#</span>
              <span>模型</span>
              <span>slug</span>
              <span>评分</span>
              <span className={styles.actionsHead}>操作</span>
            </div>
            {models.map((model, index) => (
              <div className={`${styles.modelRow}`} key={model.slug}>
                <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                <div className={styles.nameBlock}>
                  <span className={styles.itemName}>{model.name}</span>
                  <span className={styles.itemMeta}>{model.vendor || "—"}</span>
                </div>
                <span className={styles.slug}>{model.slug}</span>
                <span className={styles.scoreCount}>
                  {model.scoreCount} / {activeDimensions.length}
                </span>
                <div className={styles.rowActions}>
                  <IconButton label={`查看 ${model.name} 公开详情`} onClick={() => navigate(`/models/${model.slug}`)}>
                    <Icon name="arrowRight" />
                  </IconButton>
                  <IconButton label={`编辑模型：${model.name}`} onClick={() => openModel(model)}>
                    <Icon name="edit" />
                  </IconButton>
                  <IconButton label={`删除模型：${model.name}`} danger onClick={() => void deleteModel(model)}>
                    <Icon name="trash" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  } else {
    panel = (
      <section role="tabpanel" id="panel-data" aria-labelledby="tab-data" className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.panelIntro}>
            <p className={ui.sectionLabel}>数据</p>
            <span className={ui.sectionMeta}>完整 JSON 快照 / 仅管理员</span>
          </div>
        </div>
        <div className={styles.dataGrid}>
          <div>
            <span>维度</span>
            <strong>{dimensions.length}</strong>
          </div>
          <div>
            <span>模型</span>
            <strong>{models.length}</strong>
          </div>
          <div>
            <span>评分</span>
            <strong>{totalScores}</strong>
          </div>
        </div>
        <div className={styles.exportBox}>
          <div>
            <h2 className={styles.exportTitle}>导出 JSON</h2>
            <p className={styles.exportText}>包含维度权重、归档项、模型私人备注与全部评分，可直接解析或备份。</p>
          </div>
          <Button variant="primary" onClick={() => void exportJSON()} disabled={exporting}>
            <Icon name="download" size={14} />
            {exporting ? "导出中…" : "导出 JSON"}
          </Button>
        </div>
        <p className={styles.backupNote}>数据库文件位于服务端 DB_PATH，备份以卷或本导出为准。</p>
      </section>
    );
  }

  return (
    <div className="shell page-enter">
      <PageHeading kicker={monthKicker(session.now, "设置")} title="设置">
        <div className={ui.stats}>
          <div className={ui.statsTop}>
            <span>{activeDimensions.length} 个启用维度</span>
            <span>
              权重合计 <strong className={ui.statStrong}>{totalWeight}</strong>
            </span>
          </div>
          <div className={ui.statsBottom}>
            <span>{models.length} 个模型</span>
            <span>{totalScores} 条评分</span>
          </div>
        </div>
      </PageHeading>

      <nav className={styles.tabs} role="tablist" aria-label="设置分区">
        {(Object.keys(tabLabels) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            className={`${styles.tab} ${tab === key ? styles.activeTab : ""}`}
            onClick={() => setTab(key)}
          >
            {tabLabels[key]}
          </button>
        ))}
      </nav>

      {panel}

      <DimensionDialog
        open={dimensionOpen}
        dimension={dimensionEdit}
        onClose={() => setDimensionOpen(false)}
        onSaved={refreshAll}
      />
      <ModelDialog open={modelOpen} model={modelEdit} onClose={() => setModelOpen(false)} onSaved={refreshAll} />

      <p className={styles.footerNote}>
        维度与模型的永久删除不可恢复。需要留存时先导出 JSON。 <Link to="/">返回排行</Link>
      </p>
    </div>
  );
}