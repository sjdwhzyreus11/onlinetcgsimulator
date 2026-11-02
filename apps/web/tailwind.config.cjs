/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "error-container": "#ffdad6",
        "on-primary-fixed": "#001e2d",
        "on-secondary-fixed-variant": "#434752",
        "tertiary-fixed": "#ffdad9",
        surface: "#f9f9f9",
        tertiary: "#ba1830",
        "primary-fixed": "#c6e7ff",
        outline: "#70787e",
        "on-surface": "#1a1c1c",
        "inverse-primary": "#8dcef7",
        "secondary-container": "#dfe2f0",
        "on-primary": "#ffffff",
        primary: "#176589",
        secondary: "#5a5e6a",
        "surface-container-highest": "#e2e2e2",
        "outline-variant": "#c0c7ce",
        "secondary-fixed-dim": "#c3c6d4",
        "on-primary-container": "#00435f",
        "tertiary-fixed-dim": "#ffb3b2",
        "surface-variant": "#e2e2e2",
        "surface-container-low": "#f3f3f4",
        "primary-fixed-dim": "#8dcef7",
        "on-tertiary-fixed": "#410008",
        "surface-bright": "#f9f9f9",
        "on-tertiary": "#ffffff",
        "surface-tint": "#176589",
        background: "#f9f9f9",
        "surface-dim": "#dadada",
        "inverse-on-surface": "#f0f1f1",
        "on-error": "#ffffff",
        "on-error-container": "#93000a",
        "on-surface-variant": "#40484e",
        "primary-container": "#70b1d9",
        "on-secondary-fixed": "#171b25",
        error: "#ba1a1a",
        "on-tertiary-fixed-variant": "#92001f",
        "tertiary-container": "#ff8587",
        "on-secondary": "#ffffff",
        "secondary-fixed": "#dfe2f0",
        "surface-container-high": "#e8e8e8",
        "on-tertiary-container": "#82001a",
        "on-secondary-container": "#606470",
        "surface-container-lowest": "#ffffff",
        "surface-container": "#eeeeee",
        "on-primary-fixed-variant": "#004c6b",
        "on-background": "#1a1c1c",
        "inverse-surface": "#2f3131"
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px"
      },
      spacing: {
        unit: "8px",
        "section-margin": "48px",
        "container-padding": "32px",
        "card-gap": "16px",
        gutter: "24px"
      },
      fontSize: {
        "headline-md": [
          "24px",
          { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" }
        ],
        "display-lg": [
          "48px",
          { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "700" }
        ],
        "label-sm": [
          "12px",
          { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }
        ],
        "body-base": ["16px", { lineHeight: "24px", fontWeight: "400" }]
      }
    }
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/container-queries")]
};

