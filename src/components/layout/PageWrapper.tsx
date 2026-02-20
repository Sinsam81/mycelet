import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { Header } from './Header';

interface PageWrapperProps {
  children: ReactNode;
}

export function PageWrapper({ children }: PageWrapperProps) {
  return (
    <div className="min-h-screen pb-20">
      <Header />
      <main className="mx-auto w-full max-w-screen-md px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}
