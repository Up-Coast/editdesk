# Editdesk

Editdesk lets you change the words on a web page by clicking them and typing, then saves the change to the source file. The text keeps its font, size and layout while you edit, so you see the finished page as you write. It is for people who build pages with an AI coding tool and want to fix the copy themselves. No AI is involved, so an edit costs nothing.

![A headline being edited in place, with the Editdesk toolbar at the bottom of the page](docs/images/editing.png)

Editdesk is a command-line tool. It runs a small server on your computer, opens the page in your browser and adds a toolbar to it.

## Install

Editdesk needs [Node.js](https://nodejs.org) 20.19 or newer. There is nothing else to install. Run it with `npx`:

```bash
npx github:Up-Coast/editdesk page.html
```

To install the `editdesk` command permanently:

```bash
npm install --global github:Up-Coast/editdesk
```

## Use

1. Open a page, a folder or a running development server:

   ```bash
   editdesk page.html
   ```

   ```bash
   editdesk my-site/
   ```

   ```bash
   editdesk http://localhost:3000
   ```

2. Click any text and type.
3. Press Enter, or click somewhere else, to save. Press Esc to cancel.

The toolbar shows the file and line the edit was saved to. **Undo** and **Redo** change the file back and forth. Switch to **Browse** to follow links and press buttons, then back to **Edit**.

For a development server, run `editdesk` from the project folder. Editdesk finds the edited text in your source files, including strings files, and rewrites only those characters. Your development server reloads the page as usual.

The [editing guide](docs/editing.md) covers everything the editor does.

## What an edit changes

Only the characters you changed. Entities such as `&mdash;`, line breaks, indentation and quoting in the rest of the file stay exactly as they were, so the diff shows your wording and nothing else.

Editdesk never guesses. When it cannot tell where text comes from, it puts the old text back on the page and says why. See [when an edit is not saved](docs/troubleshooting.md).

## Read more

- [Editing guide](docs/editing.md): everything the editor does
- [Command reference](docs/reference.md): targets, options, and which files are read and written
- [When an edit is not saved](docs/troubleshooting.md): each message and what to do
- [How it works](docs/how-it-works.md): the design, the modules and the security model
- [Contributing](CONTRIBUTING.md): setup, tests and the checks a change must pass
- [Changelog](CHANGELOG.md)

## License

MIT. See [LICENSE](LICENSE).
