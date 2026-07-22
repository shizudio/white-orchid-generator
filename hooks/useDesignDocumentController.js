import { useReducer, useRef } from "react";
import {
  applyDesignCommand,
  createDesignDocumentV1,
  designDocumentReducer,
} from "@/lib/design-document.mjs";

/** Canonical DesignDocument projection and its typed command surface. */
export function useDesignDocumentController({ initialImage, freshFontSizes, freshTypeLayouts }) {
  const [designDocument, reduceDesignDocument] = useReducer(
    designDocumentReducer,
    undefined,
    () => createDesignDocumentV1({
      typography:{
        heroRegister:"",
        fontSizes:freshFontSizes(),
        masterLayouts:freshTypeLayouts(),
        formatLayouts:{},
        roleOffsetsByFormat:{},
      },
      media:{ source:initialImage, kind:"image" },
    }),
  );
  const designDocumentRef = useRef(designDocument);
  designDocumentRef.current = designDocument;
  const commandPathCollectorRef = useRef(null);
  const dispatchDesignCommand = command => {
    const result = applyDesignCommand(designDocumentRef.current, command);
    designDocumentRef.current = result.document;
    if (commandPathCollectorRef.current && result.changedPaths.length) {
      commandPathCollectorRef.current.push(...result.changedPaths);
    }
    reduceDesignDocument(command);
    return result;
  };

  const { content, palette, typography, media, logo, composition } = designDocument;

  return {
    designDocument,
    commandPathCollectorRef,
    dispatchDesignCommand,
    headline:content.headline,
    subtext:content.subtext,
    attribution:content.attribution,
    dateText:content.dateText,
    microLabel:content.microLabel,
    pillText:content.pillText,
    copyAuthors:content.authorship,
    bgColor:palette.background,
    fieldColorOverride:palette.field,
    bgAlpha:palette.backgroundOpacity,
    textColorId:palette.text,
    backdropMode:palette.backdrop,
    pinnedProps:palette.pins,
    heroRegister:typography.heroRegister,
    fontSizes:typography.fontSizes,
    typeLayouts:typography.masterLayouts,
    typeLayoutsByDim:typography.formatLayouts,
    roleOffsetsByDim:typography.roleOffsetsByFormat,
    image:media.source,
    mediaKind:media.kind,
    photoTreatment:media.treatment,
    photoFrame:media.frame,
    imgT:media.masterTransform,
    imgTByDim:media.formatTransforms,
    photoTouchedByDim:media.formatPins,
    selectedLogoId:logo.assetId,
    logoHidden:logo.hidden,
    userLogoTouched:logo.placementPinned,
    logoPosition:logo.masterPlacement.position,
    logoSize:logo.masterPlacement.sizeId,
    logoFreePos:logo.masterPlacement.free,
    logoByDim:logo.formatPlacements,
    postType:composition.postType,
    archetypeId:composition.archetypeId,
    archVariant:composition.archetypeVariant,
    overlayLayers:designDocument.shapes,
    furnitureOverrides:designDocument.furniture.overrides || {},
  };
}
