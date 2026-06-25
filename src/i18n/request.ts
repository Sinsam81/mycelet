import { getRequestConfig } from 'next-intl/server';
import { getUserLocale } from './locale';

// next-intl request config (no-routing setup): resolves the active locale per
// request and loads its message catalog from /messages/<locale>.json.
export default getRequestConfig(async () => {
  const locale = await getUserLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
