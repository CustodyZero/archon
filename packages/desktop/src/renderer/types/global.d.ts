import type { ArchonApi } from '../../preload/index.js';

declare global {
  interface Window {
    archon: ArchonApi;
  }
}

export {};
