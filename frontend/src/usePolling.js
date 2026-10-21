import { useEffect, useState } from "react";

// fetcher를 intervalMs마다 호출해서 최신 결과를 돌려준다.
// fetcher는 매 렌더마다 새로 만들지 말고 모듈 수준 함수를 넘긴다.
export function usePolling(fetcher, intervalMs) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const tick = async () => {
      try {
        const result = await fetcher();
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetcher, intervalMs]);

  return { data, error };
}
