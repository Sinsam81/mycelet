'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useMemo, useState } from 'react';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  // Validert mot åpen redirect — se src/lib/auth/safe-redirect.ts. Verdien
  // brukes både til router.push() og til å bygge OAuth-callbackens next-param.
  const redirectPath = useMemo(() => readSafeNext(searchParams), [searchParams]);

  // Hvorfor havnet du her? Settes av registreringssiden.
  const notice = useMemo(() => {
    if (searchParams.get('recover') === '1') return 'noticeRecover';
    if (searchParams.get('confirm') === '1') return 'noticeConfirm';
    return null;
  }, [searchParams]);

  const { signIn, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      router.push(redirectPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signInFailed'));
    } finally {
      setLoading(false);
    }
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
