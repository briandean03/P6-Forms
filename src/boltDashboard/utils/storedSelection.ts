import { createContext, useContext } from 'react';
export const DashboardStorageContext = createContext('bolt-dashboard');
export const useDashboardStorage = () => useContext(DashboardStorageContext);
export function readStoredStrings(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return null;
    const strings = parsed.filter((s): s is string => typeof s === "string");
    return strings;
  } catch {
    return null;
  }
}

export function writeStoredStrings(key: string, values: string[] | null): void {
  try {
    if (values !== null) localStorage.setItem(key, JSON.stringify(values));
    else localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable (private mode); selection just won't persist.
  }
}
