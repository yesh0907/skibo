import { expect, test } from "@playwright/test";

test("serves the React client alongside the legacy integration surface", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Skibo Table");
  await expect(
    page.getByRole("heading", { name: "Create a game" }),
  ).toBeVisible();

  await page.goto("/react/");

  await expect(page).toHaveTitle("Skibo Table");
  await expect(
    page.getByRole("heading", { name: "Pull up a seat." }),
  ).toBeVisible();
});
