const puppeteer = require('puppeteer');
const fs = require('fs');
const pages = {
  Homepage: require('./pages/homepage'),
};

const CloudLaunchUrl = 'https://edhd.fs.us2.oraclecloud.com/homePage/faces/FuseWelcome';

module.exports = class OracleCloud {
  constructor(authFlow) {
    this.authFlow = authFlow;
    this.cookiePath = process.env.HOME + '/.oracle-cookies.json';
  }

  async launchBrowser() {
    console.log('Summoning the Oracle...');
    this.browser = await puppeteer.launch({
      headless: !process.env.DISPLAY,
    });
    await this.restoreCookies();
    return this.browser;
  }

  async startAtHome() {
    const page = await this.browser.newPage();
    this.latestPage = page;
    await page.setViewport({
      width: 1280,
      height: 1024,
    });

    await page.goto(CloudLaunchUrl, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
    });

    // was it that easy?
    var url = await page.url();
    if (url.includes('FuseWelcome')) {
      await page.waitFor('a[title="Home"]');
      return new pages.Homepage(this, page);
    }
    if (!url.includes('login')) {
      await page.close();
      throw new Error(`startAtHome() is lost. ${url}`);
    }

    // we need to log in
    console.log('Must log in first.');
    await this.authFlow(page);
    await page.waitForNavigation({
      waitUntil: ['networkidle0', 'domcontentloaded'],
    });

    const newUrl = await page.url();
    if (newUrl.includes('FuseWelcome')) {
      // tell the user it worked
      const fullName = await page.evaluate(() =>
        document.querySelector('.xiq').textContent);
      console.log('Successfully authenticated as', fullName);

      // store cookies for the auth origin
      const cookieJson = JSON.stringify(await page.cookies(url));
      fs.writeFileSync(this.cookiePath, cookieJson, 'utf-8');
      console.log('Stored cookies in homedir for next run');
    } else {
      await page.close();
      console.log(`Login with user/pass failed.`);
      process.exit(1);
    }

    return new pages.Homepage(this, page);
  }

  async restoreCookies() {
    try {
      const oldCookies = fs.readFileSync(this.cookiePath, 'utf-8');
      console.log(`Loading previous session's cookies from your home directory`);

      const page = await this.browser.newPage();
      await page.setCookie.apply(page, JSON.parse(oldCookies));
      await page.close();

    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log(`No previous cookies found, starting without a session`);
      } else {
        console.log('Failed to read cookies from filesystem');
        await this.browser.close();
        throw err;
      }
    }
    console.log();
  }
}
