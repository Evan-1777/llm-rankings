import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { RankingModel } from "../api/types";
import { Button } from "../components/Button";
import { DimensionScore } from "../components/DimensionScore";
import { Icon } from "../components/Icons";
import { PageHeading } from "../components/PageHeading";
import { ScoreDialog } from "../components/ScoreDialog";
import { EmptyState, ErrorState, PageLoading } from "../components/States";
import ui from "../components/ui.module.css";
import { barWidth, dimensionMax, dimensionRanks, formatPercent, formatScore } from "../domain/ranking";
import { useAsyncData } from "../hooks/useAsyncData";
import { dimensionScoreRanges, formatStrengthPercentile, scoreRange, strengthPercentile } from "../lib/scoreEmphasis";
import { rankLabel } from "../lib/format";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useDisplayPreferences } from "../preferences/DisplayPreferences";
import { useSession } from "../session/SessionProvider";
import styles from "./ModelDetail.module.css";

export function ModelDetail() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const { dimensionScoreEmphasis, scorePercentageMode } = useDisplayPreferences();
  const [editOpen, setEditOpen] = useState(false);
  const { data, loading, error, reload } = useAsyncData(async (signal) => {
    const [detail, rankings] = await Promise.all([api.model(slug, signal), api.rankings(false, signal)]);
    return { detail, rankings };
  }, [slug]);
  useDocumentTitle(data?.detail.name ?? "模型详情");
  const numericDimensionIds = useMemo(
    () => (data?.detail.dimensions ?? []).filter((dimension) => !dimension.textMode).map((dimension) => dimension.id),
    [data?.detail.dimensions],
  );
  const scoreRanges = useMemo(
    () => dimensionScoreRanges(data?.rankings.models ?? [], numericDimensionIds),
    [data?.rankings.models, numericDimensionIds],
  );
  const compositeRange = useMemo(
    () => scoreRange((data?.rankings.models ?? []).map((model) => model.score)),
    [data?.rankings.models],
  );
  const ranksByDimension = useMemo(
    () => dimensionRanks(data?.rankings.models ?? [], numericDimensionIds),
    [data?.rankings.models, numericDimensionIds],
  );

  const refreshAll = () => {
    reload();
    void session.refresh();
  };

  if (loading && !data) {
    return (
      <div className="shell page-enter">
        <PageLoading label="正在加载模型详情" />
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="shell page-enter">
        <PageHeading kicker="模型详情" title="模型不存在" />
        <EmptyState title="没有找到这个模型" text="链接可能已经失效，或模型已被移除。">
          <Button variant="primary" onClick={() => navigate("/")}>
            返回排行
          </Button>
        </EmptyState>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="shell page-enter">
        <PageHeading kicker="模型详情" title="模型详情" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  const { detail, rankings } = data;
  const ordered = rankings.models;
  const index = ordered.findIndex((model) => model.slug === detail.slug);
  const nextModel = index >= 0 && ordered.length > 1 ? ordered[(index + 1) % ordered.length] : null;
  const numericDimensions = detail.dimensions.filter((dimension) => !dimension.textMode);
  const textDimensions = detail.dimensions.filter((dimension) => dimension.textMode);
  const storedRow = ordered.find((model) => model.slug === detail.slug);
  const scoreModel: RankingModel =
    storedRow ?? {
      slug: detail.slug,
      name: detail.name,
      vendor: detail.vendor,
      hidden: detail.hidden,
      score: detail.score,
      coverage: detail.coverage,
      provisional: detail.provisional,
      rank: detail.rank,
      scores: Object.fromEntries(
        numericDimensions
          .filter((dimension) => dimension.value != null)
          .map((dimension) => [String(dimension.id), dimension.value as number]),
      ),
    };

  return (
    <div className="shell page-enter">
      <PageHeading kicker={`${detail.vendor || "模型"} / 模型详情`} title={detail.name} titleClassName={styles.title}>
        <div className={styles.headSide}>
          <div className={styles.scoreLine}>
            <span>{scorePercentageMode ? "综合强度" : "综合分"}</span>
            <strong>{scorePercentageMode ? formatStrengthPercentile(detail.score, compositeRange) : formatScore(detail.score)}</strong>
          </div>
          <div className={styles.facts}>
            <div>
              <span>综合排名</span>
              <b>{rankLabel(detail.rank)}</b>
            </div>
            <div>
              <span>覆盖率</span>
              <b>
                {formatPercent(detail.coverage)}
                {detail.provisional ? <span className={ui.tag}>暂定</span> : null}
              </b>
            </div>
            <div>
              <span>已评分维度</span>
              <b>
                {detail.scoredCount} / {detail.dimensionCount}
              </b>
            </div>
          </div>
        </div>
      </PageHeading>

      <div className={styles.actionsBar}>
        <div className={styles.navLinks}>
          <Link to="/" className={styles.textLink}>
            <Icon name="arrowLeft" size={14} />
            返回排行
          </Link>
          {nextModel ? (
            <Link to={`/models/${nextModel.slug}`} className={styles.textLink}>
              下一个模型：{nextModel.name}
              <Icon name="arrowRight" size={14} />
            </Link>
          ) : null}
        </div>
        <div className={ui.actions}>
          {!detail.hidden ? (
            <Button onClick={() => navigate(`/compare?models=${detail.slug}`)}>
              <Icon name="compare" size={14} />
              对比
            </Button>
          ) : null}
          {session.authenticated ? (
            <Button variant="primary" onClick={() => setEditOpen(true)}>
              <Icon name={detail.score != null ? "edit" : "plus"} size={14} />
              {detail.score != null ? "编辑评分" : "添加评分"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className={ui.sectionHead}>
        <p className={ui.sectionLabel}>维度得分</p>
        <span className={`${styles.sectionNotes} ${styles.hideMobile}`}>
          <span className={ui.sectionMeta}>
            {scorePercentageMode
              ? "相对强度 / 100% = 最强，1% = 最弱 / 相对条越强越长"
              : "相对条按最高分归一 / 名次按同维度已评分模型"}
          </span>
          {dimensionScoreEmphasis ? (
            <span className={ui.legend}>
              <span className={`${ui.legendSwatch} ${ui.legendLow}`} aria-hidden="true" />
              低分红 <span aria-hidden="true">→</span>
              <span className={`${ui.legendSwatch} ${ui.legendHigh}`} aria-hidden="true" />
              高分蓝
            </span>
          ) : null}
        </span>
      </div>

      {numericDimensions.length === 0 && textDimensions.length === 0 ? (
        <EmptyState
          title="尚未设置维度权重"
          text={session.authenticated ? "为维度设置大于 0 的权重后，模型评分会在这里展开。" : "管理员尚未启用任何维度。"}
        >
          {session.authenticated ? (
            <Button variant="primary" onClick={() => navigate("/settings?tab=dimensions")}>
              前往维度设置
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <>
          {numericDimensions.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.dimTable}>
                <caption className="sr-only">{detail.name} 的维度得分与同维度排名</caption>
                <thead>
                  <tr>
                    <th scope="col">维度</th>
                    <th scope="col">权重</th>
                    <th scope="col" className={styles.num}>
                      {scorePercentageMode ? "强度" : "得分"}
                    </th>
                    <th scope="col" className={`${styles.rankCol} ${styles.num}`}>
                      维度排名
                    </th>
                    <th scope="col" className={styles.barCol}>
                      相对
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {numericDimensions.map((dimension) => {
                    const max = dimensionMax(rankings.models, dimension.id);
                    const percent = scorePercentageMode ? strengthPercentile(dimension.value, scoreRanges.get(dimension.id)) : null;
                    const ranked = ranksByDimension.get(dimension.id);
                    const rank = ranked?.get(detail.slug) ?? null;
                    return (
                      <tr key={dimension.id}>
                        <td className={styles.dimName}>{dimension.name}</td>
                        <td className={styles.weight}>{dimension.weight}</td>
                        <td className={`${styles.score} ${styles.num}`}>
                          <DimensionScore value={dimension.value} range={scoreRanges.get(dimension.id)} />
                        </td>
                        <td className={`${styles.rankCell} ${styles.num}`}>
                          {rank == null ? (
                            <span className={styles.rankMissing}>—</span>
                          ) : (
                            <span className={styles.rank}>
                              <b>{rankLabel(rank)}</b>
                              <span className={styles.rankTotal}>/ {rankLabel(ranked?.size ?? 0)}</span>
                            </span>
                          )}
                        </td>
                        <td className={styles.barCol}>
                          <span className={styles.barTrack} aria-hidden="true">
                            <span
                              className={styles.barFill}
                              style={{ width: `${scorePercentageMode ? (percent ?? 0) : barWidth(dimension.value, max)}%` }}
                            />
                          </span>
                        </td>
                      </tr>
                    );
                      })}
                </tbody>
              </table>
            </div>
          ) : null}

          {textDimensions.length > 0 ? (
            <section className={styles.textSection} aria-label="文字维度">
              <div className={ui.sectionHead}>
                <p className={ui.sectionLabel}>文字维度</p>
              </div>
              <div className={styles.textList}>
                {textDimensions.map((dimension) => (
                  <article className={styles.textRow} key={dimension.id}>
                    <div className={styles.textHead}>
                      <span className={styles.textName}>{dimension.name}</span>
                      <span className={styles.weight}>权重 {dimension.weight}</span>
                    </div>
                    <p className={styles.textContent}>{dimension.text?.trim() ? dimension.text : "—"}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      {session.authenticated ? (
        <section className={styles.private} aria-label="私人备注">
          <div className={styles.privateHead}>
            <Icon name="lock" size={13} />
            仅管理员
          </div>
          <p>{detail.notes?.trim() ? detail.notes : "暂无私人备注"}</p>
        </section>
      ) : null}

      {editOpen ? (
        <ScoreDialog open model={scoreModel} rankings={rankings} onClose={() => setEditOpen(false)} onSaved={refreshAll} />
      ) : null}
    </div>
  );
}
