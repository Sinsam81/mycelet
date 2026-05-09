'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { RetentionWarningBanner } from './RetentionWarningBanner';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (error) {
        console.error('Service worker registration failed', error);
      }
    };

    void register();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RetentionWarningBanner />
      {children}
      {/* App-wide toast notifications. Position bottom-center stays out of
          the way of the cookie banner (also bottom) on first visit because
          the cookie banner has higher z-index and dismisses quickly. */}
      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 4000,
          style: {
            fontSize: '14px',
            maxWidth: '420px'
          },
          success: { iconTheme: { primary: '#1A3409', secondary: '#fff' } }
        }}
      />
    </QueryClientProvider>
  );
}
