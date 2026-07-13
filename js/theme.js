/**
 * theme.js
 * Dark/light mode toggle. Persists choice in localStorage and
 * defaults to the user's OS-level preference on first visit.
 */

const Theme = {
  STORAGE_KEY: "ca_theme",

  init() {
    const saved = localStorage.getItem(Theme.STORAGE_KEY);
    const prefersDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    Theme.apply(theme);

    const toggleBtn = document.getElementById("themeToggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", Theme.toggle);
    }
  },

  apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(Theme.STORAGE_KEY, theme);
    const toggleBtn = document.getElementById("themeToggle");
    if (toggleBtn) {
      toggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
      toggleBtn.setAttribute(
        "aria-label",
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      );
    }
  },

  toggle() {
    const current = document.documentElement.getAttribute("data-theme");
    Theme.apply(current === "dark" ? "light" : "dark");
  },
};
