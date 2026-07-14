/** Memoises expensive decoded-asset analysis without coupling it to React/canvas. */
export function createAssetAnalysisCache() {
  const cache=new WeakMap();
  return {
    get(asset, analyze) {
      if (!asset || (typeof asset !== "object" && typeof asset !== "function")) return analyze(asset);
      if (cache.has(asset)) return cache.get(asset);
      const result=analyze(asset);
      cache.set(asset,result);
      return result;
    },
    invalidate(asset) { if(asset) cache.delete(asset); },
  };
}

