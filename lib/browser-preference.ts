type BrowserPreferenceOptions<T extends string> = {
  key: string;
  defaultValue: T;
  values: readonly T[];
  onValue?: (value: T) => void;
};

export function createBrowserPreferenceStore<T extends string>({
  key,
  defaultValue,
  values,
  onValue,
}: BrowserPreferenceOptions<T>) {
  const eventName = `${key}:changed`;
  let memoryValue = defaultValue;

  const read = (): T => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored && values.includes(stored as T)) {
        memoryValue = stored as T;
      }
    } catch {
      // The in-memory value keeps controls working when storage is unavailable.
    }
    return memoryValue;
  };

  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => undefined;
    const handlePreferenceChange = () => {
      const value = read();
      onValue?.(value);
      onStoreChange();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) handlePreferenceChange();
    };

    onValue?.(read());
    window.addEventListener("storage", handleStorage);
    window.addEventListener(eventName, handlePreferenceChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(eventName, handlePreferenceChange);
    };
  };

  const set = (value: T) => {
    memoryValue = value;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Persistence is optional; the current tab still updates immediately.
    }
    onValue?.(value);
    window.dispatchEvent(new Event(eventName));
  };

  return {
    getSnapshot: read,
    getServerSnapshot: () => defaultValue,
    subscribe,
    set,
  };
}
