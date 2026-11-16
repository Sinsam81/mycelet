import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * Bildeoptimereren (/_next/image) skal bare kunne hente fra vårt eget
 * Supabase-prosjekt. Før slapp `**.supabase.co` og `**.kindwise.com` gjennom
 * enhver vert under de domenene. Laster den ekte next.config.js.
 */
const require = createRequire(import.meta.url);
const STI = join(process.cwd(), 'next.config.js');

function lastBilder(): { remotePatterns: Array<Record<string, string>> } {
  delete require.cache[require.resolve(STI)];
  return (require(STI) as { images: { remotePatterns: Array<Record<string, string>> } }).images;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('next.config.js images.remotePatterns', () => {
  it('slipper bare gjennom prosjektets egen Supabase-vert', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefgh.supabase.co');
    const { remotePatterns } = lastBilder();
    expect(remotePatterns).toEqual([{ protocol: 'https', hostname: 'abcdefgh.supabase.co', pathname: '/storage/v1/**' }]);
    expect(JSON.stringify(remotePatterns)).not.toContain('**.');
    expect(JSON.stringify(remotePatterns)).not.toContain('kindwise');
  });

  it('uten variabelen blir listen tom — bygget går likevel', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(lastBilder().remotePatterns).toEqual([]);
  });

  it('ugyldig eller ikke-https URL gir tom liste, ikke et kast', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'ikke en url');
    expect(lastBilder().remotePatterns).toEqual([]);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://abcdefgh.supabase.co');
    expect(lastBilder().remotePatterns).toEqual([]);
  });
});
