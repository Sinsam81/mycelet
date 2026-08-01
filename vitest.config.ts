import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

// Mirrors the `@/*` path alias from tsconfig.json so vitest can resolve
// imports the same way Next / Webpack do at runtime. Without this,
// importing a source file that itself uses '@/...' will fail to load
// in tests even if no test imports via '@/' directly.

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  test: {
    // Uten en eksplisitt exclude samlet vitest opp ALLE git-worktrees under
    // .claude/worktrees/ — åtte gamle kopier av dette repoet. Det ga 299
    // testfiler i stedet for 43, og «feil» som egentlig var utdaterte kopier
    // av tester vi for lengst har rettet. En ekstern revisjon rapporterte 14
    // slike spøkelsesfeil som ekte regresjoner.
    //
    // Kjør alltid mot ÉN kopi av kildekoden: den vi står i.
    exclude: [
      ...configDefaults.exclude,
      '**/.claude/**',
      '**/.next/**',
      '**/android/**',
      '**/ios/**',
      '**/e2e/**',
      '**/playwright-report/**',
      // iCloud lager dublettfiler i synkede mapper, og skyter tallet inn foran
      // SISTE punktum: «routes.d.ts» blir «routes.d 3.ts», «a.test.ts» blir
      // «a.test 2.ts». Mønsteret må derfor tåle at det står noe etter tallet.
      // Ingen ekte fil i repoet har mellomrom i navnet (sjekket mot git
      // ls-files), så det er trygt å ta alt som har det.
      '**/* [0-9]*'
    ]
  }
});
