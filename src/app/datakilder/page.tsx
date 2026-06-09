import { Database } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';

export const metadata = {
  title: 'Datakilder — Mycelet',
  description: 'Åpne datakilder og lisenser som driver Mycelets soppkart og prediksjoner.'
};

interface SourceEntry {
  name: string;
  what: string;
  license: string;
  url: string;
}

const SOURCES: SourceEntry[] = [
  {
    name: 'Artsdatabanken / GBIF',
    what: 'Registrerte soppfunn («Vis registrerte funn» og funn-signalet i prediksjonen). Vi bruker kun poster publisert under fri lisens (CC0 eller CC BY 4.0).',
    license: 'CC0 1.0 / CC BY 4.0',
    url: 'https://www.gbif.org'
  },
  {
    name: 'NIBIO — SR16 skogressurskart',
    what: 'Skogdata for Norge (treslag, bonitet, volum) — grunnlaget for habitat-vurderingen i prediksjonen.',
    license: 'NLOD / CC BY 4.0',
    url: 'https://www.nibio.no'
  },
  {
    name: 'Kartverket',
    what: 'Topografisk kart (standardlaget), stedsnavnsøk og høydedata.',
    license: 'CC BY 4.0',
    url: 'https://www.kartverket.no'
  },
  {
    name: 'Meteorologisk institutt (MET Norway)',
    what: 'Værobservasjoner (Frost) og værvarsel (Locationforecast) — fukt-, temperatur- og sesongsignalene i prediksjonen og soppvarselet.',
    license: 'NLOD / CC BY 4.0',
    url: 'https://www.met.no'
  },
  {
    name: 'SMHI Öppna data',
    what: 'Værobservasjoner for Sverige.',
    license: 'CC BY 4.0',
    url: 'https://www.smhi.se'
  },
  {
    name: 'Copernicus / EEA — CORINE Land Cover',
    what: 'Arealdekke (skogtype) for Sverige.',
    license: 'Copernicus åpne data (med kreditering)',
    url: 'https://land.copernicus.eu'
  },
  {
    name: 'Esri, Maxar, Earthstar Geographics',
    what: 'Satellitt-/flyfotolaget på kartet.',
    license: 'Brukes med kreditering på kartet',
    url: 'https://www.esri.com'
  },
  {
    name: 'OpenStreetMap-bidragsytere',
    what: 'Gatekartlaget («Kart») som dekker områder utenfor Kartverkets dekning.',
    license: 'ODbL',
    url: 'https://www.openstreetmap.org/copyright'
  },
  {
    name: 'Kindwise (Plant.id)',
    what: 'AI-bildegjenkjenning i «Identifiser sopp» (kommersiell tjeneste, ikke åpne data).',
    license: 'Tjenestevilkår',
    url: 'https://www.kindwise.com'
  }
];

export default function DataSourcesPage() {
  return (
    <PageWrapper>
      <section className="space-y-4">
        <header className="pt-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-forest-900">
            <Database className="h-6 w-6" /> Datakilder
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            Mycelet er bygget på åpne, offentlige data. Soppkartet og prediksjonene hadde ikke vært mulige uten
            disse kildene — tusen takk til institusjonene og alle som rapporterer funn. Her er hva vi bruker, og
            under hvilke lisenser.
          </p>
        </header>

        <ul className="space-y-3">
          {SOURCES.map((source) => (
            <li key={source.name} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-forest-900 hover:underline"
                >
                  {source.name}
                </a>
                <span className="rounded-full bg-forest-50 px-2.5 py-1 text-xs font-medium text-forest-900">
                  {source.license}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-700">{source.what}</p>
            </li>
          ))}
        </ul>

        <p className="text-xs text-gray-600">
          Funndata fra GBIF importeres utelukkende under CC0 1.0 eller CC BY 4.0, og lisens + datasett lagres per
          post. Prediksjonene er Mycelets egne beregninger basert på kildene over — feil i vurderingene er våre,
          ikke kildenes.
        </p>
      </section>
    </PageWrapper>
  );
}
