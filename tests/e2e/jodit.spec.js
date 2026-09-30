// @ts-check
/**
 * End-to-end tests for InputfieldJodit against a throwaway ProcessWire
 * (see docker-compose.yml). They cover what the module glues together:
 * Jodit, the ProcessWire admin (dialogs, repeaters, events) and the save path.
 */
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const USER = 'e2e-admin';
const PASS = 'e2e-pass-12345';
const MODULE_DIR = path.join(__dirname, '..', '..');

// Run a PHP script in the web container, as www-data
function php(script, ...args) {
  return execFileSync('docker', ['compose', 'exec', '-T', 'web', 'su', 'www-data', '-s', '/bin/sh', '-c', ['php', `/e2e/${script}`, ...args].join(' ')], {
    cwd: __dirname,
    encoding: 'utf8',
  });
}

const read = () => JSON.parse(php('read.php'));

async function login(page) {
  await page.goto('/processwire/');
  await page.fill('#login_name', USER);
  await page.fill('#login_pass', PASS);
  await Promise.all([page.waitForNavigation(), page.click('#Inputfield_login_submit')]);
}

async function openEditor(page, pageId) {
  await page.goto(`/processwire/page/edit/?id=${pageId}`);
  await expect(page.locator('#Inputfield_body.InputfieldJoditLoaded')).toBeAttached();
}

const bodyFrame = (page) => page.frameLocator('#wrap_Inputfield_body .jodit-wysiwyg_iframe');

// Select a word in the body editor, as a user dragging over it would
async function selectText(page, selector, text) {
  await page.evaluate(([selector, text]) => {
    const editor = /** @type {any} */ (window).jQuery('#Inputfield_body').data('jodit');
    const el = editor.editor.querySelector(selector);
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes(text));
    const range = editor.ed.createRange();
    range.setStart(node, node.textContent.indexOf(text));
    range.setEnd(node, node.textContent.indexOf(text) + text.length);
    editor.s.selectRange(range);
  }, [selector, text]);
}

async function save(page) {
  await Promise.all([page.waitForNavigation(), page.click('#submit_save')]);
  await expect(page.locator('.NoticeError, .uk-alert-danger')).toHaveCount(0);
}

let errors = [];
let stored;

test.beforeEach(async ({ page }) => {
  php('seed.php', 'reset');
  stored = read();
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
});

test.afterEach(() => {
  expect(errors, 'JavaScript errors on the page').toEqual([]);
});

test('settings never collide with InputfieldTinyMCE settings', () => {
  const source = fs.readFileSync(path.join(MODULE_DIR, 'InputfieldJodit.module.php'), 'utf8');
  const ours = [...source.matchAll(/\$this->set\('(\w+)'/g)].map((m) => m[1]).filter((n) => n !== 'contentType');
  const tinymce = execFileSync('docker', ['compose', 'exec', '-T', 'web', 'cat', '/var/www/html/wire/modules/Inputfield/InputfieldTinyMCE/setting-names.txt'], { cwd: __dirname, encoding: 'utf8' })
    .split(/\s+/).filter(Boolean);
  expect(ours.length).toBeGreaterThan(0);
  expect(ours.filter((n) => tinymce.includes(n))).toEqual([]);
});

test('saving without edits leaves the stored HTML unchanged', async ({ page }) => {
  await openEditor(page, stored.pageId);
  await expect(bodyFrame(page).locator('ul.tick-list')).toBeVisible();
  await save(page);
  expect(read().body).toBe(stored.body);
});

test('typed text is saved, and nothing else changes', async ({ page }) => {
  await openEditor(page, stored.pageId);
  await bodyFrame(page).locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Typed.');
  await save(page);
  expect(read().body).toBe(stored.body.replace('an entity.</p>', 'an entity. Typed.</p>'));
});

test('pwlink inserts a link with ProcessWire\'s link dialog', async ({ page }) => {
  await openEditor(page, stored.pageId);
  await selectText(page, 'ol li', 'First');
  await page.locator('#wrap_Inputfield_body .jodit-toolbar-button_pwlink button').click();
  const dialog = page.frameLocator('.ui-dialog iframe');
  await dialog.locator('#link_page_url_input').fill('https://example.com/jodit');
  await page.click('.ui-dialog .pw_link_submit_insert');
  await expect(bodyFrame(page).locator('a[href="https://example.com/jodit"]')).toHaveText('First');
  await save(page);
  expect(read().body).toContain('<li><a href="https://example.com/jodit">First</a></li>');
});

test('pwlink does nothing when only whitespace is selected', async ({ page }) => {
  await openEditor(page, stored.pageId);
  // The newline between two list items, as a double-click beside the text selects
  await page.evaluate(() => {
    const editor = /** @type {any} */ (window).jQuery('#Inputfield_body').data('jodit');
    const ol = editor.editor.querySelector('ol');
    const gap = [...ol.childNodes].find((n) => n.nodeType === 3 && !n.textContent.trim());
    const range = editor.ed.createRange();
    range.selectNode(gap);
    editor.s.selectRange(range);
  });
  await page.locator('#wrap_Inputfield_body .jodit-toolbar-button_pwlink button').click();
  await page.waitForTimeout(1000);
  await expect(page.locator('.ui-dialog')).toHaveCount(0);
  await save(page);
  expect(read().body).toBe(stored.body);
});

test('double-clicking a link opens the dialog with its URL, and cancelling changes nothing', async ({ page }) => {
  await openEditor(page, stored.pageId);
  await bodyFrame(page).locator('a[href="https://example.com/"]').dblclick();
  const dialog = page.frameLocator('.ui-dialog iframe');
  await expect(dialog.locator('#link_page_url_input')).toHaveValue(/example\.com/);
  await page.locator('.ui-dialog .ui-dialog-buttonpane button', { hasText: 'Cancel' }).click();
  await expect(page.locator('.ui-dialog')).toBeHidden();
  expect(await bodyFrame(page).locator('body').innerHTML()).not.toContain('jodit-selection_marker');
  await save(page);
  expect(read().body).toBe(stored.body);
});

test('pwimage inserts an image with ProcessWire\'s image dialog', async ({ page }) => {
  await openEditor(page, stored.pageId);
  await bodyFrame(page).locator('p').last().click();
  await page.keyboard.press('End');
  await page.locator('#wrap_Inputfield_body .jodit-toolbar-button_pwimage button').click();
  const dialog = page.frameLocator('.ui-dialog iframe');
  // Click the thumbnail (its <a> wrapper has no box of its own, so target the image)
  await dialog.locator(`a[href*="file=${stored.pageId},jodit-e2e.png"] img`).first().click();
  await expect(dialog.locator('#selected_image')).toBeVisible();
  await page.locator('.ui-dialog .ui-dialog-buttonpane button', { hasText: 'Insert image' }).click();
  await expect(bodyFrame(page).locator('img')).toHaveCount(2);
  await save(page);
  expect((read().body.match(/<img /g) || []).length).toBe(2);
});

test('editors in repeater items start when opened and save', async ({ page }) => {
  await openEditor(page, stored.pageId);
  const item = page.locator(`.InputfieldRepeaterItem[data-page="${stored.blockId}"]`);
  const textarea = page.locator(`#Inputfield_body_repeater${stored.blockId}`);
  if (!(await textarea.evaluate((el) => el.classList.contains('InputfieldJoditLoaded')).catch(() => false))) {
    await item.locator('.InputfieldHeader').first().click();
  }
  await expect(textarea).toHaveClass(/InputfieldJoditLoaded/);
  await item.frameLocator('.jodit-wysiwyg_iframe').locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited.');
  await save(page);
  expect(read().block).toBe('<p>Repeater item text. Edited.</p>');
});

test('saved values are always purified, even when submitted directly', async ({ page }) => {
  // Posted straight to the page editor, so Jodit's own clean-up isn't involved
  await openEditor(page, stored.pageId);
  const status = await page.evaluate(async (current) => {
    const form = /** @type {HTMLFormElement} */ (document.querySelector('#ProcessPageEdit'));
    const data = new FormData(form);
    data.set('body', current + '<script>alert(document.cookie)</script>');
    data.set('submit_save', 'Save');
    return (await fetch(form.action, { method: 'POST', body: data, credentials: 'same-origin' })).status;
  }, stored.body);
  expect(status).toBe(200);
  expect(read().body).toBe(stored.body);
});

test('a field using another field\'s settings gets that field\'s editor setup', async ({ page }) => {
  await openEditor(page, stored.pageId);
  await expect(page.locator('#Inputfield_summary.InputfieldJoditLoaded')).toBeAttached();
  const summary = page.locator('#wrap_Inputfield_summary');
  // body's toolbar (with pwlink and pwimage), not summary's own "bold" only
  await expect(summary.locator('.jodit-toolbar-button_pwlink')).toHaveCount(1);
  await expect(summary.locator('.jodit-toolbar-button_pwimage')).toHaveCount(1);
  // body's body class, not summary's own
  const bodyClass = await summary.frameLocator('.jodit-wysiwyg_iframe').locator('body').getAttribute('class');
  expect(bodyClass).toContain('shared-settings');
  expect(bodyClass).not.toContain('own-settings');
});

test('a field using another field\'s settings is purified by that field\'s setting', async ({ page }) => {
  // summary's own joditPurifier is off, body's is on, and body's must apply
  await openEditor(page, stored.pageId);
  const status = await page.evaluate(async () => {
    const form = /** @type {HTMLFormElement} */ (document.querySelector('#ProcessPageEdit'));
    const data = new FormData(form);
    data.set('summary', '<p>Summary text.</p><img src="x" onerror="alert(1)">');
    data.set('submit_save', 'Save');
    return (await fetch(form.action, { method: 'POST', body: data, credentials: 'same-origin' })).status;
  });
  expect(status).toBe(200);
  expect(read().summary).not.toContain('onerror');
});

test('a settings field that isn\'t a Jodit field falls back to the field\'s own settings, with a warning', async ({ page }) => {
  await openEditor(page, stored.pageId);
  await expect(page.locator('#Inputfield_notes.InputfieldJoditLoaded')).toBeAttached();
  const notes = page.locator('#wrap_Inputfield_notes');
  await expect(notes.locator('.jodit-toolbar-button_bold')).toHaveCount(1);
  await expect(notes.locator('.jodit-toolbar-button_pwlink')).toHaveCount(0);
  await expect(page.getByText('settings field "title" is not a Jodit field')).toBeVisible();
});

test('HTML Purifier strips unsafe markup on save', async ({ page }) => {
  await openEditor(page, stored.pageId);
  await page.evaluate(() => {
    const editor = /** @type {any} */ (window).jQuery('#Inputfield_body').data('jodit');
    editor.value = '<p>Safe</p><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><svg onload="alert(1)"></svg>';
  });
  await save(page);
  const body = read().body;
  expect(body).toContain('<p>Safe</p>');
  expect(body).not.toMatch(/onerror|onload|javascript:|<svg|<script/i);
});

// "Copy settings from TinyMCE" (see seed.php for the TinyMCE settings)
const imported = (field) => JSON.parse(php('import.php', field));

test('TinyMCE settings are copied as TinyMCE really uses them', () => {
  const { settings, notes } = imported('legacy');
  expect(settings).toEqual({
    // The field's toolbar, with its styles menu as block formats and classes
    joditToolbar: 'paragraph, |, styles, |, bold, italic, pwlink, unlink, source',
    joditFormats: 'p,h1,h2,h3,h4,h5,h6,blockquote,pre',
    // From the module-wide styleFormatsCSS, content CSS and defaultsJSON
    joditClasses: 'highlight\nul.tick-list',
    joditContentCss: '/site/modules/InputfieldJodit/tests/e2e/fixtures/content.css',
    joditBodyClass: 'mce-content-body prose',
    joditHeight: 321,
    // The field doesn't have the purifier feature
    joditPurifier: 0,
  });
  expect(notes).toEqual(["Toolbar buttons Jodit doesn't have: anchor"]);
});

test('a TinyMCE field using another field\'s settings uses that field\'s Jodit settings', () => {
  const { settings, notes } = imported('legacy_child');
  expect(settings.joditSettingsField).toBe('legacy');
  expect(notes).toEqual([]);
});

test('ticking "Copy settings from TinyMCE" copies them into the field\'s Jodit settings', async ({ page }) => {
  const { id } = imported('switched');
  await page.goto(`/processwire/setup/field/edit?id=${id}`);
  await page.evaluate(() => {
    /** @type {HTMLInputElement} */ (document.querySelector('input[name="joditImportTinyMCE"]')).checked = true;
  });
  await Promise.all([page.waitForNavigation(), page.click('#Inputfield_submit_save_field')]);
  await expect(page.getByText('Copied the TinyMCE settings into the Jodit settings below')).toBeAttached();
  await expect(page.locator('input[name="joditToolbar"]')).toHaveValue('paragraph, |, bold, |, ol');
  const { stored } = imported('switched');
  expect(stored).toMatchObject({ joditToolbar: 'paragraph, |, bold, |, ol', joditFormats: 'p,h1,h2,h3,h4,h5,h6', joditHeight: 250 });
  expect(stored.joditImportTinyMCE).toBeUndefined();
});

// The "styles" button (see seed.php for body's styles)
async function applyStyle(page, label) {
  await page.locator('#wrap_Inputfield_body .jodit-toolbar-button_styles button').first().click();
  await page.locator('.jodit-popup').getByText(label, { exact: true }).click();
}

test('an element style is taken off and put back on the element around the cursor', async ({ page }) => {
  await openEditor(page, stored.pageId);
  await bodyFrame(page).locator('ul.tick-list li').first().click();
  await applyStyle(page, 'Tick list');
  await expect(bodyFrame(page).locator('ul')).not.toHaveClass(/tick-list/);
  await save(page);
  expect(read().body).toBe(stored.body.replace('<ul class="tick-list">', '<ul>'));

  await openEditor(page, stored.pageId);
  await bodyFrame(page).locator('ul li').first().click();
  await applyStyle(page, 'Tick list');
  await save(page);
  expect(read().body).toBe(stored.body);
});

test('an element style is only enabled while the cursor is in that element', async ({ page }) => {
  const stylesButton = page.locator('#wrap_Inputfield_body .jodit-toolbar-button_styles button').first();
  const tickList = page.locator('.jodit-popup .jodit-toolbar-button').filter({ hasText: 'Tick list' }).locator('button').first();
  await openEditor(page, stored.pageId);
  await bodyFrame(page).locator('ol li').first().click();
  await stylesButton.click();
  await expect(tickList).toBeDisabled();
  await page.keyboard.press('Escape');
  await bodyFrame(page).locator('ul li').first().click();
  await stylesButton.click();
  await expect(tickList).toBeEnabled();
});

test('a text style wraps the selected text in a span', async ({ page }) => {
  await openEditor(page, stored.pageId);
  await selectText(page, 'p', 'First');
  await applyStyle(page, 'Highlight');
  await save(page);
  expect(read().body).toContain('<p><span class="highlight">First</span> paragraph');
});
