import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef8ff",
          100: "#d9efff",
          200: "#bce2ff",
          300: "#8fd0ff",
          400: "#5ab4ff",
          500: "#3091f3",
          600: "#1d73d8",
          700: "#1a5db0",
          800: "#1d4f8f",
          900: "#1d4372"
        }
      },
      boxShadow: {
        panel: "0 18px 40px rgba(15, 23, 42, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
