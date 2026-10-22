import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { RankingModel } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { Coverage } from "../components/Coverage";
import { DimensionScore } from "../components/DimensionScore";
import { Icon } from "../components/Icons";
import { PageHeading } from "../components/PageHeading";
import { EmptyState, ErrorState, PageLoading } from "../components/States";
import { useToast } from "../components/Toast";
import ui from "../components/ui.module.css";
import { formatScore } from "../domain/ranking";
import { useAsyncData } from "../hooks/useAsyncData";
import { dimensionScoreRanges, formatStrengthPercentile, scoreRange } from "../lib/scoreEmphasis";
import { monthKicker } from "../lib/format";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useDisplayPreferences } from "../preferences/DisplayPreferences";
import { useSession } from "../session/SessionProvider";
import styles from "./Compare.module.css";

export function Compare() {
  useDocumentTitle("模型对比");
  const { data, loading, error, reload } = useAsyncData((signal) => api.rankings(false, signal), []);
  const session = useSession();
  const { scorePercentageMode } = useDisplayPreferences();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [candidate, setCandidate] = useState("");

  const models = data?.models ?? [];
  const dimensions = data?.dimensions ?? [];
  const requested = useMemo(() => [...new Set((params.get("models") ?? "").split(",").filter(Boolean))], [params]);
  const selected = useMemo(
    () => requested.map((slug) => models.find((model) => model.slug === slug)).filter((model): model is RankingModel => Boolean(model)).slice(0, 4),
    [requested, models],
  );
  const available = models.filter((model) => !selected.some((chosen) => chosen.slug === model.slug));

  const setSelection = (slugs: string[]) => {
    const next = new URLSearchParams(params);
    if (slugs.length > 0) next.set("models", slugs.join(","));
    else next.delete("models");
    setParams(next);
  };

  const add = (slug: string) => {
    if (!slug) return;
    if (selected.length >= 4) {
      toast("最多对比 4 个模型", "error");
      return;
    }
    setSelection([...selected.map((model) => model.slug), slug]);
    setCandidate("");
  };

  const remove = (slug: string) => {
    setSelection(selected.filter((model) => model.slug !== slug).map((model) => model.slug));
  };

  const scoreRanges = useMemo(() => dimensionScoreRanges(models, dimensions.map((dimension) => dimension.id)), [models, dimensions]);
  const compositeRange = useMemo(() => scoreRange(models.map((model) => model.score)), [models]);

  let content: ReactNode;
  if (loading && !data) {
    content = <PageLoading label="正在加载对比" />;
  } else if (error) {
    content = <ErrorState error={error} onRetry={reload} />;
  } else if (models.length === 0) {
    content = (
      <EmptyState title="尚无模型" text="管理员添加模型后即可进行对比。">
        <Button variant="primary" onClick={() => window.location.assign("/")}>
          返回排行
        </Button>
      </EmptyState>
    );
  } else if (selected.length < 2) {
    content = (
      <EmptyState title="选择至少两个模型" text="从上方加入模型，或回到排行勾选对比。">
        <div className={styles.candidates}>
          {available.slice(0, 8).map((model) => (
            <Button key={model.slug} compact onClick={() => add(model.slug)}>
              {model.name}
            </Button>
          ))}
        </div>
      </EmptyState>
    );
  } else if (dimensions.length === 0) {
    content = (
      <EmptyState title="尚未设置维度权重" text="为维度设置大于 0 的权重后，对比表会展开维度得分。" />
    );
  } else {
    content = (
      <>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">模型对比</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.dimHead}>
                  维度 / 权重
                </th>
                {selected.map((model) => (
                  <th scope="col" key={model.slug} className={styles.modelHead}>
                    <div className={styles.modelHeadTop}>
                      <Link to={`/models/${model.slug}`} className={styles.modelName}>
                        {model.name}
                      </Link>
                      <IconButton label={`移出对比：${model.name}`} onClick={() => remove(model.slug)}>
                        <Icon name="close" size={13} />
                      </IconButton>
                    </div>
                    <span className={styles.vendor}>{model.vendor || "—"}</span>
                    <div className={styles.modelScoreBlock}>
                      {scorePercentageMode ? <span className={styles.modelScoreLabel}>综合强度</span> : null}
                      <div className={styles.modelScore}>
                        {scorePercentageMode ? formatStrengthPercentile(model.score, compositeRange) : formatScore(model.score)}
                      </div>
                    </div>
                    <div className={styles.coverageRow}>
                      <Coverage coverage={model.coverage} provisional={model.provisional} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dimensions.map((dimension) => (
                <tr key={dimension.id}>
                  <th scope="row" className={styles.rowHead}>
                    <div className={styles.rowHeadInner}>
                      <span>{dimension.name}</span>
                      <span className={styles.weight}>{dimension.weight}</span>
                    </div>
                  </th>
                  {selected.map((model) => (
                    <td key={model.slug} className={styles.valueCell}>
                      <DimensionScore value={model.scores[String(dimension.id)]} range={scoreRanges.get(dimension.id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.cards}>
          {selected.map((model) => (
            <article className={styles.card} key={model.slug}>
              <header className={styles.cardHead}>
                <div>
                  <Link to={`/models/${model.slug}`} className={styles.modelName}>
                    {model.name}
                  </Link>
                  <span className={styles.vendor}>{model.vendor || "—"}</span>
                </div>
                <IconButton label={`移出对比：${model.name}`} onClick={() => remove(model.slug)}>
                  <Icon name="close" size={13} />
                </IconButton>
              </header>
              <div className={styles.cardScore}>
                <div className={styles.cardScoreValue}>
                  {scorePercentageMode ? <span className={styles.modelScoreLabel}>综合强度</span> : null}
                  <strong>{scorePercentageMode ? formatStrengthPercentile(model.score, compositeRange) : formatScore(model.score)}</strong>
                </div>
                <Coverage coverage={model.coverage} provisional={model.provisional} />
              </div>
              <dl className={styles.cardDims}>
                {dimensions.map((dimension) => (
                  <div key={dimension.id}>
                    <dt>
                      {dimension.name}
                      <span className={styles.weight}>{dimension.weight}</span>
                    </dt>
                    <dd>
                      <DimensionScore value={model.scores[String(dimension.id)]} range={scoreRanges.get(dimension.id)} />
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="shell page-enter">
      <PageHeading kicker={monthKicker(session.now, "对比")} title="模型对比">
        <div className={ui.stats}>
          <div className={ui.statsTop}>
            <span>{selected.length} 个模型</span>
            <span>
              维度 <strong className={ui.statStrong}>{dimensions.length}</strong>
            </span>
          </div>
          <div className={ui.statsBottom}>
            <span>权重合计 {data?.totalWeight ?? 0}</span>
            <span>最多 4 个模型</span>
          </div>
        </div>
      </PageHeading>

      <div className={styles.toolbar}>
        <div className={styles.picker}>
          <label className={ui.label} htmlFor="compare-select">
            加入模型
          </label>
          <div className={styles.pickerRow}>
            <select
              id="compare-select"
              className={ui.select}
              value={candidate}
              onChange={(event) => setCandidate(event.target.value)}
              disabled={available.length === 0 || selected.length >= 4}
            >
              <option value="">选择模型</option>
              {available.map((model) => (
                <option key={model.slug} value={model.slug}>
                  {model.name}
                </option>
              ))}
            </select>
            <Button onClick={() => add(candidate)} disabled={!candidate || selected.length >= 4}>
              加入
            </Button>
          </div>
        </div>
        <p className={styles.count}>
          {selected.length} / 4
          {selected.length >= 4 ? " · 已达上限" : ""}
          {scorePercentageMode ? " · 百分比 · 100% = 最强" : ""}
        </p>
      </div>

      {content}
    </div>
  );
}
