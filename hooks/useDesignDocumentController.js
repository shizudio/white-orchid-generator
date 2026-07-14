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
  const setContentField = (field, value) => dispatchDesignCommand({ type:"content/set", field, value });
  const setPaletteField = (field, value) => dispatchDesignCommand({ type:"palette/set", field, value });
  const setTypographyField = (field, value) => dispatchDesignCommand({ type:"typography/set", field, value });
  const setMediaField = (field, value) => dispatchDesignCommand({ type:"media/set", field, value });
  const setLogoField = (field, value) => dispatchDesignCommand({ type:"logo/set", field, value });
  const setCompositionField = (field, value) => dispatchDesignCommand({ type:"composition/set", field, value });
  const commands = {
    setHeadline:value => setContentField("headline", value),
    setSubtext:value => setContentField("subtext", value),
    setAttribution:value => setContentField("attribution", value),
    setDateText:value => setContentField("dateText", value),
    setMicroLabel:value => setContentField("microLabel", value),
    setPillText:value => setContentField("pillText", value),
    setBgColor:value => setPaletteField("background", value),
    setFieldColorOverride:value => setPaletteField("field", value),
    setBgAlpha:value => setPaletteField("backgroundOpacity", value),
    setTextColorId:value => setPaletteField("text", value),
    setBackdropMode:value => setPaletteField("backdrop", value),
    setPinnedProps:pins => dispatchDesignCommand({ type:"palette/set-pins", pins }),
    setHeroRegister:value => setTypographyField("heroRegister", value),
    setFontSizes:value => setTypographyField("fontSizes", value),
    setTypeLayouts:value => setTypographyField("masterLayouts", value),
    setTypeLayoutsByDim:value => setTypographyField("formatLayouts", value),
    setRoleOffsetsByDim:value => setTypographyField("roleOffsetsByFormat", value),
    setImage:source => {
      dispatchDesignCommand({ type:"media/set-source", source });
      if (source) setMediaField("kind", "image");
    },
    setMediaKind:value => setMediaField("kind", value),
    setPhotoTreatment:value => setMediaField("treatment", value),
    setPhotoFrame:value => setMediaField("frame", value),
    setImgTByDim:value => setMediaField("formatTransforms", value),
    setPhotoTouchedByDim:value => setMediaField("formatPins", value),
    setSelectedLogoId:value => setLogoField("assetId", value),
    setLogoVariantTouched:value => setLogoField("variantPinned", value),
    setLogoHidden:value => setLogoField("hidden", value),
    setUserLogoTouched:value => setLogoField("placementPinned", value),
    setLogoPosition:value => dispatchDesignCommand({ type:"logo/merge-master-placement", patch:{ position:value } }),
    setLogoSize:value => dispatchDesignCommand({ type:"logo/merge-master-placement", patch:{ sizeId:value } }),
    setLogoFreePos:value => dispatchDesignCommand({ type:"logo/merge-master-placement", patch:{ free:value } }),
    setPostType:value => setCompositionField("postType", value),
    setArchetypeId:value => setCompositionField("archetypeId", value),
    setArchVariant:value => setCompositionField("archetypeVariant", value),
  };

  return {
    designDocument,
    commandPathCollectorRef,
    dispatchDesignCommand,
    commands,
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
