// for /homePage/faces/FuseWelcome

const OraclePage = require('./_base');
module.exports = class Homepage extends OraclePage {
  constructor(oracle, page) {
    super(oracle, page);
  }

  async readFullName() {
    return await this.assertPage().evaluate(() =>
      document.querySelector('.xiq').textContent);
  }

  async readIconGrid() {
    const grid = await this.assertPage()
      .evaluate(() => Array
        .from(document.querySelectorAll('table .p_AFIconOnly'))
        .filter(x => x.id.includes('grid'))
        .map(x => ({
          id: x.id,
          title: x.title,
          img: x.querySelector('img').src,
        })));

    grid.forEach(g => g.select =
      this.selectIcon.bind(this, '#'+g.id));
    return grid;
  }

  async selectIconByTitle(title) {
    await this.page.click(`[title="${title}"]`);
    return await this.releasePage();
  }
  async selectIcon(selector) {
    await this.page.click(selector);
    return await this.releasePage();
  }
}
