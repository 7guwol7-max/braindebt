import { useEffect, useState } from 'react';

export function useRoute(): string[] {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function go(path: string): void {
  location.hash = path.startsWith('/') ? path : `/${path}`;
}

export function appUrl(path: string): string {
  return `${location.origin}${location.pathname}#${path.startsWith('/') ? path : `/${path}`}`;
}

/** 새 탭으로 연다. 팝업이 막히면(또는 새 창을 허용하지 않는 환경이면) 같은 탭에서 연다. */
export function openNew(path: string): void {
  let w: Window | null = null;
  try {
    w = window.open(appUrl(path), '_blank');
  } catch {
    w = null;
  }
  if (!w) go(path);
}
