## Oracle Cloud Applications CLI

### Install
Can you go sudoless?
* `npm i -g oracle-cli`

If you need sudo, you need this: ([via](https://github.com/GoogleChrome/puppeteer/issues/375#issuecomment-363466257))
* `sudo npm i -g oracle-cli --unsafe-perm=true`

Note that you might have to `sudo oracle` and that can cause more problems

### Example

```
$ oracle
Summoning the Oracle...

Must log in first.
Email: me@mycompany.com
Password:

Successfully authenticated as John Doe
Stored cookies in homedir for next run
Welcome home, John Doe :)
Auto-launching Expenses...



===============================================
=-=-=-=-=-=-= Travel and Expenses =-=-=-=-=-=-=

--> a: Expense Items (3 Cash) <--
    b: Expense Reports (0)    

   1)    Phone Bills     San Diego, CA         11/19/17        23.00 USD
   2)    T&E             San Diego, CA         11/19/17        478,348,723,894,743.00 USD
   3)    Flights         San Diego, CA         11/28/17        9.45 USD

==> [#/a/b/new/delete/quit]
```

### On Ubuntu

Try getting all these probably ([via](https://github.com/GoogleChrome/puppeteer/issues/290#issuecomment-322921352))

```
sudo apt-get install -q gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget
```
