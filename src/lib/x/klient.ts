import crypto from 'crypto';
import { logger } from '@/lib/log';

/**
 * Publisering til X (@mycelet) via API v2 med OAuth 1.0a user context.
 *
 * ── Hvorfor håndrullet signering ────────────────────────────────────────────
 * Kallet er ÉN POST mot ett endepunkt. OAuth 1.0a-signaturen er ~20 linjer med
 * standardbibliotekets crypto, og en npm-avhengighet for dette ville vært mer
 * kode å vedlikeholde enn signeringen selv. Viktig detalj: med JSON-kropp
 * signeres BARE oauth-parametrene — kroppen inngår ikke i signaturgrunnlaget
 * (det gjelder kun application/x-www-form-urlencoded).
 *
 * ── Kostnadsmodellen styrer formen ──────────────────────────────────────────
 * X tar betalt per forespørsel (Pay Per Use, forhåndskjøpte kreditter):
 * $0.015 for en vanlig post, men $0.20 for en post som inneholder en URL.
 * Derfor skriver komponistene i innlegg.ts ALDRI lenker i teksten — lenken
 * bor i profilen. Legger noen inn en URL i en fremtidig posttype, er det en
 * 13-dobling av prisen og et bevisst valg, ikke et uhell.
 *
 * ⚠️ INERT UTEN NØKLER, MED VILJE. Uten de fire X_*-variablene returnerer
 * postTilX { ok: false } og cron-jobben fullfører som normalt — samme mønster
 * som Resend-koden i lib/email/send.ts. Ruta har i tillegg en Sentry-alarm for
 * manglende konfig, etter nitten-dagers-lærdommen fra soppvarselet.
 */

const X_ENV = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'] as const;

/** Hvilke av de fire nøklene mangler i miljøet? Tom liste = klar til å poste. */
export function manglendeXKonfig(): string[] {
  return X_ENV.filter((navn) => !process.env[navn]);
}

/** RFC 3986-prosentkoding — strengere enn encodeURIComponent, som OAuth krever. */
function pct(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function oauthHeader(url: string): string {
  const apiKey = process.env.X_API_KEY ?? '';
  const apiSecret = process.env.X_API_SECRET ?? '';
  const accessToken = process.env.X_ACCESS_TOKEN ?? '';
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET ?? '';

  const params: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0'
  };

  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${pct(k)}=${pct(params[k])}`)
    .join('&');
  const base = ['POST', pct(url), pct(paramString)].join('&');
  const signingKey = `${pct(apiSecret)}&${pct(accessSecret)}`;
  params.oauth_signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');

  return (
    'OAuth ' +
    Object.keys(params)
      .sort()
      .map((k) => `${pct(k)}="${pct(params[k])}"`)
      .join(', ')
  );
}

export type XPostResultat = { ok: true; tweetId: string } | { ok: false; feil: string };

/** Publiser én tekstpost som @mycelet. Returnerer alltid — kaster aldri. */
export async function postTilX(tekst: string): Promise<XPostResultat> {
  const mangler = manglendeXKonfig();
  if (mangler.length > 0) {
    logger.warn('x.post_uten_nokler', { mangler });
    return { ok: false, feil: `mangler ${mangler.join(', ')}` };
  }

  const url = 'https://api.x.com/2/tweets';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: oauthHeader(url),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: tekst }),
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      // Feilkroppen fra X (401 signatur, 403 rettigheter, 402 tom kredittsaldo)
      // er akkurat det som trengs for å feilsøke — men den hører hjemme i
      // loggen, ikke hos noen bruker (dette kalles kun fra cron).
      const kropp = await res.text().catch(() => '');
      logger.error('x.post_feilet', undefined, { status: res.status, kropp: kropp.slice(0, 500) });
      return { ok: false, feil: `X svarte ${res.status}` };
    }

    const json = (await res.json()) as { data?: { id?: string } };
    const tweetId = json.data?.id;
    if (!tweetId) return { ok: false, feil: 'X svarte uten post-id' };
    return { ok: true, tweetId };
  } catch (error) {
    logger.error('x.post_nettverksfeil', error);
    return { ok: false, feil: 'nettverksfeil mot X' };
  }
}
