'use client';

import { requestAnalyticsConsentChoice } from '@/lib/analytics';

interface AnalyticsPreferencesButtonProps {
  label: string;
}

export function AnalyticsPreferencesButton({ label }: AnalyticsPreferencesButtonProps) {
  return (
    <button
      type="button"
      onClick={requestAnalyticsConsentChoice}
      className="rounded-lg border border-forest-700 px-3 py-2 text-sm font-medium text-forest-800 hover:bg-forest-50 focus:outline-none focus:ring-2 focus:ring-forest-400"
    >
      {label}
    </button>
  );
}
