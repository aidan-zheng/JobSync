import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data?.session) {
      // Store Google provider token for Gmail API access
      const providerToken = data.session.provider_token
      const providerRefreshToken = data.session.provider_refresh_token

      if (providerToken) {
        try {
          const admin = createAdminClient()
          await admin.from('user_tokens').upsert(
            {
              user_id: data.session.user.id,
              provider: 'google',
              access_token: providerToken,
              refresh_token: providerRefreshToken ?? null,
              expires_at: data.session.expires_at
                ? new Date(data.session.expires_at * 1000).toISOString()
                : null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,provider' },
          )
        } catch (err) {
          console.error('Failed to store provider token:', err)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
