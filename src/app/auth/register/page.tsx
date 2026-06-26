'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/hooks/useAuth';

// Next 15+ requires useSearchParams() to be inside a Suspense boundary so the
// page can prerender. We wrap the inner form-rendering component below.

// Supabase errors (PostgrestError, AuthError) are plain objects, NOT Error
// instances, so `err instanceof Error` misses them and the user only ever saw a
// generic fallback. Read `.message` defensively and map the common cases to
// friendly Norwegian copy.
function toRegisterErrorMessage(err: unknown, t: (key: string) => string): string {
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
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return t('errorEmailRegistered');
  }
  if (lower.includes('password') && (lower.includes('least') || lower.includes('short'))) {
    return t('errorPasswordShort');
  }
  return raw || t('errorGeneric');
}

function RegisterForm() {
  const t = useTranslations('AuthRegister');
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = useMemo(() => searchParams.get('next') ?? searchParams.get('redirect') ?? '/', [searchParams]);
  const { signUp, supabase } = useAuth();

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

      // With e-mail confirmation OFF, signUp returns an active session, so we
      // can create the profile (RLS requires auth.uid() = id) and send the user
      // straight into the app. With confirmation ON there is no session yet, so
      // we route them to login with a "check your inbox" hint instead of
      // attempting an unauthenticated profile insert that RLS would reject.
      if (result.session && result.user) {
        const { error: profileError } = await supabase.from('profiles').upsert(
          {
            id: result.user.id,
            username,
            display_name: displayName || username
          },
          { onConflict: 'id' }
        );

        if (profileError) {
          throw profileError;
        }

        router.push(redirectPath);
      } else {
        router.push(`/auth/login?next=${encodeURIComponent(redirectPath)}&confirm=1`);
      }
    } catch (err) {
      setError(toRegisterErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-screen-sm p-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))]">
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
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-gray-800">
            {t('displayNameLabel')}
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>

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
              minLength={8}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

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
