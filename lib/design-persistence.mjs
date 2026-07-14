import { designDocumentToLegacyFields, migrateDesignDocument } from "./design-document.mjs";

export const PERSISTED_DESIGN_VERSION=1;

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
export const acknowledgementMapToArray = map => Object.entries(map||{}).map(([key,value])=>({key,...clone(value)}));
export const acknowledgementArrayToMap = list => Object.fromEntries((Array.isArray(list)?list:[]).filter(item=>item?.key).map(({key,...value})=>[key,value]));

export function createPersistedDesignPayload(document,{dimensionId="ig_portrait",exportFormat="png",revision=1}={},acknowledgements={}) {
  const canonical=migrateDesignDocument(document);
  return {
    persistenceVersion:PERSISTED_DESIGN_VERSION,
    document:{...canonical,acknowledgements:acknowledgementMapToArray(acknowledgements)},
    metadata:{dimensionId,exportFormat,revision:Math.max(1,Number.isInteger(revision)?revision:1)},
  };
}

export function readPersistedDesignPayload(source) {
  if(source?.persistenceVersion===PERSISTED_DESIGN_VERSION&&source.document){
    const document=migrateDesignDocument(source.document);
    return {document,metadata:{dimensionId:source.metadata?.dimensionId||"ig_portrait",exportFormat:source.metadata?.exportFormat||"png",revision:Math.max(1,source.metadata?.revision||1)},acknowledgements:acknowledgementArrayToMap(document.acknowledgements)};
  }
  const document=migrateDesignDocument(source||{});
  return {
    document,
    metadata:{dimensionId:source?.dimensionId||"ig_portrait",exportFormat:source?.exportFormat||"png",revision:1},
    acknowledgements:source?.acks&&typeof source.acks==="object"?clone(source.acks):acknowledgementArrayToMap(document.acknowledgements),
  };
}

// Temporary adapter only for code paths that still consume the old flat view.
export function persistedDesignToLegacyView(payload) {
  const restored=readPersistedDesignPayload(payload);
  return {...designDocumentToLegacyFields(restored.document),...restored.metadata,acks:restored.acknowledgements};
}

/** Migrate a collection while retaining exact legacy records for one-click rollback. */
export function migratePersistedDesignCollection(records, { getPayload=item=>item?.state, setPayload=(item,state)=>({...item,state}) } = {}) {
  const migrated=[],backups=[];
  const telemetry={attempted:0,succeeded:0,failed:0,alreadyCurrent:0};
  for(const item of Array.isArray(records)?records:[]){
    const source=getPayload(item);
    if(source?.persistenceVersion===PERSISTED_DESIGN_VERSION){migrated.push(clone(item));telemetry.alreadyCurrent++;continue;}
    telemetry.attempted++;
    try{
      const restored=readPersistedDesignPayload(source);
      backups.push(clone(item));
      migrated.push(setPayload(clone(item),createPersistedDesignPayload(restored.document,restored.metadata,restored.acknowledgements)));
      telemetry.succeeded++;
    }catch{
      migrated.push(clone(item));telemetry.failed++;
    }
  }
  return {migrated,backups,telemetry};
}
