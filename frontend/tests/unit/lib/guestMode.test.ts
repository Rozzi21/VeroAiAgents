import { test } from "node:test";
import assert from "node:assert/strict";

import { enterGuestMode, GUEST_HOME_PATH } from "../../../src/lib/guestMode.ts";

test("guest mode revokes account session before returning public chat path", async () => {
  const events: string[] = [];
  const destination = await enterGuestMode(async () => {
    events.push("logout");
  });

  assert.deepEqual(events, ["logout"]);
  assert.equal(destination, GUEST_HOME_PATH);
  assert.equal(destination, "/");
});

test("guest mode does not navigate when account logout has not completed", async () => {
  await assert.rejects(
    enterGuestMode(async () => {
      throw new Error("logout failed");
    }),
    /logout failed/
  );
});
