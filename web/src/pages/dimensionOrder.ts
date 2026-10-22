/** Moves one id inside the visible slice and merges it back into the full order. */
export function moveVisibleOrder(all: number[], visible: number[], from: number, to: number): number[] | null {
  if (from === to || from < 0 || to < 0 || from >= visible.length || to >= visible.length) return null;
  const moved = [...visible];
  const [id] = moved.splice(from, 1);
  moved.splice(to, 0, id);
  const visibleSet = new Set(visible);
  let cursor = 0;
  return all.map((current) => (visibleSet.has(current) ? moved[cursor++] : current));
}
