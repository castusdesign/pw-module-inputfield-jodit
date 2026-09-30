# InputfieldJodit

[Jodit](https://xdsoft.net/jodit/) rich text editor for ProcessWire, as a drop-in alternative to the core's InputfieldTinyMCE.

Switch a Textarea field's **Inputfield type** from TinyMCE to Jodit, and the stored HTML stays exactly as it is. Switch back, and TinyMCE's settings are still there. Jodit's settings are stored under their own `jodit*` names.

Why it exists: the core bundles TinyMCE 6.8.2, which has unfixed high-severity XSS advisories (CVE-2026-47759 to 47762). They are only fixed in TinyMCE 7+, which is GPL-licensed or commercial. Jodit is MIT-licensed.

## What it does

- Uses ProcessWire's own **image** (`page/image/`) and **link** (`page/link/`) dialogs, through the `pwimage` and `pwlink` toolbar buttons. Double-clicking an image or link opens them too.
- Edits in an iframe, styled with your own **content stylesheets** (e.g. `/site/assets/css/editor.css`).
- Works in **repeaters and Repeater Matrix** items loaded after the page, in closed Inputfields, and in **language tabs**. Editors start when they become visible and are rebuilt after sorting.
- Runs saved HTML through **HTML Purifier** by default, like InputfieldTinyMCE's "purifier" feature.
- Turns off Jodit's AI assistant, "powered by" branding, and its own image, file and video uploaders.

## Per-field settings

These are under **Input > Jodit editor** on the field:

Fields that share a settings field should be switched from TinyMCE to Jodit together, so none of them points at a field using a different editor.

| Setting | Default |
|---|---|
| Use settings from | none. Pick another Jodit field to use its editor settings (toolbar, formats, height, classes, stylesheets, body class, purifier), and this field's own settings are ignored. It's one level only, like TinyMCE's settings field. If the chosen field isn't a Jodit field, the field falls back to its own settings and shows a warning. |
| Toolbar | `paragraph, bold, italic, underline, strikethrough, \|, ul, ol, indent, outdent, \|, pwlink, unlink, pwimage, table, hr, \|, classSpan, \|, undo, redo, eraser, source, fullsize` |
| Block formats | `p,h2,h3,h4,blockquote` |
| Height (px) | 400 |
| Classes editors can apply (`classSpan` button) | none. One per line, `class` or `class=Label` |
| Content stylesheets | the module's plain default |
| Editing area body class | `mce-content-body` (TinyMCE's), so stylesheets written for TinyMCE apply unchanged |
| Purify HTML on save | on |

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

The "Checks" workflow runs two checks:
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

`tests/e2e` holds Playwright tests that run against a throwaway ProcessWire in Docker: MariaDB, plus PHP and Apache with the pinned ProcessWire release. The install script installs the blank profile and this module. The seed script creates a Jodit body field, an images field, a repeater and a test page.

They check:
- stored HTML survives an unedited save;
- typing and saving;
- ProcessWire's link and image dialogs;
- repeater items;
- HTML Purifier on save, including values posted directly;
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
- **CI:** the "End-to-end tests" workflow runs the suite on every push and pull request, including Dependabot's Jodit updates.

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
