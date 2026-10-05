const STORAGE_KEY = "missapp-theme";

export const themes = {
  emerald: {
    name: "Emerald",
    description: "Classic MissApp",
    icon: "🌿"
  },
  midnight: {
    name: "Midnight",
    description: "Dark and focused",
    icon: "🌙"
  },
  ocean: {
    name: "Ocean",
    description: "Cool blue",
    icon: "🌊"
  },
  rose: {
    name: "Rose",
    description: "Soft pink",
    icon: "🌹"
  },
  sunset: {
    name: "Sunset",
    description: "Warm orange",
    icon: "🌅"
  },
  lavender: {
    name: "Lavender",
    description: "Calm purple",
    icon: "💜"
  },
  graphite: {
    name: "Graphite",
    description: "Minimal monochrome",
    icon: "◼"
  }
};

export function getTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return themes[saved] ? saved : "emerald";
  } catch {
    return "emerald";
  }
}

export function setTheme(theme) {
  const selected = themes[theme] ? theme : "emerald";
  document.documentElement.dataset.theme = selected;

  try {
    localStorage.setItem(STORAGE_KEY, selected);
  } catch {
    // Theme still works for the current session if storage is unavailable.
  }

  return selected;
}

export function initTheme() {
  return setTheme(getTheme());
}

export function themeOptions() {
  return Object.entries(themes).map(([id, theme]) => ({
    id,
    ...theme
  }));
}
