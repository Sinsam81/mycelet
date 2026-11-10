'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PassordFelt } from '@/components/auth/PassordFelt';
import { createClient } from '@/lib/supabase/client';
import { isNativePlatform } from '@/lib/native/platform';
import { authFeilNokkel, erForbigaaendeAuthFeil, varsleUkjentAuthFeil } from '@/lib/auth/auth-feil';

// 'doneApp': passordet er byttet, men kontoen hører hjemme i appen og siden
// står i Safari — da er «åpne appen» det eneste riktige neste steget.
type Status = 'verifying' | 'ready' | 'invalid' | 'done' | 'doneApp';

const TOKEN_LAGER = 'mycelet:reset-token';

function glemToken() {
  try {
    window.sessionStorage.removeItem(TOKEN_LAGER);
  } catch {
    // Ingenting å rydde.
  }
}

export default function ResetPasswordPage() {
  const t = useTranslations('AuthReset');
  const tFeil = useTranslations('AuthErrors');
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<Status>('verifying');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Lenker vi sender selv (/api/auth/glemt-passord) bærer ?token_hash=. Det
  // løses inn med verifyOtp og virker i enhver nettleser — i motsetning til
  // Supabases PKCE-kode (?code=), som bare virker der den ble bestilt.
  const tokenHash = useRef<string | null>(null);
  // Tokenet er til engangsbruk. Feiler passordbyttet ETTER en vellykket
  // innløsning (f.eks. samme passord som før), må neste forsøk ikke løse inn
  // det brukte tokenet på nytt.
  const verifisert = useRef(false);

  useEffect(() => {
    let active = true;

    // Leses fra adressen her, ikke med useSearchParams (som krever Suspense).
    // Skjemaet vises med en gang, og tokenet løses inn først ved innsending:
    // e-postskannere som henter lenka skal ikke få brukt opp engangstokenet.
    //
    // Tokenet tas ut av adressen straks (det skal ikke bli liggende i
    // historikken eller følge med i sidevisningsmålingen) og huskes i fanens
    // sessionStorage, så en omlasting av siden ikke gjør lenka «ugyldig».
    const params = new URLSearchParams(window.location.search);
    let hash = params.get('token_hash');
    if (hash) {
      try {
        window.sessionStorage.setItem(TOKEN_LAGER, hash);
      } catch {
        // Privat modus i WKWebView kan kaste — da virker lenka uten omlasting.
      }
      window.history.replaceState(null, '', window.location.pathname);
    } else if (!params.get('code')) {
      try {
        hash = window.sessionStorage.getItem(TOKEN_LAGER);
      } catch {
        hash = null;
      }
    }
    if (hash) {
      tokenHash.current = hash;
      setStatus('ready');
      return () => {
        active = false;
      };
    }

    // The browser client auto-detects the recovery code in the URL on load,
    // exchanges it, and fires onAuthStateChange with a recovery session.
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setStatus('ready');
    });

    // Also check directly in case the session is already established.
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setStatus('ready');
    });

    // No recovery session within a few seconds → link is missing or expired.
    const timer = setTimeout(() => {
      if (active) setStatus((s) => (s === 'verifying' ? 'invalid' : s));
    }, 4000);

    return () => {
      active = false;
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t('errorTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('errorMismatch'));
      return;
    }

    setLoading(true);
    try {
      if (tokenHash.current && !verifisert.current) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash.current,
          type: 'recovery'
        });
        if (otpError) {
          // Nettverksbrudd, 429 og 5xx kommer også hit som `error`, og sier
          // ingenting om tokenet. Da blir skjemaet stående med tokenet i
          // behold, så brukeren kan trykke én gang til — «lenken er ugyldig»
          // ville sendt dem ut etter en ny e-post de ikke trenger.
          if (erForbigaaendeAuthFeil(otpError)) {
            const k = authFeilNokkel(otpError);
            if (!k) varsleUkjentAuthFeil('reset.verify', otpError);
            setError(k ? tFeil(k) : t('errorTryAgain'));
            setLoading(false);
            return;
          }
          // Serveren avviste tokenet: brukt, utløpt eller erstattet av en nyere lenke.
          glemToken();
          tokenHash.current = null;
          setStatus('invalid');
          setLoading(false);
          return;
        }
        verifisert.current = true;
        // Tokenet er brukt opp, og økten ligger i kapslene. Glem det NÅ, ikke
        // først når passordet er lagret: feiler updateUser under og siden
        // lastes på nytt, skal den finne gjenopprettingsøkten (getSession i
        // effekten over) — ikke hente fram det brukte tokenet og ende på
        // «ugyldig» ved neste innsending.
        glemToken();
      }

      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      glemToken();

      // Kontoer opprettet i appen: e-postlenka åpner i Safari, men innloggingen
      // skal skje i appen. Å sende dem til nettsidens kart ville vært feil vei —
      // samme resonnement som /auth/bekreftet-app.
      const plattform = data.user?.user_metadata?.plattform;
      if ((plattform === 'ios' || plattform === 'android') && !isNativePlatform()) {
        // Ikke la en løs nettøkt ligge igjen i Safari.
        try {
          await supabase.auth.signOut();
        } catch {
          // Passordet er uansett byttet.
        }
        setStatus('doneApp');
        return;
      }

      setStatus('done');
      setTimeout(() => {
        // Full sidelast, ikke klientnavigasjon: i appskallet henger kapsel-
        // synkroniseringen etter, og middleware kunne avvise en router.push
        // (samme feilklasse som innloggingen, PR #191).
        window.location.assign('/map');
      }, 1500);
    } catch (err) {
      const k = authFeilNokkel(err);
      if (!k) varsleUkjentAuthFeil('reset', err);
      setError(k ? tFeil(k) : t('errorUpdateFailed'));
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-screen-sm p-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))]">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-forest-900">{t('title')}</h1>

        {status === 'verifying' ? <p className="mt-4 text-sm text-gray-700">{t('checkingLink')}</p> : null}

        {status === 'invalid' ? (
          <div className="mt-4 space-y-4">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              {t('invalidLink')}
            </p>
            <Link href="/auth/forgot" className="inline-block text-sm font-semibold text-forest-800 hover:underline">
              {t('requestNewLink')}
            </Link>
          </div>
        ) : null}

        {status === 'done' ? (
          <p className="mt-4 rounded-lg border border-forest-200 bg-forest-50 px-3 py-3 text-sm text-forest-900">
            {t('done')}
          </p>
        ) : null}

        {status === 'doneApp' ? (
          <div className="mt-4 space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-forest-700" aria-hidden="true" />
            <p className="text-base font-semibold text-forest-900">{t('doneAppTitle')}</p>
            <div className="rounded-2xl border border-forest-200 bg-forest-50 p-4 text-left">
              <p className="flex items-start gap-2 text-sm text-forest-900">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t('doneAppSteps')}</span>
              </p>
            </div>
            <p className="text-sm text-gray-600">
              {t('doneAppWebInstead')}{' '}
              <Link href="/auth/login" className="font-semibold text-forest-800 underline">
                {t('doneAppWebLink')}
              </Link>
            </p>
          </div>
        ) : null}

        {status === 'ready' ? (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <p className="text-sm text-gray-700">{t('choosePassword')}</p>

            <PassordFelt
              label={t('newPasswordLabel')}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={8}
            />

            <PassordFelt
              label={t('confirmPasswordLabel')}
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button type="submit" className="w-full" loading={loading}>
              {t('submit')}
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
