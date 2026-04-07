import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('[supabase-server] CRITICAL: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

export const supabaseAdmin = (url && serviceKey)
  ? createClient(url, serviceKey)
  : new Proxy({}, {
      get() {
        return () => { throw new Error('Supabase not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars') }
      }
    })
