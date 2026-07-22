import { getDesignWorkflowEffectError } from "./design-workflow-effects.mjs";

/** Execute compiled one-command patch entries and report canonical patch fields. */
export function executeDesignCommandEntries(entries, { dispatchCommand } = {}) {
  if (!Array.isArray(entries) || typeof dispatchCommand !== "function") return [];
  const changedFields = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || !entry.command) continue;
    const result = dispatchCommand(entry.command);
    if (Array.isArray(result?.changedPaths) && result.changedPaths.length && typeof entry.patchField === "string") {
      changedFields.push(entry.patchField);
    }
  }
  return changedFields;
}

/**
 * Execute planned command/effect groups and report only fields whose commands
 * produced canonical document changes. Effects still run for planned no-ops:
 * restoring an already-current media source may still need a fresh decode.
 */
export function executeDesignWorkflowGroups(groups, {
  dispatchCommand,
  applyEffects,
  onInvalidEffect,
}) {
  if (!Array.isArray(groups) || typeof dispatchCommand !== "function") return [];
  const changedFields = [];
  for (const [groupIndex, workflowGroup] of groups.entries()) {
    if (!workflowGroup || typeof workflowGroup !== "object") continue;
    let commandChanged = false;
    for (const command of (Array.isArray(workflowGroup.commands) ? workflowGroup.commands : [])) {
      const result = dispatchCommand(command);
      if (Array.isArray(result?.changedPaths) && result.changedPaths.length) commandChanged = true;
    }
    const validEffects = [];
    const effects = Array.isArray(workflowGroup.effects) ? workflowGroup.effects : [];
    for (const [effectIndex, effect] of effects.entries()) {
      const error = getDesignWorkflowEffectError(effect);
      if (!error) validEffects.push(effect);
      else if (typeof onInvalidEffect === "function") {
        onInvalidEffect(effect, { error, groupIndex, effectIndex });
      }
    }
    if (typeof applyEffects === "function") applyEffects(validEffects);
    if (commandChanged && Array.isArray(workflowGroup.changedFields)) {
      changedFields.push(...workflowGroup.changedFields);
    }
  }
  return changedFields;
}
