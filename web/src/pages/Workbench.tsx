import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useBlocker, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { RankingModel } from "../api/types";
import { Button } from "../components/Button";
import { useConfirm } from "../components/Confirm";
import { Coverage } from "../components/Coverage";
import { Icon } from "../components/Icons";
import { ModelDialog } from "../components/ModelDialog";
import { PageHeading } from "../components/PageHeading";
import { ScoreDialog } from "../components/ScoreDialog";
import { SortButton } from "../components/SortButton";
import { EmptyState, ErrorState, PageLoading } from "../components/States";
import { useToast } from "../components/Toast";
import ui from "../components/ui.module.css";
import { formatDimension, formatScore, sortWorkbenchRows, type SortDir } from "../domain/ranking";
import {
  collectQuickEdit,
  commitQuickEdit,
  createQuickEdit,
  type QuickEditBaseline,
  type QuickEditDraft,
} from "../domain/quickEdit";
import { parseScoreInput } from "../domain/scoreInput";
import { useAsyncData } from "../hooks/useAsyncData";
import { monthKicker, rankLabel } from "../lib/format";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useSession } from "../session/SessionProvider";
import styles from "./Workbench.module.css";

interface SortState {
  key: string;
  dir: SortDir;
}

const INITIAL_SORT: SortState = { key: "coverage", dir: "asc" };

function nextDirection(key: string, current: SortState): SortDir {
  if (current.key === key) return current.dir === "asc" ? "desc" : "asc";
  return key === "score" || key.startsWith("dim-") ? "desc" : "asc";
}

export function Workbench() {
  useDocumentTitle("评分工作台");
  const { data, loading, error, reload } = useAsyncData((signal) => api.rankings(signal), []);
  const session = useSession();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [scoreTarget, setScoreTarget] = useState<RankingModel | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [sort, setSort] = useState<SortState>(INITIAL_SORT);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuickEditDraft>({});
  const [baseline, setBaseline] = useState<QuickEditBaseline>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const promptOpen = useRef(false);

  const dimensions = data?.dimensions ?? [];
  const models = data?.models ?? [];
  const rows = useMemo(() => sortWorkbenchRows(models, sort.key, sort.dir), [models, sort.key, sort.dir]);
  const plan = useMemo(() => collectQuickEdit(draft, baseline, dimensions), [draft, baseline, dimensions]);

  const scored = models.filter((model) => model.score != null).length;
  const canQuickEdit = Boolean(data && models.length > 0 && dimensions.length > 0 && data.totalWeight > 0);
  const dirty = editing && plan.pendingCount > 0;

  const refreshAll = () => {
    reload();
    void session.refresh();
  };

  const updateSort = (key: string) => {
    setSort((current) => ({ key, dir: nextDirection(key, current) }));
  };

  const startEditing = () => {
    const next = createQuickEdit(models, dimensions);
    setDraft(next.draft);
    setBaseline(next.baseline);
    setSaveError("");
    setSavedCount(0);
    setEditing(true);
  };

  const focusToggle = () => {
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  };

  const leaveEditing = () => {
    setEditing(false);
    setDraft({});
    setBaseline({});
    setSaveError("");
    setSavedCount(0);
    focusToggle();
  };

  const requestExit = async () => {
    if (saving) return;
    if (plan.pendingCount > 0) {
      const confirmed = await confirm({
        title: "放弃未保存的修改？",
        body:
          savedCount > 0
            ? `已保存 ${savedCount} 项，放弃剩余 ${plan.pendingCount} 项未提交的修改？`
            : `有 ${plan.pendingCount} 项修改尚未提交，放弃后不会保存。`,
        confirmLabel: "放弃并退出",
        danger: true,
      });
      if (!confirmed) return;
    }
    const committed = savedCount;
    leaveEditing();
    if (committed > 0) refreshAll();
  };

  const save = async () => {
    if (!editing || saving || plan.errors.length > 0 || plan.changes.length === 0) return;
    setSaving(true);
    setSaveError("");
    let nextBaseline = baseline;
    let applied = 0;
    try {
      for (const change of plan.changes) {
        if (change.value == null) {
          await api.deleteScore(change.slug, change.dimensionId);
        } else {
          await api.putScore(change.slug, change.dimensionId, change.value);
        }
        nextBaseline = commitQuickEdit(nextBaseline, change.slug, change.dimensionId, change.value);
        applied += 1;
      }
      toast("评分已保存");
      leaveEditing();
      refreshAll();
    } catch (caught) {
      setBaseline(nextBaseline);
      setSavedCount((current) => current + applied);
      const remaining = plan.changes.length - applied;
      const message = errorMessage(caught);
      setSaveError(
        applied > 0
          ? `${message}；已保存 ${applied} 项 / 剩余 ${remaining} 项未提交（其中 1 项失败）`
          : message,
      );
    } finally {
      setSaving(false);
    }
  };

  const updateCell = (slug: string, dimensionId: number, value: string) => {
    setDraft((current) => ({
      ...current,
      [slug]: { ...current[slug], [String(dimensionId)]: value },
    }));
  };

  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (blocker.state !== "blocked" || promptOpen.current) return;
    promptOpen.current = true;
    void confirm({
      title: "离开评分工作台？",
      body: `快捷编辑还有 ${plan.pendingCount} 项修改尚未提交，离开后这些修改将丢失。`,
      confirmLabel: "放弃并离开",
      danger: true,
    }).then((confirmed) => {
      promptOpen.current = false;
      if (confirmed) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, confirm, plan.pendingCount]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">评分工作台：模型与各维度分值</caption>
          <colgroup>
            <col className={styles.modelCol} />
            {dimensions.map((dimension) => (
              <col key={dimension.id} className={styles.dimCol} />
            ))}
            <col className={styles.scoreCol} />
            <col className={styles.rankCol} />
            <col className={styles.coverageCol} />
            {!editing ? <col className={styles.actionCol} /> : null}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" aria-sort={sort.key === "model" ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={styles.th}>
                <SortButton label="模型" active={sort.key === "model"} dir={sort.dir} onClick={() => updateSort("model")} />
              </th>
              {dimensions.map((dimension) => {
                const key = `dim-${dimension.id}`;
                return (
                  <th
                    key={dimension.id}
                    scope="col"
                    aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={`${styles.th} ${styles.alignRight}`}
                  >
                    <SortButton
                      label={dimension.name}
                      weight={dimension.weight}
                      active={sort.key === key}
                      dir={sort.dir}
                      align="right"
                      wrap
                      onClick={() => updateSort(key)}
                    />
                  </th>
                );
              })}
              <th scope="col" aria-sort={sort.key === "score" ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={`${styles.th} ${styles.alignRight}`}>
                <SortButton label="综合分" active={sort.key === "score"} dir={sort.dir} align="right" onClick={() => updateSort("score")} />
              </th>
              <th scope="col" aria-sort={sort.key === "rank" ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={styles.th}>
                <SortButton label="排名" active={sort.key === "rank"} dir={sort.dir} onClick={() => updateSort("rank")} />
              </th>
              <th scope="col" aria-sort={sort.key === "coverage" ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={styles.th}>
                <SortButton label="覆盖率" active={sort.key === "coverage"} dir={sort.dir} onClick={() => updateSort("coverage")} />
              </th>
              {!editing ? (
                <th scope="col" className={`${styles.th} ${styles.actionHead}`}>
                  <span className="sr-only">操作</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((model) => {
              const ratedCount = dimensions.reduce(
                (count, dimension) => count + (model.scores[String(dimension.id)] != null ? 1 : 0),
                0,
              );
              return (
                <tr key={model.slug} className={styles.row}>
                  <td className={`${styles.td} ${styles.modelCell}`}>
                    <Link to={`/models/${model.slug}`} className={styles.modelName}>
                      {model.name}
                    </Link>
                    <span className={styles.vendor}>{model.vendor || "—"}</span>
                  </td>
                  {dimensions.map((dimension) => {
                    const key = String(dimension.id);
                    const raw = draft[model.slug]?.[key] ?? "";
                    const cellError = editing
                      ? plan.errors.find((item) => item.slug === model.slug && item.dimensionId === dimension.id)
                      : undefined;
                    const parsed = editing ? parseScoreInput(raw) : null;
                    const base = baseline[model.slug]?.[key] ?? null;
                    const changed = Boolean(parsed && !parsed.error && parsed.value !== base);
                    return (
                      <td
                        key={dimension.id}
                        className={`${styles.td} ${styles.dimCell} ${editing ? styles.editCell : ""}`}
                      >
                        {editing ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            className={`${styles.cellInput} ${changed ? styles.inputDirty : ""} ${cellError ? styles.inputError : ""}`}
                            value={raw}
                            placeholder="—"
                            disabled={saving}
                            name={`${model.slug}-${dimension.id}`}
                            autoComplete="off"
                            aria-label={`${model.name} ${dimension.name}`}
                            aria-invalid={Boolean(cellError)}
                            onChange={(event) => updateCell(model.slug, dimension.id, event.target.value)}
                          />
                        ) : (
                          <span className={styles.dimValue}>{formatDimension(model.scores[key])}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={`${styles.td} ${styles.alignRight} ${styles.scoreValue} ${editing ? styles.frozen : ""}`}>
                    {formatScore(model.score)}
                  </td>
                  <td className={`${styles.td} ${styles.rankValue} ${editing ? styles.frozen : ""}`}>{rankLabel(model.rank)}</td>
                  <td className={`${styles.td} ${editing ? styles.frozen : ""}`}>
                    <Coverage
                      coverage={model.coverage}
                      provisional={model.provisional}
                      scored={ratedCount}
                      total={dimensions.length}
                    />
                  </td>
                  {!editing ? (
                    <td className={`${styles.td} ${styles.actionCell}`}>
                      <Button compact onClick={() => setScoreTarget(model)}>
                        <Icon name={model.score != null ? "edit" : "plus"} size={13} />
                        {model.score != null ? "编辑评分" : "添加评分"}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const firstError = plan.errors[0];
  const firstErrorModel = firstError ? models.find((model) => model.slug === firstError.slug)?.name : "";
  const firstErrorDimension = firstError ? dimensions.find((dimension) => dimension.id === firstError.dimensionId)?.name : "";

  return (
    <>
      <div className={`shell page-enter ${editing ? styles.pageWithBar : ""}`}>
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
        <div className={styles.toolbarStart}>
          {editing ? (
            <span className={styles.modeLabel}>快捷编辑 / 保存后刷新排行</span>
          ) : (
            <Button onClick={() => navigate("/settings?tab=dimensions")}>
              <Icon name="settings" size={14} />
              维度设置
            </Button>
          )}
        </div>
        <div className={styles.toolbarActions}>
          {canQuickEdit ? (
            <Button
              ref={toggleRef}
              aria-pressed={editing}
              onClick={() => {
                if (editing) void requestExit();
                else startEditing();
              }}
            >
              {editing ? "完成编辑" : "快捷编辑"}
            </Button>
          ) : null}
          {!editing ? (
            <Button variant="primary" onClick={() => setModelOpen(true)}>
              <Icon name="plus" size={14} />
              新增模型
            </Button>
          ) : null}
        </div>
      </div>

      {content}

      {scoreTarget && data && !editing ? (
        <ScoreDialog open model={scoreTarget} rankings={data} onClose={() => setScoreTarget(null)} onSaved={refreshAll} />
      ) : null}
      {modelOpen && !editing ? <ModelDialog open models={models} onClose={() => setModelOpen(false)} onSaved={refreshAll} /> : null}
      </div>

      {editing ? (
        <div className={styles.editBar} role="region" aria-label="快捷编辑操作">
          <div className={`shell ${styles.editBarInner}`}>
            <div className={styles.editStatus} aria-live="polite">
              <span className={styles.editCount}>{plan.changes.length} 项改动待保存</span>
              <span className={styles.editHint}>保存后刷新排行</span>
              {firstError ? (
                <span className={styles.editError} role="alert">
                  {firstErrorModel} · {firstErrorDimension}：{firstError.message}
                </span>
              ) : saveError ? (
                <span className={styles.editError} role="alert">
                  {saveError}
                </span>
              ) : null}
            </div>
            <div className={styles.editActions}>
              <Button onClick={() => void requestExit()} disabled={saving}>
                取消
              </Button>
              <Button
                variant="primary"
                onClick={() => void save()}
                disabled={saving || plan.pendingCount === 0 || plan.errors.length > 0}
              >
                {saving ? "保存中…" : "保存评分"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
