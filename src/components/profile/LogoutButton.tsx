'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { nullstillDelingsnivaStandard } from '@/lib/findings/delingsniva';

export function LogoutButton() {
  const t = useTranslations('LogoutButton');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Husket delingsnivå er enhetsglobalt — ryddes ved utlogging (delt enhet).
    nullstillDelingsnivaStandard();
    router.push('/auth/login');
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" />
      {loading ? t('loggingOut') : t('logOut')}
    </button>
  );
}
