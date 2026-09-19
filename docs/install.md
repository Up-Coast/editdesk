---
title: Install
nav_order: 2
---

# Install

Editdesk needs [Node.js](https://nodejs.org) 20.19 or newer. It runs on macOS, Windows and Linux.

## Try it without installing

```bash
npx github:Up-Coast/editdesk page.html
```

`npx` downloads Editdesk from GitHub, so this needs the internet.

## Install it

```bash
npm install --global github:Up-Coast/editdesk
```

Then run it from any folder:

```bash
editdesk page.html
```

| Installed              | Where                                                |
| ---------------------- | ---------------------------------------------------- |
| The `editdesk` command | npm's global folder. `npm prefix --global` prints it |

Editdesk adds nothing to your project. It writes to a project file only when you save an edit.

## Working offline

An installed Editdesk works with no internet connection. The server runs on your computer, and the editor it adds to the page is served from your computer too. It loads no fonts, scripts or styles from the internet, and sends nothing anywhere.

Two things still need a connection, and neither is Editdesk's:

- A page that loads its own fonts, scripts or images from the internet shows its fallbacks while you are offline. Editing and saving work as usual
- A live site, such as `editdesk https://example.com`, cannot be opened

Use the installed command when offline, not `npx`.

## Update

```bash
npm install --global github:Up-Coast/editdesk
```

```bash
editdesk --version
```

## Remove

```bash
npm uninstall --global editdesk
```
