import { expect, test } from "@playwright/test";

test("serves the React checkpoint alongside the playable client", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Skibo Table");
  await expect(
    page.getByRole("heading", { name: "Create a game" }),
  ).toBeVisible();

  await page.goto("/react/");

  await expect(page).toHaveTitle("Skibo React checkpoint");
  await expect(
    page.getByRole("heading", { name: "The shared client contract is ready." }),
  ).toBeVisible();
});
