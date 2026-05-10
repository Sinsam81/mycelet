import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { Header } from './Header';

interface PageWrapperProps {
  children: ReactNode;
  wide?: boolean;
}

export function PageWrapper({ children, wide }: PageWrapperProps) {
  return (
    <div className="min-h-screen pb-20">
      <Header />
      <main className={`mx-auto w-full px-4 py-4 ${wide ? 'max-w-screen-xl' : 'max-w-screen-md'}`}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
