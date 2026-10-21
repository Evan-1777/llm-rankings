import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "../api/client";
import type { Dimension } from "../api/types";
import { Button } from "./Button";
import { Dialog, DialogHeader } from "./Dialog";
import { TextAreaField, TextField } from "./Field";
import { useToast } from "./Toast";
import ui from "./ui.module.css";
import styles from "./ModelDialog.module.css";

interface DimensionDialogProps {
  open: boolean;
  dimension?: Dimension | null;
  onClose: () => void;
  onSaved: () => void;
}

export function DimensionDialog({ open, dimension = null, onClose, onSaved }: DimensionDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [weight, setWeight] = useState("0");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setName(dimension?.name ?? "");
    setDescription(dimension?.description ?? "");
    setWeight(String(dimension?.weight ?? 0));
    setErrors({});
    setSaveError("");
  }, [open, dimension]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 1 || name.trim().length > 40) next.name = "名称需为 1–40 个字符";
    if (description.length > 500) next.description = "说明不能超过 500 个字符";
    const numeric = Number(weight);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 100) next.weight = "权重需为 0–100 的整数";
    return next;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    setSaveError("");
    const input = { name: name.trim(), description, weight: Number(weight) };
    try {
      if (dimension) {
        await api.updateDimension(dimension.id, input);
        toast("维度已更新");
      } else {
        await api.createDimension(input);
        toast("维度已创建");
      }
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.fields) setErrors(error.fields);
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} width="model" labelledBy="dimension-title" onRequestClose={onClose}>
      <DialogHeader
        titleId="dimension-title"
        kicker={dimension ? "维度 / 编辑" : "维度 / 新建"}
        title={dimension ? dimension.name : "新增维度"}
        onClose={onClose}
      />
      <form onSubmit={(event) => void submit(event)}>
        <div className={ui.dialogBody}>
          <div className={styles.form}>
            <TextField
              id="dimension-name"
              label="名称"
              value={name}
              maxLength={40}
              data-autofocus
              error={errors.name}
              onChange={(event) => setName(event.target.value)}
            />
            <TextAreaField
              id="dimension-description"
              label="说明"
              value={description}
              maxLength={500}
              rows={3}
              error={errors.description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <TextField
              id="dimension-weight"
              label="权重"
              type="number"
              inputMode="numeric"
              min="0"
              max="100"
              step="1"
              value={weight}
              error={errors.weight}
              hint="0–100 的整数；权重 0 的维度不参与排行，也不进入评分弹窗。"
              onChange={(event) => setWeight(event.target.value)}
            />
            {saveError ? (
              <p className={ui.error} role="alert">
                {saveError}
              </p>
            ) : null}
          </div>
        </div>
        <div className={ui.dialogFoot}>
          <span />
          <div className={ui.actions}>
            <Button onClick={onClose}>取消</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "保存中…" : dimension ? "保存维度" : "创建维度"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
