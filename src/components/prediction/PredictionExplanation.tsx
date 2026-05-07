import { Check, CircleAlert, Info, X } from 'lucide-react';
import type { Explanation, ExplanationLevel } from '@/lib/utils/prediction-explanation';

/**
 * Render a list of prediction-explanation lines with a color-coded marker
 * per level. Pure presentational — feed it the output of buildExplanation()
 * from src/lib/utils/prediction-explanation.ts.
 *
 * No 'use client' — pure component, works in both server and client trees.
 *
 * Visual model:
 *   positive  → green check, forest accent
 *   neutral   → gray info circle
 *   negative  → red X, soft-red accent
 *
 * Compact: each line is one row with icon + text. The category is implicit
 * in ordering (season comes first, then weather, then habitat).
 */

interface Props {
  explanations: Explanation[];
  /** When true, renders a slimmer version with no card chrome. */
  inline?: boolean;
}

const LEVEL_STYLE: Record<
  ExplanationLevel,
  { icon: typeof Check; iconColor: string; textColor: string }
> = {
  positive: {
    icon: Check,
    iconColor: 'text-forest-700',
    textColor: 'text-forest-900'
  },
  neutral: {
    icon: Info,
    iconColor: 'text-gray-500',
    textColor: 'text-gray-800'
  },
  negative: {
    icon: X,
    iconColor: 'text-red-600',
    textColor: 'text-red-900'
  }
};

export function PredictionExplanation({ explanations, inline = false }: Props) {
  if (explanations.length === 0) {
    return null;
  }

  const Container = inline ? 'div' : 'article';
  const containerClasses = inline
    ? 'space-y-1.5'
    : 'space-y-2 rounded-xl border border-gray-200 bg-white p-3';

  return (
    <Container className={containerClasses}>
      {!inline ? (
        <header className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-600">
          <CircleAlert className="h-3.5 w-3.5" />
          Hvorfor er dette markert?
        </header>
      ) : null}

      <ul className="space-y-1">
        {explanations.map((line, idx) => {
          const style = LEVEL_STYLE[line.level];
          const Icon = style.icon;
          return (
            <li
              key={`${line.category}-${idx}`}
              className={`flex items-start gap-2 text-sm ${style.textColor}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconColor}`} aria-hidden="true" />
              <span>{line.text}</span>
            </li>
          );
        })}
      </ul>
    </Container>
  );
}
