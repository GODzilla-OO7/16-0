/**
 * URL shortener using Supabase short_urls table.
 *
 * Run once in Supabase SQL editor:
 *
 *   create table short_urls (
 *     code text primary key,
 *     long_url text not null,
 *     created_at timestamptz default now()
 *   );
 *   alter table short_urls enable row level security;
 *   create policy "anyone can read"   on short_urls for select using (true);
 *   create policy "anyone can insert" on short_urls for insert with check (true);
 *
 * Short links look like:  https://16zero.in/s/ab3xk
 */

import { getSupabase } from './supabase.js'

const BASE = 'https://16zero.in/'
const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

function genCode(len = 6) {
  return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
}

/**
 * Store a long URL in Supabase and return the short URL.
 * Falls back to the original long URL on any error.
 */
export async function createShortUrl(longUrl) {
  try {
    const sb = await getSupabase()
    if (!sb) return longUrl

    // Try up to 3 times to get a unique code
    for (let i = 0; i < 3; i++) {
      const code = genCode()
      const { error } = await sb.from('short_urls').insert({ code, long_url: longUrl })
      if (!error) return BASE + code
      // If conflict (duplicate code), retry with new code
    }
    return longUrl
  } catch {
    return longUrl
  }
}

/**
 * Resolve a short code to its long URL.
 * Returns null if not found or on error.
 */
export async function resolveShortUrl(code) {
  try {
    const sb = await getSupabase()
    if (!sb) return null
    const { data } = await sb.from('short_urls').select('long_url').eq('code', code).single()
    return data?.long_url ?? null
  } catch {
    return null
  }
}
