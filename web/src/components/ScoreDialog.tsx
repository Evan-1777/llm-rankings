import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { ModelDetail, ModelDimension, Rankings, RankingModel } from "../api/types";
import { boardColumns, formatScore, previewRanking, type DimensionGroup } from "../domain/ranking";
import { parseScoreInput } from "../domain/scoreInput";
import { rankLabel } from "../lib/format";
import { Button, IconButton } from "./Button";
import { useConfirm } from "./Confirm";
import { Dialog, DialogHeader } from "./Dialog";
import { Icon } from "./Icons";
import { useToast } from "./Toast";
import ui from "./ui.module.css";
import styles from "./ScoreDialog.module.css";

interface DraftRow {
  value: string;
  note: string;
  text: string;
  openNote: boolean;
  /** The dimension is marked as skipped instead of rated. */
  skip: boolean;
}

interface OriginalRow {
  value: number | null;
  note: string;
  text: string;
  skip: boolean;
}

const EMPTY_DIMENSIONS: ModelDetail["dimensions"] = [];
const TEXT_LIMIT = 2000;

/** Weight share floored to one decimal, so 79.9% never renders as 80%. */
function percentLabel(ratio: number): string {
  const value = Math.floor(ratio * 1000 + 1e-9) / 10;
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

interface ScoreDialogProps {
  open: boolean;
  model: RankingModel | null;
  rankings: Rankings;
  onClose: () => void;
  onSaved: () => void;
}

export function ScoreDialog({ open, model, rankings, onClose, onSaved }: ScoreDialogProps) {
  const [detail, setDetail] = useState<ModelDetail | null>(null);
  const [draft, setDraft] = useState<Record<number, DraftRow>>({});
  const [original, setOriginal] = useState<Record<number, OriginalRow>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const confirm = useConfirm();
  const toast = useToast();
  const promptOpen = useRef(false);
  const firstInput = useRef<HTMLInputElement>(null);
  const firstText = useRef<HTMLTextAreaElement>(null);

  const slug = model?.slug ?? null;

  useEffect(() => {
    if (!open || !slug) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    setDetail(null);
    setDraft({});
    setOriginal({});
    setSaveError("");
    // The detail snapshot already contains hidden models, so its effective
    // baselines are the server truth for the preview; no second board request.
    api
      .model(slug, controller.signal)
      .then((data) => {
        const nextDraft: Record<number, DraftRow> = {};
        const nextOriginal: Record<number, OriginalRow> = {};
        const skipped = new Set(data.skips);
        for (const dimension of data.dimensions) {
          const text = dimension.textMode ? dimension.text ?? "" : "";
          nextDraft[dimension.id] = {
            value: dimension.value == null ? "" : String(dimension.value),
            note: dimension.note ?? "",
            text,
            openNote: Boolean(dimension.note),
            skip: skipped.has(dimension.id),
          };
          nextOriginal[dimension.id] = { value: dimension.value, note: dimension.note ?? "", text, skip: skipped.has(dimension.id) };
        }
        setDetail(data);
        setDraft(nextDraft);
        setOriginal(nextOriginal);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, slug]);

  const dimensions = detail?.dimensions ?? EMPTY_DIMENSIONS;
  const scoreableDimensions = useMemo(
    () => dimensions.filter((dimension) => !dimension.textMode && dimension.weight > 0),
    [dimensions],
  );
  const columns = useMemo(() => boardColumns(dimensions), [dimensions]);
  const totalWeight = useMemo(() => dimensions.reduce((sum, dimension) => sum + dimension.weight, 0), [dimensions]);

  /** Unrated dimensions lead their group; groups holding one lead the dialog. */
  const blocks = useMemo(() => {
    const pending = (dimension: ModelDimension) => {
      const row = draft[dimension.id];
      return Boolean(row && !dimension.textMode && !row.skip && row.value.trim() === "");
    };
    const grouped: { group: DimensionGroup<ModelDimension> | null; dims: ModelDimension[] }[] = columns.groups.map((group) => ({
      group,
      dims: group.dimensions,
    }));
    if (columns.ungrouped.length > 0) grouped.push({ group: null, dims: columns.ungrouped });
    return grouped
      .map((block) => {
        const dims = [...block.dims].sort((a, b) => Number(pending(b)) - Number(pending(a)));
        return { ...block, dims, pendingCount: dims.filter(pending).length };
      })
      .sort((a, b) => Number(b.pendingCount > 0) - Number(a.pendingCount > 0));
  }, [columns, draft]);

  const firstNumericId = useMemo(
    () => blocks.flatMap((block) => block.dims).find((dimension) => !dimension.textMode)?.id,
    [blocks],
  );

  useEffect(() => {
    if (!open || !detail) return;
    if (firstNumericId != null) firstInput.current?.focus();
    else firstText.current?.focus();
  }, [open, detail, firstNumericId]);

  const updateRow = (id: number, patch: Partial<DraftRow>) => {
    setDraft((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  };

  const skips = useMemo(
    () => dimensions.filter((dimension) => draft[dimension.id]?.skip).map((dimension) => dimension.id),
    [dimensions, draft],
  );

  const parsedValues = useMemo(() => {
    const values: Record<number, number | null> = {};
    for (const dimension of dimensions) {
      const row = draft[dimension.id];
      if (!row || dimension.textMode) continue;
      values[dimension.id] = parseScoreInput(row.value).value;
    }
    return values;
  }, [dimensions, draft]);

  const errors = useMemo(() => {
    const next: Record<number, string> = {};
    for (const dimension of dimensions) {
      const row = draft[dimension.id];
      if (!row) continue;
      if (dimension.textMode) {
        if (row.text.length > TEXT_LIMIT) next[dimension.id] = `文字不能超过 ${TEXT_LIMIT} 个字符`;
        continue;
      }
      if (row.skip) continue;
      const parsed = parseScoreInput(row.value);
      if (parsed.error) next[dimension.id] = parsed.error;
      else if (row.note.length > 500) next[dimension.id] = "备注不能超过 500 个字符";
    }
    return next;
  }, [dimensions, draft]);

  const dirty = useMemo(() => {
    return dimensions.some((dimension) => {
      const row = draft[dimension.id];
      const base = original[dimension.id];
      if (!row || !base) return false;
      if (dimension.textMode) return row.text !== base.text;
      if (row.skip !== base.skip) return true;
      if (row.skip) return false;
      return parseScoreInput(row.value).value !== base.value || row.note !== base.note;
    });
  }, [dimensions, draft, original]);

  // The preview must not depend on the public ranking containing this model:
  // hidden models are absent there, but their draft still needs a live rank view.
  const previewRows = useMemo(() => {
    if (!model) return rankings.models;
    if (rankings.models.some((row) => row.slug === model.slug)) return rankings.models;
    return [...rankings.models, model];
  }, [model, rankings.models]);

  // The detail snapshot covers hidden models, so these baselines already match
  // the saved ranking; resolveBaselines only raises them when the draft does.
  const fallbackBaselines = useMemo(() => {
    const next: Record<number, number | null> = {};
    for (const dimension of dimensions) next[dimension.id] = dimension.effectiveBaselineMax;
    return next;
  }, [dimensions]);

  const preview = useMemo(() => {
    if (!model) return null;
    return previewRanking(previewRows, dimensions, model.slug, parsedValues, fallbackBaselines, skips);
  }, [model, previewRows, dimensions, parsedValues, fallbackBaselines, skips]);

  const requestClose = useCallback(async () => {
    if (!dirty) {
      onClose();
      return;
    }
    const confirmed = await confirm({
      title: "放弃未保存的评分？",
      body: "已修改的评分、文字与备注不会保存。",
      confirmLabel: "放弃并离开",
      danger: true,
    });
    if (confirmed) onClose();
  }, [confirm, dirty, onClose]);

  const blocker = useBlocker(dirty && open);

  useEffect(() => {
    if (blocker.state !== "blocked" || promptOpen.current) return;
    promptOpen.current = true;
    void confirm({
      title: "离开评分弹窗？",
      body: "当前评分尚未保存，离开后修改将丢失。",
      confirmLabel: "放弃并离开",
      danger: true,
    }).then((confirmed) => {
      promptOpen.current = false;
      if (confirmed) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, confirm]);

  useEffect(() => {
    if (!dirty || !open) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, open]);

  const save = async () => {
    if (!model || !detail || saving || !dirty || Object.keys(errors).length > 0) return;
    setSaving(true);
    setSaveError("");
    let applied = 0;
    try {
      for (const dimension of dimensions) {
        const row = draft[dimension.id];
        const base = original[dimension.id];
        if (!row || !base) continue;
        if (dimension.textMode) {
          if (row.text !== base.text) {
            await api.putModelText(model.slug, dimension.id, row.text);
            applied += 1;
          }
          continue;
        }
        if (!row.skip) {
          const parsed = parseScoreInput(row.value);
          if (parsed.value == null) {
            if (base.value != null) {
              await api.deleteScore(model.slug, dimension.id);
              applied += 1;
            }
          } else if (base.value == null || parsed.value !== base.value || row.note !== base.note) {
            await api.putScore(model.slug, dimension.id, parsed.value, row.note);
            applied += 1;
          }
        }
        if (row.skip !== base.skip) {
          if (row.skip) await api.putSkip(model.slug, dimension.id);
          else await api.deleteSkip(model.slug, dimension.id);
          applied += 1;
        }
      }
      toast("评分已保存");
      onSaved();
      onClose();
    } catch (error) {
      const message = errorMessage(error);
      setSaveError(applied > 0 ? `${message}；已提交 ${applied} 项，可再次保存补齐` : message);
    } finally {
      setSaving(false);
    }
  };

  const invalid = Object.keys(errors).length > 0;
  const firstTextId = dimensions.find((dimension) => dimension.textMode)?.id;

  return (
    <Dialog open={open} width="wide" labelledBy="score-title" onRequestClose={() => void requestClose()}>
      <DialogHeader
        titleId="score-title"
        kicker={model?.vendor ? `${model.vendor} / 评分` : "评分"}
        title={model?.name ?? "评分"}
        onClose={() => void requestClose()}
      />
      <div className={ui.dialogBody}>
        <div className={styles.summary} aria-live="polite">
          <div className={styles.summaryCell}>
            <span className={styles.summaryLabel}>综合分</span>
            <strong className={styles.summaryValue}>{formatScore(preview?.score ?? null)}</strong>
          </div>
          <div className={styles.summaryCell}>
            <span className={styles.summaryLabel}>综合排名</span>
            <strong className={styles.summaryValue}>{rankLabel(preview?.rank ?? null)}</strong>
          </div>
          <div className={styles.summaryCell}>
            <span className={styles.summaryLabel}>已评分维度</span>
            <strong className={styles.summaryValue}>
              {preview?.scoredCount ?? 0} / {scoreableDimensions.length}
            </strong>
          </div>
        </div>

        {loading ? (
          <p className={styles.status}>正在加载评分…</p>
        ) : loadError ? (
          <p className={styles.statusError} role="alert">
            {loadError}
          </p>
        ) : dimensions.length === 0 ? (
          <p className={styles.status}>没有可评分的维度。请先在设置中为维度设置权重。</p>
        ) : (
          <ul className={styles.rows}>
            {blocks.map((block) => (
              <li key={block.group?.name ?? "ungrouped"}>
                <p className={styles.groupLabel}>
                  {block.group ? <span className={styles.groupDot} style={{ background: block.group.color }} aria-hidden="true" /> : null}
                  <span className={block.group ? styles.groupName : ui.sectionLabel}>{block.group?.name ?? "未分组"}</span>
                  {block.group && totalWeight > 0 ? (
                    <span className={styles.groupPct}>组内权重占比 {percentLabel(block.group.weight / totalWeight)}</span>
                  ) : null}
                  {block.pendingCount > 0 ? <span className={styles.pendingTag}>{block.pendingCount} 项待评分</span> : null}
                </p>
                <ul>
                  {block.dims.map((dimension) => {
                    const row = draft[dimension.id];
                    if (!row) return null;
                    const error = errors[dimension.id];
                    if (dimension.textMode) {
                      return (
                        <li className={styles.row} key={dimension.id}>
                          <div className={styles.textBlock}>
                            <div className={styles.rowIdentity}>
                              <span className={styles.rowName}>{dimension.name}</span>
                              <span className={styles.rowWeight}>文字</span>
                            </div>
                            <textarea
                              className={styles.textInput}
                              value={row.text}
                              maxLength={TEXT_LIMIT}
                              rows={3}
                              placeholder="中文或英文均可"
                              aria-label={`${dimension.name} 文字`}
                              aria-invalid={Boolean(error)}
                              ref={dimension.id === firstTextId ? firstText : undefined}
                              onChange={(event) => updateRow(dimension.id, { text: event.target.value })}
                            />
                          </div>
                          {error ? (
                            <p className={styles.rowError} role="alert">
                              {error}
                            </p>
                          ) : null}
                        </li>
                      );
                    }
                    // A note belongs to a score row, so it is only editable once the
                    // dimension has a value; otherwise a PUT would have nothing to send.
                    const unrated = !row.skip && row.value.trim() === "";
                    const hasScore = !row.skip && !unrated;
                    return (
                      <li className={styles.row} key={dimension.id}>
                        <div className={styles.rowMain} style={{ borderLeftColor: block.group?.color ?? "transparent" }}>
                          <div className={styles.rowIdentity}>
                            <span className={styles.rowName}>
                              {dimension.name}
                              {unrated ? <span className={styles.pendingTag}>未评分</span> : null}
                            </span>
                            <span className={styles.rowWeight}>权重 {dimension.weight}</span>
                          </div>
                          {row.skip ? (
                            <span className={styles.skipBox}>Skip · 60% 中位分</span>
                          ) : (
                            <input
                              className={styles.scoreInput}
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.1"
                              placeholder="—"
                              value={row.value}
                              ref={dimension.id === firstNumericId ? firstInput : undefined}
                              aria-label={`${dimension.name} 评分`}
                              aria-invalid={Boolean(error)}
                              onChange={(event) => updateRow(dimension.id, { value: event.target.value })}
                              onBlur={(event) => {
                                const parsed = parseScoreInput(event.target.value);
                                if (parsed.error == null && parsed.value != null) {
                                  updateRow(dimension.id, { value: String(parsed.value) });
                                }
                              }}
                            />
                          )}
                          <IconButton
                            label={row.skip ? `取消跳过 ${dimension.name}` : `跳过 ${dimension.name}`}
                            active={row.skip}
                            aria-pressed={row.skip}
                            onClick={() => updateRow(dimension.id, { skip: !row.skip, openNote: row.skip ? row.openNote : false })}
                          >
                            <Icon name={row.skip ? "skip" : "skipOff"} />
                          </IconButton>
                          <IconButton
                            label={
                              hasScore
                                ? row.openNote
                                  ? `收起 ${dimension.name} 评分备注`
                                  : `展开 ${dimension.name} 评分备注`
                                : `${dimension.name} 备注需先填写评分`
                            }
                            active={hasScore && row.openNote}
                            disabled={!hasScore}
                            onClick={() => updateRow(dimension.id, { openNote: !row.openNote })}
                          >
                            <Icon name="note" />
                          </IconButton>
                        </div>
                        {row.openNote && hasScore ? (
                          <textarea
                            className={styles.noteInput}
                            value={row.note}
                            maxLength={500}
                            placeholder="测试条件与判断依据"
                            aria-label={`${dimension.name} 评分备注`}
                            onChange={(event) => updateRow(dimension.id, { note: event.target.value })}
                          />
                        ) : null}
                        {error ? (
                          <p className={styles.rowError} role="alert">
                            {error}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={ui.dialogFoot}>
        <div className={styles.footNote}>
          <span className={styles.footHint}>非负、不设上限，保留一位小数；跳过维度按该维度 60% 中位分计入总分</span>
          {saveError ? (
            <span className={styles.saveError} role="alert">
              {saveError}
            </span>
          ) : null}
        </div>
        <div className={ui.actions}>
          <Button onClick={() => void requestClose()}>取消</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!dirty || invalid || saving || loading || Boolean(loadError)}>
            {saving ? "保存中…" : "保存评分"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
