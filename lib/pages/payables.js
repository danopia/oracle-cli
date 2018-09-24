// for /payables/faces/FndOverview

const OraclePage = require('./_base');
module.exports = class PayablesModule extends OraclePage {
  constructor(oracle, page) {
    super(oracle, page);
    this.page.setDefaultNavigationTimeout(6000);
    this.mode = '';
  }

  async readScreen() {
    await this.page.waitFor('[id$="afrTtxt"]');
    await this.page.waitFor(1000);
    const pageTitle = await this.page.evaluate(() =>
      document.querySelector('[id$="afrTtxt"]').textContent);
    const hasExpenseDrop = await this.page.evaluate(() =>
      !!document.querySelector('[id$=":socExpenseER::content"]'));

    // check for popups first
    const popup = await this.page.evaluate(() => {
      const rootEl = document.querySelector('[data-afr-popupid]');
      if (!rootEl) return;
      const {afrPopupid} = rootEl.dataset;

      const noteEl = document.querySelector('.AFNoteWindow');
      var note;
      if (noteEl) {
        const noteImg = noteEl.querySelector('img');
        note = {
          type: noteImg && noteImg.title,
          lines: Array.from(noteEl.querySelectorAll('.AFNoteWindowContent table tr'))
            .map(x => x.innerText.trim()),
          hints: Array.from(noteEl.querySelectorAll('.AFNoteWindowHintText'))
            .map(x => x.innerText.trim()),
        };
      }

      // attachments todo
      // the current attach-file input, if any. goes away once uploaded
      // document.querySelectorAll('span[id$=":ifPopup"] > input[type=file]')

      // e.g. "do you want to lose your changes"
      const tb = rootEl.querySelector('[id$="::tb"]');
      if (tb) {
        var buttons = Array.from(rootEl.querySelectorAll('[id$="_fce"] button'));
        if (buttons.length === 0) {
          // delete report confirmation doesn't put buttons in the right spot
          buttons = Array.from(rootEl.querySelectorAll('button.p_AFTextOnly'));
        } else {
          // hide buttons from embedded popups
          buttons = buttons.filter(b => !b.id.includes('Popup'));
        }

        const popup = {
          type: 'popup',
          key: afrPopupid.slice(afrPopupid.lastIndexOf(':') + 1),
          title: tb.textContent,
          note,
          buttons: buttons.map(b => ({
            text: b.textContent,
            selector: '#'+b.id.replace(/:/g,'\\:'),
          })),
        };

        if (popup.title === 'Add Expense Items') {
          popup.type = 'apply-items';
          popup.items = Array.from(rootEl.querySelector('div[id$="::db"]').children).map(x => {
            const spans = x.querySelectorAll('span');
            return {
              selector: '#'+spans[0].id.replace(/:/g,'\\:'),
              category: spans[1].textContent,
              location: spans[3].textContent,
              date: x.querySelector('.xtu').textContent,
              amount: spans[5].textContent,
              currency: spans[6].textContent,
              merchant: spans[7].textContent,
            };
          });

        } else {
          popup.body = rootEl.querySelector('[id$="contentContainer"]').innerText;
        }
        return popup;
      }

      const dropdown = rootEl.querySelector('[id$="dropDownContent"]');
      if (dropdown) {
        const tableId = rootEl.querySelector('table').id.replace(/:/g,'\\:');
        return {
          type: 'dropdown',
          options: Array.from(dropdown.querySelectorAll('tr'))
            .filter(tr => !tr.querySelector('[_afrseperator]'))
            .map(tr => ({
              isSelected: tr.classList.contains('p_AFSelected'),
              fields: Array.from(tr.querySelectorAll('span'))
                .map(x => x.innerText),
              selector: '#'+tableId+' [_afrrk="'+tr.attributes._afrrk.value+'"] span',
            })),
        }
      }

      if (note) {
        // it's just a note, whatever
        return;
      }
      throw new Error("data-afr-popupid was weird.", rootEl.outerHTML);
    });
    if (popup) {
      const list = (popup.buttons || popup.options);
      list.forEach(b => {
        b.click = async () => {
          // 'Approver List' view overrides window.Node
          // https://github.com/GoogleChrome/puppeteer/issues/1668
          await this.page.evaluate( () => {
            if (!window.Node) window.Node = {};
            if (!Node.ELEMENT_NODE) Node.ELEMENT_NODE = 1;
          });
          await this.page.click(b.selector);
          await this.page.waitFor(() =>
            !document.querySelector('[data-afr-popupid]')
            || document.querySelector('.AFNoteWindow'));
        };
      });
      if (popup.items) {
        const applyButton = popup.buttons.find(x => x.text === 'Apply');
        popup.items.forEach(b => {
          b.apply = async () => {
            await this.page.click(b.selector);
            await this.page.click(applyButton.selector);
            // selector is index-based but they don't reorder themselves on-apply
            // this double-escaping is getting silly btw
            await this.page.waitForFunction(`!document.querySelector("${b.selector.replace(/\\/g,'\\\\')}")`);
          };
        });
      }
      return popup;
    }

    if (pageTitle === 'Travel and Expenses') {
      this.selectedTile = await this.currentTile();
      return {
        type: 'overview',
        title: pageTitle,
        currentTile: await this.currentTile(),
        allTiles: await this.readOverviewTiles(),
        noDataText: await this.readNoDataText(),
        items: await this.readItems(),
        createNew: async () => {
          await this.page.click('a[title=Create]');
          await this.page.waitFor('[id$="afrTtxt"] [title^="Create"]');
        },
      };

    } else if (pageTitle.trim() === 'Create Expense Item' || hasExpenseDrop) {
      const {fields, note} = await this.page.evaluate(() => {
        const wrapper = document.querySelector('div[id$="editPanelGroupLayout"]');
        const fields = Array.from(wrapper
          .querySelectorAll('.xy2:not([style="display:none"]), tr.xvz:not([style="display:none"])'))
          .map(row => {
            const data = {
              key: row.id.slice(row.id.lastIndexOf(':')+1),
              isRequired: !!row.querySelector('[title="Required"]'),
              label: row.querySelector('label').textContent,
              hasError: !!row.querySelector('.p_AFError'),
            };

            const attachmentsBtn = row.querySelector('a[title="Manage Attachments"]');
            const lastAttachment = row.querySelector('a[id$=":lastAttachedFile"]');
            if (attachmentsBtn) {
              data.value = lastAttachment && lastAttachment.textContent;
              data.buttonId = attachmentsBtn.id;
              data.type = 'attachments';
              return data;
            }

            const inputBox = row.querySelector('input:not([type=hidden])')
            if (inputBox) {
              data.value = inputBox.value;
              data.inputId = inputBox.id;

              const searchBtn = row.querySelector('[title^="Search"]');
              if (searchBtn) {
                data.type = 'lookup';
                data.buttonId = searchBtn.id;
              } else {
                data.type = 'text';
              }
              return data;
            }

            const textarea = row.querySelector('textarea')
            if (textarea) {
              data.value = textarea.value;
              data.inputId = textarea.id;
              data.type = 'textarea';
              return data;
            }

            const selectBox = row.querySelector('select')
            if (selectBox) {
              data.value = selectBox.value;
              data.inputId = selectBox.id;
              data.type = 'select';
              data.options = Array.from(row.querySelectorAll('option')).map(o => ({
                value: o.value,
                text: o.textContent,
                isSelected: !!o.selected,
              }));
              data.selected = data.options.find(x => x.isSelected);
              data.value = data.selected && data.selected.text;
              return data;
            }

            if (row.id.endsWith('Label')) {
              data.type = 'label';
              data.value = row.querySelectorAll('td')[1].innerText.trim();

              const button = row.querySelector('button[id]');
              if (button) {
                data.buttonId = button.id;
              }

              return data;
            }

            console.log('I did not recognize form entry', data.key, '-', data.label);
            return data;
          }).concat(Array.from(wrapper.querySelectorAll('span[id$="Flag"]')).map(flag => {
            return {
              key: flag.id.slice(flag.id.lastIndexOf(':')+1),
              label: flag.querySelector('label').textContent,
              value: flag.querySelector('input[type=checkbox]').checked,
              inputId: flag.querySelector('input[type=checkbox]').id,
              type: 'flag',
            }
          }));

        const noteEl = document.querySelector('.AFNoteWindow');
        var note;
        if (noteEl) {
          const noteImg = noteEl.querySelector('img');
          note = {
            type: noteImg && noteImg.title,
            lines: Array.from(noteEl.querySelectorAll('.AFNoteWindowContent table tr'))
              .map(x => x.innerText.trim()),
            hints: Array.from(noteEl.querySelectorAll('.AFNoteWindowHintText'))
              .map(x => x.innerText.trim()),
          };
        }

        return {fields, note};
      });

      fields.forEach(field => { switch (field.type) {
        case 'label':
          if (field.buttonId) {
            var btnSelector = '#'+field.buttonId.replace(/:/g, '\\:');
            field.openPopup = async () => {
              await this.page.click(btnSelector);
              // selectors are stoopid
              await this.page.waitForFunction(`!document.querySelector("${btnSelector.replace(/\\/g,'\\\\')}.p_AFDisabled")`);
            };
          }
          break;

        case 'lookup':
        case 'attachments':
          var btnSelector = '#'+field.buttonId.replace(/:/g, '\\:');
          field.openPopup = async () => {
            await this.page.click(btnSelector);
            await this.page.waitFor('[data-afr-popupid]');
          };
          break;

        case 'flag':
          var inputSelector = '#'+field.inputId.replace(/:/g, '\\:');
          field.toggle = async () => {
            await this.page.click(inputSelector);
          };
          break;

        case 'select':
          var inputSelector = '#'+field.inputId.replace(/:/g, '\\:');
          field.selectOption = async opt => {
            await this.page.select(inputSelector, opt.value);
          };
          break;

        case 'text':
        case 'textarea':
          var inputSelector = '#'+field.inputId.replace(/:/g, '\\:');
          field.setValue = async newValue => {
            const inputHandle = await this.page.$(inputSelector);
            if (!inputHandle) {
              throw new Error(`text/textarea setValue didn't see ${inputSelector}`);
            }
            await this.page.focus(inputSelector);

            // delete existing
            await this.page.keyboard.down('Control');
            await this.page.keyboard.type('a');
            await this.page.keyboard.up('Control');
            await this.page.keyboard.press('Backspace');

            // put in new text
            await this.page.keyboard.type(newValue);

            // refocus the input to flush and show error
            await this.page.keyboard.press('Tab');
            await this.page.keyboard.down('Shift');
            await this.page.keyboard.press('Tab');
            await this.page.keyboard.up('Shift');
          }
          break;
        default:
          console.log('Not enriching field', field);
      }});

      return {
        type: 'edit-form',
        title: pageTitle,
        fields,
        note,
        saveAndClose: async () => {
          await this.page.click('div[id$="SaveAndCloseButton"] a');
          await this.page.waitFor('[data-afr-popupid], [id$="afrTtxt"] [title="Travel and Expenses"], [id$="afrTtxt"] [title^="Expense Report"], [id$="afrTtxt"] [title^="Create Expense Report"]');
        },
        cancel: async () => {
          await this.page.click('div[id$="CancelButton"] a');
          await this.page.waitFor('[data-afr-popupid], [id$="afrTtxt"] [title="Travel and Expenses"], [id$="afrTtxt"] [title^="Expense Report"], [id$="afrTtxt"] [title^="Create Expense Report"]');
        },
      };



    } else if (pageTitle.trim() === 'Create Expense Report' || pageTitle.startsWith('Expense Report:')) {
      const {fields, items, buttons, note} = await this.page.evaluate(() => {
        const wrapper = document.querySelector('div[id$="editPanelGroupLayout"]');
        const fields = Array.from(document.querySelectorAll('label[class$="label-text"]'))
          .map(x => x.parentElement.parentElement) // get the <tr>
          .filter(x => x.style.display !== 'none') // hidden rows
          .filter(x => !x.id.includes(':th1:')) // ignore stuff from 'status' dialog
          .map(tr => {
            const data = {
              isRequired: !!tr.querySelector('[title="Required"]'),
              label: tr.querySelector('label').textContent,
              hasError: !!tr.querySelector('.p_AFError'),
            };

            const attachmentsBtn = tr.querySelector('a[title="Manage Attachments"]');
            const lastAttachment = tr.querySelector('a[id$=":lastAttachedFile"]');
            if (attachmentsBtn) {
              data.value = lastAttachment && lastAttachment.textContent;
              data.buttonId = attachmentsBtn.id;
              data.type = 'attachments';
              return data;
            }

            const inputBox = tr.querySelector('input:not([type=hidden])')
            if (inputBox) {
              data.value = inputBox.value;
              data.inputId = inputBox.id;
              data.type = 'text';
              return data;
            }

            const link = tr.querySelector('a');
            if (link) {
              data.value = link.textContent;
              data.buttonId = link.id;
              data.type = 'label';
              return data;
            }

            const textarea = tr.querySelector('textarea')
            if (textarea) {
              data.value = textarea.value;
              data.inputId = textarea.id;
              data.type = 'textarea';
              return data;
            }

            const selectBox = tr.querySelector('select')
            if (selectBox) {
              data.value = selectBox.value;
              data.inputId = selectBox.id;
              data.type = 'select';
              data.options = Array.from(tr.querySelectorAll('option')).map(o => ({
                value: o.value,
                text: o.textContent,
                isSelected: !!o.selected,
              }));
              data.selected = data.options.find(x => x.isSelected);
              data.value = data.selected && data.selected.text;
              return data;
            }

            console.log('I did not recognize report form entry', data.key, '-', data.label);
            return data;
          });

        const noteEl = document.querySelector('.AFNoteWindow');
        var note;
        if (noteEl) {
          const noteImg = noteEl.querySelector('img');
          note = {
            type: noteImg && noteImg.title,
            lines: Array.from(noteEl.querySelectorAll('.AFNoteWindowContent table tr'))
              .map(x => x.innerText.trim()),
            hints: Array.from(noteEl.querySelectorAll('.AFNoteWindowHintText'))
              .map(x => x.innerText.trim()),
          };
        }

        var items = [];
        const el = document.querySelector('[data-emptytext=true]');
        if (!el) {
          items = Array.from(document.querySelector('div[id$="lv1::db"]').children).map(x => {
            const editLink = x.querySelector('a.AFLinkColor');
            const spans = Array.from(x.querySelectorAll('span:not([id])'));
            const descBox = x.querySelector('[_afrc="2 1 4 1 start top"]');
            const descText = Array.from(descBox.childNodes).filter(x=>x.constructor === Text);
            return {
              selector: '#'+editLink.id.replace(/:/g,'\\:'),
              category: editLink.textContent,
              location: spans[1].textContent,
              date: spans[2].textContent,
              amount: spans[3].textContent,
              currency: spans[4].textContent,
              removeSelector: '#'+x.querySelector('a[title="Remove"]').id.replace(/:/g,'\\:'),
              description: descText.map(x => x.data).join(''),
              error: spans[5].textContent,
            };
          });
        }

        const buttons = Array.from(document.querySelectorAll('.p_AFTextOnly a>span')).map(x => {
          const label = x.textContent;
          x.parentElement.dataset.buttonText = label;
          return {
            action: label,
            selector: `a[data-button-text="${label}"]`,
          };
        })

        return {fields, items, buttons, note};
      });

      fields.forEach(field => { switch (field.type) {
        case 'lookup':
        case 'attachments':
        case 'label':
          var btnSelector = '#'+field.buttonId.replace(/:/g, '\\:');
          field.openPopup = async () => {
            await this.page.click(btnSelector);
            await this.page.waitFor('[data-afr-popupid]');
          };
          break;

        case 'select':
          var inputSelector = '#'+field.inputId.replace(/:/g, '\\:');
          field.selectOption = async opt => {
            await this.page.select(inputSelector, opt.value);
          };
          break;

        case 'text':
        case 'textarea':
          var inputSelector = '#'+field.inputId.replace(/:/g, '\\:');
          field.setValue = async newValue => {
            const inputHandle = await this.page.$(inputSelector);
            if (!inputHandle) {
              throw new Error(`text/textarea setValue didn't see ${inputSelector}`);
            }
            await this.page.focus(inputSelector);

            // delete existing
            await this.page.keyboard.down('Control');
            await this.page.keyboard.type('a');
            await this.page.keyboard.up('Control');
            await this.page.keyboard.press('Backspace');

            // put in new text
            await this.page.keyboard.type(newValue);

            // refocus the input to flush and show error
            await this.page.keyboard.press('Tab');
            await this.page.keyboard.down('Shift');
            await this.page.keyboard.press('Tab');
            await this.page.keyboard.up('Shift');
          }
          break;
        default:
          console.log('Not enriching field', field);
      }});

      items.forEach(item => {
        item.click = async () => {
          await this.page.click(item.selector);
          await this.page.waitFor('div[id$="CancelButton"] a');
        };
        item.remove = async () => {
          await this.page.click(item.removeSelector);
          await this.page.waitFor('[data-afr-popupid]');
        };
      });

      return {
        type: 'edit-master-form',
        title: pageTitle,
        fields,
        items,
        note,
        addExisting: async () => {
          const button = buttons.find(x => x.action === 'Add Existing');
          await this.page.click(button.selector);
          await this.page.waitFor('[data-afr-popupid]');
        },
        newExpense: async () => {
          await this.page.click('a[title=Create]');
          await this.page.waitFor('[data-afr-popupid], [id$="afrTtxt"] [title^="Create Expense Item"]');
        },
        save: async () => {
          // save dialogs on success
          const button = buttons.find(x => x.action === 'Save');
          await this.page.click(button.selector);
          await this.page.waitFor('[data-afr-popupid]');
        },
        // Submit ????
        cancel: async () => {
          const button = buttons.find(x => x.action === 'Cancel');
          await this.page.click(button.selector);
          await this.page.waitFor('[data-afr-popupid], [id$="afrTtxt"] [title="Travel and Expenses"]');
        },
      };



    } else {
      return {
        type: '404',
        title: pageTitle,
      };
    }
  }


  // Internal functions that scrape out the screen parts


  async readOverviewTiles() {
    const tiles = await this.page.evaluate(() =>
      Array.from(document.querySelectorAll('div[id$=ITtile]')).map(t => {
        const [title, badge] = t.querySelectorAll('span');
        return {
          isSelected: t.classList.contains('p_AFSelected'),
          title: title.textContent,
          badge: badge.textContent,
          selectId: t.querySelector('a[title^="Select:"]').id,
        };
      }));

    tiles.forEach(t => t.click =
      this.page.click.bind(this.page, '#'+t.selectId.replace(/:/g,'\\:')));
    return tiles;
  }

  async currentTile() {
    const tiles = await this.readOverviewTiles();
    return tiles.find(t => t.isSelected);
  }

  async readItems() {
    // TODO: depends on the tile!

    const items = await this.page.evaluate(() => {
      const el = document.querySelector('[data-emptytext=true]');
      if (el) { return []; }
      return Array.from(document.querySelector('div[id$="::db"]').children).map(x => {
        const expButton = x.querySelector('a[id$=":commandLink9"], a[id$=":commandLink4"]');
        const x30i = Array.from(x.querySelectorAll('.x30i'));
        if (x30i.length === 3) {
          x30i.splice(2, 0, {textContent: ''});
        }
        return {
          selector: expButton && ('#'+expButton.id.replace(/:/g,'\\:')),
          category: expButton && expButton.textContent,
          location: x.querySelector('.x30j').textContent,
          date: x30i[0].textContent,
          amount: x.querySelector('.AppsBoldFont').textContent,
          currency: x30i[1].textContent,
          deleteSelector: '#'+x.querySelector('a[title="Delete"]').id.replace(/:/g,'\\:'),
          merchant: x30i[2].textContent,
          description: x30i[3].textContent,
        };
      });
    });

    items.forEach(item => {
      item.click = async () => {
        await this.page.click(item.selector);
        //await this.page.waitFor('div[id$="CancelButton"] a');
        await this.page.waitFor('a[accesskey=C]');
      };
      item.delete = async () => {
        await this.page.click(item.deleteSelector);
        await this.page.waitFor('[data-afr-popupid]');
      };
    });
    return items;
  }

  async readNoDataText() {
    return await this.page.evaluate(() => {
      const el = document.querySelector('[data-emptytext=true]');
      if (el) { return el.textContent; }
    });
  }
}
