/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** wss://… game server. Defaults to this host on port 2567 in dev */
  readonly VITE_SERVER_URL?: string;
}
