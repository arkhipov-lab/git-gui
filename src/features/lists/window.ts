import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function windowLimit(itemCount: number, pageSize: number, pages: number): number {
  const size = Math.max(1, pageSize);
  return Math.min(Math.max(0, itemCount), size * Math.max(1, pages));
}

export function useScreenWindow(itemCount: number, rowHeight: number, resetKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(() => Math.max(8, Math.ceil(window.innerHeight / rowHeight)));
  const [pages, setPages] = useState(1);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const height = node.clientHeight;
      if (height <= 0) return;
      const next = Math.max(1, Math.ceil(height / rowHeight));
      setPageSize((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [rowHeight]);
  useEffect(() => {
    setPages(1);
  }, [resetKey]);
  const limit = windowLimit(itemCount, pageSize, pages);
  return {
    ref,
    limit,
    hasMore: itemCount > limit,
    loadMore: () => setPages((current) => current + 1),
  };
}
