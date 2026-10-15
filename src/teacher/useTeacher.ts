import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ApiError, errorText, type SessionPatch, type TeacherSnapshot } from '../api/types';
import { load, remove, save } from '../lib/storage';

export const tokenKey = (code: string) => `bd:teacher:${code}`;

export interface MySession {
  code: string;
  name: string;
  createdAt: string;
}

export function mySessions(): MySession[] {
  return load<MySession[]>('bd:mysessions') ?? [];
}

export function rememberSession(s: MySession) {
  save('bd:mysessions', [s, ...mySessions().filter((x) => x.code !== s.code)].slice(0, 30));
}

export function forgetSession(code: string) {
  save('bd:mysessions', mySessions().filter((x) => x.code !== code));
  remove(tokenKey(code));
}

/** 교수자 화면 데이터: 4초마다 + 학생 쪽 신호가 오면 바로 다시 읽는다. */
export function useTeacher(code: string, token: string) {
  const [snap, setSnap] = useState<TeacherSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
  const inflight = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    try {
      const s = await api.teacherSnapshot(code, token);
      setSnap(s);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'unauthorized' || e.code === 'not_found')) setAuthFailed(true);
      setError(errorText(e));
    } finally {
      inflight.current = false;
      if (again.current) {
        again.current = false;
        setTimeout(() => void refresh(), 300);
      }
    }
  }, [code, token]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => document.visibilityState === 'visible' && void refresh(), 4000);
    const unsub = api.subscribe(code, () => void refresh());
    return () => {
      clearInterval(t);
      unsub();
    };
  }, [code, refresh]);

  const patch = useCallback(
    async (p: SessionPatch) => {
      await api.teacherUpdate(code, token, p);
      await refresh();
    },
    [code, token, refresh],
  );

  return { snap, error, authFailed, refresh, patch };
}
