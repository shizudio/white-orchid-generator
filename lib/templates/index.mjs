/* The published template registry. §12: ONE template first, end to end — then
   the second, once the first had surfaced the gaps (it did: per-pair scrims, a
   required slot with nothing to refuse with, and no way to mask a photo) — then
   the third, which surfaced its own (a motif that is DATA rather than a layer,
   a slot whose floor register was wrong for the job it is actually asked to do,
   and the first ink this system paints on an unknown photograph). */
import { TEMPLATE_LABEL_HEADLINE } from './template-label-headline.mjs';
import { TEMPLATE_PETAL_WINDOW } from './template-petal-window.mjs';
import { TEMPLATE_CAPTION_BAND } from './template-caption-band.mjs';

export const TEMPLATES = Object.freeze([TEMPLATE_LABEL_HEADLINE, TEMPLATE_PETAL_WINDOW, TEMPLATE_CAPTION_BAND]);

export function templateById(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

/** The template the user app opens on. */
export const DEFAULT_TEMPLATE_ID = TEMPLATE_LABEL_HEADLINE.id;

export { TEMPLATE_LABEL_HEADLINE, TEMPLATE_PETAL_WINDOW, TEMPLATE_CAPTION_BAND };
