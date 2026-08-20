import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-[1280px] px-4 md:px-8', className)}>{children}</div>;
}
