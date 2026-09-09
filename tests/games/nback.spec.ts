import { test, expect, play, seedLog, startAndGo, readLog } from '../fixtures';

const LETTERS = /^[BCDFGHJKLMNPRSTVXZ]$/;

test.describe('N-Back', () => {
  test('streams letters with N = 1 over 22 trials at difficulty 1', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'nback');
    await expect(page.locator('#arena')).toContainText('N = 1 · press MATCH when the letter equals the one 1 step ago');
    await expect(page.locator('#nb-match')).toContainText('MATCH');
    await expect(page.locator('#hud-l')).toHaveText(/^1\/22 · hits 0\/\d+ · false 0$/, { timeout: 3000 });
    expect(await page.locator('#nb').innerText()).toMatch(LETTERS);
    await expect(page.locator('#hud-l')).toHaveText(/^2\/22/, { timeout: 4000 });
  });

  test('N and the trial count grow with difficulty', async ({ page }) => {
    await seedLog(page, Array.from({ length: 2 }, () => play('nback', 800)));
    await startAndGo(page, 'nback');
    await expect(page.locator('#arena')).toContainText('N = 2 · press MATCH when the letter equals the one 2 steps ago');
    await expect(page.locator('#hud-l')).toHaveText(/^1\/26/, { timeout: 3000 });

    await seedLog(page, Array.from({ length: 6 }, () => play('nback', 800)));
    await startAndGo(page, 'nback');
    await expect(page.locator('#arena')).toContainText('N = 3');
    await expect(page.locator('#hud-l')).toHaveText(/^1\/34/, { timeout: 3000 });
  });

  test('the first letter cannot be matched and each letter is scored once', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'nback');
    const hud = page.locator('#hud-l');
    await expect(hud).toHaveText(/^1\/22/, { timeout: 3000 });
    const first = await page.locator('#nb').innerText();
    await page.keyboard.press('Space');
    await expect(hud).toHaveText(/^1\/22 · hits 0\/\d+ · false 0$/);

    await expect(hud).toHaveText(/^2\/22/, { timeout: 4000 });
    const second = await page.locator('#nb').innerText();
    await page.locator('#nb-match').click();
    const fb = page.locator('#fb');
    if (first === second) {
      await expect(fb).toHaveText('✓ hit');
      await expect(hud).toHaveText(/^2\/22 · hits 1\/\d+ · false 0$/);
    } else {
      await expect(fb).toHaveText('✗ no match');
      await expect(hud).toHaveText(/^2\/22 · hits 0\/\d+ · false 1$/);
    }
    const after = await hud.innerText();
    await page.keyboard.press('Space');
    await page.locator('#nb-match').click();
    await expect(hud).toHaveText(after);
  });

  test('a perfect run scores 1000 and unlocks Flawless Recall', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.evaluate(() => startGame('nback'));
    // Respond synchronously whenever the displayed letter repeats the previous one.
    await page.evaluate(() => {
      const orig = G.nback.start;
      G.nback.start = (api: any) => {
        orig(api);
        const disp = document.querySelector('#nb')!;
        const proto = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
        const seen: string[] = [];
        Object.defineProperty(disp, 'textContent', {
          configurable: true,
          get() { return proto.get!.call(this) },
          set(v: string) {
            proto.set!.call(this, v);
            seen.push(v);
            const i = seen.length - 1;
            if (i >= 1 && seen[i] === seen[i - 1]) (document.querySelector('#nb-match') as HTMLButtonElement).click();
          },
        });
      };
    });
    await page.getByRole('button', { name: 'Start' }).click();
    await page.clock.runFor(60_000);
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    await expect(r.locator('.score')).toHaveText('1000');
    const tags = await r.locator('.tags .tag').allInnerTexts();
    expect(tags[2]).toMatch(/^(\d+)\/\1 hits$/);
    expect(tags[3]).toBe('0 false alarms');
    expect(tags[4]).toBe('N=1');
    await expect(r).toContainText('Badge unlocked: Flawless Recall');
    await expect(r).toContainText('Badge unlocked: Sharpshooter');
    expect((await readLog(page)).recs[0].a).toEqual(expect.arrayContaining(['nbperf', 'sc900', 'first']));
  });

  test('never responding earns only the false-alarm share of the score', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await startAndGo(page, 'nback');
    await page.clock.runFor(60_000);
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    const tags = await r.locator('.tags .tag').allInnerTexts();
    const [, targets] = tags[2].match(/^0\/(\d+) hits$/)!;
    await expect(r.locator('.score')).toHaveText(+targets > 0 ? '300' : '1000');
    await expect(r).not.toContainText('Flawless Recall');
  });
});
