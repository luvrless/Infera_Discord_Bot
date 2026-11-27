/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          1000: "#030304",
          950: "#050506",
          900: "#08080a",
          850: "#0c0c0f",
          800: "#111115",
          750: "#16161b",
          700: "#1d1d24",
          650: "#24242c",
          600: "#2c2c36",
          500: "#3a3a46",
        },
        accent: {
          DEFAULT: "#8B5CF6",
          soft: "#A78BFA",
          dim: "#7444e8",
          faint: "rgba(139,92,246,0.12)",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", "1rem"],
        "13": ["0.8125rem", "1.25rem"],
      },
      borderRadius: {
        lg: "0.5rem",
        xl: "0.625rem",
      },
      boxShadow: {
        pop: "0 24px 64px -24px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.04)",
        glow: "0 0 0 1px rgba(139,92,246,0.35), 0 8px 30px -12px rgba(139,92,246,0.45)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "slide-in-left": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "slide-up": "slide-up 180ms ease-out",
        "slide-in-right": "slide-in-right 220ms cubic-bezier(0.16,1,0.3,1)",
        "slide-in-left": "slide-in-left 220ms cubic-bezier(0.16,1,0.3,1)",
      },
    },
  },
  plugins: [],
};
