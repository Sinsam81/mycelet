import { test, expect } from './_setup/fixtures';

// Offentlige sider — kun lesing, ingen innlogging, ingen skriving til databasen.
// Trygg å kjøre mot produksjon (`npm run qa:prod`).

test.describe('Offentlige sider', () => {
  test('forsiden laster og viser Mycelet', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Mycelet/i);
    await expect(page.getByText('Mycelet').first()).toBeVisible();
  });

  // Lenka til forvekslingstreneren står over artskortene og begynner også på
  // /species/ — uten unntaket ville «første artslenke» vært treneren, og de to
  // testene under ville blitt grønne uten å ha sett en eneste art.
  const ARTSKORT = 'a[href^="/species/"]:not([href="/species/forvekslinger"])';

  test('artsoversikten viser arter', async ({ page }) => {
    await page.goto('/species');
    await expect(page.locator(ARTSKORT).first()).toBeVisible();
  });

  // Søket går i nettleseren og leser også svenske navn og eldre latinske navn.
  // «karl johan» ga null treff i det norske biblioteket før. Kortene finnes på
  // det latinske navnet, som er likt på begge språk.
  test('artssøket finner steinsopp på det svenske navnet, og kantarell i flertall', async ({ page }) => {
    await page.goto('/species');
    const kort = page.locator('a[href^="/species/"]');
    const sok = page.getByRole('searchbox');
    await expect(kort.filter({ hasText: 'Cantharellus cibarius' })).toBeVisible();
    await sok.fill('karl johan');
    await expect(kort.filter({ hasText: 'Boletus edulis' })).toBeVisible();
    await expect(kort.filter({ hasText: 'Cantharellus cibarius' })).toHaveCount(0);
    // Bøyde former: «kantareller» står ikke i noe navn, men stammen gjør det.
    await sok.fill('kantareller');
    await expect(kort.filter({ hasText: 'Cantharellus cibarius' })).toBeVisible();
    await expect(kort.filter({ hasText: 'Boletus edulis' })).toHaveCount(0);
  });

  // Biblioteket og kalenderen arvet forsidens tittel og hadde ingen canonical.
  // Bibliotekets metadata kommer fra en layout som også ligger rundt
  // artssidene — de skal fortsatt ha sin EGEN tittel, med merkenavnet bak.
  test('biblioteket og kalenderen har egen tittel og kanonisk adresse', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page).toHaveTitle(/^(Soppkalender|Svampkalender).* — Mycelet$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.mycelet.com/calendar');

    await page.goto('/species');
    await expect(page).toHaveTitle(/^(Sopparter|Svamparter).* — Mycelet$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.mycelet.com/species');

    await page.locator('a[href^="/species/"]').filter({ hasText: 'Cantharellus cibarius' }).click();
    await expect(page).toHaveURL(/\/species\/\d+$/);
    await expect(page).toHaveTitle(/Cantharellus cibarius.* — Mycelet$/);
  });

  test('en art kan åpnes og viser detaljer', async ({ page }) => {
    await page.goto('/species');
    await page.locator(ARTSKORT).first().click();
    await expect(page).toHaveURL(/\/species\/\d+/);
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('forvekslingstreneren er åpen uten innlogging og viser sikkerhetslinja', async ({ page }) => {
    await page.goto('/species/forvekslinger');
    // Ikke sendt til innlogging, og ikke tolket som en art med id «forvekslinger».
    await expect(page).toHaveURL(/\/species\/forvekslinger$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Kjenn forvekslingen' })).toBeVisible();
    // Den faste linja og giftinformasjonen står der uansett hva treneren har å vise.
    await expect(page.getByText('Et bilde er aldri nok.').first()).toBeVisible();
    await expect(page.getByText('22 59 13 00').first()).toBeVisible();
    // En runde å starte, eller tom-tilstanden — aldri en feilmelding eller en tom flate.
    await expect(
      page
        .getByRole('button', { name: 'Start en runde' })
        .or(page.getByRole('heading', { name: 'Ingen par å øve på akkurat nå' }))
    ).toBeVisible();
  });

  test('forvekslingstreneren: krediterte bilder før svaret, kjennetegnene etter', async ({ page }) => {
    await page.goto('/species/forvekslinger');
    const start = page.getByRole('button', { name: 'Start en runde' });
    await expect(start.or(page.getByRole('heading', { name: 'Ingen par å øve på akkurat nå' }))).toBeVisible();
    test.skip(!(await start.isVisible()), 'ingen par i treneren akkurat nå — tom-tilstanden er dekket over');

    // Leser bare: svaret lagres i nettleserens lokale lagring, aldri i databasen.
    // Knappen står i HTML-en fra serveren før React har koblet seg på, og et
    // trykk i det vinduet går tapt — derfor trykkes det til spørsmålet kommer.
    const sporsmal = page.getByRole('heading', { name: /Hvilken av disse to er giftsoppen\?/ });
    await expect(async () => {
      await start.click({ timeout: 2_000 });
      await expect(sporsmal).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    const kort = page.locator('main figure');
    await expect(kort).toHaveCount(2);
    await expect(kort.nth(0).getByText(/^Foto: /).first()).toBeVisible();
    await expect(kort.nth(1).getByText(/^Foto: /).first()).toBeVisible();

    await kort.nth(0).getByRole('button').click();
    await expect(page.getByText('er giftsoppen av de to.')).toBeVisible();
    await expect(page.getByText('Slik skiller du dem:')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Les alt om / })).toHaveCount(2);
    // Sikkerhetslinja står en gang til, rett under kjennetegnene.
    await expect(page.getByText('Et bilde er aldri nok.')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /Neste par|Se resultatet/ })).toBeVisible();
  });

  test('kalenderen laster', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page).toHaveTitle(/Mycelet/i);
    await expect(page.getByText(/sesong/i).first()).toBeVisible();
  });

  // Hva kalenderen skal vise følger måneden (Oslo-tid, som siden selv bruker):
  //  · april–november er det giftige arter ute — de står i sin egen blokk,
  //  · utenom september–oktober sier siden hva som kommer («Kommer snart» når
  //    det er neste måned, ellers «Neste ut: <måned>»).
  test('kalenderen skiller ut de giftige artene og ser framover', async ({ page }) => {
    const maaned = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Oslo', month: 'numeric' }).format(new Date())
    );
    await page.goto('/calendar');
    await expect(page.getByRole('heading', { name: /I sesong nå|I säsong nu/ })).toBeVisible();
    if (maaned >= 4 && maaned <= 11) {
      await expect(
        page.getByRole('heading', { name: /Giftige arter som også er ute nå|Giftiga arter som också finns ute nu/ })
      ).toBeVisible();
    }
    if (maaned !== 9 && maaned !== 10) {
      await expect(page.getByRole('heading', { name: /Neste ut|Näst på tur|Kommer snart/ })).toBeVisible();
    }
  });

  test('prissiden viser begge planene med riktige priser (bygges i nettleseren)', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('Premium').first()).toBeVisible();
    await expect(page.getByText(/Sesongpass/i).first()).toBeVisible();
    // 99 siden 2026-09-01 (prisendringen i PR #213) — 79 gjelder kun eksisterende abonnenter.
    await expect(page.getByText('99').first()).toBeVisible();
    await expect(page.getByText('249').first()).toBeVisible();
  });

  test('sikkerhetssiden viser Giftinformasjonen', async ({ page }) => {
    await page.goto('/sikkerhet');
    await expect(page.getByText('Giftinformasjonen').first()).toBeVisible();
    await expect(page.getByText('22 59 13 00').first()).toBeVisible();
  });

  test('datakilder-siden krediterer kildene', async ({ page }) => {
    await page.goto('/datakilder');
    await expect(page.getByRole('heading', { name: /Datakilder/i }).first()).toBeVisible();
  });

  test('personvernsiden laster', async ({ page }) => {
    await page.goto('/personvern');
    await expect(page).toHaveTitle(/Personvern/i);
  });
});

// Landingssiden besøkende faktisk ser er den STATISKE fila i public/landing/,
// som mellomvaren skriver «/» om til. React-komponenten LandingPage er bare
// reserven der mellomvaren ikke kjører — altså lokalt, og dermed i `npm run qa`.
// QA-løkka prøvde derfor en landingsside ingen besøkende får. Denne ene sjekken
// kjører mot prod og ser at «/» virkelig er den statiske fila.
test.describe('Den ekte landingssiden', () => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? '';
  const isLocalDev = baseURL.includes('localhost') || baseURL.includes('127.0.0.1');

  test('«/» serverer den statiske landingssiden til utloggede', async ({ request }) => {
    test.skip(
      isLocalDev,
      'Mellomvaren kjører ikke i lokal Turbopack-dev — verifiseres mot prod (npm run qa:prod).'
    );
    const svar = await request.get('/');
    expect(svar.status()).toBe(200);
    // Selvhostet skrift som bare den statiske fila laster (norsk og svensk utgave).
    expect(await svar.text()).toContain('/landing/f1.woff2');
  });
});

// Toppen og bunnmenyen for en som IKKE er logget inn. Reglene er enhetstestet
// (src/lib/nav/__tests__/hjem.test.ts); her sjekkes at de to komponentene
// faktisk får innlogging og plattform fra nettleseren. Kun lesing.
test.describe('Utlogget — toppen og bunnmenyen', () => {
  test('toppen har «Logg inn», med veien tilbake til siden', async ({ page }) => {
    await page.goto('/species');
    const lenke = page.locator('header').first().getByRole('link', { name: /^(Logg inn|Logga in)$/ });
    await expect(lenke).toBeVisible();
    await expect(lenke).toHaveAttribute('href', '/auth/login?next=%2Fspecies');
  });

  test('i appen (simulert) er Hjem /soppforhold, og fanen lyser der', async ({ page }) => {
    // Samme markør som billing-gating.e2e.ts: Capacitor.isNativePlatform() blir sann.
    await page.addInitScript(() => {
      (window as Window & { CapacitorCustomPlatform?: unknown }).CapacitorCustomPlatform = {
        name: 'ios',
        plugins: {}
      };
    });
    await page.goto('/soppforhold');
    const hjem = page
      .getByRole('navigation', { name: /Hovedmeny|Huvudmeny/ })
      .getByRole('link', { name: /^(Hjem|Hem)$/ });
    // «/» var en full sidelasting via landingssiden og tilbake hit, og ingen fane lyste.
    await expect(hjem).toHaveAttribute('href', '/soppforhold');
    await expect(hjem).toHaveAttribute('aria-current', 'page');
  });
});

// Soppvarselet og områdesidene — fortsatt KUN lesing. Skjemaene finnes på
// siden, men sendes aldri inn herfra: det er én database, og en innsending
// ville laget en ekte påmelding og sendt en ekte e-post.
test.describe('Soppvarsel og områdesider', () => {
  test('soppvarsel-siden har sin egen tittel, ikke appens generelle', async ({ page }) => {
    await page.goto('/soppvarsel');
    await expect(page).toHaveTitle(/^(Soppvarsel på e-post|Svampvarning via mejl) — Mycelet$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.mycelet.com/soppvarsel');
    await expect(page.locator('form[action="/api/soppvarsel/pamelding"] input[name="email"]')).toBeVisible();
  });

  test('svensk områdeside sier selv at innholdet er svensk', async ({ page }) => {
    // <html lang> følger den besøkende; artikkelen og delingskortet følger landet.
    await page.goto('/soppforhold/goteborg');
    await expect(page.locator('article[lang="sv"]')).toBeVisible();
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'sv_SE');
  });

  test('norsk områdeside: norsk artikkel, og varselboksen er selve påmeldingsskjemaet', async ({ page }) => {
    await page.goto('/soppforhold/oslo');
    await expect(page.locator('article[lang="nb"]')).toBeVisible();
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'nb_NO');
    const skjema = page.locator('#varsel form[action="/api/soppvarsel/pamelding"]');
    await expect(skjema.locator('input[name="email"]')).toBeVisible();
    await expect(skjema.locator('input[name="region"]')).toHaveValue('Oslo');
    await expect(skjema.locator('input[name="retur"]')).toHaveValue('oslo');
  });
});
