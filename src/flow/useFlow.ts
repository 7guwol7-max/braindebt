import { useCallback, useEffect, useRef, useState } from 'react';
import { load, remove, save } from '../lib/storage';
import type { FlowState } from './state';

export type Update = (fn: (s: FlowState) => FlowState) => void;

/** 체험 상태를 localStorage에 저장한다. 새로고침하거나 폰 화면이 꺼졌다 켜져도 같은 단계에서 이어진다. */
export function useFlow(key: string, init: () => FlowState): [FlowState, Update, () => void] {
  const [state, setState] = useState<FlowState>(() => {
    const saved = load<FlowState>(key);
    // 수준 기능 이전에 저장된 상태는 초등으로 본다.
    return saved?.v === 1 ? { ...saved, level: saved.level ?? 'elem' } : init();
  });
  const initRef = useRef(init);
  initRef.current = init;
  useEffect(() => {
    save(key, state);
  }, [key, state]);
  const update: Update = useCallback((fn) => setState((prev) => fn(prev)), []);
  const reset = useCallback(() => {
    remove(key);
    setState(initRef.current());
  }, [key]);
  return [state, update, reset];
}
