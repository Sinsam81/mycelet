import { Database } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';

export async function generateMetadata() {
  const t = await getTranslations('Datakilder');
  return {
    title: t('metaTitle'),
    description: t('metaDescription')
  };
}

interface SourceEntry {
  name: string;
  whatKey: string;
  license: string;
  url: string;
}

const SOURCES: SourceEntry[] = [
  {
    name: 'Artsdatabanken / GBIF',
    whatKey: 'sourceGbif',
    license: 'CC0 1.0 / CC BY 4.0',
    url: 'https://www.gbif.org'
  },
  {
    name: 'NIBIO — SR16 skogressurskart',
    whatKey: 'sourceNibio',
    license: 'NLOD / CC BY 4.0',
    url: 'https://www.nibio.no'
  },
  {
    name: 'Kartverket',
    whatKey: 'sourceKartverket',
    license: 'CC BY 4.0',
    url: 'https://www.kartverket.no'
  },
  {
    name: 'Meteorologisk institutt (MET Norway)',
    whatKey: 'sourceMet',
    license: 'NLOD / CC BY 4.0',
    url: 'https://www.met.no'
  },
  {
    name: 'SMHI Öppna data',
    whatKey: 'sourceSmhi',
    license: 'CC BY 4.0',
    url: 'https://www.smhi.se'
  },
  {
    name: 'Copernicus / EEA — CORINE Land Cover',
    whatKey: 'sourceCorine',
    license: 'sourceCorineLicense',
    url: 'https://land.copernicus.eu'
  },
  {
    name: 'Esri, Maxar, Earthstar Geographics',
    whatKey: 'sourceEsri',
    license: 'sourceEsriLicense',
    url: 'https://www.esri.com'
  },
  {
    name: 'OpenStreetMap-bidragsytere',
    whatKey: 'sourceOsm',
    license: 'ODbL',
    url: 'https://www.openstreetmap.org/copyright'
  },
  {
    name: 'Kindwise (Plant.id)',
    whatKey: 'sourceKindwise',
    license: 'sourceKindwiseLicense',
    url: 'https://www.kindwise.com'
  }
];

const TRANSLATED_LICENSE_KEYS = new Set([
  'sourceCorineLicense',
  'sourceEsriLicense',
  'sourceKindwiseLicense'
]);

export default async function DataSourcesPage() {
  const t = await getTranslations('Datakilder');

  return (
    <PageWrapper>
      <section className="space-y-4">
        <header className="pt-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-forest-900">
            <Database className="h-6 w-6" /> {t('heading')}
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            {t('intro')}
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
                  {TRANSLATED_LICENSE_KEYS.has(source.license) ? t(source.license) : source.license}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-700">{t(source.whatKey)}</p>
            </li>
          ))}
        </ul>

        <p className="text-xs text-gray-600">
          {t('footnote')}
        </p>
      </section>
    </PageWrapper>
  );
}
