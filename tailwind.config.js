/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Rounded, friendly faces — the IISU / eShop launcher look.
        sans: [
          "Nunito",
          "Quicksand",
          "ui-rounded",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        display: ["Baloo 2", "Nunito", "ui-rounded", "system-ui", "sans-serif"],
      },
      fontWeight: {
        400: "400",
        500: "500",
        600: "600",
        700: "700",
        800: "800",
        900: "900",
      },
      colors: {
        // IISU "paper" greys.
        paper: {
          DEFAULT: "#f2f3f5",
          edge: "#d9dbe0",
          dot: "#dfe1e6",
        },
        // Glossy light tile surface.
        tile: {
          top: "#f5f6f8",
          bottom: "#dde0e6",
          flat: "#e8eaee",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          soft: "rgb(var(--ink-soft) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
        mint: {
          DEFAULT: "#74dcb6",
          deep: "#4cc79c",
        },
        // Category accent colors (used for glow frames + small chips).
        cat: {
          exercise: "#ff7a59",
          instrument: "#a06bff",
          project: "#4aa3ff",
          chores: "#2bc4a8",
          health: "#ff77b0",
          learning: "#ffb43d",
          other: "#8b97a8",
        },
      },
      borderRadius: {
        tile: "1.5rem",
        pill: "999px",
      },
      boxShadow: {
        // Glossy light tile: drop shadow + top inner highlight + bottom inner bevel.
        tile: "0 8px 16px -8px rgba(70,80,100,0.30), inset 0 2px 1px rgba(255,255,255,0.95), inset 0 -3px 6px rgba(140,150,170,0.18)",
        "tile-press":
          "0 3px 8px -6px rgba(70,80,100,0.4), inset 0 2px 4px rgba(140,150,170,0.35)",
        panel: "0 14px 34px -14px rgba(70,80,100,0.34), inset 0 1px 0 rgba(255,255,255,0.9)",
        dock: "0 12px 30px -10px rgba(70,80,100,0.4), inset 0 2px 1px rgba(255,255,255,0.95), inset 0 -2px 4px rgba(140,150,170,0.2)",
        pill: "0 6px 16px -10px rgba(70,80,100,0.4), inset 0 1px 0 rgba(255,255,255,0.9)",
        "seg-inset":
          "inset 0 2px 5px rgba(140,150,170,0.45), inset 0 -1px 0 rgba(255,255,255,0.7)",
        soft: "0 8px 22px -12px rgba(70,80,100,0.35)",
      },
      keyframes: {
        floaty: {
          "0%,100%": { transform: "translateY(0) rotate(var(--r,0deg))" },
          "50%": { transform: "translateY(-10px) rotate(calc(var(--r,0deg) + 6deg))" },
        },
        "pop-in": {
          "0%": { transform: "scale(0.92)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "slide-up": {
          "0%": { transform: "translateY(24px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "glow-pulse": {
          "0%,100%": { filter: "brightness(1)" },
          "50%": { filter: "brightness(1.12)" },
        },
        "pulse-red": {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(255,90,90,0.5)" },
          "50%": { boxShadow: "0 0 0 7px rgba(255,90,90,0)" },
        },
      },
      animation: {
        floaty: "floaty 8s ease-in-out infinite",
        "pop-in": "pop-in 0.32s cubic-bezier(0.34,1.56,0.64,1) both",
        "slide-up": "slide-up 0.4s cubic-bezier(0.16,1,0.3,1) both",
        "glow-pulse": "glow-pulse 2.4s ease-in-out infinite",
        "pulse-red": "pulse-red 1.8s ease-out infinite",
      },
    },
  },
  plugins: [],
};
