'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const t = useTranslations('AuthForgot');
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Recovery link lands on /auth/reset, where the browser client auto-detects
      // the code and the user sets a new password. redirectTo must be in Supabase's
      // allow-list (www.mycelet.com/** + mycelet.com/** are configured).
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sendError'));
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
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
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
