import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/generated.css";
import "./styles/learnplay.css";

// Simple initialization - render app immediately
console.log("[Main] Starting app...");

const rootElement = document.getElementById("root");

if (rootElement) {
  console.log("[Main] Root element found, rendering...");
  createRoot(rootElement).render(<App />);
  console.log("[Main] App rendered");
} else {
  console.error("[Main] Root element not found!");
}
