import { test, expect, GAME_IDS, startAndGo, readCurrent } from '../fixtures';

// What each game shows in the HUD right after Start (Reflex only fills the HUD after the first tap).
const HUD: Record<string, RegExp> = {
  match: /^Moves 0 · Pairs 0\/6$/,
  simon: /^Round 1$/,
  grid: /^Cells 3 · 4×4 · Lives ❤️❤️$/,
  digits: /^Digits 3 · Lives 2$/,
  nback: /^1\/22 · hits 0\/\d+ · false 0$/,
  stroop: /^✓ 0  ✗ 0$/,
  schulte: /^Find: 1$/,
  react: /^$/,
  dots: /^✓ 0  ✗ 0$/,
  math: /^✓ 0  ✗ 0$/,
  scramble: /^Solved 0 · Skipped 0$/,
  oddword: /^✓ 0  ✗ 0$/,
  seq: /^✓ 0  ✗ 0$/,
  rotate: /^✓ 0  ✗ 0$/,
};

test.describe('Every game', () => {
  for (const id of GAME_IDS) {
    test(`${id} opens, starts, renders and quits cleanly`, async ({ page }) => {
      await page.goto('/');
      await page.locator(`.gcard[data-play=${id}]`).click();
      const g = await page.evaluate(id => ({ name: G[id].name, icon: G[id].icon }), id);
      await expect(page.locator('#play-title')).toHaveText(`${g.icon} ${g.name}`);
      await expect(page.locator('#play-diff')).toHaveText('Difficulty 1/10');
      await expect(page.locator('#arena .overlay h3')).toHaveText(g.name);
      await page.locator('#go-btn').click();
      await expect(page.locator('#go-btn')).toHaveCount(0);
      await expect.poll(() => page.locator('#arena > *').count()).toBeGreaterThan(0);
      await expect(page.locator('#hud-l')).toHaveText(HUD[id], { timeout: 3000 });
      expect((await readCurrent(page))).toMatchObject({ id, started: true, done: false });
      await page.waitForTimeout(700);
      await page.locator('#quit-btn').click();
      await expect(page.locator('#home')).toHaveClass(/active/);
      expect(await readCurrent(page)).toBeNull();
      await expect(page.locator('#arena')).toBeEmpty();
    });
  }

  test('each game can be started twice in a row without leaking state', async ({ page }) => {
    await page.goto('/');
    for (const id of GAME_IDS) {
      await startAndGo(page, id);
      await startAndGo(page, id);
      expect((await readCurrent(page))).toMatchObject({ id, started: true });
      await page.locator('#quit-btn').click();
    }
    expect(await readCurrent(page)).toBeNull();
  });
});
