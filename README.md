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

| Setting | Default |
|---|---|
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

The "Check bundled Jodit" workflow runs `npm run check-jodit` and fails while `jodit/` doesn't match. A Dependabot PR is therefore red until someone has run `sync-jodit` on it.

Before merging, check the [changelog](https://github.com/xdan/jodit/blob/main/CHANGELOG.md) for changes to the selection, controls or popup APIs that `plugins/pwimage.js`, `plugins/pwlink.js` and `InputfieldJodit.js` use.

## Limitations

- **Combo** (ProFields): enable "Jodit" under the Combo module's *Allowed field/input types* to use it for subfields. That setup is untested, and has two known gaps:
  - Combo only passes the page to TinyMCE subfields, so the `pwimage` button is hidden in a Combo.
  - Combo's Textformatter support doesn't include Jodit.
- **FormBuilder** hasn't been tested.
- No inline or lazy mode yet, and no drag-and-drop image upload.

## Licence

MIT. `plugins/pwimage.js` and `plugins/pwlink.js` are ported from ProcessWire's InputfieldTinyMCE and stay MPL-2.0. The bundled Jodit is MIT. See [LICENSE](LICENSE).
