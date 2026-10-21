/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // night-match stadium palette
        pitch: { 950: "#05110C", 900: "#0A1F16", 850: "#0D281D", 800: "#113325", 700: "#17483A", 600: "#1E5E49", 500: "#2A7A5E" },
        lime: { DEFAULT: "#D4FF3A", soft: "#E6FF8A", deep: "#A9D11A" },
        chalk: { DEFAULT: "#F2F6EF", dim: "#B7C7BC", mute: "#7E9488" },
        amber: { DEFAULT: "#FFB020" },
        flag: { DEFAULT: "#FF5A4E" },
        sky: { DEFAULT: "#5CC8FF" },
      },
      fontFamily: {
        display: ['"Bebas Neue"', "Impact", "sans-serif"],
        score: ['"Oxanium"', "ui-monospace", "monospace"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        flood: "0 0 0 1px rgba(212,255,58,.35), 0 10px 40px -10px rgba(212,255,58,.35)",
      },
      keyframes: {
        pulseLine: { "0%,100%": { opacity: ".35" }, "50%": { opacity: ".9" } },
        rise: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { pulseLine: "pulseLine 2.4s ease-in-out infinite", rise: "rise .35s ease-out both" },
    },
  },
  plugins: [],
};
