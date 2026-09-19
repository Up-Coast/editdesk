# Changelog

## Unreleased

## 0.2.0 — 2026-09-18

New lines and paragraphs, a fuller undo, and an install page.

### Added

- **Shift+Enter adds a new line, and pressing it twice adds a new paragraph.** Enter still saves. In an HTML file a new line is a `<br>` tag and a new paragraph splits the `<p>` or `<li>`, keeping its class. In an app's source a new line is `<br />` between tags or `\n` in a string. See https://up-coast.github.io/editdesk/editing.html
- **Existing line breaks can be removed.** Put the caret after the break and press Backspace.
- **Install page, with offline use.** Run `npm install --global github:Up-Coast/editdesk`. An installed Editdesk works with no internet connection. See https://up-coast.github.io/editdesk/install.html

### Changed

- **Undo and Redo now cover every edit saved since Editdesk was started, on any page, and survive a reload.** Undo puts the file back exactly as it was, and is refused when something else has changed the file since.

### Fixed

- **Undo no longer fails on wording that contains quotes.** It used to be refused for text that was part of a longer string.

### Upgrading

Run `npm install --global github:Up-Coast/editdesk`.

## 0.1.0 — 2026-09-18

The first release: copy editing in place, saved to the source.

### Added

- **Click any text on a page and type to change it.** The text keeps its own font, size and layout while it is edited. Enter saves, Esc cancels.
- **Edits are saved to the page's HTML file.** Only the changed characters are rewritten, so entities, line breaks and indentation elsewhere in the file stay as they were.
- **Edits to pages rendered by a development server are saved to the source file that holds the text.** Run `editdesk http://localhost:3000` from the project folder. When the text is in several places, Editdesk asks which one.
- **Live sites can be opened and edited without saving.** `editdesk https://example.com` collects the edits in a change list that can be copied.
- **Undo and Redo** change the file back and forth.
- **Edit and Browse modes.** In Edit, links and buttons are paused so their labels can be clicked. In Browse, the page works normally.

### Upgrading

Nothing to do.
