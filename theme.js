export const THEME_MODES = {
  INDIGO: 'indigo',
  CYBERPUNK: 'cyberpunk',
  NEO_RETRO: 'neo_retro',
};

export const themes = {
  [THEME_MODES.INDIGO]: {
    colors: {
      background: '#0f172a',     // Deep Slate Blue
      surface: 'rgba(30, 41, 59, 0.7)', // Semi-transparent Slate
      border: '#334155',
      primary: '#6366f1',        // Electric Violet
      secondary: '#10b981',      // Neon Mint
      accent: '#f43f5e',         // Bright Rose
      text: '#f8fafc',           // Ice White
      textMuted: '#94a3b8',      // Cool Gray
    },
    fonts: {
      heading: 'Fraunces_700Bold',
      body: 'System',
      mono: 'SpaceMono_400Regular',
    }
  },
  [THEME_MODES.CYBERPUNK]: {
    colors: {
      background: '#0a0b10',     // Pitch Black
      surface: '#12141c',        // Dark Circuit Slate
      border: '#00ff9c',         // Neon Terminal Green
      primary: '#00ff9c',        // Cyber Green
      secondary: '#ff007f',      // Acid Pink
      accent: '#00e5ff',         // Electric Cyan
      text: '#e8fdf5',           // Matrix Mint
      textMuted: '#6e7a8a',      // Dark Steel Gray
    },
    fonts: {
      heading: 'SpaceMono_700Bold',
      body: 'SpaceMono_400Regular',
      mono: 'SpaceMono_400Regular',
    }
  },
  [THEME_MODES.NEO_RETRO]: {
    colors: {
      background: '#fcfaf2',     // Warm Newsprint Cream
      surface: '#f5f2e9',        // Aged Paper
      border: '#1a1a1a',         // Hard Charcoal Ink
      primary: '#1a1a1a',        // Flat Ink Black
      secondary: '#d97706',      // Block Print Amber
      accent: '#b91c1c',         // Crimson Stamp
      text: '#1a1a1a',           // Typewriter Charcoal
      textMuted: '#575757',      // Faded Ink
    },
    fonts: {
      heading: 'Fraunces_700Bold',
      body: 'Fraunces_400Regular',
      mono: 'SpaceMono_400Regular',
    }
  }
};

// GameScreen theme tokens — Wikipedia-inspired encyclopedia palette
export const colors = {
  ink: '#FFFFFF',           // Backgrounds: brilliant clean white
  inkRaised: '#F8F9FA',     // Cards/modals: Wikipedia's official light grey container tint
  paper: '#111111',          // Main body text: deep charcoal black
  paperDim: '#54595D',       // Secondary subtitles: Wikipedia's meta slate grey
  link: '#3665D5',          // Hyperlinks: pristine Wikipedia blue
  linkPressed: '#2a4faa',   // Pressed link: slightly darker blue
  gold: '#D6A232',          // Records: sophisticated academic bronze/gold
  hairline: '#EAECF0',      // Borders: subtle book-like dividers
  danger: '#D33333',        // Errors: deep edit-rejection red
};

export const type = {
  display: 'Fraunces_700Bold',
  displayBlack: 'Fraunces_700Bold',
  mono: 'SpaceMono_400Regular',
};

export const space = (n) => n * 4;

export const radii = {
  card: 12,
  pill: 9999,
};
