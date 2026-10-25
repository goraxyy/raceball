/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** wss://… game server. Defaults to this host on port 2567 in dev */
  readonly VITE_SERVER_URL?: string;
  /** Pad app URL for the QR codes. Defaults to this host on port 5174 in dev */
  readonly VITE_PAD_URL?: string;
}
