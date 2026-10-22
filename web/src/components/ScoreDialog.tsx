import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { ModelDetail, Rankings, RankingModel } from "../api/types";
import { formatPercent, formatScore, previewRanking } from "../domain/ranking";
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
}

interface OriginalRow {
  value: number | null;
  note: string;
  text: string;
}

const EMPTY_DIMENSIONS: ModelDetail["dimensions"] = [];
const TEXT_LIMIT = 2000;

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
    api
      .model(slug, controller.signal)
      .then((data) => {
        const nextDraft: Record<number, DraftRow> = {};
        const nextOriginal: Record<number, OriginalRow> = {};
        for (const dimension of data.dimensions) {
          const text = dimension.textMode ? dimension.text ?? "" : "";
          nextDraft[dimension.id] = {
            value: dimension.value == null ? "" : String(dimension.value),
            note: dimension.note ?? "",
            text,
            openNote: Boolean(dimension.note),
          };
          nextOriginal[dimension.id] = { value: dimension.value, note: dimension.note ?? "", text };
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

  useEffect(() => {
    if (!open || !detail) return;
    if (scoreableDimensions.length > 0) firstInput.current?.focus();
    else firstText.current?.focus();
  }, [open, detail, scoreableDimensions.length]);

  const updateRow = (id: number, patch: Partial<DraftRow>) => {
    setDraft((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  };

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

  const preview = useMemo(() => {
    if (!model) return null;
    return previewRanking(previewRows, dimensions, model.slug, parsedValues);
  }, [model, previewRows, dimensions, parsedValues]);

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
  const firstNumericId = scoreableDimensions[0]?.id;
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
            <span className={styles.summaryLabel}>覆盖率</span>
            <strong className={styles.summaryValue}>
              {formatPercent(preview?.coverage ?? 0)}
              {preview?.provisional ? <span className={ui.tag}>暂定</span> : null}
            </strong>
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
            {dimensions.map((dimension) => {
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
              const hasScore = row.value.trim() !== "";
              return (
                <li className={styles.row} key={dimension.id}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowIdentity}>
                      <span className={styles.rowName}>{dimension.name}</span>
                      <span className={styles.rowWeight}>权重 {dimension.weight}</span>
                    </div>
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
        )}
      </div>
      <div className={ui.dialogFoot}>
        <div className={styles.footNote}>
          <span className={styles.footHint}>非负、不设上限，保留一位小数</span>
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
