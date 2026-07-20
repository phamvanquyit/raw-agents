/** Dark-only theme. Always apply `.dark` on <html>. */

export function initTheme(): void {
  const root = document.documentElement;
  root.classList.add("dark");
  root.style.colorScheme = "dark";
  try {
    localStorage.removeItem("raw-agents-theme");
  } catch {
    // ignore
  }
}
