import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
    'transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50 ' +
    'whitespace-nowrap [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-clay text-white hover:bg-clay-hover',
        secondary: 'bg-surface text-ink border border-line-strong hover:bg-sand',
        ghost: 'text-ink-muted hover:bg-sand hover:text-ink',
        danger: 'bg-danger text-white hover:bg-danger/90',
        link: 'text-clay underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm: 'h-8 px-3 text-body-sm',
        md: 'h-10 px-4 text-body-sm',
        lg: 'h-12 px-6 text-body',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';

export { buttonVariants };
