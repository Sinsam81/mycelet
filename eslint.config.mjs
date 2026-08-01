import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// Bakgrunn: `npm run lint` kjørte «next lint», som ble fjernet i Next 16 —
// og eslint var ikke installert i det hele tatt. Kommandoen har derfor aldri
// virket i dette prosjektet. Dette er første fungerende oppsett.
//
// eslint-config-next 16 leverer ferdig flat config, så ingen FlatCompat-bro.

export default [
  {
    // Alt som ikke er kildekoden vår. Merk .claude/ — der ligger git-worktrees
    // med hele repoet kopiert; uten dette linter vi åtte kopier av oss selv.
    ignores: [
      'node_modules/**',
      '.next/**',
      '.claude/**',
      'android/**',
      'ios/**',
      'public/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'supabase/functions/**',
      // iCloud-dubletter («routes.d 3.ts»). Se tsconfig.json for samme mønster.
      '**/* [0-9]*'
    ]
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Vi bruker bevisst `any` i noen adaptere mot eksterne API-er der formen
      // ikke er kjent på forhånd. Verdt å rydde, men skal ikke stoppe et bygg.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Understrek-prefiks er den etablerte måten å si «med vilje ubrukt».
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],

      // ── React 19 / compiler-reglene ───────────────────────────────────────
      // Disse er nye i eslint-plugin-react-hooks og traff 22 steder første
      // gang linting i det hele tatt ble kjørt i dette prosjektet. De peker på
      // ekte teknisk gjeld — setState i useEffect gir en ekstra render — men:
      //
      //   • ingen av dem er en aktiv feil (appen er live og fungerer),
      //   • flere er falske positive (window.location i en event-handler,
      //     useRef(...).current-idiomet i MushroomMap),
      //   • å rette 22 hooks-mønstre i kart, analyse og onboarding samtidig er
      //     en refaktorering med reell regresjonsrisiko på et produkt i drift.
      //
      // Derfor: advarsel, ikke feil. Gjelden er synlig i hver lint-kjøring og
      // skal jobbes ned komponent for komponent, ikke i én stor omskriving.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn'
    }
  },
  {
    // Node-scripts og e2e kjører utenfor Next-runtime og har andre premisser.
    files: ['scripts/**/*.{js,mjs,ts}', '*.config.{js,mjs,ts}', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off'
    }
  },
  {
    // Playwright-fixtures kaller `use()` — plugin-en tror det er en React-hook
    // fordi navnet begynner på «use». Det er det ikke.
    files: ['e2e/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off'
    }
  }
];
