import { useCallback, useEffect, useState } from "react";
import { deleteIndicator, getIndicatorSource, listIndicators, saveIndicator, SavedIndicator } from "@/app/components/handlers/indicators";
import { compileFinScript, CompileResult } from "@/app/features/indicators/language/compiler";
import { useUser } from "@/app/components/provider/userprovider";

export function useSavedIndicators() {
  const { user, resolved } = useUser();
  const [items, setItems] = useState<SavedIndicator[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!resolved || !user) {
      setItems([]);
      setError(null);
      return;
    }
    try {
      setItems(await listIndicators());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load indicators");
    }
  }, [resolved, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveSource = useCallback(async (source: string): Promise<CompileResult> => {
    const result = compileFinScript(source);
    if (!result.ok) return result;
    if (!user) {
      const message = "Sign in to save indicators.";
      setError(message);
      throw new Error(message);
    }

    setBusyId("save");
    setError(null);
    try {
      await saveIndicator(result.compiled.metadata.title, source);
      await refresh();
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Failed to save indicator";
      setError(message);
      throw new Error(message);
    } finally {
      setBusyId(null);
    }
  }, [refresh, user]);

  const loadSaved = useCallback(async (id: string) => {
    if (!user) {
      const message = "Sign in to load saved indicators.";
      setError(message);
      throw new Error(message);
    }
    setBusyId(id);
    setError(null);
    try {
      return await getIndicatorSource(id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Failed to load indicator";
      setError(message);
      throw new Error(message);
    } finally {
      setBusyId(null);
    }
  }, [user]);

  const deleteSaved = useCallback(async (id: string) => {
    if (!user) {
      const message = "Sign in to delete saved indicators.";
      setError(message);
      throw new Error(message);
    }
    setBusyId(id);
    setError(null);
    try {
      await deleteIndicator(id);
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Failed to delete indicator";
      setError(message);
      throw new Error(message);
    } finally {
      setBusyId(null);
    }
  }, [refresh, user]);

  return { items, busyId, error, refresh, saveSource, loadSaved, deleteSaved };
}
