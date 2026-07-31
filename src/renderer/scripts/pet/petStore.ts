import { create } from "zustand";

import type { PetState } from "../../../shared/contracts";

interface PetStore {
  state: PetState;
  message: string;
  setState: (state: PetState, message?: string) => void;
}

export const usePetStore = create<PetStore>((set) => ({
  state: "idle",
  message: "",
  setState: (state, message = "") => set({ state, message })
}));
