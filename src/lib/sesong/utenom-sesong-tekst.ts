import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { sesongfaseForManed } from '@/lib/sesong/sesongtilstand';

/**
 * Teksten flatene viser når det er UTENOM hovedsesongen (desember–mai).
 *
 * ÉN kilde, fordi to ikke holdt: mushroom-day.ts og flush.ts hadde hver sin
 * kopi av «Det er utenfor hovedsesongen. Kom tilbake fra sensommeren.», og de
 * to rendres rett over hverandre i forsidekortet — samme overskrift og samme
 * setning to ganger, et halvt år i strekk. Nå henter begge herfra.
 *
 * Fire regler for ordlyden:
 *  - Aldri «kom tilbake». Det er en beskjed om å gå, til folk som har betalt
 *    for et helt år.
 *  - Si hva tallet betyr nå. Sesongleddet er 0 utenom sesongen, så det som står
 *    igjen i 0–100-tallet er bare regn, temperatur og luftfuktighet.
 *  - April–mai har egen tekst. Forsidens overskrift sier «Vårsoppene er
 *    kommet!» de månedene; kortet under kan ikke si «utenom soppsesongen» uten
 *    forbehold. Derfor «sommer- og høstsesongen» der, ikke «soppsesongen». Men
 *    INGEN påstand om at vårsoppene står der brukeren er — tallet har ingen
 *    vårsoppmodell bak seg.
 *  - Juni er START, ikke hovedsesong. Teksten sa «Hovedsesongen starter i juni»
 *    / «Högsäsongen börjar i juni» — kodens navn (HOVEDSESONG_STARTMANED) limt
 *    rett inn i teksten. Men til brukeren betyr de ordene august–oktober:
 *    kortet gir haken «Hovedsesong for sopp i Norge» / «Högsäsong för svamp»
 *    først 1. august (prediction-explanation.ts), overskriften «Høysesong!»
 *    kommer i august, og i juni når ikke ringen «Perfekt soppdag» selv i
 *    ideelt vær. På svensk sto det bokstavelig talt at høysesongen begynner i
 *    juni. Si det modellen mener: sesongen starter i juni (vekt over null),
 *    høysesongen i august (full vekt).
 *
 * «Juni» er HOVEDSESONG_STARTMANED i sesongtilstand.ts (første måned med
 * sesongvekt over null) og «august» første måned i fasen 'hoysesong'; testen
 * ved siden av låser begge.
 */

export interface UtenomSesongTekst {
  title: string;
  message: string;
}

const COPY: Record<Locale, { vinter: UtenomSesongTekst; var: UtenomSesongTekst }> = {
  nb: {
    vinter: {
      title: 'Utenom soppsesongen',
      message:
        'Soppsesongen starter i juni, med høysesong fra august. Tallet viser bare været nå — sesongkalenderen viser de få artene som har sesong om vinteren.'
    },
    var: {
      title: 'Før hovedsesongen',
      message:
        'Sommer- og høstsesongen starter i juni, og tallet gjelder den. Vårsoppene følger sin egen rytme — se sesongkalenderen.'
    }
  },
  sv: {
    vinter: {
      title: 'Utanför svampsäsongen',
      message:
        'Svampsäsongen börjar i juni, med högsäsong från augusti. Siffran visar bara vädret just nu — säsongskalendern visar de få arter som har säsong på vintern.'
    },
    var: {
      title: 'Före högsäsongen',
      message:
        'Sommar- och höstsäsongen börjar i juni, och siffran gäller den. Vårsvamparna följer sin egen rytm — se säsongskalendern.'
    }
  }
};

/**
 * Tittel og setning for en måned utenom hovedsesongen. Kalles bare for
 * desember–mai; får den likevel en sesongmåned, svarer den med vinterteksten
 * heller enn å kaste (kallerne har allerede avgjort at det er utenom sesong).
 */
export function utenomSesongTekst(month: number, locale: Locale = DEFAULT_LOCALE): UtenomSesongTekst {
  const copy = COPY[locale] ?? COPY[DEFAULT_LOCALE];
  return sesongfaseForManed(month) === 'var' ? copy.var : copy.vinter;
}
