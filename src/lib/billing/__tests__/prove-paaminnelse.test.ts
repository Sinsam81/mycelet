import { describe, expect, it } from 'vitest';
import {
  APPLE_ABONNEMENT_URL,
  beregnBelop,
  bestemProvePaaminnelse,
  byggAppProvePaaminnelseEpost,
  byggProvePaaminnelseEpost,
  dagerTil,
  formaterBelop,
  lesRabatt,
  rabattStorrelseUkjent,
  sprakFraMetadata,
  type ProvePaaminnelseFakta
} from '../prove-paaminnelse';
import { BILLING_PLANS, FREE_DAILY_AI_LIMIT } from '../plans';

/**
 * Tre dager før gratisuka på nett blir til et trekk, skal kunden få vite hva
 * abonnementet gir, hva som blir borte, og så — rett ut, til slutt — når,
 * hvor mye og hvor man sier opp. Beløpet kommer fra Stripe-prisen, aldri fra
 * koden, og med rabatten trukket fra når vi kjenner den. Kjenner vi den ikke,
 * sies det ikke noe tall.
 */
const NAA = Date.parse('2026-09-14T20:00:00Z');
const OM_TRE_DAGER = Math.floor(Date.parse('2026-09-17T20:00:00Z') / 1000);
const UKJENT_RABATT = { percentOff: null, amountOff: null, amountOffCurrency: null };

function fakta(overrides: Partial<ProvePaaminnelseFakta> = {}): ProvePaaminnelseFakta {
  return {
    status: 'trialing',
    trialEndSek: OM_TRE_DAGER,
    cancelAtPeriodEnd: false,
    unitAmount: 7900,
    currency: 'nok',
    rabatt: null,
    naaMs: NAA,
    ...overrides
  };
}

describe('bestemProvePaaminnelse', () => {
  it('sender for en løpende prøveperiode med kjent pris', () => {
    expect(bestemProvePaaminnelse(fakta())).toEqual({
      send: true,
      dagerIgjen: 3,
      sluttIso: '2026-09-17',
      belop: { unitAmount: 7900, currency: 'nok' }
    });
  });

  it('ikke uten prøveperiode, ikke når kunden alt har sagt opp, ikke etter prøveslutt', () => {
    expect(bestemProvePaaminnelse(fakta({ status: 'active' }))).toEqual({ send: false, grunn: 'ikke-prove' });
    expect(bestemProvePaaminnelse(fakta({ trialEndSek: null }))).toEqual({ send: false, grunn: 'ikke-prove' });
    expect(bestemProvePaaminnelse(fakta({ cancelAtPeriodEnd: true }))).toEqual({ send: false, grunn: 'allerede-sagt-opp' });
    expect(bestemProvePaaminnelse(fakta({ trialEndSek: Math.floor(NAA / 1000) - 60 }))).toEqual({ send: false, grunn: 'prove-slutt-passert' });
  });

  it('sender aldri et beløp vi ikke kjenner', () => {
    expect(bestemProvePaaminnelse(fakta({ unitAmount: null }))).toEqual({ send: false, grunn: 'pris-ukjent' });
    expect(bestemProvePaaminnelse(fakta({ unitAmount: 0 }))).toEqual({ send: false, grunn: 'pris-ukjent' });
    expect(bestemProvePaaminnelse(fakta({ currency: null }))).toEqual({ send: false, grunn: 'pris-ukjent' });
  });

  it('en kjent rabatt trekkes fra beløpet', () => {
    const b = bestemProvePaaminnelse(fakta({ rabatt: { percentOff: 50, amountOff: null, amountOffCurrency: null } }));
    expect(b).toMatchObject({ send: true, belop: { unitAmount: 3950, currency: 'nok' } });
  });

  it('en rabatt vi ikke kan regne på gir e-post uten tall — ikke listeprisen', () => {
    const b = bestemProvePaaminnelse(fakta({ rabatt: UKJENT_RABATT }));
    expect(b).toMatchObject({ send: true, dagerIgjen: 3, belop: null });
  });

  it('dagerTil runder til hele dager (Stripe sender ~72 timer før)', () => {
    expect(dagerTil(OM_TRE_DAGER, NAA)).toBe(3);
    expect(dagerTil(OM_TRE_DAGER, NAA + 2 * 3600_000)).toBe(3);
    expect(dagerTil(Math.floor((NAA + 20 * 3600_000) / 1000), NAA)).toBe(1);
  });
});

describe('lesRabatt', () => {
  it('ingen rabatt → null', () => {
    expect(lesRabatt({})).toBeNull();
    expect(lesRabatt({ discount: null, discounts: [] })).toBeNull();
  });

  it('dagens rendring bærer bare id-er: rabatten finnes, størrelsen er ukjent', () => {
    const r = lesRabatt({ discounts: ['di_1Abc'] });
    expect(r).toEqual(UKJENT_RABATT);
    expect(rabattStorrelseUkjent(r!)).toBe(true);
  });

  it('utvidet rabatt gir prosent eller beløp fra kupongen', () => {
    expect(lesRabatt({ discounts: [{ coupon: { percent_off: 50, amount_off: null, currency: null } }] })).toEqual({
      percentOff: 50,
      amountOff: null,
      amountOffCurrency: null
    });
    expect(lesRabatt({ discount: { coupon: { percent_off: null, amount_off: 2000, currency: 'NOK' } } })).toEqual({
      percentOff: null,
      amountOff: 2000,
      amountOffCurrency: 'nok'
    });
  });

  it('gammel rendring: samme rabatt som objekt i discount og som id i discounts leses én gang', () => {
    expect(lesRabatt({ discount: { coupon: { percent_off: 25 } }, discounts: ['di_1Abc'] })).toMatchObject({ percentOff: 25 });
  });

  it('flere rabatter, eller en kupong uten tall, regnes ikke på', () => {
    expect(lesRabatt({ discounts: [{ coupon: { percent_off: 10 } }, { coupon: { percent_off: 20 } }] })).toEqual(UKJENT_RABATT);
    expect(lesRabatt({ discounts: [{ coupon: null }] })).toEqual(UKJENT_RABATT);
    expect(lesRabatt({ discounts: [{ coupon: { percent_off: 0, amount_off: 0 } }] })).toEqual(UKJENT_RABATT);
  });
});

describe('beregnBelop', () => {
  it('prosent og beløp trekkes fra; beløp bare i samme valuta', () => {
    expect(beregnBelop(7900, 'nok', null)).toBe(7900);
    expect(beregnBelop(7900, 'nok', { percentOff: 50, amountOff: null, amountOffCurrency: null })).toBe(3950);
    expect(beregnBelop(7900, 'nok', { percentOff: 33, amountOff: null, amountOffCurrency: null })).toBe(5293);
    expect(beregnBelop(7900, 'nok', { percentOff: null, amountOff: 2000, amountOffCurrency: 'nok' })).toBe(5900);
    expect(beregnBelop(7900, 'nok', { percentOff: null, amountOff: 2000, amountOffCurrency: 'sek' })).toBeNull();
  });

  it('ukjent størrelse og rabatt som går i null gir ikke noe tall', () => {
    expect(beregnBelop(7900, 'nok', UKJENT_RABATT)).toBeNull();
    expect(beregnBelop(7900, 'nok', { percentOff: 100, amountOff: null, amountOffCurrency: null })).toBeNull();
    expect(beregnBelop(7900, 'nok', { percentOff: null, amountOff: 9000, amountOffCurrency: 'nok' })).toBeNull();
  });
});

describe('formaterBelop', () => {
  it('kroner uten desimaler når beløpet er helt, med når det ikke er det', () => {
    expect(formaterBelop(7900, 'nok', 'nb')).toBe('79 kr');
    expect(formaterBelop(7950, 'sek', 'sv')).toBe('79,50 kr');
    expect(formaterBelop(24900, 'NOK', 'nb')).toBe('249 kr');
  });

  it('andre valutaer får Intl-formatering', () => {
    expect(formaterBelop(790, 'eur', 'nb')).toMatch(/7,90/);
    expect(formaterBelop(790, 'eur', 'nb')).toMatch(/€|EUR/);
  });
});

describe('sprakFraMetadata', () => {
  it('leser sprak fra user_metadata og faller tilbake på nb', () => {
    expect(sprakFraMetadata({ sprak: 'sv' })).toBe('sv');
    expect(sprakFraMetadata({ sprak: 'nb' })).toBe('nb');
    expect(sprakFraMetadata({ sprak: 'en' })).toBe('nb');
    expect(sprakFraMetadata({})).toBe('nb');
    expect(sprakFraMetadata(null)).toBe('nb');
  });
});

/**
 * E-postteksten: først hva abonnementet gir og hva som blir borte, så
 * trekket rett ut. Beløpet, datoen og veien ut skal aldri være vanskeligere
 * å finne enn verditeksten — derfor testes rekkefølgen, ikke bare at ordene
 * finnes. Og den lover ikke sopp: forbeholdet er det samme som i
 * varsel-e-posten.
 */
describe('byggProvePaaminnelseEpost', () => {
  // Prissiden har knappen til Stripe-portalen. Profilsiden har ingen oppsigelse.
  const oppsigelseUrl = 'https://www.mycelet.com/pricing';
  const belop = { unitAmount: 7900, currency: 'nok' };
  const felles = { plan: 'Premium', dagerIgjen: 3, sluttIso: '2026-09-17', belop, oppsigelseUrl };

  it.each(['nb', 'sv'] as const)('%s: beløp, dato og oppsigelseslenke står i både html og ren tekst', (locale) => {
    const { emne, html, tekst } = byggProvePaaminnelseEpost({ ...felles, locale });
    for (const del of [html, tekst]) {
      expect(del).toContain('79 kr');
      expect(del).toContain(oppsigelseUrl);
      expect(del).not.toContain('/profile');
      expect(del).toContain(locale === 'sv' ? '17 september' : '17. september');
      expect(del).toContain('Premium');
    }
    expect(emne).toMatch(/3 dag/);
  });

  it.each(['nb', 'sv'] as const)('%s: verdien først, trekket sist — og lenken ut før tallet', (locale) => {
    const { tekst } = byggProvePaaminnelseEpost({ ...felles, locale });
    const tapt = locale === 'sv' ? 'Offlinekartan' : 'Offline-kartet';
    // Hva du mister → veien ut → beløpet. Ingen skal måtte lese seg forbi
    // pengene for å finne utgangen, og trekket står likevel til slutt.
    expect(tekst.indexOf(tapt)).toBeLessThan(tekst.indexOf(oppsigelseUrl));
    expect(tekst.indexOf(oppsigelseUrl)).toBeLessThan(tekst.indexOf('79 kr'));

    // Trekket er siste avsnitt før signaturen — ikke grå småskrift under noe annet.
    const avsnitt = tekst.split('\n\n');
    expect(avsnitt[avsnitt.length - 1]).toContain('Mycelet');
    expect(avsnitt[avsnitt.length - 2]).toContain('79 kr');
    expect(avsnitt[avsnitt.length - 2]).toContain(oppsigelseUrl);
  });

  it('html rendrer trekket i samme brødtekst som resten, og lenken som anker', () => {
    const { html } = byggProvePaaminnelseEpost({ ...felles, locale: 'nb' });
    const trekkAvsnitt = html.split('\n').find((linje) => linje.includes('79 kr'));
    expect(trekkAvsnitt).toContain('font-size: 16px');
    expect(trekkAvsnitt).toContain(`<a href="${oppsigelseUrl}"`);
    // Seks avsnitt: fire i teksten, ett med trekket, ett med signaturen.
    expect(html.match(/<p /g)).toHaveLength(6);
  });

  it.each(['nb', 'sv'] as const)('%s: sier hva som blir borte, og hva du beholder gratis', (locale) => {
    const { tekst } = byggProvePaaminnelseEpost({ ...felles, locale });
    if (locale === 'nb') {
      expect(tekst).toContain('begrunnelsen bak hvert tall');
      expect(tekst).toContain('tre områder');
      expect(tekst).toContain('Offline-kartet');
      expect(tekst).toContain('AI-identifikasjonen');
      expect(tekst).toContain('Soppforholdene for området ditt, soppkartet og soppvarselet beholder du gratis');
    } else {
      expect(tekst).toContain('motiveringen bakom varje siffra');
      expect(tekst).toContain('tre områden');
      expect(tekst).toContain('Offlinekartan');
      expect(tekst).toContain('AI-identifieringen');
      expect(tekst).toContain('Svampläget för ditt område, svampkartan och svampvarningen behåller du gratis');
    }
    // Dagsgrensen er bundet til koden, ikke skrevet av. Endres FREE_DAILY_AI_LIMIT,
    // endres e-posten med den.
    expect(tekst).toContain(`${FREE_DAILY_AI_LIMIT} bilder`);
  });

  it.each(['nb', 'sv'] as const)('%s: lover ikke sopp, og gjelder et område — ikke skogen der du står', (locale) => {
    const { tekst } = byggProvePaaminnelseEpost({ ...felles, locale });
    expect(tekst).toContain(
      locale === 'sv'
        ? 'Den säger ingenting om skogen där du står, och vi lovar inte att du hittar svamp.'
        : 'Det sier ingenting om skogen der du står, og vi lover ikke at du finner sopp.'
    );
    expect(tekst).not.toMatch(/garanter|du finner sopp hvis|hittar svamp om du/i);
  });

  it('ingen hastverk, ingen skyld, ingen sesongpåstand — tabellen er statisk hele året', () => {
    const { emne, tekst } = byggProvePaaminnelseEpost({ ...felles, locale: 'nb', sluttIso: '2026-02-03' });
    expect(tekst).toContain('3. februar');
    for (const maaned of ['januar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']) {
      expect(tekst).not.toContain(maaned);
    }
    expect(`${emne} ${tekst}`).not.toMatch(/siste sjanse|ikke gå glipp|snart slutt|nå eller aldri|synd om|vi håper/i);
  });

  it('sv er faktisk svensk, ikke norsk fallback', () => {
    const { emne, tekst } = byggProvePaaminnelseEpost({
      ...felles,
      locale: 'sv',
      belop: { unitAmount: 7900, currency: 'sek' }
    });
    expect(emne).toContain('provperiod');
    expect(tekst).toContain('säger du upp här');
    expect(tekst).toContain('om du inte säger upp innan dess');
    // «Den» foran datoen er svensk; norsk har den ikke.
    expect(tekst).toContain('Den 17 september dras 79 kr');
    expect(tekst).not.toMatch(/begrunnelsen|trekkes|beholder du|områdene/);
  });

  it('sier «i morgen» og «i dag» når det er så kort igjen', () => {
    const kort = { ...felles, locale: 'nb' as const, sluttIso: '2026-09-15' };
    expect(byggProvePaaminnelseEpost({ ...kort, dagerIgjen: 1 }).emne).toContain('i morgen');
    expect(byggProvePaaminnelseEpost({ ...kort, dagerIgjen: 0 }).emne).toContain('i dag');
    // Frasen står i setningen uten «om ... dager» rundt seg: aldri «om 1 dager».
    expect(byggProvePaaminnelseEpost({ ...kort, dagerIgjen: 1 }).tekst).toContain('slutter i morgen.');
    expect(byggProvePaaminnelseEpost({ ...kort, dagerIgjen: 3 }).tekst).toContain('slutter om 3 dager.');
  });

  it('rabattert beløp står som det trekkes', () => {
    const { tekst } = byggProvePaaminnelseEpost({ ...felles, locale: 'nb', belop: { unitAmount: 3950, currency: 'nok' } });
    expect(tekst).toContain('17. september trekkes 39,50 kr');
    expect(tekst).not.toContain('79 kr');
  });

  it.each(['nb', 'sv'] as const)('%s: uten kjent beløp nevnes rabatten, men ikke noe tall', (locale) => {
    const { html, tekst } = byggProvePaaminnelseEpost({ ...felles, locale, belop: null });
    for (const del of [html, tekst]) {
      expect(del).not.toMatch(/\d+(,\d\d)? kr/);
      expect(del).toMatch(/rabatt/i);
      expect(del).toContain(oppsigelseUrl);
      expect(del).toContain(locale === 'sv' ? '17 september' : '17. september');
    }
    expect(tekst).toContain(
      locale === 'sv'
        ? 'Den 17 september debiteras ditt kort — med din rabatt avdragen — om du inte säger upp innan dess.'
        : '17. september belastes kortet ditt — med rabatten din trukket fra — om du ikke sier opp før det.'
    );
    // Samme rekkefølge som med tall: hva du mister, veien ut, så belastningen.
    const avsnitt = tekst.split('\n\n');
    expect(avsnitt[avsnitt.length - 2]).toContain(oppsigelseUrl);
  });

  it('sier fortsatt når, hvor mye og hvor man sier opp — og selger ikke', () => {
    const { tekst } = byggProvePaaminnelseEpost({ ...felles, locale: 'nb' });
    expect(tekst).toContain('om du ikke sier opp');
    expect(tekst).toContain('Vil du fortsette, trenger du ikke gjøre noe.');
    expect(tekst).not.toMatch(/tilbud|rabatt|håper/i);
  });
});

/**
 * App Store-varianten: samme verdiavsnitt, samme «beholder gratis», samme
 * forbehold — men veien ut er iPhonens innstillinger og Apples
 * abonnementsside, fristen står med dato OG klokkeslett ett døgn før
 * prøveslutt (Apple forsøker trekket i løpet av det siste døgnet), og det
 * står ALDRI et beløp: RevenueCat-webhooken lagrer ingen pris, og Apple
 * setter prisen per land. Et tall fra plans.ts kunne vært feil for akkurat
 * denne kunden. «Gratisuka» sies bare når prøven var en uke.
 */
describe('byggAppProvePaaminnelseEpost', () => {
  const svarLenker = {
    omrader: 'https://www.mycelet.com/api/prove/svar?t=TOKEN&valg=omrader&sprak=nb',
    offline: 'https://www.mycelet.com/api/prove/svar?t=TOKEN&valg=offline&sprak=nb',
    ai: 'https://www.mycelet.com/api/prove/svar?t=TOKEN&valg=ai&sprak=nb'
  };
  // Prøveslutt 27. september 05:12 UTC = 07:12 Oslo → fristen 26. september kl. 07.
  const felles = { plan: 'Premium', dagerIgjen: 3, sluttMs: Date.parse('2026-09-27T05:12:00.000Z'), gratisuke: true, svarLenker };
  const nett = { plan: 'Premium', dagerIgjen: 3, sluttIso: '2026-09-27', belop: { unitAmount: 9900, currency: 'nok' }, oppsigelseUrl: 'https://www.mycelet.com/pricing' };

  const AVSLUTNING_NB =
    'Vil du ikke fortsette, avslutter du senest 26. september kl. 07 under Innstillinger → navnet ditt øverst → Abonnementer på iPhonen, eller på https://apps.apple.com/account/subscriptions. Vil du fortsette, trenger du ikke gjøre noe. Prøveperioden slutter 27. september, og Apple-kontoen din belastes da med prisen som sto i appen da du startet. Fristen er et døgn før, fordi Apple kan trekke beløpet inntil ett døgn før prøveslutt.';
  const AVSLUTNING_SV =
    'Vill du inte fortsätta avslutar du senast den 26 september kl. 07 under Inställningar → ditt namn överst → Prenumerationer på din iPhone, eller på https://apps.apple.com/account/subscriptions. Vill du fortsätta behöver du inte göra något. Provperioden slutar den 27 september, och ditt Apple-konto debiteras då med priset som stod i appen när du började. Fristen är ett dygn tidigare, eftersom Apple kan dra beloppet upp till ett dygn före provperiodens slut.';

  it('nb: emne, fristen med klokkeslett, Apples vei ut, og belastningen uten tall', () => {
    const { emne, html, tekst } = byggAppProvePaaminnelseEpost({ ...felles, locale: 'nb' });
    expect(emne).toBe('Gratisuka di i Mycelet slutter om 3 dager');
    expect(tekst).toContain(AVSLUTNING_NB);
    // HTML: samme setning, Apple-lenken som anker.
    expect(html).toContain(
      `senest 26. september kl. 07 under Innstillinger → navnet ditt øverst → Abonnementer på iPhonen, eller på <a href="${APPLE_ABONNEMENT_URL}" style="color: #1A3409;">${APPLE_ABONNEMENT_URL}</a>. Vil du fortsette`
    );
    for (const del of [html, tekst]) {
      expect(del).toContain('Gratisuka di på Premium slutter om 3 dager.');
      expect(del).not.toContain('/pricing');
      expect(del).not.toMatch(/sier du opp her/);
      // Raden i Innstillinger heter kundens navn, og kontoen heter Apple-konto — «Apple-ID» finnes ikke der lenger.
      expect(del).not.toContain('Apple-ID');
    }
  });

  it('sv: naturlig svensk, ikke norsk reserve', () => {
    const { emne, html, tekst } = byggAppProvePaaminnelseEpost({ ...felles, locale: 'sv' });
    expect(emne).toBe('Din gratisvecka i Mycelet slutar om 3 dagar');
    expect(tekst).toContain(AVSLUTNING_SV);
    for (const del of [html, tekst]) {
      expect(del).toContain('Din gratisvecka på Premium slutar om 3 dagar.');
      expect(del).toContain('Vad var viktigast för dig under veckan?');
      expect(del).toContain(APPLE_ABONNEMENT_URL);
      expect(del).not.toMatch(/begrunnelsen|trekkes|beholder du|områdene|Innstillinger|Apple-ID/);
    }
  });

  it.each(['nb', 'sv'] as const)('%s: ingen tall fra plans.ts, ingen kronebeløp i det hele tatt', (locale) => {
    const { emne, html, tekst } = byggAppProvePaaminnelseEpost({ ...felles, locale });
    const priser = Object.values(BILLING_PLANS).flatMap((p) => [p.monthlyNok, p.yearlyNok]).filter((n): n is number => typeof n === 'number');
    expect(priser.length).toBeGreaterThan(0);
    for (const del of [emne, html, tekst]) {
      for (const pris of priser) expect(del).not.toMatch(new RegExp(`\\b${pris}\\b`));
      expect(del).not.toMatch(/\d+(,\d\d)?\s?kr\b/);
      expect(del).not.toMatch(/rabatt/i);
    }
    // De eneste tallene i teksten er dagsgrensen for AI, dagene igjen, fristens dato og klokkeslett, og datoen.
    const tallITekst = tekst.replace(/https?:\/\/\S+/g, '').match(/\d+/g) ?? [];
    expect(new Set(tallITekst)).toEqual(new Set([String(FREE_DAILY_AI_LIMIT), '3', '26', '07', '27']));
  });

  it.each(['nb', 'sv'] as const)('%s: verdien, «beholder gratis» og forbeholdet er ordrett de samme som på nett', (locale) => {
    const app = byggAppProvePaaminnelseEpost({ ...felles, locale }).tekst.split('\n\n');
    const web = byggProvePaaminnelseEpost({ ...nett, locale }).tekst.split('\n\n');
    // Avsnitt 2–4: verdi, beholder, forbehold. Innledningen (1) og avslutningen skiller.
    expect(app.slice(2, 5)).toEqual(web.slice(2, 5));
    expect(app[1]).not.toBe(web[1]);
    expect(app.slice(2, 5).join(' ')).toContain(
      locale === 'sv'
        ? 'Den säger ingenting om skogen där du står, och vi lovar inte att du hittar svamp.'
        : 'Det sier ingenting om skogen der du står, og vi lover ikke at du finner sopp.'
    );
  });

  it.each(['nb', 'sv'] as const)('%s: var prøven ikke en uke, heter den «prøveperioden» — ordrett som på nett, også i spørsmålet', (locale) => {
    const app = byggAppProvePaaminnelseEpost({ ...felles, locale, gratisuke: false });
    const web = byggProvePaaminnelseEpost({ ...nett, locale });
    expect(app.emne).toBe(web.emne);
    // Tittel, innledning, verdi, beholder, forbehold: nettvariantens, ordrett.
    expect(app.tekst.split('\n\n').slice(0, 5)).toEqual(web.tekst.split('\n\n').slice(0, 5));
    expect(app.tekst).toContain(locale === 'sv' ? 'Vad var viktigast för dig under provperioden?' : 'Hva var viktigst for deg i prøveperioden?');
    expect(`${app.emne} ${app.html} ${app.tekst}`).not.toMatch(/gratisuka|gratisvecka|i uka|under veckan/i);
    // Avslutningen er fortsatt App Store-veien, ikke Stripe-lenken.
    expect(app.tekst).toContain(locale === 'sv' ? AVSLUTNING_SV : AVSLUTNING_NB);
  });

  it('spørsmålet står sist, etter belastningen, med tre lenker og at det er frivillig', () => {
    const { html, tekst } = byggAppProvePaaminnelseEpost({ ...felles, locale: 'nb' });
    const avsnitt = tekst.split('\n\n');
    expect(avsnitt[avsnitt.length - 1]).toContain('Mycelet');
    expect(avsnitt[avsnitt.length - 2]).toContain('Hva var viktigst for deg i uka?');
    expect(avsnitt[avsnitt.length - 2]).toContain(`– områdene med begrunnelse: ${svarLenker.omrader}`);
    expect(avsnitt[avsnitt.length - 2]).toContain(`– offline-kartet: ${svarLenker.offline}`);
    expect(avsnitt[avsnitt.length - 2]).toContain(`– AI-identifikasjonen: ${svarLenker.ai}`);
    expect(avsnitt[avsnitt.length - 2]).toContain('du trenger ikke svare');
    expect(avsnitt[avsnitt.length - 3]).toContain('Apple-kontoen din belastes');
    // HTML: tre ankere med de tre lenkene, i samme brødtekst som resten.
    for (const url of Object.values(svarLenker)) expect(html).toContain(`<a href="${url}" style="color: #1A3409;">`);
    const sporsmalLinje = html.split('\n').find((l) => l.includes('Hva var viktigst'));
    expect(sporsmalLinje).toContain('font-size: 16px');
    // Sju avsnitt: fem i teksten, spørsmålet, signaturen.
    expect(html.match(/<p /g)).toHaveLength(7);
  });

  it('innhenting (2 dager igjen): fristen heter «i morgen» med klokkeslett, og aldri en nedtelling eller et press', () => {
    const { emne, tekst } = byggAppProvePaaminnelseEpost({ ...felles, locale: 'nb', dagerIgjen: 2, sluttMs: Date.parse('2026-09-26T05:12:00.000Z') });
    expect(emne).toBe('Gratisuka di i Mycelet slutter om 2 dager');
    expect(tekst).toContain('avslutter du senest i morgen kl. 07 under Innstillinger');
    expect(tekst).toContain('Prøveperioden slutter 26. september, og Apple-kontoen din belastes da');
    expect(`${emne} ${tekst}`).not.toMatch(/siste sjanse|ikke gå glipp|snart slutt|nå eller aldri|synd om|vi håper|tilbud/i);
    const sv = byggAppProvePaaminnelseEpost({ ...felles, locale: 'sv', dagerIgjen: 2, sluttMs: Date.parse('2026-09-26T05:12:00.000Z') });
    expect(sv.tekst).toContain('avslutar du senast i morgon kl. 07 under Inställningar');
  });

  it('fristen følger prøveslutt-tidspunktet: kl. 23 for en prøve som slutter 23:59, kl. 00 for en som slutter 00:30', () => {
    expect(byggAppProvePaaminnelseEpost({ ...felles, locale: 'nb', sluttMs: Date.parse('2026-09-27T21:59:00.000Z') }).tekst).toContain('senest 26. september kl. 23');
    expect(byggAppProvePaaminnelseEpost({ ...felles, locale: 'nb', sluttMs: Date.parse('2026-09-26T22:30:00.000Z') }).tekst).toContain('senest 26. september kl. 00');
  });
});
