import type { XnftPreference, XnftPreferenceStore } from "@coral-xyz/common";
import { UI_RPC_METHOD_GET_XNFT_PREFERENCES } from "@coral-xyz/common";
import { atom, atomFamily, selector, selectorFamily } from "recoil";

import { backgroundClient } from "../client";

export const xnftPreferences = atom<XnftPreferenceStore | null>({
  key: "xnftPreferences",
  default: selector({
    key: "xnftPreferencesDefault",
    get: async ({ get }) => {
      const background = get(backgroundClient);
      const response = await background.request({
        method: UI_RPC_METHOD_GET_XNFT_PREFERENCES,
        params: [],
      });
      return response ?? null;
    },
  }),
});

type xNFTId = string;
export const xnftPreference = atomFamily<XnftPreference | null, xNFTId>({
  key: "xnftPreference",
  default: selectorFamily({
    key: "xnftPreferenceDefault",
    get:
      (xnftId) =>
      async ({ get }) => {
        const preferences = get(xnftPreferences);
        return preferences?.[xnftId] ?? null;
      },
  }),
});
