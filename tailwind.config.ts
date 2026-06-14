import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        vista: {
          ink: "#19211c",
          leaf: "#28764a",
          mint: "#cbe8d4",
          fairway: "#f1f7ef",
          clay: "#b86b3f",
          gold: "#dca63d",
          night: "#29313d"
        }
      },
      boxShadow: {
        "soft-line": "0 16px 40px rgba(25, 33, 28, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
