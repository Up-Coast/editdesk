# Changelog

## Unreleased

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
