'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/hooks/useAuth';
import { useIsNative } from '@/lib/hooks/useIsNative';
import { NativeOnly } from '@/components/native/NativeOnly';
import { TellFlate } from '@/components/bruk/TellFlate';
import { trackEvent } from '@/lib/analytics';
import { PassordFelt } from '@/components/auth/PassordFelt';
import { readSafeNext } from '@/lib/auth/safe-redirect';
import { ensureProfile } from '@/lib/auth/ensure-profile';
import { authFeilNokkel, varsleUkjentAuthFeil, type AuthFeilNokkel } from '@/lib/auth/auth-feil';
import { huskRegistrertEpost } from '@/lib/auth/registrert-epost';

// Next 15+ requires useSearchParams() to be inside a Suspense boundary so the
// page can prerender. We wrap the inner form-rendering component below.

// Feil herfra kan være både AuthError (en Error med `code`) og PostgrestError
// (et rent objekt), så meldingen leses defensivt. Brukernavn-kollisjonen er
// særegen for registreringen og sjekkes først; resten går gjennom den delte
// oversetteren. Den rå (engelske) meldingen vises aldri.
function toRegisterErrorMessage(
  err: unknown,
  t: (key: string) => string,
  tFeil: (key: AuthFeilNokkel) => string
): string {
  const raw =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';
  const lower = raw.toLowerCase();

  if (
    lower.includes('profiles_username_key') ||
    (lower.includes('username') && (lower.includes('duplicate') || lower.includes('unique')))
  ) {
    return t('errorUsernameTaken');
  }

  const k = authFeilNokkel(err);
  if (k === 'emailRegistered') return t('errorEmailRegistered');
  if (k === 'weakPassword' || (lower.includes('password') && (lower.includes('least') || lower.includes('short')))) {
    return t('errorPasswordShort');
  }
  if (k) return tFeil(k);
  varsleUkjentAuthFeil('register', err);
  return t('errorGeneric');
}

function RegisterForm() {
  const t = useTranslations('AuthRegister');
  const tFeil = useTranslations('AuthErrors');
  const router = useRouter();
  const searchParams = useSearchParams();
  // Validert mot åpen redirect — se src/lib/auth/safe-redirect.ts.
  const redirectPath = useMemo(() => readSafeNext(searchParams), [searchParams]);
  const { signUp, supabase } = useAuth();
  const native = useIsNative();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Age + terms acceptance gate (legal: provable consent + 18+ requirement).
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signUp({ email, password, username, displayName });
      trackEvent('sign_up', { method: 'password' });

      // With e-mail confirmation OFF, signUp returns an active session, so we
      // can create the profile (RLS requires auth.uid() = id) and send the user
      // straight into the app. With confirmation ON there is no session yet, so
      // we route them to login with a "check your inbox" hint instead of
      // attempting an unauthenticated profile insert that RLS would reject.
      if (result.session && result.user) {
        // Tidligere kastet vi hvis profil-upserten feilet. Da hadde auth-brukeren
        // ALLEREDE blitt opprettet, så brukeren satt igjen med en konto uten
        // profil — og kunne ikke registrere seg på nytt («e-posten er allerede
        // i bruk») eller komme videre i appen. En blindvei.
        //
        // ensureProfile prøver ønsket brukernavn, og faller tilbake på en
        // suffikset variant hvis det er opptatt. Går selv ikke det, sender vi
        // brukeren til innlogging — der signIn kaller den samme funksjonen på
        // nytt, slik at kontoen reparerer seg selv ved neste forsøk i stedet
        // for å bli stående ødelagt.
        const { error: profileError } = await ensureProfile(supabase, result.user);

        if (profileError) {
          router.push(`/auth/login?next=${encodeURIComponent(redirectPath)}&recover=1`);
          return;
        }

        // Full sidelast, ikke klientnavigasjon: økten er helt fersk, og i
        // appskallet henger kapsel-synkroniseringen etter — middleware kunne
        // avvise en router.push og sende brukeren stille tilbake (PR #191,
        // samme grep som innloggingen). Gjelder den dagen e-postbekreftelse
        // slås av; i dag går registreringen via else-grenen under.
        window.location.assign(redirectPath);
        return;
      } else {
        // Innloggingssiden viser hvilken adresse e-posten gikk til. Via
        // sessionStorage, aldri i URL-en.
        huskRegistrertEpost(email.trim());
        router.push(`/auth/login?next=${encodeURIComponent(redirectPath)}&confirm=1${native ? '&app=1' : ''}`);
      }
    } catch (err) {
      setError(toRegisterErrorMessage(err, t, tFeil));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-screen-sm p-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))]">
      {/* Registreringsskjemaet åpnet: anonym telling (migrasjon 070), bare i appen. */}
      <NativeOnly>
        <TellFlate flate="register" />
      </NativeOnly>
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-forest-900">{t('title')}</h1>
        <p className="mt-2 text-sm text-gray-700">{t('subtitle')}</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-800">
            {t('usernameLabel')}
            <input
              type="text"
              required
              minLength={3}
              autoComplete="nickname"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-gray-800">
            {t('displayNameLabel')}
            <input
              type="text"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>

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

          <PassordFelt
            label={t('passwordLabel')}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
          />

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              required
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              {t('acceptPrefix')}{' '}
              <Link href="/vilkar" className="font-medium text-forest-800 underline">{t('acceptTerms')}</Link>{' '}
              {t('acceptAnd')}{' '}
              <Link href="/personvern" className="font-medium text-forest-800 underline">{t('acceptPrivacy')}</Link>.
            </span>
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button type="submit" className="w-full" loading={loading} disabled={!acceptedTerms}>
            {t('submit')}
          </Button>
        </form>

        <p className="mt-4 text-sm text-gray-700">
          {t('haveAccount')}{' '}
          <Link className="font-semibold text-forest-800" href={`/auth/login?next=${encodeURIComponent(redirectPath)}`}>
            {t('login')}
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  const t = useTranslations('AuthRegister');
  return (
    <Suspense fallback={<main className="mx-auto min-h-screen w-full max-w-screen-sm p-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))]"><p className="text-sm text-gray-700">{t('loading')}</p></main>}>
      <RegisterForm />
    </Suspense>
  );
}
