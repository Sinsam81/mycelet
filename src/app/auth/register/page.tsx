'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/hooks/useAuth';

export default function RegisterPage() {
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signUp({ email, password, username, displayName });

      if (result.user) {
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
      }

      router.push(`/auth/login?next=${encodeURIComponent(redirectPath)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke registrere konto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-screen-sm p-6">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-forest-900">Opprett konto</h1>
        <p className="mt-2 text-sm text-gray-700">Lag profil for å lagre funn og bli med i forumet.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-800">
            Brukernavn
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
            Visningsnavn
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>

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
              minLength={8}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button type="submit" className="w-full" loading={loading}>
            Opprett konto
          </Button>
        </form>

        <p className="mt-4 text-sm text-gray-700">
          Har du allerede konto?{' '}
          <Link className="font-semibold text-forest-800" href={`/auth/login?next=${encodeURIComponent(redirectPath)}`}>
            Logg inn
          </Link>
        </p>
      </div>
    </main>
  );
}
