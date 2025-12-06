import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/generated.css";
import "./styles/learnplay.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(<App />);
}
