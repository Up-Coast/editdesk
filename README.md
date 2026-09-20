# Editdesk

Editdesk lets you change the words on a web page by clicking them and typing, then saves the change to the source file. The text keeps its font, size and layout while you edit, so you see the finished page as you write. It is for people who build pages with an AI coding tool and want to fix the copy themselves. No AI is involved, so an edit costs nothing.

![A headline being edited in place, with the Editdesk toolbar at the bottom of the page](docs/images/editing.png)

Editdesk is a command-line tool. It runs a small server on your computer, opens the page in your browser and adds a toolbar to it.

## Install

Editdesk needs [Node.js](https://nodejs.org) 20.19 or newer.

1. Install the `editdesk` command:

   ```bash
   npm install --global editdesk
   ```

2. Check it:

   ```bash
   editdesk --version
   ```

To try it without installing, run `npx editdesk page.html`. The [install page](docs/install.md) covers updating and removing it.

### Working offline

An installed Editdesk works with no internet connection. The server and the editor both run from your computer, load nothing from the internet and send nothing anywhere. A page that loads its own fonts or scripts from the internet shows its fallbacks while you are offline, and editing still works. `npx` downloads Editdesk each time, so use the installed command when offline.

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
3. Press Enter, or click somewhere else, to save. Press Shift+Enter for a new line, twice for a new paragraph. Press Esc to cancel.

The toolbar shows the file and line the edit was saved to. **Undo** and **Redo** change the file back and forth. Switch to **Browse** to follow links and press buttons, then back to **Edit**.

For a development server, run `editdesk` from the project folder. Editdesk finds the edited text in your source files, including strings files, and rewrites only those characters. Your development server reloads the page as usual.

The [editing guide](docs/editing.md) covers everything the editor does.

## What an edit changes

Only the characters you changed. Entities such as `&mdash;`, line breaks, indentation and quoting in the rest of the file stay exactly as they were, so the diff shows your wording and nothing else.

Editdesk never guesses. When it cannot tell where text comes from, it puts the old text back on the page and says why. See [when an edit is not saved](docs/troubleshooting.md).

## Read more

- [Install](docs/install.md): installing, working offline, updating and removing
- [Editing guide](docs/editing.md): everything the editor does
- [Command reference](docs/reference.md): targets, options, and which files are read and written
- [When an edit is not saved](docs/troubleshooting.md): each message and what to do
- [How it works](docs/how-it-works.md): the design, the modules and the security model
- [Contributing](CONTRIBUTING.md): setup, tests and the checks a change must pass
- [Changelog](CHANGELOG.md)

## Who makes Editdesk, and why it is free

I'm Abbey Jackson. I spent over a decade in tech as an iOS engineer and then a product manager, at Intel, Mastercard and Rivian, where I hold a patent ([US12115931B2](https://patents.google.com/patent/US12115931B2/en)) for the architecture behind how the Rivian app talks to the vehicle.

Editdesk exists because of the people I teach. Most of them are not in tech: they have an app idea, they are building it themselves or with one other person, and they should not have to ask an AI or a developer to fix a typo on their own page.

The rest of my work is the same idea at a bigger scale. From Passion to Product is my free six-week live course on app strategy: working out who has the problem, talking to the people who have it, deciding what to build, and planning a launch. No coding, no-code or AI skills are needed to take it. It is run by [Up Coast](https://www.upcoastbuilders.ca), my social venture, and it is free because I think the ability to build things people want should not depend on already being inside the tech industry.

There are no dates for the next cohort yet. The waitlist and the course details are at [upcoastbuilders.ca](https://www.upcoastbuilders.ca).

## License

MIT. See [LICENSE](LICENSE).
