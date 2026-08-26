/* Render the three published /post templates for the landing-page gallery.
   These are not hand-made mockups: every PNG goes through the same template
   registry and canvas render core as the composer. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openHarness, REPO_ROOT } from './template-harness.mjs';
import { TEMPLATE_PETAL_WINDOW, TEMPLATE_CAPTION_BAND } from '../../lib/templates/index.mjs';
import { templateMaskAsset } from '../../lib/templates/mask-assets.mjs';
import { templateMotifAsset } from '../../lib/templates/motif-assets.mjs';

const OUT_DIR = join(REPO_ROOT, 'public', 'assets', 'post-template-samples');
const PHOTO_SRC = '/generated/.photo-cache/002.jpg';

const PREVIEWS = [
  {
    templateId: 'label_headline',
    filename: 'classic-portrait.png',
    pairId: 'blush',
    values: {
      eyebrow: 'OUR BELIEF',
      heading: 'Every child can lead their own day',
      body: 'A thoughtful place to learn and grow.',
      logoPosition: 'bottom-right',
    },
  },
  {
    templateId: 'petal_window',
    filename: 'petal-window-portrait.png',
    pairId: 'sage',
    maskSrc: templateMaskAsset(TEMPLATE_PETAL_WINDOW)?.src
      ? `/public${templateMaskAsset(TEMPLATE_PETAL_WINDOW).src}`
      : null,
    values: {
      heading: 'Where curious minds grow',
      logoPosition: 'bottom-left',
    },
  },
  {
    templateId: 'caption_band',
    filename: 'caption-band-portrait.png',
    pairId: 'forest',
    motifSrc: templateMotifAsset(TEMPLATE_CAPTION_BAND)?.src
      ? `/public${templateMotifAsset(TEMPLATE_CAPTION_BAND).src}`
      : null,
    values: {
      heading: 'Places for the new term are now open',
      pill: 'ENROL NOW',
      logoPosition: 'top-right',
    },
  },
];

function decodeDataUrl(data) {
  return Buffer.from(data.split(',')[1], 'base64');
}

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });
  const harness = await openHarness();

  try {
    const renders = await harness.page.evaluate(async ({ previews, photoSrc }) => {
      const { DIMENSIONS, templateById, renderTemplate } = window.__wo;
      const loadImage = (src) => new Promise((resolve) => {
        if (!src) return resolve(null);
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      });

      const photoImage = await loadImage(photoSrc);
      if (!photoImage) throw new Error(`Gallery photo failed to load: ${photoSrc}`);

      const output = [];
      for (const preview of previews) {
        const template = templateById(preview.templateId);
        if (!template) throw new Error(`Unknown gallery template: ${preview.templateId}`);
        const pair = template.colourPairs.find((candidate) => candidate.id === preview.pairId);
        if (!pair) throw new Error(`Unknown colour pair: ${preview.templateId}/${preview.pairId}`);

        const [logoImage, maskImage, motifImage] = await Promise.all([
          loadImage('/public' + template.logoAssets[pair.klass]),
          loadImage(preview.maskSrc),
          loadImage(preview.motifSrc),
        ]);
        if (!logoImage) throw new Error(`Gallery logo failed to load: ${preview.templateId}`);
        if (preview.maskSrc && !maskImage) throw new Error(`Gallery mask failed to load: ${preview.templateId}`);
        if (preview.motifSrc && !motifImage) throw new Error(`Gallery motif failed to load: ${preview.templateId}`);

        const canvas = document.createElement('canvas');
        canvas.width = DIMENSIONS.portrait.w;
        canvas.height = DIMENSIONS.portrait.h;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const truth = renderTemplate(context, template, 'portrait', {
          ...preview.values,
          colourPairId: preview.pairId,
          photoImage,
          logoImage,
          logoInk: pair.klass === 'dark' ? '#F5F6E7' : '#254E48',
          maskImage,
          motifImage,
        }, {});

        output.push({
          filename: preview.filename,
          data: canvas.toDataURL('image/png'),
          missingRequired: truth.missingRequired,
          missingAssets: truth.missingAssets,
          contrastFailures: truth.contrastFailures,
        });
      }
      return output;
    }, { previews: PREVIEWS, photoSrc: PHOTO_SRC });

    const failures = [];
    for (const render of renders) {
      writeFileSync(join(OUT_DIR, render.filename), decodeDataUrl(render.data));
      if (render.missingRequired.length || render.missingAssets.length || render.contrastFailures.length) {
        failures.push(`${render.filename}: ${JSON.stringify({
          missingRequired: render.missingRequired,
          missingAssets: render.missingAssets,
          contrastFailures: render.contrastFailures,
        })}`);
      }
    }
    if (harness.errors.length) failures.push(...harness.errors);
    if (failures.length) throw new Error(failures.join('\n'));
    console.log(`Rendered ${renders.length} live template previews to ${OUT_DIR}`);
  } finally {
    await harness.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
