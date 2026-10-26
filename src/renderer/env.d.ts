/// <reference types="vite/client" />
import type { GitMonsterApi } from "../shared/types";

declare global {
  interface Window {
    gitmonster: GitMonsterApi;
  }
}

export {};
