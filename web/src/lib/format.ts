const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const clockFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date).replaceAll("/", "-");
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return clockFormatter.format(date);
}

export function monthKicker(now: string | undefined, prefix: string): string {
  const date = now ? new Date(now) : new Date();
  if (Number.isNaN(date.getTime())) return prefix;
  return `${prefix} / ${date.getFullYear()} – ${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function rankLabel(rank: number | null): string {
  return rank == null ? "—" : String(rank).padStart(2, "0");
}

export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
