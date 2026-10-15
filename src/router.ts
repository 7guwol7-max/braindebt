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
