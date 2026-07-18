import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0a7cff",
        secondary: "#1a1a2e",
        accent: "#00d4aa",
      },
    },
  },
  plugins: [],
};

export default config;
