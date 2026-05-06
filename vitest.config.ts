import { defineConfig } from 'vitest/config';
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
  }
});
