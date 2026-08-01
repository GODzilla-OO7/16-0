// Lazy Supabase loader — keeps @supabase/supabase-js out of the main bundle
let _client = null

export async function getSupabase() {
  if (_client) return _client
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (url && key) {
      _client = createClient(url, key, {
        auth: {
          // Handle email confirmation links that land back on the app
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    }
  } catch (e) {
    console.error('Supabase init failed:', e)
  }
  return _client
}

// Call once at app boot so the client picks up any #access_token in the URL
// (e.g. after clicking an email verification link)
export function initSupabase() {
  getSupabase().catch(() => {})
}
