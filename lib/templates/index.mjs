/* The published template registry. §12: ONE template first, end to end — then
   the second, once the first had surfaced the gaps (it did: per-pair scrims, a
   required slot with nothing to refuse with, and no way to mask a photo). */
import { TEMPLATE_LABEL_HEADLINE } from './template-label-headline.mjs';
import { TEMPLATE_PETAL_WINDOW } from './template-petal-window.mjs';

export const TEMPLATES = Object.freeze([TEMPLATE_LABEL_HEADLINE, TEMPLATE_PETAL_WINDOW]);

export function templateById(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

/** The template the user app opens on. */
export const DEFAULT_TEMPLATE_ID = TEMPLATE_LABEL_HEADLINE.id;

export { TEMPLATE_LABEL_HEADLINE, TEMPLATE_PETAL_WINDOW };
