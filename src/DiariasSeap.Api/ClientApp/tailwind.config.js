import forms from '@tailwindcss/forms';

// Tokens idênticos ao CarteiraPenal (ClientApp/tailwind.config.js): mesma identidade visual.
export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html"
  ],
  darkMode: "class",
  theme: {
      extend: {
          "colors": {
              "status-warning": "#FBC02D",
              "on-primary": "#ffffff",
              "on-error-container": "#93000a",
              "on-secondary-fixed": "#002204",
              "surface-container-low": "#f4f3f8",
              "surface-container": "#eeedf2",
              "primary-fixed": "#d6e3ff",
              "surface-card": "#FFFFFF",
              "error-container": "#ffdad6",
              "surface-container-highest": "#e3e2e7",
              "on-surface": "#1a1b1f",
              "surface-container-high": "#e8e7ec",
              "background": "#faf9fe",
              "inverse-surface": "#2f3034",
              "on-primary-container": "#7594cb",
              "surface-variant": "#e3e2e7",
              "tertiary-container": "#4f1c01",
              "on-secondary": "#ffffff",
              "surface-bright": "#faf9fe",
              "on-tertiary": "#ffffff",
              "secondary-fixed": "#a3f69c",
              "outline-variant": "#c4c6d0",
              "surface-container-lowest": "#ffffff",
              "on-surface-variant": "#43474f",
              "on-tertiary-container": "#ce805b",
              "inverse-on-surface": "#f1f0f5",
              "tertiary-fixed-dim": "#ffb695",
              "secondary": "#1b6d24",
              "outline": "#747780",
              "background-neutral": "#F5F7F9",
              "on-background": "#1a1b1f",
              "on-tertiary-fixed-variant": "#713617",
              "primary-fixed-dim": "#aac7ff",
              "on-tertiary-fixed": "#351000",
              "on-primary-fixed": "#001b3e",
              "on-secondary-fixed-variant": "#005312",
              "on-secondary-container": "#217128",
              "inverse-primary": "#aac7ff",
              "primary": "#001736",
              "secondary-container": "#a0f399",
              "error": "#ba1a1a",
              "tertiary-fixed": "#ffdbcc",
              "secondary-fixed-dim": "#88d982",
              "status-error": "#D32F2F",
              "on-error": "#ffffff",
              "on-primary-fixed-variant": "#264779",
              "tertiary": "#2e0d00",
              "primary-container": "#002b5c",
              "surface-dim": "#dad9de",
              "surface-tint": "#3f5f92",
              "surface": "#faf9fe",
              "status-success": "#388E3C"
          },
          "borderRadius": {
              "DEFAULT": "0.25rem",
              "lg": "0.5rem",
              "xl": "0.75rem",
              "full": "9999px"
          },
          "spacing": {
              "stack-gap": "1rem",
              "margin-page": "2rem",
              "gutter-grid": "1.5rem",
              "padding-card": "1.5rem",
              "form-element-gap": "1.25rem"
          },
          "fontFamily": {
              "headline-lg": ["Inter"],
              "headline-lg-mobile": ["Inter"],
              "headline-md": ["Inter"],
              "headline-sm": ["Inter"],
              "body-lg": ["Inter"],
              "body-md": ["Inter"],
              "label-md": ["Inter"]
          },
          "fontSize": {
              "headline-lg": ["32px", { "lineHeight": "40px", "fontWeight": "700" }],
              "headline-lg-mobile": ["24px", { "lineHeight": "32px", "fontWeight": "700" }],
              "headline-md": ["24px", { "lineHeight": "32px", "fontWeight": "600" }],
              "headline-sm": ["20px", { "lineHeight": "28px", "fontWeight": "600" }],
              "body-lg": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
              "body-md": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
              "label-md": ["12px", { "lineHeight": "16px", "letterSpacing": "0.5px", "fontWeight": "500" }]
          }
      },
  },
  plugins: [forms],
}
