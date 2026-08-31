import { createRoot } from "react-dom/client";

import { App } from "./app";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("React root element is missing");
}

createRoot(rootElement).render(<App />);
