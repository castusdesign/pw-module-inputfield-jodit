# InputfieldJodit

[Jodit](https://xdsoft.net/jodit/) rich text editor for ProcessWire, as a drop-in alternative to the core's InputfieldTinyMCE.

Switch a Textarea field's **Inputfield type** from TinyMCE to Jodit, and the stored HTML stays exactly as it is. Switch back, and TinyMCE's settings are still there. Jodit's settings are stored under their own `jodit*` names, and can be [copied from TinyMCE's](#switching-from-tinymce).

Why it exists: the core bundles TinyMCE 6.8.2, which has unfixed high-severity XSS advisories (CVE-2026-47759 to 47762). They are only fixed in TinyMCE 7+, which is GPL-licensed or commercial. Jodit is MIT-licensed.

## What it does

- Uses ProcessWire's own **image** (`page/image/`) and **link** (`page/link/`) dialogs, through the `pwimage` and `pwlink` toolbar buttons. Double-clicking an image or link opens them too.
- Edits in an iframe, styled with your own **content stylesheets** (e.g. `/site/assets/css/editor.css`).
- Works in **repeaters and Repeater Matrix** items loaded after the page, in closed Inputfields, and in **language tabs**. Editors start when they become visible and are rebuilt after sorting.
- A **styles** button for the field's own styles, which work like TinyMCE's: on selected text (`span.highlight`, `small.fine-print`), on the selected blocks (`p.lead`, `h2.section-title`), or on other elements in the selection (`ul.tick-list`, `table.striped`, `blockquote.pull`).
- Runs saved HTML through **HTML Purifier** by default, like InputfieldTinyMCE's "purifier" feature.
- Turns off Jodit's AI assistant, "powered by" branding, and its own image, file and video uploaders.

## Per-field settings

These are under **Input > Jodit editor** on the field:

| Setting | Default |
|---|---|
| Use settings from | none. Pick another Jodit field to use its editor settings (toolbar, formats, height, styles, stylesheets, body class, purifier), and this field's own settings are ignored. It's one level only, like TinyMCE's settings field. If the chosen field isn't a Jodit field, the field falls back to its own settings and shows a warning. |
| Toolbar | `paragraph, bold, italic, underline, strikethrough, \|, ul, ol, indent, outdent, \|, pwlink, unlink, pwimage, table, hr, \|, styles, \|, undo, redo, eraser, source, fullsize` |
| Block formats | `p,h2,h3,h4,blockquote`. Also available: `h1`, `h5`, `h6`, `pre` |
| Height (px) | 400 |
| Styles editors can apply (`styles` button) | none. One per line, as `element.class=Label`. What it does depends on the element, as in TinyMCE:<br>- **Inline** (`span`, `small`, `strong`, `em`, `code`, `mark`…): wraps the selected text, e.g. `span.highlight=Highlight`. A plain `class=Label` means `span.class`.<br>- **Block** (`p`, `h1`–`h6`): turns the selected blocks into that element with the class, e.g. `p.lead=Lead paragraph`. In a container of other blocks, such as a `div` with paragraphs in it, only the selected loose text is wrapped.<br>- **Anything else** (`ul`, `ol`, `table`, `img`, `a`, `blockquote`, `pre`, `div`…): toggles the class on those elements in the selection, and is greyed out when there are none. Several elements can share a style: `ul,ol.tick-list=Tick list`.<br>Several classes work too: `span.btn.primary`. Without `=Label`, the classes are the label. The button is hidden when there are no styles. Toolbars saved with Jodit's `classSpan` button get `styles` instead. |
| Content stylesheets | the module's plain default |
| Editing area body class | `mce-content-body` (TinyMCE's), so stylesheets written for TinyMCE apply unchanged |
| Purify HTML on save | on |

## Switching from TinyMCE

1. Change the field's **Input > Inputfield type** to Jodit and save.
2. Under **Input > Jodit editor**, tick **Copy settings from TinyMCE** and save again.

The copy uses the settings TinyMCE really applies to the field: its own settings, TinyMCE's module-wide defaults (content CSS, `defaultsJSON`, `styleFormatsCSS`), and its settings field. That becomes the Jodit toolbar, block formats, styles, content stylesheet, body class, height, purifier and "Use settings from". Anything Jodit can't do is listed after saving, for example the `anchor` button or a style for any element (`.red-text`). TinyMCE's settings are left as they are, so switching back still works.

It's a one-off copy: after it, the Jodit settings are ordinary settings you can change.

From the API, e.g. in a migration:

```php
$field->inputfieldClass = 'InputfieldJodit';
$notes = $modules->get('InputfieldJodit')->importTinyMCE($field);
$fields->save($field);
```

For a Combo subfield, pass its settings prefix, e.g. `importTinyMCE($comboField, 'i2_')`, and set `i2_type` to `Jodit`.

Fields that use another field's settings point at that field with "Use settings from", so switch them together.

## Installing

With Composer (type `processwire-module`, installs to `site/modules/InputfieldJodit/`):

```sh
composer require castusdesign/pw-module-inputfield-jodit
```

Then go to Modules > Refresh, and install **Jodit**.

## Updating Jodit

`jodit/` is committed, because ProcessWire modules are installed without a build step. It must always be the `es2021.en` build of the `jodit` version in `package-lock.json`. Dependabot tracks that version and opens a PR when there's a new release or an advisory.

To update, whether on a Dependabot PR or by hand:

```sh
npm install jodit@<version> --save-exact   # skip on a Dependabot PR
npm ci
npm run sync-jodit                          # copies the build into jodit/
git add jodit package.json package-lock.json
```

The "Tests" workflow runs two checks, alongside the end-to-end tests:
- **`npm run check-jodit`** fails while `jodit/` doesn't match. A Dependabot PR is therefore red until someone has run `sync-jodit` on it.
- **`npm run typecheck`** type-checks `InputfieldJodit.js` and the plugins against the new Jodit's own type definitions. It's TypeScript over plain JavaScript (`checkJs`, no build step), so a renamed or removed method or option we use fails before merge.

Before merging, check the [changelog](https://github.com/xdan/jodit/blob/main/CHANGELOG.md) for changes to the selection, controls or popup APIs that `plugins/pwimage.js`, `plugins/pwlink.js` and `InputfieldJodit.js` use.

## Keeping pwimage and pwlink in step with ProcessWire

`plugins/pwimage.js` and `plugins/pwlink.js` are ProcessWire's own TinyMCE plugins, changed as little as possible. Each change is marked `Jodit:`. That's about 60 lines per file, mostly the port header and the toolbar button.

The plugins still call `selection.getNode()`, `select()`, `getContent()` and `setContent()` as upstream does. Those calls go through the TinyMCE-style adapter, `InputfieldJodit.selection()` in `InputfieldJodit.js`.

To pick up an upstream fix, diff ProcessWire's current plugin against ours, then apply anything outside the `Jodit:` lines:

```sh
diff -u path/to/processwire/wire/modules/Inputfield/InputfieldTinyMCE/plugins/pwimage.js plugins/pwimage.js
```

## Tests

`tests/e2e` holds Playwright tests that run against a throwaway ProcessWire in Docker: MariaDB, plus PHP and Apache with the pinned ProcessWire release. The install script installs the blank profile and this module. The seed script creates Jodit fields, an images field, a repeater, a test page, and TinyMCE fields to copy settings from.

They check:
- stored HTML survives an unedited save;
- typing and saving;
- ProcessWire's link and image dialogs;
- repeater items;
- HTML Purifier on save, including values posted directly;
- "Use settings from";
- the styles button, for text, block and element styles, including across a selection;
- copying settings from TinyMCE, from the API and from the field settings;
- that settings don't collide with InputfieldTinyMCE's.

```sh
npm ci
npx playwright install chromium   # once
npm run test:e2e:up               # build and install the test site (http://localhost:8090)
npm run test:e2e
npm run test:e2e:down             # remove it
```

- **Test against another ProcessWire release:** set `PW_VERSION=3.0.x` when running `test:e2e:up`.
- **Where Playwright can't download its own browser** (older Linux distributions): point `E2E_CHROMIUM_PATH` at an installed Chromium.
- **CI:** the "Tests" workflow runs the suite on pushes to `main` and on pull requests, including Dependabot's Jodit updates. To run it against another ProcessWire release, run the workflow by hand and set its `pw_version`.

## Limitations

- **Combo** (ProFields): enable "Jodit" under the Combo module's *Allowed field/input types* to use it for subfields. Tested by hand, not by the e2e suite: editors start, "Use settings from" works, unedited saves leave values unchanged (apart from character codes, below), and the link and image dialogs work. Combo has a fixed list of text types (TinyMCE, CKEditor, Text and so on) that doesn't include Jodit, so Jodit subfields:
  - can't have Textformatters;
  - have no multi-language variant.

  The `pwimage` button still works in a Combo inside the page editor, even though Combo only passes the page to TinyMCE subfields.
- **Character codes:** named codes such as `&rsquo;` are saved as the plain character (`’`) the first time a field is saved with Jodit. The browser decodes them before Jodit sees them, and unlike TinyMCE, Jodit doesn't encode them again. `&amp;`, `&lt;`, `&gt;` and `&nbsp;` stay as codes.
- **FormBuilder** hasn't been tested.
- No inline or lazy mode yet, and no drag-and-drop image upload.

## Licence

MIT. `plugins/pwimage.js` and `plugins/pwlink.js` are ported from ProcessWire's InputfieldTinyMCE and stay MPL-2.0. The bundled Jodit is MIT. See [LICENSE](LICENSE).
