import { createContext } from "react";
// Native dialogs occupy the top layer; repeat notices inside them so failures remain visible.
export const NoticeContext = createContext("");
