// Lazy Supabase loader — keeps @supabase/supabase-js out of the main bundle
// Promise singleton: concurrent callers all await the same init, never create two clients
let _promise = null

export function getSupabase() {
  if (!_promise) {
    _promise = (async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const url = import.meta.env.VITE_SUPABASE_URL
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY
        if (url && key) {
          return createClient(url, key, {
            auth: {
              // Handle email confirmation/OAuth links that land back on the app
              detectSessionInUrl: true,
              persistSession: true,
              autoRefreshToken: true,
              // Explicitly use localStorage so sessions survive window close
              storage: window.localStorage,
              // Implicit flow: tokens arrive in the URL hash (#access_token=...)
              // so no code exchange or sessionStorage is needed — required for
              // popup-based OAuth (PKCE stores its verifier in the opener's
              // sessionStorage, which the popup window can't access)
              flowType: 'implicit',
            },
          })
        }
      } catch (e) {
        console.error('Supabase init failed:', e)
      }
      return null
    })()
  }
  return _promise
}

// Call once at app boot so the client picks up any #access_token in the URL
// (e.g. after clicking an email verification link)
export function initSupabase() {
  getSupabase().catch(() => {})
}
