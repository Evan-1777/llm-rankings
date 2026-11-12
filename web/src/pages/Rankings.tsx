import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { RankingDimension, RankingModel } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { DetailDrawer, type DetailTarget } from "../components/DetailDrawer";
import { DimensionScore } from "../components/DimensionScore";
import scoreStyles from "../components/DimensionScore.module.css";
import { Icon } from "../components/Icons";
import { ModelDialog } from "../components/ModelDialog";
import { PageHeading } from "../components/PageHeading";
import { RankingNotes } from "../components/RankingNotes";
import { ScoreDialog } from "../components/ScoreDialog";
import { SortButton } from "../components/SortButton";
import { EmptyState, ErrorState, PageLoading } from "../components/States";
import { useToast } from "../components/Toast";
import ui from "../components/ui.module.css";
import {
  boardColumns,
  dimensionKey,
  dimensionMax,
  formatScore,
  groupKey,
  groupValue,
  snapshotBaselines,
  sortRows,
  type BoardColumns,
  type DimensionGroup,
  type SortDir,
} from "../domain/ranking";
import { useAsyncData } from "../hooks/useAsyncData";
import { downloadRankingsImage } from "../lib/exportImage";
import { dimensionScoreRanges, displayScoreLabel, formatDisplayScore, scoreMax, scoreRange } from "../lib/scoreEmphasis";
import { formatClock, monthKicker, rankLabel } from "../lib/format";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useDisplayPreferences } from "../preferences/DisplayPreferences";
import { useSession } from "../session/SessionProvider";
import styles from "./Rankings.module.css";

interface SortState {
  key: string;
  dir: SortDir;
}

function isSortKey(key: string, columns: BoardColumns<RankingDimension>): boolean {
  if (key === "model" || key === "score") return true;
  if (key.startsWith("group-")) return columns.groups.some((group) => groupKey(group.name) === key);
  return key.startsWith("dim-") && columns.ungrouped.some((dimension) => dimensionKey(dimension.id) === key);
}

function resolveSort(params: URLSearchParams, columns: BoardColumns<RankingDimension>): SortState {
  const rawKey = params.get("sort") ?? "score";
  const key = isSortKey(rawKey, columns) ? rawKey : "score";
  const rawDir = params.get("dir");
  const dir: SortDir = rawDir === "asc" || rawDir === "desc" ? rawDir : key === "model" ? "asc" : "desc";
  return { key, dir };
}

function resolveCompare(params: URLSearchParams, models: RankingModel[]): string[] {
  const raw = params.get("compare");
  if (!raw) return [];
  const known = new Set(models.map((model) => model.slug));
  return [...new Set(raw.split(",").filter((slug) => known.has(slug)))].slice(0, 4);
}

function SortHeader({
  label,
  right = false,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  right?: boolean;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      className={`${styles.th} ${right ? styles.alignRight : ""} ${className ?? ""}`}
    >
      <SortButton label={label} active={active} dir={dir} align={right ? "right" : "left"} onClick={onClick} />
    </th>
  );
}

/** One rating column: shared by group columns and single dimensions. */
function ColumnHead({
  label,
  sub,
  active,
  dir,
  onSort,
  onDetail,
}: {
  label: string;
  sub: string;
  active: boolean;
  dir: SortDir;
  onSort: () => void;
  onDetail: () => void;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      className={`${styles.th} ${styles.alignRight} ${styles.dimCol}`}
    >
      <SortButton label={label} sub={sub} active={active} dir={dir} align="right" onClick={onSort} />
      <button type="button" className={styles.detailBtn} aria-label={`查看 ${label} 明细`} onClick={onDetail}>
        <Icon name="chevron" size={10} />
      </button>
    </th>
  );
}

export function Rankings() {
  useDocumentTitle("综合排行");
  const { data, loading, error, reload } = useAsyncData((signal) => api.rankings(false, signal), []);
  const session = useSession();
  const { dimensionScoreEmphasis, scorePercentageMode, scorePercentageMaxMode, rankingNotes } = useDisplayPreferences();
  const displayMode = { percentage: scorePercentageMode, maxShare: scorePercentageMaxMode };
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [scoreTarget, setScoreTarget] = useState<RankingModel | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [exporting, setExporting] = useState(false);

  const dimensions = data?.dimensions ?? [];
  const models = data?.models ?? [];
  const totalWeight = data?.totalWeight ?? 0;
  const scoredCount = models.filter((model) => model.score != null).length;
  const columns = useMemo(() => boardColumns(dimensions), [dimensions]);
  // The board converts with the snapshot's effective baselines, so hidden
  // models that hold a maximum keep the visible group values in step.
  const baselines = useMemo(() => snapshotBaselines(dimensions), [dimensions]);
  const sort = resolveSort(params, columns);
  const compareSlugs = resolveCompare(params, models);
  const sortedModels = useMemo(
    () => sortRows(models, sort.key, sort.dir, { groups: columns.groups, baselines }),
    [models, sort.key, sort.dir, columns, baselines],
  );
  const scoreRanges = useMemo(() => dimensionScoreRanges(models, dimensions.map((dimension) => dimension.id)), [models, dimensions]);
  const dimensionMaxima = useMemo(
    () => new Map(dimensions.map((dimension) => [dimension.id, dimensionMax(models, dimension.id)])),
    [models, dimensions],
  );
  const compositeRange = useMemo(() => scoreRange(models.map((model) => model.score)), [models]);
  const compositeMax = useMemo(() => scoreMax(models.map((model) => model.score)), [models]);

  const updateSort = (key: string) => {
    const next = new URLSearchParams(params);
    const nextDir: SortDir = sort.key === key ? (sort.dir === "asc" ? "desc" : "asc") : key === "model" ? "asc" : "desc";
    next.set("sort", key);
    next.set("dir", nextDir);
    setParams(next);
  };

  const openGroupDetail = (group: DimensionGroup<RankingDimension>) => {
    setDetail({
      kicker: "维度组 / 组内明细",
      title: group.name,
      color: group.color,
      meta: `${group.dimensions.map((dimension) => `${dimension.name} · 权重 ${dimension.weight}`).join("   /   ")}   ·   组值按综合分公式的组内部分计算`,
      dimensions: group.dimensions,
    });
  };

  const openDimensionDetail = (dimension: RankingDimension) => {
    setDetail({
      kicker: "维度 / 明细",
      title: dimension.name,
      color: null,
      meta: `权重 ${dimension.weight} · 名次按同维度已评分模型`,
      dimensions: [dimension],
    });
  };

  const toggleCompare = (slug: string) => {
    const next = new URLSearchParams(params);
    let selected = compareSlugs;
    if (compareSlugs.includes(slug)) {
      selected = compareSlugs.filter((item) => item !== slug);
    } else {
      if (compareSlugs.length >= 4) {
        toast("最多选择 4 个模型", "error");
        return;
      }
      selected = [...compareSlugs, slug];
    }
    if (selected.length > 0) next.set("compare", selected.join(","));
    else next.delete("compare");
    setParams(next);
  };

  const refreshAll = () => {
    reload();
    void session.refresh();
  };

  const openSettings = () => navigate("/settings?tab=dimensions");

  const exportImage = async () => {
    if (!data || exporting) return;
    setExporting(true);
    try {
      await downloadRankingsImage(data);
      toast("图片已导出");
    } catch (caught) {
      toast(errorMessage(caught), "error");
    } finally {
      setExporting(false);
    }
  };

  const compositeLabel = displayScoreLabel(displayMode, "综合分", "综合强度", "综合占比");
  const percentageLabel = displayScoreLabel(displayMode, "加权平均", "相对强度", "最高分占比");
  const compositeNote = !scorePercentageMode
    ? "加权平均 / 全部模型"
    : scorePercentageMaxMode
      ? compositeMax > 0
        ? "最高分占比 / 100% = 同项最高分"
        : "最高分占比 / 需有大于 0 的分值"
      : compositeRange
        ? "相对强度 / 100% = 最强"
        : "相对强度 / 需至少两个不同分值";

  let content: ReactNode;
  if ((loading && !data) || session.loading) {
    content = <PageLoading label="正在加载排行" />;
  } else if (error) {
    content = <ErrorState error={error} onRetry={reload} />;
  } else if (data) {
    const activeSessionDimensions = session.dimensions.filter((dimension) => !dimension.archivedAt);
    const numericSessionDimensions = activeSessionDimensions.filter((dimension) => !dimension.textMode);
    if (dimensions.length === 0) {
      const onlyText = activeSessionDimensions.length > 0 && numericSessionDimensions.length === 0;
      content = (
        <EmptyState
          title={onlyText ? "暂无参与排行的维度" : "尚未创建维度"}
          text={
            onlyText
              ? session.authenticated
                ? "文字维度不参与排行；启用数值维度并设置权重后会在这里展开。"
                : "管理员尚未启用参与排行的数值维度。"
              : session.authenticated
                ? "排行需要维度与权重，先在设置中创建第一个维度。"
                : "管理员尚未配置维度与权重。"
          }
        >
          {session.authenticated ? (
            <Button variant="primary" onClick={openSettings}>
              前往维度设置
            </Button>
          ) : null}
        </EmptyState>
      );
    } else if (data.totalWeight === 0) {
      content = (
        <EmptyState
          title="维度均未纳入评分"
          text={session.authenticated ? "所有启用维度的权重均为 0，设置权重后开始计算排行。" : "管理员尚未让任何维度参与评分。"}
        >
          {session.authenticated ? (
            <>
              <Button variant="primary" onClick={openSettings}>
                设置权重
              </Button>
              <Button onClick={() => setModelOpen(true)}>新增模型</Button>
            </>
          ) : null}
        </EmptyState>
      );
    } else if (models.length === 0) {
      content = (
        <EmptyState
          title="尚无模型"
          text={session.authenticated ? "创建模型后即可进入排行并录入评分。" : "管理员尚未添加模型。"}
        >
          {session.authenticated ? (
            <Button variant="primary" onClick={() => setModelOpen(true)}>
              新增模型
            </Button>
          ) : null}
        </EmptyState>
      );
    } else {
      content = (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">模型加权综合排行</caption>
              <thead>
                <tr>
                  <th scope="col" aria-label="综合排名" className={`${styles.th} ${styles.rankCol}`}>
                    <span className={styles.staticHead}>
                      <span className={styles.rankFull}>综合排名</span>
                      <span className={styles.rankShort}>排名</span>
                    </span>
                  </th>
                  <SortHeader label="模型" className={styles.modelCol} active={sort.key === "model"} dir={sort.dir} onClick={() => updateSort("model")} />
                  <SortHeader
                    label={compositeLabel}
                    className={styles.scoreCol}
                    right
                    active={sort.key === "score"}
                    dir={sort.dir}
                    onClick={() => updateSort("score")}
                  />
                  {columns.columns.map((column) => {
                    if (column.kind === "group") {
                      const { group } = column;
                      const key = groupKey(group.name);
                      return (
                        <ColumnHead
                          key={key}
                          label={group.name}
                          sub={`${group.dimensions.length} 项 · 权重 ${group.weight}`}
                          active={sort.key === key}
                          dir={sort.dir}
                          onSort={() => updateSort(key)}
                          onDetail={() => openGroupDetail(group)}
                        />
                      );
                    }
                    const { dimension } = column;
                    const key = dimensionKey(dimension.id);
                    return (
                      <ColumnHead
                        key={key}
                        label={dimension.name}
                        sub={`权重 ${dimension.weight}`}
                        active={sort.key === key}
                        dir={sort.dir}
                        onSort={() => updateSort(key)}
                        onDetail={() => openDimensionDetail(dimension)}
                      />
                    );
                  })}
                  <th scope="col" className={`${styles.th} ${styles.actionCol}`}>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedModels.map((model) => {
                  const selected = compareSlugs.includes(model.slug);
                  return (
                    <tr key={model.slug} className={styles.row}>
                      <td className={`${styles.td} ${styles.rankCell}`}>
                        <span className={`${styles.rank} ${model.rank === 1 ? styles.topRank : ""}`}>{rankLabel(model.rank)}</span>
                      </td>
                      <td className={`${styles.td} ${styles.modelCell}`}>
                        <Link to={`/models/${model.slug}`} className={styles.modelName}>
                          {model.name}
                        </Link>
                        <span className={styles.vendor}>{model.vendor || "—"}</span>
                      </td>
                      <td className={`${styles.td} ${styles.alignRight} ${styles.scoreValue}`}>
                        {formatDisplayScore(model.score, displayMode, compositeRange, compositeMax)}
                      </td>
                      {columns.columns.map((column) => (
                        <td
                          key={column.kind === "group" ? column.group.name : column.dimension.id}
                          className={`${styles.td} ${styles.dimCol} ${styles.alignRight} ${styles.dimValue}`}
                        >
                          <span className={styles.cellRule}>
                            {column.kind === "group" ? (
                              <span className={scoreStyles.score}>
                                {formatScore(groupValue(column.group, model.scores, baselines, model.skips))}
                              </span>
                            ) : model.skips.includes(column.dimension.id) ? (
                              <span className={ui.skip}>Skip</span>
                            ) : (
                              <DimensionScore
                                value={model.scores[String(column.dimension.id)]}
                                range={scoreRanges.get(column.dimension.id)}
                                max={dimensionMaxima.get(column.dimension.id)}
                              />
                            )}
                          </span>
                        </td>
                      ))}
                      <td className={`${styles.td} ${styles.actionCol}`}>
                        <div className={styles.rowActions}>
                          <IconButton
                            label={selected ? `移出对比：${model.name}` : `加入对比：${model.name}`}
                            active={selected}
                            aria-pressed={selected}
                            onClick={() => toggleCompare(model.slug)}
                          >
                            <Icon name="compare" />
                          </IconButton>
                          {session.authenticated ? (
                            <IconButton
                              label={model.score != null ? `编辑 ${model.name} 评分` : `为 ${model.name} 添加评分`}
                              onClick={() => setScoreTarget(model)}
                            >
                              <Icon name={model.score != null ? "edit" : "plus"} />
                            </IconButton>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.tableFoot}>
            <p>
              <span className={styles.footMark} aria-hidden="true" />
              维度组占一列，组值为组内参与计算维度的加权平均，可与综合分互相还原
            </p>
            <p>权重合计 {data.totalWeight} / {percentageLabel}</p>
          </div>
        </>
      );
    }
  } else {
    content = null;
  }

  const dimensionCount = data ? dimensions.length : session.counts.dimensions;
  const modelCount = data ? models.length : session.counts.models;
  const scored = data ? scoredCount : session.counts.scoredModels;
  const weight = data ? totalWeight : session.totalWeight;

  return (
    <div className={`shell page-enter ${compareSlugs.length > 0 ? styles.pageWithBar : ""}`}>
      <PageHeading kicker={monthKicker(session.now, "排行")} title="综合排行">
        <div className={ui.stats}>
          <div className={ui.statsTop}>
            <span>{dimensionCount} 个维度</span>
            <span>
              权重合计 <strong className={ui.statStrong}>{weight}</strong>
            </span>
          </div>
          <div className={ui.statsBottom}>
            <span>{modelCount} 个模型</span>
            <span>{scored} 已评分</span>
            <span>{formatClock(data?.updatedAt)}</span>
          </div>
        </div>
      </PageHeading>

      <div className={styles.billHead}>
        <div className={styles.billIntro}>
          <p className={ui.sectionLabel}>当前榜单</p>
          <span className={ui.sectionMeta}>{compositeNote} · 跳过维度按该维度 60% 中位分计入</span>
          {dimensionScoreEmphasis ? (
            <span className={ui.legend}>
              <span className={`${ui.legendSwatch} ${ui.legendLow}`} aria-hidden="true" />
              低分红 <span aria-hidden="true">→</span>
              <span className={`${ui.legendSwatch} ${ui.legendHigh}`} aria-hidden="true" />
              高分蓝
            </span>
          ) : null}
        </div>
        <div className={styles.billActions}>
          <Button compact onClick={() => void exportImage()} disabled={exporting || !data} aria-label="导出榜单图片">
            <Icon name="download" size={13} />
            {exporting ? "导出中…" : "导出图片"}
          </Button>
          {session.authenticated ? (
            <Button variant="primary" onClick={() => setModelOpen(true)}>
              <Icon name="plus" size={14} />
              新增模型
            </Button>
          ) : null}
        </div>
      </div>

      {content}

      {data && !error ? <RankingNotes content={rankingNotes} className={styles.notes} /> : null}

      {compareSlugs.length > 0 && data ? (
        <div className={styles.compareBar} role="region" aria-label="对比选择">
          <div className={`shell ${styles.compareInner}`}>
            <div className={styles.chips}>
              {compareSlugs.map((slug) => {
                const model = models.find((item) => item.slug === slug);
                if (!model) return null;
                return (
                  <span className={styles.chip} key={slug}>
                    {model.name}
                    <button type="button" aria-label={`移出对比：${model.name}`} onClick={() => toggleCompare(slug)}>
                      <Icon name="close" size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
            <div className={styles.compareActions}>
              <span className={styles.compareHint}>{compareSlugs.length} / 4</span>
              <Button
                variant="primary"
                disabled={compareSlugs.length < 2}
                onClick={() => navigate(`/compare?models=${compareSlugs.join(",")}`)}
              >
                对比
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {scoreTarget && data ? (
        <ScoreDialog
          open
          model={scoreTarget}
          rankings={data}
          onClose={() => setScoreTarget(null)}
          onSaved={refreshAll}
        />
      ) : null}
      {modelOpen ? (
        <ModelDialog open models={models} onClose={() => setModelOpen(false)} onSaved={refreshAll} />
      ) : null}
      <DetailDrawer target={detail} rows={models} onClose={() => setDetail(null)} />
    </div>
  );
}
