/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Trading-specific colors
        profit: {
          DEFAULT: "#22c55e",
          light: "#86efac",
          dark: "#15803d",
        },
        loss: {
          DEFAULT: "#ef4444",
          light: "#fca5a5",
          dark: "#b91c1c",
        },
        signal: {
          pending: "#f59e0b",
          taken: "#3b82f6",
          skipped: "#6b7280",
          expired: "#9ca3af",
        },
      },
    },
  },
  plugins: [],
};
