---
title: When an edit is not saved
nav_order: 5
---

# When an edit is not saved

When Editdesk cannot save an edit, it puts the old text back on the page and shows one of these messages. Nothing is written to any file.

## "This text is not written anywhere in your source files"

The text on screen is not in any source file as it appears. It is built by code, for example `Hello ${name}`, or loaded from a database or an API.

1. Find where the text is built, and change it there.
2. If the text is in a file Editdesk does not search, check the [list of searched files](reference.md#files-that-are-searched). Start Editdesk with `--root` set to a folder that contains the file.

## "There was no text here before"

You typed into a gap that had no text, such as the space after a link. Editdesk can add text to an empty gap only in a page's own HTML file. For a page rendered by an app, there is no old text to search the source for.

1. Click the text beside the gap.
2. Add your words to that text.

## "That spot in your source can only take plain words and punctuation"

The text is part of a longer string or expression, or in a kind of file Editdesk does not know how to quote for, such as YAML or PHP. It writes only letters, numbers, spaces and a few punctuation marks there. The [command reference](reference.md#where-an-edit-is-saved) lists them.

1. Remove quotes, brackets, braces, backslashes, `&`, `$` and backticks from the new text, and save again.
2. If you need those characters, make the change in the file.

## "This text is kept in code"

You added a new line to text that lives in a string in the source, and the page does not show line breaks in that text. The new line would be saved and never appear.

1. Save the wording without the new line.
2. To show line breaks there, give the element the style `white-space: pre-line` in the code, then add the new line again.

## "The source file changed since this page loaded"

The file was edited by something else after the page loaded, so the place Editdesk recorded no longer holds the text. **Undo** and **Redo** show it too, when the file is not as the edit left it.

1. Reload the page.
2. Make the edit again.

## "Text kept in code can be changed but not emptied from here"

You deleted all of a text that lives in a source file other than the page's own HTML. Editdesk does not write empty strings into code.

1. Remove the text in the file, along with the code that shows it.

## "Editdesk is not running any more"

The server was stopped, or the terminal was closed.

1. Start Editdesk again with the same command.
2. Reload the page.

## "That would remove formatting such as bold or a link"

The selection reached across bold text, a link or other formatting, and deleting it would delete the formatting too.

1. Select the text on one side of the formatting.
2. Change it, then do the same on the other side.

## The page opens but clicking text does nothing

| Cause                                                                      | What to do                        |
| -------------------------------------------------------------------------- | --------------------------------- |
| The toolbar is in **Browse**                                               | Click **Edit**                    |
| The text is in a form field, an image, a chart or an embedded frame        | Change it in the file             |
| The toolbar is missing because the address is the development server's own | Open the address Editdesk printed |

## A development server shows an error through Editdesk

Editdesk passes requests to the development server and shows `Editdesk could not reach http://localhost:3000` when the server does not answer.

1. Check that the development server is running at the address you gave.
2. Reload the page.

## "Port 4173 is already in use"

Another program is listening on the port given with `--port`.

1. Choose another port, or leave `--port` out to use any free port.
