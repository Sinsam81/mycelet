'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { authFeilNokkel, varsleUkjentAuthFeil } from '@/lib/auth/auth-feil';

export default function ForgotPasswordPage() {
  const t = useTranslations('AuthForgot');
  const tFeil = useTranslations('AuthErrors');
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Satt når ruten vår har laget en lenke uten å få sendt e-posten. Hvert kall
  // dit stempler `recovery_sent_at` hos Supabase, og Supabases egen e-post er
  // da sperret i 60 s. Neste forsøk går derfor RETT til Supabase — et nytt
  // kall til ruten ville stemplet på nytt og holdt reserven sperret for alltid.
  const hoppOverRuten = useRef(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Vår egen rute sender en lenke med token_hash, som /auth/reset løser inn
      // i HVILKEN SOM HELST nettleser. Supabases egen e-post er en PKCE-kode som
      // bare virker der den ble bestilt — fra appen åpner lenka alltid i Safari,
      // og da endte brukeren på «lenken er ugyldig».
      //
      //  · sendt     — ruten tok seg av det (eller adressen er ukjent).
      //  · ikkeSendt — lenka ble laget, men e-posten kom ikke ut (`sendFailed`).
      //  · reserve   — ruten laget ingen lenke (`fallback`: ikke satt opp lokalt
      //                og i preview), eller svarte ikke i det hele tatt.
      let utfall: 'sendt' | 'ikkeSendt' | 'reserve' = 'reserve';
      if (!hoppOverRuten.current) {
        try {
          const res = await fetch('/api/auth/glemt-passord', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          });
          if (res.ok) {
            const svar = (await res.json().catch(() => null)) as { fallback?: boolean; sendFailed?: boolean } | null;
            utfall = svar?.sendFailed === true ? 'ikkeSendt' : svar?.fallback === true ? 'reserve' : 'sendt';
          }
        } catch {
          utfall = 'reserve';
        }
      }

      if (utfall === 'ikkeSendt') {
        // Supabases e-post kan ikke sendes før minuttet er gått (den ville
        // svart 429), så si det som det er i stedet for å prøve.
        hoppOverRuten.current = true;
        setError(t('sendFailedRetry'));
        return;
      }

      // Reserve: Supabase sender sin egen e-post, som før. redirectTo må stå i
      // Supabases tillatelsesliste (www.mycelet.com/** + mycelet.com/**).
      if (utfall === 'reserve') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/reset`
        });
        if (error) {
          // 429 herfra betyr at adressen nettopp er stemplet — typisk av ruten
          // vår i et kall som aldri rakk å svare. Ikke stemple én gang til.
          if (authFeilNokkel(error) === 'rateLimited') hoppOverRuten.current = true;
          throw error;
        }
      }
      setSent(true);
    } catch (err) {
      const k = authFeilNokkel(err);
      if (!k) varsleUkjentAuthFeil('forgot', err);
      setError(k ? tFeil(k) : t('sendError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-screen-sm p-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))]">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-forest-900">{t('title')}</h1>
        <p className="mt-2 text-sm text-gray-700">
          {t('intro')}
        </p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-lg border border-forest-200 bg-forest-50 px-3 py-3 text-sm text-forest-900">
              {t.rich('sentMessage', {
                email,
                strong: (chunks) => <span className="font-medium">{chunks}</span>
              })}
            </p>
            <Link href="/auth/login" className="inline-block text-sm font-semibold text-forest-800 hover:underline">
              {t('backToLogin')}
            </Link>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-gray-800">
              {t('emailLabel')}
              <input
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button type="submit" className="w-full" loading={loading}>
              {t('sendLink')}
            </Button>

            <p className="text-sm text-gray-700">
              <Link href="/auth/login" className="font-semibold text-forest-800 hover:underline">
                {t('backToLogin')}
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
