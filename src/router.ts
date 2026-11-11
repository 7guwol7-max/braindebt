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

const hashPath = (path: string) => `#${path.startsWith('/') ? path : `/${path}`}`;

/** 지금 열려 있는 주소 기준의 링크. 같은 기기에서 새 탭으로 열 때 쓴다(교수자 로그인이 이 주소에 저장돼 있다). */
export function appUrl(path: string): string {
  return `${location.origin}${location.pathname}${hashPath(path)}`;
}

const PUBLIC_URL = ((import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? '').trim().replace(/\/+$/, '');

/**
 * 다른 사람에게 주는 링크(학생 참여 QR·링크, 수업 리포트).
 * 배포마다 생기는 긴 주소로 접속해 있어도 항상 고정된 공개 주소를 쓴다.
 * 공개 주소가 설정되지 않은 데모·개발 환경에서는 지금 주소를 쓴다.
 */
export function shareUrl(path: string): string {
  return PUBLIC_URL ? `${PUBLIC_URL}/${hashPath(path)}` : appUrl(path);
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
