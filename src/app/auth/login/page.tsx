'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/hooks/useAuth';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { trackEvent } from '@/lib/analytics';
import { readSafeNext } from '@/lib/auth/safe-redirect';

// Next 15+ requires useSearchParams() to be inside a Suspense boundary.
// Inner form rendered by LoginForm; default export wraps it in Suspense.

function LoginForm() {
  const t = useTranslations('AuthLogin');
  const searchParams = useSearchParams();
  // Validert mot åpen redirect — se src/lib/auth/safe-redirect.ts. Verdien
  // brukes både til navigasjonen etter innlogging og til OAuth-callbackens next-param.
  const redirectPath = useMemo(() => readSafeNext(searchParams), [searchParams]);

  // Hvorfor havnet du her? Settes av registreringssiden.
  const notice = useMemo(() => {
    if (searchParams.get('recover') === '1') return 'noticeRecover';
    if (searchParams.get('confirm') === '1') return 'noticeConfirm';
    return null;
  }, [searchParams]);

  const { signIn, signInWithGoogle, user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // En allerede innlogget besøkende skal ikke se innloggingsskjemaet — send
  // dem dit de var på vei. Dette er også SELVHELBREDELSEN for appskallet:
  // i WKWebView henger synkroniseringen av øktinformasjonskapslene etter
  // (document.cookie → HTTP-lageret), så navigasjonen rett etter innlogging
  // kan bli avvist av middleware og sendt STILLE tilbake hit — skjermen står
  // urørt, og knappen ser død ut. Det var halve App Review-avvisningen 21.08
  // (2.1a): serverloggen viser at anmelderens innlogging LYKTES, elleve
  // sekunder før skjermbildet av den «døde» knappen. Når den avviste
  // navigasjonen lander her igjen, ser denne effekten økten og prøver på
  // nytt — innen da har kapslene rukket fram.
  const omdirigert = useRef(false);
  useEffect(() => {
    if (authLoading || !user || omdirigert.current) return;
    omdirigert.current = true;
    // Full sidelast, ikke klientnavigasjon: da går forespørselen med de
    // synkroniserte kapslene, og middleware ser samme økt som nettleseren.
    window.location.replace(redirectPath);
  }, [authLoading, user, redirectPath]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Send tastaturet ned FØR innloggingen fullfører. I WKWebView etterlater
    // et åpent tastatur viewporten forskjøvet i sekundene etterpå, og alt som
    // monteres bunnforankret i det vinduet (onboarding-introen) kan havne
    // utenfor skjermen — det var App Review-avvisningen 21.08.2026 (2.1a).
    (document.activeElement as HTMLElement | null)?.blur?.();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
      trackEvent('login', { method: 'password' });
      // Full sidelast i stedet for router.push: klientnavigasjonen kunne bli
      // avvist av middleware i appskallet (kapsel-synkroniseringen over) og
      // lande stille tilbake på skjemaet. En full last konvergerer: skulle
      // også den bli avvist, fanger allerede-innlogget-effekten over det opp
      // og prøver igjen.
      window.location.assign(redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signInFailed'));
      setLoading(false);
    }
    // Merk: ved suksess får loading stå — siden er på vei bort, og en aktiv
    // knapp i det vinduet inviterer til dobbelttrykk.
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);

    try {
      const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`;
      await signInWithGoogle(callback);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('googleSignInFailed'));
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-screen-sm p-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))]">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-forest-900">{t('heading')}</h1>
        <p className="mt-2 text-sm text-gray-700">{t('subheading')}</p>

        {/*
          Registreringssiden sender folk hit med et hint om hvorfor. Begge
          parameterne har til nå vært døde — de ble satt, men aldri lest — så
          brukeren ble flyttet til et innloggingsskjema uten et ord om hva som
          skjedde. `recover` er særlig viktig: kontoen ble opprettet, men uten
          profil, og det er nettopp innloggingen som reparerer den (signIn
          kaller ensureProfile).
        */}
        {notice ? (
          <p className="mt-4 rounded-lg border border-forest-200 bg-forest-50 px-3 py-2 text-sm text-forest-900">
            {t(notice)}
          </p>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-800">
            {t('emailLabel')}
            <input
              type="email"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-gray-800">
            {t('passwordLabel')}
            <input
              type="password"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <div className="-mt-1 text-right">
            <Link href="/auth/forgot" className="text-sm font-medium text-forest-800 hover:underline">
              {t('forgotPassword')}
            </Link>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button type="submit" className="w-full" loading={loading}>
            {t('signInButton')}
          </Button>
        </form>

        <NonNativeOnly>
          <Button type="button" variant="outline" className="mt-3 w-full" onClick={handleGoogle} disabled={loading}>
            {t('continueWithGoogle')}
          </Button>
        </NonNativeOnly>

        <p className="mt-4 text-sm text-gray-700">
          {t('noAccount')}{' '}
          <Link className="font-semibold text-forest-800" href={`/auth/register?next=${encodeURIComponent(redirectPath)}`}>
            {t('registerLink')}
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  const t = useTranslations('AuthLogin');
  return (
    <Suspense fallback={<main className="mx-auto min-h-screen w-full max-w-screen-sm p-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))]"><p className="text-sm text-gray-700">{t('loading')}</p></main>}>
      <LoginForm />
    </Suspense>
  );
}
