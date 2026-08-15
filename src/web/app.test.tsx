import { afterAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const { render } = await import("@testing-library/react");
const userEvent = (await import("@testing-library/user-event")).default;
const { App } = await import("./app");

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

describe("React app scaffold", () => {
  test("routes its first interaction through the reducer", async () => {
    const user = userEvent.setup();
    const view = render(<App />);

    await user.click(view.getByRole("button", { name: "Check reducer" }));

    expect(
      view.getByRole("button", { name: "Reducer ready" }),
    ).not.toBeNull();
  });
});
