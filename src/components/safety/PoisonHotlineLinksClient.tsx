'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { byggGiftnummer } from './giftnummer';

/**
 * Klienttvillingen til PoisonHotlineLinks (som er en async serverkomponent og
 * derfor ikke kan brukes fra 'use client'-flater).
 *
 * Den finnes fordi de to stedene der nummeret trengs MEST — den røde
 * fareboksen på AI-resultatet og den faste advarselen på identify-siden — er
 * klientkomponenter, og der sto nummeret som ren tekst ved siden av et
 * telefonikon: det så ut som en ringeknapp, men var ikke en lenke. I appskallet
 * (WKWebView) blir sifre ikke lenket automatisk.
 *
 * Samme regel og samme markup som servervarianten: teksten du trykker på er
 * nøyaktig det nummeret som ringes — én lenke for norsk, to for svensk
 * (112 akutt / 010-456 67 00). Tallene bygges av byggGiftnummer, så de to
 * komponentene kan ikke vise ulike nummer.
 */
export function PoisonHotlineLinksClient({
  className,
  withName = false
}: {
  /** Klasser på selve lenkene — kallstedene har ulik farge og trykkflate. */
  className?: string;
  /** Sett når teksten rundt ikke allerede navngir giftinformasjonen. */
  withName?: boolean;
}) {
  const s = useTranslations('Safety');
  const numbers = byggGiftnummer(s);

  return (
    <>
      {withName ? `${s('poisonName')} ` : ''}
      {numbers.map((number, index) => (
        <Fragment key={number.tel}>
          {index > 0 ? ` ${s('poisonOr')} ` : ''}
          <a href={`tel:${number.tel}`} className={className}>
            {number.label}
          </a>
        </Fragment>
      ))}
    </>
  );
}
