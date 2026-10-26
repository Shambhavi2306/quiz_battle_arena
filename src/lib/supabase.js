
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  url && key && !url.includes('YOUR_PROJECT')
);

let playerToken = null;

export function setPlayerToken(token) {
  playerToken = token || null;
}

export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      },
      global: {
        fetch: (input, init = {}) => {
          const headers = new Headers(init.headers || {});
          if (playerToken) {
            headers.set('x-player-token', playerToken);
          }
          return fetch(input, { ...init, headers });
        }
      },
      realtime: {
        params: { eventsPerSecond: 10 }
      }
    })
  : null;
