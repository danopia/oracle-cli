module.exports = class OraclePage {
  constructor(oracle, page) {
    this.oracle = oracle;
    this.page = page;
  }

  async navigateViaClick(selector, waitUntil) {
    await this.page.click(selector);
    return await this.releasePage(waitUntil);
  }

  async releasePage(waitFor) {
    const page = this.assertPage();
    await page.waitForFunction(waitFor);
    //await page.waitForNavigation({
    //  waitUntil: waitUntil || 'domcontentloaded',
    //});
    this.page = null;
    //await page.waitFor(1000);
    return page;
  }

  assertPage() {
    if (!this.page) {
      throw new Error(`${this.constructor.name} use-after-free [already navigated away]`);
    }
    return this.page;
  }
}
