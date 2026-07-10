import { useEffect, useState } from 'preact/hooks';

export function useLiveQuery<T>(query: () => Promise<T>, deps: any[] = []): T | undefined {
  const [result, setResult] = useState<T | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    query().then(r => { if (!cancelled) setResult(r); });
    return () => { cancelled = true; };
  }, deps);

  return result;
}
