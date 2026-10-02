/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#090A0F",
        panel: "#11131B",
        elevated: "#171A24",
        line: "rgba(255,255,255,0.09)",
        coral: "#FF5148",
        rose: "#FB7185",
        violet: "#A78BFA",
      },
      borderRadius: {
        card: "1.25rem",
        panel: "1rem",
      },
      boxShadow: {
        glow: "0 0 55px rgba(255, 65, 82, 0.12), 0 0 90px rgba(139, 92, 246, 0.08)",
        panel: "0 20px 70px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255,255,255,0.035)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(110deg, #FF5148 0%, #FB7185 52%, #A78BFA 100%)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 600ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
        float: "float 7s ease-in-out infinite",
      }
    }
  },
  plugins: []
};
