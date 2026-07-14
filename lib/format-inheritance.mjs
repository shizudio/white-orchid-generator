const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

export function resolveInheritedValue({ master, byFormat = {} }, formatId, masterFormatId, derive) {
  if (own(byFormat, formatId)) return { value:byFormat[formatId], source:"override" };
  if (formatId === masterFormatId) return { value:master, source:"master" };
  return { value:typeof derive === "function" ? derive(master, formatId) : master, source:"derived" };
}

export function setInheritedValue(state, formatId, masterFormatId, value) {
  if (formatId === masterFormatId) return { ...state, master:value };
  return { ...state, byFormat:{ ...(state.byFormat || {}), [formatId]:value } };
}

export function resetInheritedFormat(state, formatId, masterFormatId) {
  if (formatId === masterFormatId) return state;
  const byFormat = { ...(state.byFormat || {}) };
  delete byFormat[formatId];
  return { ...state, byFormat };
}

export function hasInheritedOverride(state, formatId, masterFormatId) {
  return formatId !== masterFormatId && own(state?.byFormat, formatId);
}
