import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { PingKind, Realtime, RpcFn } from './client';
import { ApiError } from './types';

/** Supabase 연결: RPC는 HTTP, 실시간은 Broadcast 채널로 "바뀌었어요" 신호만 보낸다(데이터는 RPC로 다시 읽는다). */
export function supabaseTransport(url: string, anonKey: string): { rpc: RpcFn; realtime: Realtime } {
  let clientP: Promise<SupabaseClient> | null = null;
  const client = () =>
    (clientP ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    ));

  const rpc: RpcFn = async (fn, args) => {
    const c = await client();
    const { data, error } = await c.rpc(fn, args);
    if (error) {
      const m = /bd:(\w+)/.exec(error.message ?? '');
      throw new ApiError(m?.[1] ?? 'network', error.message);
    }
    return data;
  };

  const channels = new Map<string, { ch: RealtimeChannel; listeners: Set<(k: PingKind) => void> }>();

  const realtime: Realtime = {
    subscribe(code, cb) {
      let entry = channels.get(code);
      if (!entry) {
        entry = { ch: null as unknown as RealtimeChannel, listeners: new Set() };
        channels.set(code, entry);
        const e = entry;
        void client().then((c) => {
          e.ch = c
            .channel(`bd-${code}`)
            .on('broadcast', { event: 'ping' }, ({ payload }) => e.listeners.forEach((l) => l(payload?.kind)))
            .subscribe();
        });
      }
      entry.listeners.add(cb);
      return () => {
        const e = channels.get(code);
        if (!e) return;
        e.listeners.delete(cb);
        if (e.listeners.size === 0) {
          channels.delete(code);
          void client().then((c) => e.ch && c.removeChannel(e.ch));
        }
      };
    },
    ping(code, kind) {
      const e = channels.get(code);
      if (e?.ch) {
        void e.ch.send({ type: 'broadcast', event: 'ping', payload: { kind } });
        return;
      }
      void client().then((c) => {
        const ch = c.channel(`bd-${code}`);
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            void ch.send({ type: 'broadcast', event: 'ping', payload: { kind } }).finally(() => c.removeChannel(ch));
          }
        });
      });
    },
  };

  return { rpc, realtime };
}
