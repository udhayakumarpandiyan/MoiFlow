/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API origin, e.g. https://api.moiflow.in. Empty in dev (Vite proxy). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
