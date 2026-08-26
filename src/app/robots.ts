import type { MetadataRoute } from 'next';

/**
 * robots.txt — fantes ikke. `GET /robots.txt` ga 404 fram til 2026-08-08.
 *
 * Uten den må søkemotorene gjette hva de skal se på, og de finner ingen
 * sitemap. Det er ikke en katastrofe — Google indekserer uansett — men det er
 * en unødvendig håndbrekk på den ene kanalen som gir gratis, varig trafikk.
 *
 * ⚠️ IKKE la dette bli en tilgangskontroll. Alt som står under `disallow` er
 * fortsatt fullt tilgjengelig for den som skriver adressen; robots.txt er en
 * HØFLIG BESKJED til søkeroboter, ikke en sperre — og fila er offentlig, så den
 * røper hva som finnes. Den ekte gatingen ligger i PROTECTED_PATHS i
 * src/lib/supabase/middleware.ts, og skal fortsette å gjøre det.
 *
 * Grunnen til at de private stiene likevel er listet, er en annen: uten dem
 * bruker roboten kvoten sin på sider som bare svarer med en omdirigering til
 * innlogging, i stedet for på artiklene vi faktisk vil bli funnet på.
 */
const BASE = 'https://www.mycelet.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        // Krever innlogging — å krype dem gir bare omdirigeringer.
        '/profile',
        '/mine-steder',
        '/identifiseringer',
        '/map',
        '/admin',
        '/forum/new',
        '/forum/moderation',
        '/forum/reports',
        // Skjemasider uten selvstendig verdi i et søkeresultat.
        '/auth/',
        '/identify/result'
      ]
    },
    sitemap: `${BASE}/sitemap.xml`
  };
}
