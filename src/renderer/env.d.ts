/// <reference types="vite/client" />

import type { PetAPI } from "../shared/contracts";

declare global {
  interface Window {
    petAPI: PetAPI;
  }
}

export {};
