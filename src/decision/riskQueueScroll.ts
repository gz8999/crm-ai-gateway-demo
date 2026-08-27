export function nextQueueScrollTop({ scrollTop, clientHeight, rowTop, rowHeight, padding = 8 }: {
  scrollTop: number;
  clientHeight: number;
  rowTop: number;
  rowHeight: number;
  padding?: number;
}) {
  const visibleTop = scrollTop + padding;
  const visibleBottom = scrollTop + clientHeight - padding;
  if (rowTop < visibleTop) return Math.max(0, rowTop - padding);
  if (rowTop + rowHeight > visibleBottom) return Math.max(0, rowTop + rowHeight - clientHeight + padding);
  return scrollTop;
}
