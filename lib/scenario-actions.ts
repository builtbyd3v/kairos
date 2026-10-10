"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SCENARIO_COOKIE } from "./scenario";

/** Switch between the recorded storm and live weather. Input is a closed set; anything else means recorded. */
export async function setScenario(form: FormData) {
  const value = form.get("scenario") === "live" ? "live" : "recorded";
  (await cookies()).set(SCENARIO_COOKIE, value, { path: "/", sameSite: "lax", maxAge: 7 * 86400 });
  refresh();
}
