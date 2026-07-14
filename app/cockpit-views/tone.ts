import type { Tone } from '@/lib/cockpit/render-model';

/** Tone -> hex, aligned with the cockpit design system (monochrome + accent). */
export function toneColor(tone: Tone | undefined): string {
  switch (tone) {
    case 'positive':
      return '#5a8f7a';
    case 'caution':
      return '#4a7186';
    case 'critical':
      return '#c25a4a';
    case 'accent':
      return '#4a7186';
    default:
      return '#6b7689';
  }
}
