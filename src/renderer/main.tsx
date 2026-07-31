import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PetPage } from "./pages/pet/PetPage";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("React root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <PetPage />
  </StrictMode>
);
