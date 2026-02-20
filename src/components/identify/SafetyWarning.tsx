'use client';

import Link from 'next/link';
import { AlertTriangle, Info, Phone } from 'lucide-react';

interface SafetyWarningProps {
  level: 'info' | 'caution' | 'danger';
  edibility?: string;
}

export function SafetyWarning({ level, edibility }: SafetyWarningProps) {
  if (level === 'danger' || edibility === 'deadly' || edibility === 'toxic') {
    return (
      <div className="mb-4 rounded-xl border-2 border-red-500 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-6 w-6 flex-shrink-0 text-red-600" />
          <div>
            <h3 className="text-lg font-bold text-red-800">ADVARSEL: Mulig giftig sopp</h3>
            <p className="mt-1 text-red-700">
              Denne soppen kan være giftig eller dødelig. AI gir kun sannsynlig art. Spis aldri uten bekreftelse fra kvalifisert ekspert.
            </p>
            <div className="mt-3 flex items-center gap-2 text-red-700">
              <Phone className="h-4 w-4" />
              <span className="text-sm font-medium">Giftinformasjonen: 22 59 13 00</span>
            </div>
            <Link href="https://soppkontroll.no" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-red-800 underline">
              Få vurdering hos Soppkontrollen
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div>
          <h3 className="font-semibold text-amber-800">AI-identifikasjon er kun veiledende</h3>
          <p className="mt-1 text-sm text-amber-700">
            Resultatet er kun veiledende (sannsynlig art). Spis aldri sopp du ikke er 100% sikker på.
          </p>
          <Link href="https://soppkontroll.no" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-amber-800 underline">
            Sjekk med Soppkontrollen
          </Link>
        </div>
      </div>
    </div>
  );
}
