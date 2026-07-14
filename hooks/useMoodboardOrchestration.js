import { addMoodboardItem, listMoodboard, removeMoodboardItem } from "@/lib/moodboard";

/** Owns the external-inspiration catalogue, image intake, and removal workflow. */
export function useMoodboardOrchestration({
  actionsRef,
  compressImage,
  setMoodboard,
  setMoodboardConfigured,
  enlargedItem,
  setEnlargedItem,
}) {
  const loadMoodboard = async () => {
    try {
      const { configured, items } = await listMoodboard();
      setMoodboard(Array.isArray(items) ? items : []);
      setMoodboardConfigured(!!configured);
    } catch {}
  };
  actionsRef.current = { load: loadMoodboard };

  const addMoodboardFile = async file => {
    if (!file || !file.type?.startsWith("image/")) return;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const thumbnail = await compressImage(dataUrl, 480, 0.72);
      const { item } = await addMoodboardItem({ image: thumbnail, note: "" });
      setMoodboard(previous => [item, ...previous.filter(candidate => candidate.id !== item.id)]);
    } catch {}
  };

  const deleteMoodboardItem = async id => {
    setMoodboard(previous => previous.filter(item => item.id !== id));
    if (enlargedItem?.id === id) setEnlargedItem(null);
    await removeMoodboardItem(id);
  };

  return { addMoodboardFile, deleteMoodboardItem };
}
