'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = useMemo(() => searchParams.get('redirect') ?? '/', [searchParams]);
  const { signIn, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
      router.push(redirectPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke logge inn');
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
      setError(err instanceof Error ? err.message : 'Google-innlogging feilet');
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-screen-sm p-6">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-forest-900">Velkommen til SoppJakt</h1>
        <p className="mt-2 text-sm text-gray-700">Logg inn for å lagre funn, poste i forumet og bruke kart fullt ut.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-800">
            E-post
            <input
              type="email"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-gray-800">
            Passord
            <input
              type="password"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button type="submit" className="w-full" loading={loading}>
            Logg inn
          </Button>
        </form>

        <Button type="button" variant="outline" className="mt-3 w-full" onClick={handleGoogle} disabled={loading}>
          Fortsett med Google
        </Button>

        <p className="mt-4 text-sm text-gray-700">
          Har du ikke konto?{' '}
          <Link className="font-semibold text-forest-800" href={`/auth/register?next=${encodeURIComponent(redirectPath)}`}>
            Registrer deg
          </Link>
        </p>
      </div>
    </main>
  );
}
