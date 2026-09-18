/**
 * Every sentence the in-page editor shows a person.
 */

export const strings = {
  toolbarLabel: "Editdesk",
  modeEdit: "Edit",
  modeBrowse: "Browse",
  modeEditHint: "Click any text to change it. Links and buttons are paused.",
  modeBrowseHint: "The page works normally. Switch to Edit to change text.",
  undo: "Undo",
  redo: "Redo",
  close: "Dismiss",
  cancel: "Cancel",

  statusReady: "Click any text to edit it",
  statusBrowsing: "Browsing",
  statusEditing: "Enter to save · Esc to cancel",
  statusSaving: "Saving…",
  /** @param {string} file @param {number} line */
  statusSaved: (file, line) => `Saved to ${file}:${line}`,
  statusCollected: "Added to the change list",
  statusUndone: "Undone",
  statusRedone: "Redone",

  /** @param {number} count */
  copyChanges: (count) => `Copy changes (${count})`,
  changesCopied: "Change list copied",
  /** @param {string} page */
  changeListPage: (page) => `Page: ${page}`,

  chooseSeveral:
    "This text appears in more than one place in your source. Which one are you changing?",
  chooseConfirm:
    "This text is part of something larger in your source. Change it here?",
  /** @param {string} file @param {number} line */
  candidatePlace: (file, line) => `${file}:${line}`,

  problemNotFound:
    "This text is not written anywhere in your source files, so it is probably built by code or loaded from data. Your change was not saved.",
  problemNewText:
    "There was no text here before, and new text can only be saved into a page's own HTML file. Add to the text beside it instead. Your change was not saved.",
  problemUnsafeCharacters:
    "That spot in your source can only take plain words and punctuation. Remove quotes, brackets or backslashes, or make this change in the file. Your change was not saved.",
  problemChangedOnDisk:
    "The source file changed since this page loaded. Reload the page and try again. Your change was not saved.",
  problemEmptyText:
    "Text kept in code can be changed but not emptied from here. Your change was not saved.",
  problemUnreachable:
    "Editdesk is not running any more. Start it again, then reload this page. Your change was not saved.",
  problemAcrossFormatting:
    "That would remove formatting such as bold or a link. Select text on one side of it at a time.",
};
