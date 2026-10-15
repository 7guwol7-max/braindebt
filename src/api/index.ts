import { Api } from './client';
import { IdbStore, MemoryStore, localRealtime, localRpc } from './local';
import { supabaseTransport } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function build(): Api {
  if (url && key) {
    const t = supabaseTransport(url, key);
    return new Api(t.rpc, t.realtime, 'supabase');
  }
  const store = typeof indexedDB !== 'undefined' ? new IdbStore() : new MemoryStore();
  return new Api(localRpc(store), localRealtime(), 'local');
}

export const api = build();
export const isDemo = api.kind === 'local';
