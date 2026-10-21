import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "../api/client";
import type { ModelSummary } from "../api/types";
import { slugFromName } from "../lib/format";
import { Button } from "./Button";
import { Dialog, DialogHeader } from "./Dialog";
import { TextAreaField, TextField } from "./Field";
import { useToast } from "./Toast";
import ui from "./ui.module.css";
import styles from "./ModelDialog.module.css";

interface ModelDialogProps {
  open: boolean;
  model?: ModelSummary | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ModelDialog({ open, model = null, onClose, onSaved }: ModelDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setName(model?.name ?? "");
    setSlug(model?.slug ?? "");
    setVendor(model?.vendor ?? "");
    setNotes(model?.notes ?? "");
    setSlugTouched(Boolean(model));
    setErrors({});
    setSaveError("");
  }, [open, model]);

  const onNameChange = (value: string) => {
    setName(value);
    if (!model && !slugTouched) setSlug(slugFromName(value));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "请填写模型名称";
    if (!model) {
      if (!slug.trim()) next.slug = "请填写 slug";
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        next.slug = "slug 只能包含小写字母、数字与连字符";
      }
    }
    if (vendor.length > 80) next.vendor = "厂商不能超过 80 个字符";
    if (notes.length > 2000) next.notes = "备注不能超过 2000 个字符";
    return next;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    setSaveError("");
    try {
      if (model) {
        await api.updateModel(model.slug, { name: name.trim(), vendor: vendor.trim(), notes });
        toast("模型已更新");
      } else {
        await api.createModel({ name: name.trim(), slug: slug.trim(), vendor: vendor.trim(), notes });
        toast("模型已创建");
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
    <Dialog open={open} width="model" labelledBy="model-title" onRequestClose={onClose}>
      <DialogHeader titleId="model-title" kicker={model ? "模型档案 / 编辑" : "模型档案 / 新建"} title={model ? model.name : "新增模型"} onClose={onClose} />
      <form onSubmit={(event) => void submit(event)}>
        <div className={ui.dialogBody}>
          <div className={styles.form}>
            <TextField
              id="model-name"
              label="名称"
              value={name}
              maxLength={80}
              data-autofocus
              error={errors.name}
              onChange={(event) => onNameChange(event.target.value)}
            />
            {model ? (
              <div className={styles.readonly}>
                <span className={ui.label}>slug</span>
                <span className={styles.slug}>{model.slug}</span>
              </div>
            ) : (
              <TextField
                id="model-slug"
                label="slug"
                value={slug}
                maxLength={64}
                error={errors.slug}
                hint="由名称生成；纯中文名称需要手动填写。"
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value.toLowerCase());
                }}
              />
            )}
            <TextField
              id="model-vendor"
              label="厂商"
              value={vendor}
              maxLength={80}
              error={errors.vendor}
              onChange={(event) => setVendor(event.target.value)}
            />
            <TextAreaField
              id="model-notes"
              label="私人备注"
              value={notes}
              maxLength={2000}
              rows={4}
              error={errors.notes}
              hint="仅管理员可见。"
              onChange={(event) => setNotes(event.target.value)}
            />
            {saveError ? (
              <p className={ui.error} role="alert">
                {saveError}
              </p>
            ) : null}
          </div>
        </div>
        <div className={ui.dialogFoot}>
          <span className={styles.footHint}>{model ? "slug 创建后不可修改" : "创建后可继续补充评分"}</span>
          <div className={ui.actions}>
            <Button onClick={onClose}>取消</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "保存中…" : model ? "保存模型" : "创建模型"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
