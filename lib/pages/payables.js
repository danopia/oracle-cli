// for /payables/faces/FndOverview

const OraclePage = require('./_base');
module.exports = class PayablesModule extends OraclePage {
  constructor(oracle, page) {
    super(oracle, page);
    this.mode = '';
  }

  async readScreen() {
    await this.page.waitFor('[id$="afrTtxt"]');
    await this.page.waitFor(1000);
    const pageTitle = await this.page.evaluate(() =>
      document.querySelector('[id$="afrTtxt"]').textContent);

    // check for popups first
    const popup = await this.page.evaluate(() => {
      const rootEl = document.querySelector('[data-afr-popupid]');
      if (!rootEl) return;
      const {afrPopupid} = rootEl.dataset;

      // ignore notes, they'll be brought up elsewhere
      if (document.querySelector('.AFNoteWindow')) {
        return;
      }

      // e.g. "do you want to lose your changes"
      const tb = rootEl.querySelector('[id$="::tb"]');
      if (tb) {
        return {
          type: 'popup',
          key: afrPopupid.slice(afrPopupid.lastIndexOf(':') + 1),
          title: tb.textContent,
          body: rootEl.querySelector('[id$="contentContainer"]').innerText,
          buttons: Array.from(rootEl.querySelectorAll('[id$="_fce"] button'))
            .map(b => ({text: b.textContent, selector: '#'+b.id.replace(/:/g,'\\:')})),
        };
      }

      const dropdown = rootEl.querySelector('[id$="dropDownContent"]');
      if (dropdown) {
        const tableId = rootEl.querySelector('table').id.replace(/:/g,'\\:');
        return {
          type: 'dropdown',
          options: Array.from(dropdown.querySelectorAll('tr'))
            .map(tr => ({
              isSelected: tr.classList.contains('p_AFSelected'),
              fields: Array.from(tr.querySelectorAll('span'))
                .map(x => x.innerText),
              selector: '#'+tableId+' [_afrrk="'+tr.attributes._afrrk.value+'"] span',
            })),
        }
      }

      throw new Error("data-afr-popupid was weird.", rootEl.outerHTML);
    });
    if (popup) {
      const list = (popup.buttons || popup.options);
      list.forEach(b => {
        b.click = async () => {
          await this.page.click(b.selector);
        };
      })
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
        createNew: async () => {
          await this.page.click('a[title=Create]');
          await this.page.waitFor('[id$="afrTtxt"] [title^="Create"]');
        },
      };

    } else if (pageTitle.trim() === 'Create Expense Item') {
      const {fields, note} = await this.page.evaluate(() => {
        const wrapper = document.querySelector('div[id$="editPanelGroupLayout"]');
        const fields = Array.from(wrapper
          .querySelectorAll('.xt1:not([style="display:none"]), tr.xv3:not([style="display:none"])'))
          .map(xt1 => {
            const data = {
              key: xt1.id.slice(xt1.id.lastIndexOf(':')+1),
              isRequired: !!xt1.querySelector('[title="Required"]'),
              label: xt1.querySelector('label').textContent,
              hasError: !!xt1.querySelector('.p_AFError'),
            };

            const inputBox = xt1.querySelector('input:not([type=hidden])')
            if (inputBox) {
              data.value = inputBox.value;
              data.inputId = inputBox.id;

              const searchBtn = xt1.querySelector('[title^="Search"]');
              if (searchBtn) {
                data.type = 'lookup';
                data.buttonId = searchBtn.id;
              } else {
                data.type = 'text';
              }
              return data;
            }

            const textarea = xt1.querySelector('textarea')
            if (textarea) {
              data.value = textarea.innerText;
              data.inputId = textarea.id;
              data.type = 'textarea';
              return data;
            }

            const selectBox = xt1.querySelector('select')
            if (selectBox) {
              data.value = selectBox.value;
              data.inputId = selectBox.id;
              data.type = 'select';
              data.options = Array.from(xt1.querySelectorAll('option')).map(o => ({
                value: o.value,
                text: o.textContent,
                isSelected: !!o.selected,
              }));
              data.selected = data.options.find(x => x.isSelected);
              return data;
            }

            const attachmentsBtn = xt1.querySelector('a[title="Manage Attachments"]');
            if (attachmentsBtn) {
              data.value = []; // TODO
              data.buttonId = attachmentsBtn.id;
              data.type = 'attachments';
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
            console.log('selecting', opt);
            await this.page.select(inputSelector, opt.value);
          };
          break;

        case 'text':
        case 'textarea':
          var inputSelector = '#'+field.inputId.replace(/:/g, '\\:');
          field.setValue = async newValue => {
            await this.page.focus(inputSelector)

            // delete existing
            await this.page.keyboard.down('Control');
            await this.page.keyboard.type('a');
            await this.page.keyboard.up('Control');
            await this.page.keyboard.press('Backspace');

            // put in new text
            await this.page.keyboard.type(newValue);

            // refocus the input to flush and show error
            await this.page.focus('div[id$="CancelButton"] a');
            await this.page.focus(inputSelector);
          }
          break;
        default:
          console.log('Not enriching field', field);
      }});

      return {
        type: 'create',
        title: pageTitle,
        fields,
        note,
        saveAndClose: async () => {
          await this.page.click('div[id$="SaveAndCloseButton"] a');
        },
        cancel: async () => {
          await this.page.click('div[id$="CancelButton"] a');
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
    await this.page.waitFor('[title="Travel and Expenses"]');

    const tiles = await this.page.evaluate(() =>
      Array.from(document.querySelectorAll('div[id$=ITtile]')).map(t => {
        const [title, badge] = t.querySelectorAll('span');
        return {
          isSelected: t.classList.contains('p_AFSelected'),
          title: title.textContent,
          badge: badge.textContent,
          selectId: t.querySelector('a[title="Select Tile"]').id,
        };
      }));

    tiles.forEach(t => t.navigate =
      this.navigateViaClick.bind(this, '#'+t.id));
    return tiles;
  }

  async currentTile() {
    const tiles = await this.readOverviewTiles();
    return tiles.find(t => t.isSelected);
  }

  async readNoDataText() {
    return await this.page.evaluate(() => {
      const el = document.querySelector('[data-emptytext=true]');
      if (el) { return el.textContent; }
    });
  }
}
