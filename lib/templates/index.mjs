/* The published template registry. §12: ONE template first, end to end. */
import { TEMPLATE_LABEL_HEADLINE } from './template-label-headline.mjs';

export const TEMPLATES = Object.freeze([TEMPLATE_LABEL_HEADLINE]);

export function templateById(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

/** The template the user app opens on. No gallery in v1 (one template). */
export const DEFAULT_TEMPLATE_ID = TEMPLATE_LABEL_HEADLINE.id;

export { TEMPLATE_LABEL_HEADLINE };
