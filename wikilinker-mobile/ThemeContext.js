// ThemeContext.js — WikiLinker global theme (Single Source of Truth)
//
// WHY A SEPARATE FILE (small deviation from "create it in App.js"):
// App.js imports HomeScreen; if HomeScreen then imported ThemeContext back
// out of App.js, that's a circular dependency — the exact kind of thing that
// works in dev and explodes after a Metro cache change. The context lives
// here; App.js OWNS the provider by wrapping the tree in <ThemeProvider>.
//
// Consumers use either:
//   const { colors, isDarkMode, toggleTheme } = React.useContext(ThemeContext);
// or the convenience hook:
//   const { colors, isDarkMode, toggleTheme } = useTheme();
//
// The chosen mode persists across launches via AsyncStorage.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@wikilinker/theme_v1';

// ---------------------------------------------------------------------------
// PALETTES — same ROLE names in both modes, so every component styles
// against roles ("ink" = background, "paper" = text) and flips for free.
// ---------------------------------------------------------------------------
export const DARK_COLORS = {
  ink: '#0E1013',        // app background
  inkRaised: '#171A20',  // cards, sheets
  paper: '#F5F2EA',      // primary text
  paperDim: '#9AA0AB',   // secondary text
  link: '#3B82F6',       // primary actions
  linkPressed: '#2563EB',
  visited: '#8B5CF6',    // other players / accolades
  gold: '#F5C542',       // 1st place / records
  danger: '#FF4D4D',     // sudden death / destructive
  hairline: '#2A2E36',
  scrim: 'rgba(0,0,0,0.6)',   // modal backdrops
};

export const LIGHT_COLORS = {
  ink: '#F7F5F0',        // app background — warm paper white
  inkRaised: '#ECE9E1',  // cards, sheets — slightly toasted
  paper: '#16181D',      // primary text — near-black ink
  paperDim: '#5B6068',   // secondary text
  link: '#2563EB',       // classic hyperlink blue holds up on cream
  linkPressed: '#1D4ED8',
  visited: '#7C3AED',
  gold: '#A8821B',       // darkened for contrast on light backgrounds
  danger: '#D92D2D',
  hairline: '#D8D4CA',
  scrim: 'rgba(20,18,12,0.45)',
};

// ---------------------------------------------------------------------------
// CONTEXT + PROVIDER
// ---------------------------------------------------------------------------
export const ThemeContext = createContext({
  isDarkMode: true,
  colors: DARK_COLORS,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Hydrate the saved preference once at boot.
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((saved) => {
        if (saved === 'light') setIsDarkMode(false);
        if (saved === 'dark') setIsDarkMode(true);
      })
      .catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light').catch(() => {});
      return next;
    });
  }, []);

  // Memoized so consumers only re-render on an actual theme flip.
  const value = useMemo(
    () => ({
      isDarkMode,
      colors: isDarkMode ? DARK_COLORS : LIGHT_COLORS,
      toggleTheme,
    }),
    [isDarkMode, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
