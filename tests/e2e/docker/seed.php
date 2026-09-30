<?php namespace ProcessWire;
/**
 * Sets up the e2e test site, or resets its content between tests.
 *
 *   php seed.php          install InputfieldJodit and create the fields and test page
 *   php seed.php reset    put the test page back to the fixture content
 *
 * The page is /jodit-test/ (template basic-page) with:
 *   body    Textarea using InputfieldJodit, filled from fixtures/content.html
 *   images  one generated image, which the fixture's <figure> uses
 *   blocks  a repeater with one item, whose body is fixtures/block.html
 *
 * Also TinyMCE fields for the "Copy settings from TinyMCE" tests, on no template:
 *   legacy        TinyMCE, with known settings
 *   legacy_child  TinyMCE, using legacy's settings
 *   switched      Jodit, still holding TinyMCE settings (reset each time)
 *
 * Stored values are the fixtures after HTML Purifier (which the module runs
 * on every save), so an unchanged save should leave them byte-identical.
 */

$reset = in_array('reset', $argv, true);

include '/var/www/html/index.php';
/** @var ProcessWire $wire */
$modules = $wire->modules;
$fields = $wire->fields;
$templates = $wire->templates;
$pages = $wire->pages;
$wire->users->setCurrentUser($wire->users->get('roles=superuser, sort=id'));

if (!$reset) {
    $modules->refresh();
    foreach (['InputfieldJodit', 'FieldtypeRepeater', 'InputfieldTinyMCE'] as $class) {
        if (!$modules->isInstalled($class)) $modules->install($class);
    }
    // Test site only: every test logs in, which the login throttle would block
    if ($modules->isInstalled('SessionLoginThrottle')) $modules->uninstall('SessionLoginThrottle');

    $body = $fields->get('body') ?: new Field();
    $body->type = $modules->get('FieldtypeTextarea');
    $body->name = 'body';
    $body->label = 'Body';
    $body->inputfieldClass = 'InputfieldJodit';
    $body->contentType = FieldtypeTextarea::contentTypeHTML;
    $body->set('joditContentCss', '/site/modules/InputfieldJodit/tests/e2e/fixtures/content.css');
    $body->set('joditClasses', "tick-list=Tick list\nhighlight=Highlight");
    $body->set('joditBodyClass', 'mce-content-body shared-settings');
    $fields->save($body);

    // Takes body's settings. Its own settings differ, so the test can tell
    // they're ignored (including purifier off, which must not apply).
    $summary = $fields->get('summary') ?: new Field();
    $summary->type = $modules->get('FieldtypeTextarea');
    $summary->name = 'summary';
    $summary->label = 'Summary';
    $summary->inputfieldClass = 'InputfieldJodit';
    $summary->contentType = FieldtypeTextarea::contentTypeHTML;
    $summary->set('joditSettingsField', 'body');
    $summary->set('joditToolbar', 'bold');
    $summary->set('joditBodyClass', 'own-settings');
    $summary->set('joditPurifier', 0);
    $fields->save($summary);

    // Points at a field that isn't a Jodit field, so falls back to its own settings
    $notes = $fields->get('notes') ?: new Field();
    $notes->type = $modules->get('FieldtypeTextarea');
    $notes->name = 'notes';
    $notes->label = 'Notes';
    $notes->inputfieldClass = 'InputfieldJodit';
    $notes->contentType = FieldtypeTextarea::contentTypeHTML;
    $notes->set('joditSettingsField', 'title');
    $notes->set('joditToolbar', 'bold, italic');
    $fields->save($notes);

    $images = $fields->get('images') ?: new Field();
    $images->type = $modules->get('FieldtypeImage');
    $images->name = 'images';
    $images->label = 'Images';
    $images->set('extensions', 'png jpg');
    $fields->save($images);

    $blocks = $fields->get('blocks');
    if (!$blocks) {
        $blocks = new Field();
        $blocks->type = $modules->get('FieldtypeRepeater');
        $blocks->name = 'blocks';
        $blocks->label = 'Blocks';
        $fields->save($blocks);
    }
    $repeaterTemplate = $blocks->type->_getRepeaterTemplate($blocks);
    if (!$repeaterTemplate->fieldgroup->has('body')) {
        $repeaterTemplate->fieldgroup->add($body);
        $repeaterTemplate->fieldgroup->save();
    }
    $blocks->set('repeaterFields', [$body->id]);
    $fields->save($blocks);

    // TinyMCE module-wide settings the import must pick up
    $modules->saveConfig('InputfieldTinyMCE', array_merge($modules->getConfig('InputfieldTinyMCE'), [
        'content_css' => 'custom',
        'content_css_url' => '/site/modules/InputfieldJodit/tests/e2e/fixtures/content.css',
        'defaultsJSON' => '{"body_class": "prose"}',
        'styleFormatsCSS' => "span.highlight { color: red; }\nul.tick-list {}",
    ]));

    $legacy = $fields->get('legacy') ?: new Field();
    $legacy->type = $modules->get('FieldtypeTextarea');
    $legacy->name = 'legacy';
    $legacy->inputfieldClass = 'InputfieldTinyMCE';
    $legacy->contentType = FieldtypeTextarea::contentTypeHTML;
    $legacy->set('toolbar', 'styles bold italic pwlink anchor code');
    $legacy->set('height', 321);
    $legacy->set('features', ['toolbar', 'menubar', 'stickybars', 'imgUpload', 'imgResize', 'pasteFilter']);
    $fields->save($legacy);

    $child = $fields->get('legacy_child') ?: new Field();
    $child->type = $modules->get('FieldtypeTextarea');
    $child->name = 'legacy_child';
    $child->inputfieldClass = 'InputfieldTinyMCE';
    $child->contentType = FieldtypeTextarea::contentTypeHTML;
    $child->set('settingsField', 'legacy');
    $fields->save($child);

    $basic = $templates->get('basic-page');
    foreach ([$body, $images, $blocks, $summary, $notes] as $f) {
        if (!$basic->fieldgroup->has($f)) $basic->fieldgroup->add($f);
    }
    $basic->fieldgroup->save();
}

$switched = $fields->get('switched') ?: new Field();
$switched->type = $modules->get('FieldtypeTextarea');
$switched->name = 'switched';
$switched->inputfieldClass = 'InputfieldJodit';
$switched->contentType = FieldtypeTextarea::contentTypeHTML;
foreach ($switched->getArray() as $key => $value) {
    if (strpos($key, 'jodit') === 0) $switched->remove($key);
}
$switched->set('toolbar', 'blocks bold | numlist');
$switched->set('height', 250);
$fields->save($switched);

$page = $pages->get('/jodit-test/');
if (!$page->id) {
    $page = new Page();
    $page->template = 'basic-page';
    $page->parent = $pages->get('/');
    $page->name = 'jodit-test';
    $page->title = 'Jodit test';
    $page->save();
}
$page->of(false);

// One image, generated so the repo holds no binary fixtures
if (!$page->images->count()) {
    $file = sys_get_temp_dir() . '/jodit-e2e.png';
    $img = imagecreatetruecolor(400, 200);
    imagefill($img, 0, 0, imagecolorallocate($img, 60, 160, 140));
    imagepng($img, $file);
    $page->images->add($file);
    $page->save('images');
}
$imageUrl = $page->images->first()->url;

/** @var InputfieldJodit $jodit */
$jodit = $modules->get('InputfieldJodit');
$fixture = function ($name) use ($imageUrl, $jodit) {
    $html = file_get_contents("/e2e-fixtures/$name");
    return $jodit->purifyValue(trim(str_replace('{{image}}', $imageUrl, $html)));
};

$page->body = $fixture('content.html');
$page->save('body');
$page->summary = '<p>Summary text.</p>';
$page->save('summary');
$page->notes = '';
$page->save('notes');

foreach ($page->blocks as $item) $page->blocks->remove($item);
$page->save('blocks');
$item = $page->blocks->getNew();
$item->body = $fixture('block.html');
$item->save();
$page->blocks->add($item);
$page->save('blocks');

echo ($reset ? 'Reset' : 'Seeded') . " /jodit-test/ (page {$page->id}, block {$item->id})\n";
