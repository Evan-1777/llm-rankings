import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useBlocker, useNavigate, useSearchParams, type Location } from "react-router-dom";
import { ApiError, api, errorMessage } from "../api/client";
import type { Dimension, ModelSummary } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { useConfirm } from "../components/Confirm";
import { DimensionDialog } from "../components/DimensionDialog";
import { TextAreaField } from "../components/Field";
import { Icon } from "../components/Icons";
import { ModelDialog } from "../components/ModelDialog";
import { PageHeading } from "../components/PageHeading";
import { EmptyState, ErrorState, PageLoading } from "../components/States";
import { useToast } from "../components/Toast";
import ui from "../components/ui.module.css";
import { useAsyncData } from "../hooks/useAsyncData";
import { monthKicker } from "../lib/format";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useDisplayPreferences } from "../preferences/DisplayPreferences";
import { useSession } from "../session/SessionProvider";
import styles from "./Settings.module.css";
import { moveVisibleOrder } from "./dimensionOrder";

type Tab = "dimensions" | "models" | "data" | "display";

const tabLabels: Record<Tab, string> = {
  dimensions: "维度",
  models: "模型",
  data: "数据",
  display: "显示",
};

const tabOrder: Tab[] = ["dimensions", "models", "data", "display"];

function formatBaseline(value: number): string {
  return Number.isFinite(value) ? String(value) : "—";
}

/** Fixed baselines show the configured value; automatic ones show the snapshot value. */
function baselineMeta(dimension: Dimension): string {
  if (dimension.textMode) return "基准不适用";
  const configured = dimension.baselineMax != null ? `基准 ${formatBaseline(dimension.baselineMax)}（固定）` : "";
  if (dimension.archivedAt) return configured || "自动";
  if (configured) return configured;
  const effective = dimension.effectiveBaselineMax;
  return effective == null ? "自动 · —" : `自动 · ${formatBaseline(effective)}`;
}

function resolveTab(raw: string | null): Tab {
  return raw === "models" || raw === "data" || raw === "display" ? raw : "dimensions";
}

export function Settings() {
  useDocumentTitle("设置");
  const [orderBusy, setOrderBusy] = useState(false);
  const orderLock = useRef(false);
  const pendingOrderReload = useRef(false);
  const { data, loading, error, reload } = useAsyncData(async (signal) => {
    const [dimensions, models] = await Promise.all([api.dimensions(true, signal), api.models(true, signal)]);
    if (pendingOrderReload.current) {
      pendingOrderReload.current = false;
      orderLock.current = false;
      setOrderBusy(false);
    }
    return { dimensions: dimensions.dimensions, models: models.models };
  }, []);
  const session = useSession();
  const {
    dimensionScoreEmphasis,
    setDimensionScoreEmphasis,
    scorePercentageMode,
    scorePercentageMaxMode,
    setScorePercentageMode,
    setScorePercentageMaxMode,
    maintenanceMode,
    setMaintenanceMode,
    rankingNotes,
    saveRankingNotes,
    readError,
    retrying,
    retryRead,
    loading: displayLoading,
    saving: displaySaving,
  } = useDisplayPreferences();
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
  const [notesDraft, setNotesDraft] = useState("");
  const [notesReady, setNotesReady] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState("");
  const promptOpen = useRef(false);
  const [drag, setDrag] = useState<{ id: number; over: number | null } | null>(null);
  const dragRef = useRef<{ pointerId: number; id: number; from: number; over: number | null; y: number; raf: number | null } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef(new Map<number, HTMLButtonElement>());
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
  const pendingFocus = useRef<number | null>(null);

  const tab = resolveTab(params.get("tab"));
  const dimensions = data?.dimensions ?? [];
  const models = data?.models ?? [];
  const activeModels = models.filter((model) => !model.archivedAt);
  const archivedModels = models.filter((model) => model.archivedAt);
  const activeDimensions = dimensions.filter((dimension) => !dimension.archivedAt);
  const archivedDimensions = dimensions.filter((dimension) => dimension.archivedAt);
  const scoreableDimensions = activeDimensions.filter((dimension) => dimension.weight > 0);
  const visibleDimensions = showArchived ? dimensions : activeDimensions;
  const totalScores = models.reduce((sum, model) => sum + model.scoreCount, 0);
  const totalWeight = activeDimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const visibleKey = visibleDimensions.map((dimension) => dimension.id).join(",");

  const setTab = (next: Tab) => {
    const nextParams = new URLSearchParams(params);
    if (next === "dimensions") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setParams(nextParams);
  };

  const moveTab = (event: React.KeyboardEvent<HTMLButtonElement>, current: Tab) => {
    const index = tabOrder.indexOf(current);
    let next: Tab | undefined;
    if (event.key === "ArrowRight") next = tabOrder[(index + 1) % tabOrder.length];
    else if (event.key === "ArrowLeft") next = tabOrder[(index - 1 + tabOrder.length) % tabOrder.length];
    else if (event.key === "Home") next = tabOrder[0];
    else if (event.key === "End") next = tabOrder[tabOrder.length - 1];
    if (!next) return;
    event.preventDefault();
    setTab(next);
    tabRefs.current.get(next)?.focus();
  };

  const refreshAll = () => {
    reload();
    void session.refresh();
  };

  const stopAutoScroll = () => {
    const current = dragRef.current;
    if (current?.raf != null) {
      cancelAnimationFrame(current.raf);
      current.raf = null;
    }
  };

  const endDrag = () => {
    stopAutoScroll();
    dragRef.current = null;
    setDrag(null);
  };

  const targetIndexAt = (y: number): number | null => {
    const list = listRef.current;
    if (!list) return null;
    const bounds = list.getBoundingClientRect();
    if (y < bounds.top || y > bounds.bottom) return null;
    const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-dim-row]"));
    if (rows.length === 0) return null;
    for (let index = 0; index < rows.length; index += 1) {
      const rect = rows[index].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return index;
    }
    return rows.length - 1;
  };

  const updateTarget = () => {
    const current = dragRef.current;
    if (!current) return;
    const over = targetIndexAt(current.y);
    if (over === current.over) return;
    current.over = over;
    setDrag({ id: current.id, over });
  };

  const autoScroll = () => {
    const current = dragRef.current;
    if (!current || current.raf != null) return;
    const step = () => {
      const active = dragRef.current;
      if (!active) return;
      let delta = 0;
      if (active.y < 48) delta = -Math.min(20, (48 - active.y) / 2 + 4);
      else if (active.y > window.innerHeight - 48) delta = Math.min(20, (active.y - (window.innerHeight - 48)) / 2 + 4);
      if (delta === 0) {
        active.raf = null;
        return;
      }
      const before = window.scrollY;
      window.scrollBy(0, delta);
      if (window.scrollY === before) {
        active.raf = null;
        return;
      }
      updateTarget();
      active.raf = requestAnimationFrame(step);
    };
    current.raf = requestAnimationFrame(step);
  };

  const saveOrder = async (ids: number[], focusId?: number) => {
    if (orderLock.current) return;
    orderLock.current = true;
    setOrderBusy(true);
    try {
      await api.reorderDimensions(ids);
      toast("维度顺序已保存");
      if (focusId != null) pendingFocus.current = focusId;
      pendingOrderReload.current = true;
      reload();
      void session.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        toast("维度列表已变化，已重新加载", "error");
        pendingOrderReload.current = true;
        reload();
        return;
      }
      orderLock.current = false;
      setOrderBusy(false);
      toast(errorMessage(caught), "error");
    }
  };

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>, dimension: Dimension, index: number) => {
    if (orderBusy || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, id: dimension.id, from: index, over: index, y: event.clientY, raf: null };
    setDrag({ id: dimension.id, over: index });
    autoScroll();
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.y = event.clientY;
    updateTarget();
    autoScroll();
  };

  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const { from, over } = current;
    endDrag();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (over == null || over === from) return;
    const order = moveVisibleOrder(dimensions.map((item) => item.id), visibleDimensions.map((item) => item.id), from, over);
    if (order) void saveOrder(order);
  };

  const handleOrderKey = (event: React.KeyboardEvent<HTMLButtonElement>, dimension: Dimension, index: number) => {
    if (event.key === "Escape" && dragRef.current) {
      event.preventDefault();
      endDrag();
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (orderBusy) return;
    const to = event.key === "ArrowUp" ? index - 1 : index + 1;
    if (to < 0 || to >= visibleDimensions.length) return;
    const order = moveVisibleOrder(dimensions.map((item) => item.id), visibleDimensions.map((item) => item.id), index, to);
    if (order) void saveOrder(order, dimension.id);
  };

  useEffect(() => {
    if (dragRef.current) endDrag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, showArchived]);

  useEffect(() => {
    if (!data) return;
    const id = pendingFocus.current;
    if (id == null) return;
    handlesRef.current.get(id)?.focus();
    pendingFocus.current = null;
  }, [data]);

  useEffect(
    () => () => {
      const current = dragRef.current;
      if (current?.raf != null) cancelAnimationFrame(current.raf);
      dragRef.current = null;
    },
    [],
  );

  const notesDirty = notesReady && notesDraft !== rankingNotes;
  // An in-flight save clears notesDirty optimistically; keep guarding until it settles.
  const notesPending = notesDirty || notesSaving;
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: Location; nextLocation: Location }) =>
        notesPending && currentLocation.pathname !== nextLocation.pathname,
      [notesPending],
    ),
  );

  useEffect(() => {
    if (displayLoading || readError || notesReady) return;
    setNotesDraft(rankingNotes);
    setNotesReady(true);
  }, [displayLoading, notesReady, rankingNotes, readError]);

  useEffect(() => {
    if (blocker.state !== "blocked" || promptOpen.current) return;
    promptOpen.current = true;
    void confirm({
      title: "离开设置？",
      body: "排行榜备注尚未保存，离开后修改将丢失。",
      confirmLabel: "放弃并离开",
      danger: true,
    }).then((confirmed) => {
      promptOpen.current = false;
      if (confirmed) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, confirm]);

  useEffect(() => {
    if (!notesPending) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [notesPending]);

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
      body: "该模型及其全部评分与文字记录会被永久删除，无法恢复。",
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

  const toggleModelHidden = async (model: ModelSummary) => {
    try {
      await api.setModelHidden(model.slug, !model.hidden);
      toast(model.hidden ? "模型已显示" : "模型已隐藏");
      refreshAll();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    }
  };

  const archiveModel = async (model: ModelSummary) => {
    try {
      await api.setModelArchived(model.slug, !model.archivedAt);
      toast(model.archivedAt ? "模型已恢复" : "模型已归档");
      refreshAll();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    }
  };

  const saveNotes = async () => {
    if (!notesDirty || displayLoading || displaySaving || readError) return;
    setNotesError("");
    setNotesSaving(true);
    try {
      const result = await saveRankingNotes(notesDraft);
      if (result.ok) {
        toast("已保存");
        return;
      }
      const fieldError = result.fields?.rankingNotes;
      if (fieldError) setNotesError(fieldError);
    } finally {
      setNotesSaving(false);
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
          <div className={styles.list} ref={listRef}>
            <div className={`${styles.listHead} ${styles.dimCols}`}>
              <span>#</span>
              <span>维度</span>
              <span>权重</span>
              <span>状态</span>
              <span className={styles.actionsHead}>操作</span>
            </div>
            {visibleDimensions.map((dimension, index) => (
              <div
                className={`${styles.dimRow} ${dimension.archivedAt ? styles.archived : ""} ${drag?.id === dimension.id ? styles.dragSource : ""} ${
                  drag && drag.id !== dimension.id && drag.over === index ? styles.dropTarget : ""
                }`}
                data-dim-row
                key={dimension.id}
              >
                <button
                  type="button"
                  className={styles.handle}
                  ref={(node) => {
                    if (node) handlesRef.current.set(dimension.id, node);
                    else handlesRef.current.delete(dimension.id);
                  }}
                  aria-label={`调整维度顺序：${dimension.name}，使用上下方向键移动`}
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  disabled={orderBusy}
                  onPointerDown={(event) => beginDrag(event, dimension, index)}
                  onPointerMove={moveDrag}
                  onPointerUp={finishDrag}
                  onPointerCancel={endDrag}
                  onLostPointerCapture={endDrag}
                  onKeyDown={(event) => handleOrderKey(event, dimension, index)}
                >
                  <Icon name="grip" size={14} />
                  <span className={styles.handleIndex}>{String(index + 1).padStart(2, "0")}</span>
                </button>
                <div className={styles.nameBlock}>
                  <span className={styles.itemName}>{dimension.name}</span>
                  {dimension.description ? <span className={styles.itemMeta}>{dimension.description}</span> : null}
                  <span className={styles.itemMeta}>{baselineMeta(dimension)}</span>
                </div>
                <span className={styles.weight}>{dimension.weight}</span>
                <span className={styles.status}>
                  {dimension.archivedAt ? (
                    <span className={ui.tag}>已归档</span>
                  ) : dimension.textMode ? (
                    <span className={`${styles.statusTag} ${styles.statusIdle}`}>文字</span>
                  ) : dimension.weight === 0 ? (
                    <span className={`${styles.statusTag} ${styles.statusIdle}`}>不纳入</span>
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
            <span className={ui.sectionMeta}>
              {activeModels.length} 启用 / {archivedModels.length} 归档
            </span>
          </div>
          <Button variant="primary" onClick={openNewModel}>
            <Icon name="plus" size={14} />
            新增模型
          </Button>
        </div>

        {activeModels.length === 0 ? (
          <EmptyState
            title={archivedModels.length > 0 ? "没有启用的模型" : "尚未创建模型"}
            text="模型档案不含评分；评分仍由排行、详情或工作台的评分弹窗写入。"
          >
            <Button variant="primary" onClick={openNewModel}>
              {archivedModels.length > 0 ? "新增模型" : "创建第一个模型"}
            </Button>
          </EmptyState>
        ) : (
          <div className={styles.list}>
            <div className={`${styles.listHead} ${styles.modelCols}`}>
              <span>#</span>
              <span>模型</span>
              <span>slug</span>
              <span>完整度</span>
              <span className={styles.actionsHead}>操作</span>
            </div>
            {activeModels.map((model, index) => (
              <div className={styles.modelRow} key={model.slug}>
                <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                <div className={styles.nameBlock}>
                  <span className={styles.nameLine}>
                    <span className={styles.itemName}>{model.name}</span>
                    {model.hidden ? <span className={`${styles.statusTag} ${styles.statusIdle}`}>已隐藏</span> : null}
                  </span>
                  <span className={styles.itemMeta}>{model.vendor || "—"}</span>
                </div>
                <span className={styles.slug}>{model.slug}</span>
                <span className={styles.scoreCount}>
                  {model.scoredDimensions} / {scoreableDimensions.length}
                </span>
                <div className={styles.rowActions}>
                  <IconButton label={`查看 ${model.name} 详情`} onClick={() => navigate(`/models/${model.slug}`)}>
                    <Icon name="arrowRight" />
                  </IconButton>
                  <IconButton label={`编辑模型：${model.name}`} onClick={() => openModel(model)}>
                    <Icon name="edit" />
                  </IconButton>
                  <IconButton
                    label={model.hidden ? `显示模型：${model.name}` : `隐藏模型：${model.name}`}
                    active={model.hidden}
                    aria-pressed={model.hidden}
                    onClick={() => void toggleModelHidden(model)}
                  >
                    <Icon name={model.hidden ? "eyeOff" : "eye"} />
                  </IconButton>
                  <IconButton label={`归档模型：${model.name}`} onClick={() => void archiveModel(model)}>
                    <Icon name="archive" />
                  </IconButton>
                  <IconButton label={`删除模型：${model.name}`} danger onClick={() => void deleteModel(model)}>
                    <Icon name="trash" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}

        {archivedModels.length > 0 ? (
          <section className={styles.archiveSection} aria-label="已归档模型">
            <div className={styles.archiveHead}>
              <p className={ui.sectionLabel}>已归档</p>
              <span className={ui.sectionMeta}>{archivedModels.length} 个模型</span>
            </div>
            <div className={styles.list}>
              {archivedModels.map((model) => (
                <div className={styles.archivedRow} key={model.slug}>
                  <div className={styles.nameBlock}>
                    <span className={styles.itemName}>{model.name}</span>
                    <span className={styles.itemMeta}>
                      {model.vendor || "—"}
                      {model.archivedAt ? ` · 归档于 ${new Date(model.archivedAt).toLocaleDateString("zh-CN")}` : ""}
                    </span>
                  </div>
                  <span className={styles.slug}>{model.slug}</span>
                  <div className={styles.rowActions}>
                    <IconButton label={`恢复模型：${model.name}`} onClick={() => void archiveModel(model)}>
                      <Icon name="restore" />
                    </IconButton>
                    <IconButton label={`删除模型：${model.name}`} danger onClick={() => void deleteModel(model)}>
                      <Icon name="trash" />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    );
  } else if (tab === "display") {
    panel = (
      <section role="tabpanel" id="panel-display" aria-labelledby="tab-display" className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.panelIntro}>
            <p className={ui.sectionLabel}>显示</p>
            <span className={ui.sectionMeta}>显示偏好</span>
          </div>
        </div>
        {readError ? (
          <div className={styles.readError} role="alert">
            <p>站点设置读取失败，暂时无法保存。</p>
            <Button onClick={retryRead} disabled={retrying}>
              {retrying ? "正在重试" : "重新读取"}
            </Button>
          </div>
        ) : null}
        <label className={styles.preference}>
          <span className={styles.preferenceCopy}>
            <span className={styles.preferenceLabel}>百分比模式</span>
            <span className={styles.preferenceHint}>所有设备 · 综合分与维度分显示为百分比</span>
          </span>
          <span className={ui.checkboxRow}>
            <input
              type="checkbox"
              checked={scorePercentageMode}
              disabled={displayLoading || displaySaving || Boolean(readError)}
              onChange={(event) => void setScorePercentageMode(event.target.checked)}
            />
            {scorePercentageMode ? "开启" : "关闭"}
          </span>
        </label>
        <label className={styles.preference}>
          <span className={styles.preferenceCopy}>
            <span className={styles.preferenceLabel}>最高分占比</span>
            <span className={styles.preferenceHint}>
              {scorePercentageMode ? "所有设备 · 得分 ÷ 同项最高分 · 关闭时按分差（1%–100%）" : "所有设备 · 需先开启百分比模式"}
            </span>
          </span>
          <span className={ui.checkboxRow}>
            <input
              type="checkbox"
              checked={scorePercentageMaxMode}
              disabled={displayLoading || displaySaving || Boolean(readError) || !scorePercentageMode}
              onChange={(event) => void setScorePercentageMaxMode(event.target.checked)}
            />
            {scorePercentageMaxMode ? "开启" : "关闭"}
          </span>
        </label>
        <label className={styles.preference}>
          <span className={styles.preferenceCopy}>
            <span className={styles.preferenceLabel}>维护模式</span>
            <span className={styles.preferenceHint}>所有设备 · 未登录访客只显示维护页</span>
          </span>
          <span className={ui.checkboxRow}>
            <input
              type="checkbox"
              checked={maintenanceMode}
              disabled={displayLoading || displaySaving || Boolean(readError)}
              onChange={(event) => void setMaintenanceMode(event.target.checked)}
            />
            {maintenanceMode ? "开启" : "关闭"}
          </span>
        </label>
        <label className={styles.preference}>
          <span className={styles.preferenceCopy}>
            <span className={styles.preferenceLabel}>维度得分强调</span>
            <span className={styles.preferenceHint}>
              当前浏览器
              <span className={`${ui.legendSwatch} ${ui.legendLow}`} aria-hidden="true" />
              低分红 <span aria-hidden="true">→</span>
              <span className={`${ui.legendSwatch} ${ui.legendHigh}`} aria-hidden="true" />
              高分蓝
            </span>
          </span>
          <span className={ui.checkboxRow}>
            <input
              type="checkbox"
              checked={dimensionScoreEmphasis}
              onChange={(event) => setDimensionScoreEmphasis(event.target.checked)}
            />
            {dimensionScoreEmphasis ? "开启" : "关闭"}
          </span>
        </label>
        <div className={styles.notesEditor}>
          <TextAreaField
            id="ranking-notes"
            label="排行榜备注（Markdown）"
            rows={8}
            value={notesDraft}
            error={notesError || undefined}
            disabled={displayLoading || displaySaving || Boolean(readError)}
            onChange={(event) => {
              setNotesDraft(event.target.value);
              if (notesError) setNotesError("");
            }}
          />
          <div className={styles.notesActions}>
            <Button
              variant="primary"
              onClick={() => void saveNotes()}
              disabled={!notesDirty || displayLoading || displaySaving || Boolean(readError)}
            >
              {displaySaving ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      </section>
    );
  } else {
    panel = (
      <section role="tabpanel" id="panel-data" aria-labelledby="tab-data" className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.panelIntro}>
            <p className={ui.sectionLabel}>数据</p>
            <span className={ui.sectionMeta}>模型与评分 JSON 导出 / 仅管理员</span>
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
            <p className={styles.exportText}>包含维度权重、归档项、模型评语、文字维度、私人备注与全部评分，可直接解析；完整备份以数据卷为准。</p>
          </div>
          <Button variant="primary" onClick={() => void exportJSON()} disabled={exporting}>
            <Icon name="download" size={14} />
            {exporting ? "导出中…" : "导出 JSON"}
          </Button>
        </div>
        <p className={styles.backupNote}>数据库文件位于服务端 DB_PATH，完整备份以数据卷为准。</p>
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
            <span>{activeModels.length} 个模型</span>
            <span>{totalScores} 条评分</span>
          </div>
        </div>
      </PageHeading>

      <nav className={styles.tabs} role="tablist" aria-label="设置分区">
        {tabOrder.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            ref={(node) => {
              if (node) tabRefs.current.set(key, node);
              else tabRefs.current.delete(key);
            }}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            className={`${styles.tab} ${tab === key ? styles.activeTab : ""}`}
            onClick={() => setTab(key)}
            onKeyDown={(event) => moveTab(event, key)}
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
      <ModelDialog open={modelOpen} model={modelEdit} models={activeModels} onClose={() => setModelOpen(false)} onSaved={refreshAll} />

      <p className={styles.footerNote}>
        维度与模型的永久删除不可恢复。需要留存时先导出 JSON。 <Link to="/">返回排行</Link>
      </p>
    </div>
  );
}
