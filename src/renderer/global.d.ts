import type { WmsApi } from '../shared/contracts';

declare global {
  interface Window { wmps: WmsApi; }
}

export {};
