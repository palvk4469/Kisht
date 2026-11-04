/**
 * The officer's list: the model's order, with a manager's pins on top of it
 * (A21). A pinned loan sits at its chosen position; everything else keeps its
 * relative order around it. The score stays advisory: a person can always
 * overrule it, and the reason they gave is shown.
 */
export function applyPins<T>(items: readonly T[], pinOf: (item: T) => number | null): T[] {
  const pinned = items
    .filter((i) => pinOf(i) !== null)
    .sort((a, b) => (pinOf(a) as number) - (pinOf(b) as number));
  const rest = items.filter((i) => pinOf(i) === null);

  const out = [...rest];
  for (const item of pinned) {
    const index = Math.min(Math.max((pinOf(item) as number) - 1, 0), out.length);
    out.splice(index, 0, item);
  }
  return out;
}
