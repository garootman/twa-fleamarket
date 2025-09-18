/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare interface Window {
  Telegram?: {
    WebApp?: {
      close(): void;
      [key: string]: unknown;
    };
  };
}
