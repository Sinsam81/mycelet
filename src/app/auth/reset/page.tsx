'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

type Status = 'verifying' | 'ready' | 'invalid' | 'done';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<Status>('verifying');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

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
      setError('Passordet må være minst 8 tegn.');
      return;
    }
    if (password !== confirm) {
      setError('Passordene er ikke like.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStatus('done');
      setTimeout(() => {
        router.push('/map');
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke oppdatere passordet.');
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-screen-sm p-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))]">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-forest-900">Lag nytt passord</h1>

        {status === 'verifying' ? <p className="mt-4 text-sm text-gray-700">Sjekker lenken…</p> : null}

        {status === 'invalid' ? (
          <div className="mt-4 space-y-4">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              Lenken er ugyldig eller utløpt. Be om en ny lenke for å lage nytt passord. (Husk å åpne lenken i samme
              nettleser som du ba om den fra.)
            </p>
            <Link href="/auth/forgot" className="inline-block text-sm font-semibold text-forest-800 hover:underline">
              Be om ny lenke
            </Link>
          </div>
        ) : null}

        {status === 'done' ? (
          <p className="mt-4 rounded-lg border border-forest-200 bg-forest-50 px-3 py-3 text-sm text-forest-900">
            Passordet er oppdatert! Logger deg inn…
          </p>
        ) : null}

        {status === 'ready' ? (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <p className="text-sm text-gray-700">Velg et nytt passord (minst 8 tegn).</p>

            <label className="block text-sm font-medium text-gray-800">
              Nytt passord
              <input
                type="password"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-gray-800">
              Gjenta nytt passord
              <input
                type="password"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button type="submit" className="w-full" loading={loading}>
              Lagre nytt passord
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
