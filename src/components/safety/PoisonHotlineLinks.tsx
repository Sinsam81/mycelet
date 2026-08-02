import { Fragment } from 'react';
import { getTranslations } from 'next-intl/server';

/**
 * Ringelenkene til giftinformasjonen.
 *
 * Sverige har TO nummer: 112 ved akutt fare, og 010-456 67 00 til
 * Giftinformationscentralen for alt som ikke er akutt. Begge sto i
 * lenketeksten, men selve lenka gikk til 112 — en svensk bruker som ville
 * ringe giftlinja med et ikke-akutt spørsmål («jeg har spist en sopp jeg er
 * usikker på») trykket på 010-nummeret og ringte nødsentralen.
 *
 * Regelen komponenten håndhever: teksten du trykker på er nøyaktig det
 * nummeret som ringes. Har språket bare ett nummer (Norge), blir det én
 * lenke — sammenligningen på tel-målet gjør at Norge ikke får samme nummer
 * to ganger.
 */
export async function PoisonHotlineLinks({
  className,
  withName = false
}: {
  /** Klasser på selve lenkene — kallstedene har ulik farge på rød/mørk bunn. */
  className?: string;
  /** Sett når teksten rundt ikke allerede navngir giftinformasjonen. */
  withName?: boolean;
}) {
  const s = await getTranslations('Safety');

  const acuteTel = s('poisonTel');
  const directTel = s('poisonTelDirect');
  const numbers = [{ tel: acuteTel, label: s('poisonAcuteLabel') }];
  if (directTel !== acuteTel) {
    numbers.push({ tel: directTel, label: s('poisonDirectLabel') });
  }

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
