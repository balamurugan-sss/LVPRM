import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        rail: v("rail"),
        panel: v("panel"),
        card: v("card"),
        elev: v("elev"),
        line: v("line"),
        fg: v("fg"),
        muted: v("muted"),
        subtle: v("subtle"),
        accent: v("accent"),
        brand: v("brand"),
        ok: v("ok"),
        warn: v("warn"),
        bad: v("bad"),
        info: v("info"),
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "-apple-system", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      borderRadius: { xl: "14px", "2xl": "18px", "3xl": "24px" },
      boxShadow: {
        card: "0 1px 0 rgb(255 255 255 / 0.03) inset, 0 8px 24px -12px rgb(0 0 0 / 0.45)",
        glow: "0 10px 30px -10px rgb(var(--accent) / 0.55)",
      },
    },
  },
  plugins: [],
} satisfies Config;
