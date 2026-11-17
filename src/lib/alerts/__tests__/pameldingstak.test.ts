import { describe, expect, it } from 'vitest';
import {
  BEKREFTELSESVINDU_MS,
  FORSTE_PURRING_ETTER_MS,
  MAKS_BEKREFTELSER_PER_TIME,
  NESTE_PURRING_ETTER_MS,
  adresseMonster,
  bekreftelsesvinduFra,
  kanoniskAdresse,
  nyligBekreftelseSendt
} from '../pameldingstak';

/**
 * Regelen på raden er den som overlever kaldstart og instansvifte — telleren i
 * minnet gjør ikke det. Feilene som betyr noe går hver sin vei: slipper den
 * gjennom for ofte, kan adressen bombes; holder den igjen feil rad, får et
 * menneske «sjekk innboksen» uten at det finnes noen e-post.
 */

const NAA = Date.parse('2026-09-25T10:00:00.000Z');
const siden = (ms: number) => new Date(NAA - ms).toISOString();
const MIN = 60_000;

/** En rad som venter på bekreftelse, opprettet og sist rørt for `min` minutter siden. */
const fersk = (min: number) => ({ active: true, confirmed_at: null, created_at: siden(min * MIN), updated_at: siden(min * MIN) });

describe('nyligBekreftelseSendt', () => {
  it('tallene henger sammen: tre i timen, første gjentakelse etter ti minutter, så én i timen', () => {
    expect(MAKS_BEKREFTELSER_PER_TIME).toBe(3);
    expect(FORSTE_PURRING_ETTER_MS).toBe(10 * MIN);
    expect(NESTE_PURRING_ETTER_MS).toBe(60 * MIN);
    expect(BEKREFTELSESVINDU_MS).toBe(60 * MIN);
  });

  it('en rad som nettopp ble opprettet: bekreftelsen gikk nå, send ikke en til', () => {
    expect(nyligBekreftelseSendt(fersk(0), NAA)).toBe(true);
    expect(nyligBekreftelseSendt(fersk(9), NAA)).toBe(true);
  });

  it('etter ti minutter kan den første gjentakelsen gå — nøyaktig på grensen også', () => {
    expect(nyligBekreftelseSendt({ ...fersk(0), created_at: siden(10 * MIN), updated_at: siden(10 * MIN) }, NAA)).toBe(false);
    expect(nyligBekreftelseSendt(fersk(11), NAA)).toBe(false);
    expect(nyligBekreftelseSendt(fersk(24 * 60), NAA)).toBe(false);
  });

  it('er raden alt sendt på nytt (rørt etter at den ble opprettet), går det en time til neste', () => {
    const purret = (min: number) => ({ active: true, confirmed_at: null, created_at: siden(180 * MIN), updated_at: siden(min * MIN) });
    expect(nyligBekreftelseSendt(purret(11), NAA)).toBe(true);
    expect(nyligBekreftelseSendt(purret(59), NAA)).toBe(true);
    expect(nyligBekreftelseSendt(purret(60), NAA)).toBe(false);
    expect(nyligBekreftelseSendt(purret(61), NAA)).toBe(false);
  });

  it('gjelder aldri en avmeldt rad — updated_at er fersk fra selve avmeldingen', () => {
    expect(nyligBekreftelseSendt({ active: false, confirmed_at: '2026-08-01T00:00:00Z', created_at: siden(900 * MIN), updated_at: siden(MIN) }, NAA)).toBe(false);
    expect(nyligBekreftelseSendt({ active: false, confirmed_at: null, created_at: siden(MIN), updated_at: siden(MIN) }, NAA)).toBe(false);
  });

  it('gjelder aldri en bekreftet rad — den håndteres før, som stille suksess', () => {
    expect(nyligBekreftelseSendt({ active: true, confirmed_at: siden(MIN), created_at: siden(MIN), updated_at: siden(MIN) }, NAA)).toBe(false);
  });

  it('kan ikke tidsstempelet leses, holdes ingenting igjen', () => {
    expect(nyligBekreftelseSendt({ active: true, confirmed_at: null, created_at: null, updated_at: null }, NAA)).toBe(false);
    expect(nyligBekreftelseSendt({ active: true, confirmed_at: null, created_at: siden(MIN), updated_at: 'tull' }, NAA)).toBe(false);
  });

  it('mangler opprettelsestiden, regnes raden som alt purret — den strenge ventetiden', () => {
    const rad = { active: true, confirmed_at: null, created_at: null, updated_at: siden(30 * MIN) };
    expect(nyligBekreftelseSendt(rad, NAA)).toBe(true);
    expect(nyligBekreftelseSendt({ ...rad, updated_at: siden(61 * MIN) }, NAA)).toBe(false);
  });

  it('tåler Supabases mikrosekunder og tidssoneform', () => {
    const rad = { active: true, confirmed_at: null, created_at: '2026-09-25T09:57:00.123456+00:00', updated_at: '2026-09-25T09:57:00.123456+00:00' };
    expect(nyligBekreftelseSendt(rad, NAA)).toBe(true);
    expect(nyligBekreftelseSendt(rad, NAA + 8 * MIN)).toBe(false);
  });

  it('en klokke som går litt foran databasen sender ikke i strøm: «i framtiden» er nylig', () => {
    expect(nyligBekreftelseSendt({ active: true, confirmed_at: null, created_at: siden(-2000), updated_at: siden(-2000) }, NAA)).toBe(true);
  });
});

describe('bekreftelsesvinduFra', () => {
  it('er én time før nå, som ISO databasen kan sammenligne mot', () => {
    expect(bekreftelsesvinduFra(NAA)).toBe('2026-09-25T09:00:00.000Z');
  });
});

/**
 * Taket gjelder INNBOKSEN, ikke strengen: «ola+1», «o.la» og «ola» på Gmail
 * (og på googlemail.com) havner alle i samme innboks. Og det må aldri treffe
 * en annen persons adresse — da kunne hvem som helst fylle taket til en
 * fremmed og få bekreftelsene dens svelget i stillhet.
 *
 * Gmail-adressene settes sammen av biter: repoet er offentlig, og vakta i
 * src/lib/__tests__/docs-uten-hemmeligheter.test.ts stopper adresser hos
 * private leverandører i innsjekkede filer — også oppdiktede. Resten står på
 * reserverte eksempeldomener (.example, example.com).
 */
const gm = (lokal: string, domene = 'gmail.com') => [lokal, domene].join('@');

describe('kanoniskAdresse', () => {
  it('+merkelapper, Gmail-punktum, googlemail, store bokstaver og mellomrom gir samme innboks', () => {
    for (const variant of [
      gm('victim'),
      gm('victim+1'),
      gm('victim+a.b'),
      gm('v.i.c.t.i.m'),
      gm('.victim.'),
      gm('vic.tim+x', 'googlemail.com'),
      gm('Victim', 'GMail.com'),
      `  ${gm('victim')}  `,
      gm('victim', 'gmail.com.')
    ]) {
      expect(kanoniskAdresse(variant), variant).toBe(gm('victim'));
    }
    expect(kanoniskAdresse('Ola+Sopp@Firma.example')).toBe('ola@firma.example');
    expect(kanoniskAdresse('ola++@firma.example')).toBe('ola@firma.example');
  });

  it('punktum betyr noe utenfor Gmail, og et annet navn eller domene er en annen innboks', () => {
    expect(kanoniskAdresse('o.la@firma.example')).toBe('o.la@firma.example');
    expect(kanoniskAdresse(gm('victimother'))).toBe(gm('victimother'));
    expect(kanoniskAdresse(gm('victim', 'mail.gmail.com'))).toBe(gm('victim', 'mail.gmail.com'));
    expect(kanoniskAdresse('victim@example.com')).toBe('victim@example.com');
  });

  it('en + først er ingen merkelapp, og et Gmail-navn av bare punktum slås ikke sammen med noe', () => {
    expect(kanoniskAdresse('+ola@firma.example')).toBe('+ola@firma.example');
    expect(kanoniskAdresse('+kari@firma.example')).not.toBe(kanoniskAdresse('+ola@firma.example'));
    expect(kanoniskAdresse(gm('.'))).toBe(gm('.'));
    expect(kanoniskAdresse(gm('..+x'))).toBe(gm('..+x'));
  });
});

describe('adresseMonster', () => {
  /** Slik databasen matcher: `~*` mot den lagrede (lowercase) adressen. */
  const treffer = (monster: string, lagret: string) => new RegExp(monster, 'i').test(lagret.trim().toLowerCase());

  /** Ekte skrivemåter, nesten-like adresser, regex-tegn og søppel — alle par prøves mot hverandre. */
  const KORPUS = [
    gm('victim'),
    gm('victim+1'),
    gm('v.i.c.t.i.m'),
    gm('victim', 'googlemail.com'),
    gm('Victim', 'Gmail.com'),
    gm('victim+a.b'),
    gm('.victim.'),
    gm('victim', 'gmail.com.'),
    gm('vic.tim+x', 'googlemail.com'),
    gm('victimother'),
    gm('victi'),
    gm('xvictim'),
    gm('victim', 'mail.gmail.com'),
    gm('victim', 'gmail.co'),
    'victim@example.com',
    'victim+1@example.com',
    'vic.tim@example.com',
    'victimother@example.com',
    'victim@example.com.',
    'victim@example.com.evil.example',
    'victim@sub.example.com',
    'ola@firma.example',
    'ola+x@firma.example',
    'ola++@firma.example',
    'o.la@firma.example',
    'oxla@firma.example',
    'olaf@firma.example',
    'ol@firma.example',
    '+ola@firma.example',
    '+kari@firma.example',
    '++@firma.example',
    gm('.'),
    gm('..+x'),
    gm('+x'),
    'o.k|x*y?z$w^q{2}@ex-ample.example',
    'ookxxxyyzzwwq{2}@ex-ample.example',
    'o.k|x*y?z$w^q{2}+tag@ex-ample.example',
    'søren@eksempel.example',
    'søren+sopp@eksempel.example',
    'soren@eksempel.example',
    '%@%.%%',
    '_@x.example',
    'a@x.example',
    'a@b@c.example',
    'a+x@y@c.example',
    'a@c.example'
  ];

  it('treffer en lagret adresse nøyaktig når den har samme innboks — alle par i korpuset', () => {
    for (const a of KORPUS) {
      const monster = adresseMonster(a);
      for (const b of KORPUS) {
        expect(treffer(monster, b), `${a} ~ ${b}`).toBe(kanoniskAdresse(a) === kanoniskAdresse(b));
      }
    }
  });

  it('treffer aldri en adresse som bare begynner eller slutter likt', () => {
    const victim = adresseMonster(gm('victim'));
    expect(treffer(victim, gm('victimother'))).toBe(false);
    expect(treffer(victim, gm('victi'))).toBe(false);
    expect(treffer(victim, gm('xvictim'))).toBe(false);
    expect(treffer(victim, gm('victim', 'gmail.com.evil.example'))).toBe(false);
    const ola = adresseMonster('ola@firma.example');
    expect(treffer(ola, 'olaf@firma.example')).toBe(false);
    expect(treffer(ola, 'ola@firma.example.evil.example')).toBe(false);
    expect(treffer(ola, 'kari.ola@firma.example')).toBe(false);
    // Og omvendt: en lagret rad for victimother teller ikke på victim.
    expect(treffer(adresseMonster(gm('victimother')), gm('victim'))).toBe(false);
  });

  it('regex-tegn fra brukeren er bokstavelige: punktum, stjerne, pluss og resten matcher bare seg selv', () => {
    // Uten escaping ville «o.la» truffet «oxla» og «a*b» truffet «aaab».
    expect(treffer(adresseMonster('o.la@firma.example'), 'oxla@firma.example')).toBe(false);
    expect(treffer(adresseMonster('a*b@firma.example'), 'aaab@firma.example')).toBe(false);
    expect(treffer(adresseMonster('a*b@firma.example'), 'a*b@firma.example')).toBe(true);
    expect(treffer(adresseMonster('ola@firma.example'), 'ola@firmaxexample')).toBe(false);
    expect(treffer(adresseMonster('a|b@x.example'), 'b@x.example')).toBe(false);
    expect(treffer(adresseMonster('a\\b@x.example'), 'a\\b@x.example')).toBe(true);
    expect(treffer(adresseMonster('a\\b@x.example'), 'a\\\\b@x.example')).toBe(false);
    expect(adresseMonster('o.k|x*y?z$w^q{2}(a)[b]@ex-ample.example')).toBe(
      '^o\\.k\\|x\\*y\\?z\\$w\\^q\\{2\\}\\(a\\)\\[b\\](\\+[^@]*)?@ex-ample\\.example\\.*$'
    );
  });

  it('er forankret i begge ender, og har aldri en backslash foran en bokstav eller et siffer', () => {
    // I Postgres er \d, \m, \y og \w klasser og ordgrenser, ikke tegnet.
    for (const a of KORPUS) {
      const monster = adresseMonster(a);
      expect(monster.startsWith('^'), a).toBe(true);
      expect(monster.endsWith('$'), a).toBe(true);
      expect(monster, a).not.toMatch(/\\[\p{L}\p{N}]/u);
    }
  });

  it('formene ruta sender til databasen', () => {
    expect(adresseMonster('Offer@Example.com')).toBe('^offer(\\+[^@]*)?@example\\.com\\.*$');
    expect(adresseMonster(gm('o.ffer+1', 'googlemail.com'))).toBe(
      '^\\.*o\\.*f\\.*f\\.*e\\.*r\\.*(\\+[^@]*)?@(gmail|googlemail)\\.com\\.*$'
    );
    // Søppel uten et navn å kjenne innboksen på telles bare som seg selv.
    expect(adresseMonster('+ola@firma.example')).toBe('^\\+ola@firma\\.example$');
  });
});
