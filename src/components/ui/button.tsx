import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn/ui composition, styled with the existing ClassSync theme tokens.
const buttonVariants = cva('ui-button', {
  variants: {
    variant: {
      default: 'primary-button',
      outline: 'secondary-button',
      ghost: 'ui-button-ghost',
    },
    size: { default: '', sm: 'ui-button-sm', icon: 'ui-button-icon' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

function Button({
  className, variant, size, asChild = false, type, ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp data-slot="button" type={asChild ? undefined : type ?? 'button'} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
