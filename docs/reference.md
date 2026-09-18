---
title: Command reference
nav_order: 3
---

# Command reference

```bash
editdesk [target] [options]
```

Editdesk starts a server on this computer, prints its address and opens it in the default browser. Press Ctrl+C to stop it.

## Targets

| Target                  | What opens                                                          | Where edits are saved                         |
| ----------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| none                    | The current folder                                                  | Files in the current folder                   |
| `page.html`             | That page. Its folder is served, so its stylesheets and images load | Files in the page's folder                    |
| `folder`                | The folder's `index.html`, or a list of its HTML pages              | Files in that folder                          |
| `http://localhost:3000` | A development server running on this computer                       | Files in the current folder                   |
| `https://example.com`   | A live site                                                         | Nowhere. Edits are collected in a change list |

A page that loads files from outside its own folder needs `--root` set to a folder that contains them all.

## Options

| Option            | What it does                                                                          | Default                                            |
| ----------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `--root <folder>` | Sets the folder whose files may be read and edited. The target file must be inside it | The folder served, or the current folder for a URL |
| `--port <number>` | Sets the port to listen on                                                            | Any free port                                      |
| `--no-open`       | Does not open the browser                                                             | The browser opens                                  |
| `-v`, `--version` | Prints the version                                                                    |                                                    |
| `-h`, `--help`    | Prints the help                                                                       |                                                    |

## Exit codes

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| `0`  | Help or version was printed                                    |
| `1`  | The port given with `--port` is in use                         |
| `2`  | The command line could not be understood. The message says why |

## Where an edit is saved

Editdesk tries two ways, in this order.

1. **The page's own HTML file.** Used when the page is an `.html` or `.htm` file on disk and the text on screen matches the file. The edited range of the file is rewritten.
2. **A search of the source files.** Used for everything else: pages rendered by a development server, and text a script put on the page. Editdesk searches the root folder for the old text and rewrites the match.

The search accepts the spellings a character can have in source code. `Don't` on screen matches `Don\'t`, `Don&apos;t` and `Don&#39;t`. Line breaks and indentation between words are ignored.

What the search does with a match depends on the code around it.

| The match is                                                    | Editdesk          | New text is written as                                                                                                                                           |
| --------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All of a quoted string: `"…"`, `'…'` or `` `…` ``               | Saves             | The string's quote character, backslashes and newlines are escaped. In a template string, `${` is escaped                                                        |
| All the text between two tags                                   | Saves             | `&`, `<` and `>` become entities. In `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mdx`, `.vue`, `.svelte` and `.astro` files, `{` and `}` become entities too |
| Words in a `.md`, `.markdown` or `.txt` file                    | Saves             | As typed                                                                                                                                                         |
| Part of something longer, or an attribute value in an HTML file | Asks first        | As typed. Refused when the new text contains quotes, backslashes, brackets, braces, `&`, `$` or backticks                                                        |
| Inside a longer word or a code identifier                       | Ignores the match |                                                                                                                                                                  |

When the text matches in one place, Editdesk saves there. When it matches in several, Editdesk asks which one.

## Files that are searched

Files with these extensions, up to 1 MB each: `.html` `.htm` `.js` `.jsx` `.mjs` `.cjs` `.ts` `.tsx` `.vue` `.svelte` `.astro` `.md` `.markdown` `.mdx` `.txt` `.json` `.yaml` `.yml` `.njk` `.liquid` `.hbs` `.ejs` `.erb` `.php` `.twig`

These folders are never searched or written: `node_modules`, `dist`, `build`, `out`, `coverage`, `vendor`, `test-results`, and any folder whose name starts with a dot.

## Text that cannot be edited

| Text                                                                                                                                       | Why                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| The page title, and text in `script`, `style`, `template`, `noscript`, `textarea`, `select`, `iframe`, `object`, `svg` and `math` elements | It is not copy on the page, or the browser cannot edit it in place |
| Text built while the page runs, such as `Hello ${name}`, plurals and numbers                                                               | It is not written in the source as it appears on screen            |
| Text loaded from a database or an API                                                                                                      | It is not in the source files                                      |
| Text in an HTML file that the browser moves when it repairs invalid markup, such as loose text inside a `table`                            | Its position in the file is not certain                            |

## Files and encoding

Files are read and written as UTF-8. A file is replaced in one step and keeps its permissions, so a development server never reads a half-written file.
