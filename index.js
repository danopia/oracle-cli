#!/usr/bin/env node

const OracleCloud = require('./lib/oracle');
const PayablesModule = require('./lib/pages/payables');

const readline = require('readline-promise').default;
const rlp = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

(async () => {
  const oracle = new OracleCloud(async page => {
    var {ORACLE_USER, ORACLE_PASS} = process.env;
    if (!ORACLE_USER) ORACLE_USER = await rlp.questionAsync('Email: ');
    if (!ORACLE_PASS) ORACLE_PASS = await rlp.questionAsync('Password: ');
    rlp.output.write("\x1B[A\x1B[K\n"); // erase the password
    rlp.history = rlp.history.slice(1);

    await page.type('#userid', ORACLE_USER);
    await page.type('#password', ORACLE_PASS);
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
      const screenTitle = screen.title || ('Untitled: '+screen.type);
      console.log();
      console.log();
      console.log();
      console.log(new Array(29+screenTitle.length).join('='));
      console.log('=-=-=-=-=-=-=', screenTitle, '=-=-=-=-=-=-=');
      console.log();

      if (screen.note) {
        const {type, lines, hints} = screen.note;
        console.log('==>', type);
        lines.forEach(line =>
          console.log('   ', line));
        hints.forEach(line =>
          console.log('-->', line));
        console.log();
      }

      switch (screen.type) {
        case 'overview':
          const letters = ['a', 'b', 'c', 'd', 'e'];
          screen.allTiles.forEach((tile, idx) => {
            if (tile.isSelected) {
              console.log('-->', `${letters[idx]}:`, tile.title, `(${tile.badge})`, '<--');
            } else {
              console.log('   ', `${letters[idx]}:`, tile.title, `(${tile.badge})`, '   ');
            }
          });
          console.log();
          if (screen.noDataText) {
            console.log(screen.noDataText);
          } else {
            screen.items.forEach((item, idx) => {
              console.log('  ', (idx+1)+")\t", item.category+"\t", item.location+"\t", item.date+"\t", item.amount+' '+item.currency+"\t", item.merchant);
            });
          }
          console.log();

          var answer = await rlp.questionAsync('==> [#/a/b/new/delete/quit] ');
          switch (answer[0]) {
            case 'a':
            case 'b':
              const tile = screen.allTiles[letters.indexOf(answer[0])];
              console.log('Clicking tile', tile.title);
              await tile.click();
              break;
            case 'n':
              console.log('Going to the Create form...');
              await screen.createNew();
              break;
            case 'd':
              var idxAnswer = parseInt(await rlp.questionAsync('==> Entry # to delete: '));
              const poorItem = screen.items[idxAnswer-1];
              if (idxAnswer > 0 && poorItem) {
                console.log('Okay, deleting', poorItem.category, poorItem.date, poorItem.amount);
                await poorItem.delete();
              }
              break;
            case 'q':
              inFlow = false;
              break;
            default:
              var idxA = parseInt(answer);
              const happyItem = screen.items[idxA-1];
              if (idxA > 0 && happyItem) {
                console.log('Okay, selecting', happyItem.category, happyItem.date, happyItem.amount);
                await happyItem.click();
              }
          }
          break;

        case 'edit-form':
          screen.fields.forEach((field, idx) => {
            var suffix = '';
            if (field.isRequired) {
              if (field.type === 'select' && (!field.selected || !field.selected.text)) {
                suffix += ' required!';
              } else if (field.type !== 'select' && !field.value) {
                suffix += ' required!';
              }
            }
            var space = '  ';
            if (field.hasError) {
              space = '!!';
            }

            switch (field.type) {
              case 'text':
              case 'textarea':
              case 'select':
              case 'lookup':
                if (field.value) {
                  console.log(space, (idx+1)+")\t", field.label, ":\t[", field.value, ']', suffix);
                } else {
                  console.log(space, (idx+1)+")\t", field.label, ":\t(empty)", suffix);
                }
                break;
              case 'flag':
                console.log(space, (idx+1)+")\t", field.label, ":\t", field.value ? 'yes' : 'no', suffix);
                break;
              case 'label':
                console.log(space, (idx+1)+")\t", field.label, ":\t", field.value, suffix);
                break;
              case 'attachments':
                var latest = '(none)';
                if (field.value) {
                  latest = 'most recent: ' + field.value;
                }
                console.log(space, (idx+1)+")\t", field.label, ":\t", latest, suffix);
                break;
              default:
                console.log(space, (idx+1)+")\t", field.label, ":\t", field.type, suffix);
            }
          });
          console.log();

          var answer = await rlp.questionAsync('==> [#/cancel/save] ');
          var idx = parseInt(answer);
          const field = screen.fields[idx-1];
          if (answer[0] === 'c') {
            console.log('Cancelling');
            await screen.cancel();
          } else if (answer[0] === 's') {
            console.log('Saving');
            await screen.saveAndClose();

          } else if (idx > 0 && field) {
            switch (field.type) {
              case 'text':
                const newVal = await rlp.questionAsync(`Enter new ${field.label}: `);
                await field.setValue(newVal);
                break;
              case 'textarea':
                console.log(`Enter new multiline ${field.label}. When done, enter a blank line.`);
                var newText = '';
                while (true) {
                  const newLine = await rlp.questionAsync('');
                  if (newLine) {
                    newText += newLine + '\n';
                  } else {
                    break;
                  }
                }
                await field.setValue(newText.trim());
                break;
              case 'flag':
                console.log('Toggling', field.label);
                await field.toggle();
                break;
              case 'lookup':
              case 'attachments':
              case 'label':
                if (field.openPopup) {
                  console.log('Activating for', field.label);
                  await field.openPopup();
                } else {
                  console.log('I didnt find an action for', field.label, ':(');
                }
                break;
              case 'select':
                console.log();
                console.log('Options for', field.label, ':');
                field.options.forEach((opt, optIdx) => {
                  console.log('  ', (optIdx+1)+")\t", opt.text);
                });
                const newOptIdx = await rlp.questionAsync(`Option number [#/cancel] `);
                const optIdx = parseInt(newOptIdx);
                const option = field.options[optIdx-1];
                if (optIdx > 0 && option) {
                  console.log('Selecting', option.text)
                  await field.selectOption(option);
                }
                break;
              default:
                console.log('ERROR: I do not understand', field.type, 'fields');
            }
          }
          break;

        case 'edit-master-form':
          screen.fields.forEach((field, idx) => {
            var suffix = '';
            if (field.isRequired && !field.value) {
              suffix += ' required!';
            }
            var space = '  ';
            if (field.hasError) {
              space = '!!';
            }

            switch (field.type) {
              case 'text':
              case 'textarea':
                if (field.value) {
                  console.log(space, (idx+1)+")\t", field.label, ":\t[", field.value, ']', suffix);
                } else {
                  console.log(space, (idx+1)+")\t", field.label, ":\t(empty)", suffix);
                }
                break;
              case 'select':
                const {selected} = field;
                if (selected && selected.text) {
                  console.log(space, (idx+1)+")\t", field.label, ":\t[", selected.text, ']', suffix);
                } else {
                  console.log(space, (idx+1)+")\t", field.label, ":\t(no selection) ", suffix);
                }
                break;
              case 'flag':
                console.log(space, (idx+1)+")\t", field.label, ":\t", field.value ? 'yes' : 'no', suffix);
                break;
              case 'label':
                console.log(space, (idx+1)+")\t", field.label, ":\t", field.value, suffix);
                break;
              case 'attachments':
                var latest = '(none)';
                if (field.value) {
                  latest = 'most recent: ' + field.value;
                }
                console.log(space, (idx+1)+")\t", field.label, ":\t", latest, suffix);
                break;
              case 'lookup':
                console.log(space, (idx+1)+")\t", field.label, ":\t", 'lookup:', '[', field.value, ']', suffix);
                break;
              default:
                console.log(space, (idx+1)+")\t", field.label, ":\t", field.type, suffix);
            }
          });
          console.log();

          screen.items.forEach((item, idx) => {
            console.log('  ', 'i'+(idx+1)+")\t", item.category+"\t", item.date+"\t", item.amount+' '+item.currency+"\t", item.description+"\t", item.error);
          });
          if (!screen.items.length) {
            console.log('No items yet.');
          }
          console.log();

          var answer = await rlp.questionAsync('==> [#/i#/add/new/remove/close/save] ');
          var idx = parseInt(answer);
          if (answer[0] === 'c') {
            console.log('Closing');
            await screen.cancel();
          } else if (answer[0] === 's') {
            console.log('Saving');
            await screen.save();
          } else if (answer[0] === 'n') {
            console.log('Creating new expense');
            await screen.newExpense();
          } else if (answer[0] === 'a') {
            console.log('Adding existing expense');
            await screen.addExisting();

          } else if (answer[0] === 'i') {
            var idxA = parseInt(answer.slice(1));
            const happyItem = screen.items[idxA-1];
            if (idxA > 0 && happyItem) {
              console.log('Okay, selecting', happyItem.category, happyItem.date, happyItem.amount);
              await happyItem.click();
            }
          } else if (answer[0] === 'r') {
            const newIn = await rlp.questionAsync('==> Entry # to remove: ');
            var idxAnswer = parseInt(newIn.replace('i', ''));
            const poorItem = screen.items[idxAnswer-1];
            if (idxAnswer > 0 && poorItem) {
              console.log('Okay, removing', poorItem.category, poorItem.date, poorItem.amount);
              await poorItem.remove();
            }

          } else if (idx > 0) {
            const field = screen.fields[idx-1];
            switch (field.type) {
              case 'text':
                const newVal = await rlp.questionAsync(`Enter new ${field.label}: `);
                await field.setValue(newVal);
                break;
              case 'textarea':
                console.log(`Enter new multiline ${field.label}. When done, enter a blank line.`);
                var newText = '';
                while (true) {
                  const newLine = await rlp.questionAsync('');
                  if (newLine) {
                    newText += newLine + '\n';
                  } else {
                    break;
                  }
                }
                await field.setValue(newText.trim());
                break;
              case 'flag':
                console.log('Toggling', field.label);
                await field.toggle();
                break;
              case 'label':
              case 'lookup':
              case 'attachments':
                console.log('Opening popup for', field.label);
                await field.openPopup();
                break;
              case 'select':
                console.log();
                console.log('Options for', field.label, ':');
                field.options.forEach((opt, optIdx) => {
                  console.log('  ', (optIdx+1)+")\t", opt.text);
                });
                const newOptIdx = await rlp.questionAsync(`Option number [#/cancel] `);
                const optIdx = parseInt(newOptIdx);
                const option = field.options[optIdx-1];
                if (optIdx > 0 && option) {
                  console.log('Selecting', option.text)
                  await field.selectOption(option);
                }
                break;
              default:
                console.log('ERROR: I do not understand', field.type, 'fields');
            }
          }
          break;

        case 'popup':
          console.log(screen.body.trim());
          console.log();
          screen.buttons.forEach(button => {
            console.log('  ->', button.text);
          });

          var input;
          if (screen.buttons.length === 1) {
            const onlyB = screen.buttons[0];
            input = onlyB.text;
            await rlp.questionAsync(`Press Enter to dismiss`);
          } else {
            input = await rlp.questionAsync(`? `);
          }
          const button = screen.buttons.find(b =>
            b.text.toLowerCase().startsWith(input.toLowerCase()));
          if (input.length && button) {
            console.log('Clicking', button.text);
            await button.click();
          }
          break;

        case 'dropdown':
          if (screen.options) {
            screen.options.forEach((item, idx) => {
              var prefix = item.isSelected ? '-->' : '   ';
              console.log(prefix, (idx+1)+")\t", item.fields.join(`\t`));
            });
          } else {
            console.log('No data (???)');
          }
          console.log();

          var answer = parseInt(await rlp.questionAsync('Option number: '));
          const option = screen.options[answer-1];
          if (answer > 0 && option) {
            console.log('Okay, selecting', option.fields.join(`\t`));
            await option.click();
          }
          break;

        case 'apply-items':
          console.log('Select an expense item to add to the report:');
          if (screen.items.length === 0) {
            console.log('No items to apply');
          } else {
            screen.items.forEach((item, idx) => {
              console.log('  ', (idx+1)+")\t", item.category+"\t", item.location+"\t", item.date+"\t", item.amount+' '+item.currency+"\t", item.merchant);
            });
          }
          console.log();

          var answer = await rlp.questionAsync('==> [#/done] ');
          switch (answer[0]) {
            case 'd':
              // there are 3 buttons:
              // apply: adds the currently selected item (if any), leave dialog open
              // ok: adds the currently selected item (if any), closes the dialog
              // cancel: closes the dialog without adding anything more
              //  - so 'ok' is really 'apply&cancel'
              // items aren't actually saved to server until you cancel
              screen.buttons
                .find(x => x.text === 'Cancel')
                .click();
              break;
            default:
              var idxA = parseInt(answer);
              const happyItem = screen.items[idxA-1];
              if (idxA > 0 && happyItem) {
                console.log('Okay, selecting', happyItem.category, happyItem.date, happyItem.amount);
                await happyItem.apply();
              }
          }
          break;


        default:
          console.log('Failed to scrape screen', screen);
          inFlow = false;
          break;
      }

      console.log();
      console.log('---');
      console.log();
      await oracle.latestPage.waitFor(100);
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
    rlp.close();
  }
})();
