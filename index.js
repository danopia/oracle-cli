const OracleCloud = require('./lib/oracle');
const PayablesModule = require('./lib/pages/payables');

(async () => {
  const oracle = new OracleCloud(async page => {
    await page.type('#userid', process.env.ORACLE_USER);
    await page.type('#password', process.env.ORACLE_PASS);
    await page.click('#btnActive');
  });

  try {
    browser = await oracle.launchBrowser();
    homepage = await oracle.startAtHome();
    console.log('Welcome home,', await homepage.readFullName(), ':)');
    //const homeIcons = await homepage.readIconGrid();
    //console.log(`You have ${homeIcons.length} applications`);

    console.log('Auto-launching Expenses...');
    const payables = new PayablesModule(oracle,
      await homepage.selectIconByTitle('Expenses'));

    var inFlow = true;
    while (inFlow) {

      const screen = await payables.readScreen();
      console.log();
      console.log('===============================================')
      console.log('=-=-=-=-=-=-=', screen.title, '=-=-=-=-=-=-=')
      console.log();

      switch (screen.type) {
        case 'overview':
          screen.allTiles.forEach(tile => {
            if (tile.isSelected) {
              console.log('-->', tile.title, `(${tile.badge})`, '<--');
            } else {
              console.log('   ', tile.title, `(${tile.badge})`, '   ');
            }
          });
          console.log();
          if (screen.noDataText) {
            console.log('==>', screen.noDataText);
            console.log();

            console.log('Trying to create :)');
            await screen.createNew();
          } else {
            console.log('TODO: the list was not empty');
          }
          break;

        case 'create':
          screen.fields.forEach((field, idx) => {
            var suffix = '';
            if (field.isRequired) {
              suffix += ' required';
            }
            if (field.hasErro) {
              suffix += ' error!';
            }

            switch (field.type) {
              case 'text':
              case 'textarea':
                if (field.value) {
                  console.log('  ', idx+")\t", field.label, ":\t[", field.value, ']');
                } else {
                  console.log('  ', idx+")\t", field.label, ":\t(empty)");
                }
                break;
              case 'select':
                const {selected} = field;
                if (selected && selected.text) {
                  console.log('  ', idx+")\t", field.label, ":\t[", selected.text, ']');
                } else {
                  console.log('  ', idx+")\t", field.label, ":\t(no selection) ");
                }
                break;
              case 'flag':
                console.log('  ', idx+")\t", field.label, ":\t", field.value ? 'yes' : 'no');
                break;
              case 'attachments':
                console.log('  ', idx+")\t", field.label, ":\t", '(none)');
                break;
              default:
                console.log('  ', idx+")\t", field.label, ":\t", field.type);
            }
          });

          if (screen.note) {
            const {type, lines, hints} = screen.note;
            console.log();
            console.log('==>', type);
            lines.forEach(line =>
              console.log('   ', line));
            hints.forEach(line =>
              console.log('-->', line));
            console.log();
          }

          if (screen.fields[1].selected.text) {
            console.log('cancelling');
            await screen.cancel();
          } else if (screen.fields[0].value !== '11/28/17') {
            await screen.fields[1].selectOption(screen.fields[1].options[4]);
          } else {
            await screen.fields[0].setValue('10/05/17');
          }
          break;

        default:
          console.log('Failed to scrape screen', screen);
          inFlow = false;
          break;
      }

      console.log('Looping...');
      await oracle.latestPage.waitFor(1000);
    }

  } catch (err) {
    console.log('Failed', err.stack);
    try {
      if (oracle.latestPage) {
        await oracle.latestPage.screenshot({path: 'screenshot-failure.png'});
        console.log('Took failure screenshot, yw');
      }
    } catch (err) {
      console.log(`Failed to screenshot failure because `, err.message)
    }
  } finally {
    if (oracle.latestPage) {
      await oracle.latestPage.screenshot({path: 'screenshot-final.png'});
    }
    if (oracle.browser) {
      console.log('Closing the Oracle browser');
      await oracle.browser.close();
    }
  }
})();
