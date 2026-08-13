/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#6366f1",
        background: "#0f172a",
        card: "#1e293b",
        border: "#334155",
        muted: "#64748b",
      },
    },
  },
  plugins: [],
};
