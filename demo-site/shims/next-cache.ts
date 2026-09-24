import { refresh } from "../router";
/** In the browser demo, "revalidating" means re-rendering the current page from the in-memory store. */
export function revalidatePath() {
  setTimeout(refresh, 0);
}
