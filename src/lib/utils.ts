import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge has to be told about our custom type scale.
 *
 * It resolves conflicts by class *group*, and it classifies unknown `text-*`
 * utilities by guessing. `text-body-sm` is a font size, but it looks exactly
 * like a colour utility, so `cn('bg-clay text-white', 'text-body-sm')` silently
 * dropped `text-white` — every primary and danger button on the site rendered
 * ink text on clay instead of white. It stayed invisible for two phases because
 * dark-on-clay is legible; only a contrast audit found it.
 *
 * Registering the scale makes size and colour distinct groups again, so both
 * survive the merge.
 */
const TYPE_SCALE = [
  'display-1',
  'display-2',
  'h1',
  'h2',
  'h3',
  'body-lg',
  'body',
  'body-sm',
  'caption',
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: TYPE_SCALE }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
