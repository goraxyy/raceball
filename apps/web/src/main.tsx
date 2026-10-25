import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./decoders"; // before any model loads
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
