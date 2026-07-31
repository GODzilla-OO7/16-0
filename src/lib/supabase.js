// Lazy Supabase loader — keeps @supabase/supabase-js out of the main bundle
let _client = null

export async function getSupabase() {
  if (_client) return _client
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (url && key) _client = createClient(url, key)
  } catch (e) {
    console.error('Supabase init failed:', e)
  }
  return _client
}
