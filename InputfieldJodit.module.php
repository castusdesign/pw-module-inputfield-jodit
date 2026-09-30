<?php namespace ProcessWire;

require_once __DIR__ . '/InputfieldJoditTinyMCE.php';

/**
 * Jodit rich text editor Inputfield
 *
 * A drop-in alternative to InputfieldTinyMCE for Textarea fields: select it as
 * the field's Inputfield type and the stored HTML stays the same. Uses
 * ProcessWire's own image and link dialogs, and runs saved HTML through
 * HTML Purifier (as InputfieldTinyMCE's "purifier" feature does).
 *
 * Settings are prefixed "jodit" so they never collide with InputfieldTinyMCE's
 * settings on the same field (e.g. its own toolbar and height).
 *
 * @property string $joditSettingsField Name of another Jodit field whose editor settings this field uses ('' for its own)
 * @property string $joditToolbar Comma-separated Jodit button names
 * @property int $joditHeight Editor height in pixels
 * @property string $joditContentCss Stylesheet URLs for the editing area, one per line
 * @property string $joditBodyClass Class(es) on the editing area's <body>, for content stylesheets
 * @property string $joditClasses Styles editors can apply, one per line as "element.class=Label" or "class=Label"
 * @property string $joditFormats Block formats, comma-separated from p,h1,h2,h3,h4,h5,h6,blockquote,pre
 * @property int $joditPurifier Run saved HTML through HTML Purifier (1) or not (0)
 * @property int $joditImportTinyMCE Set by the field settings to copy TinyMCE's settings on the next edit
 *
 * MIT licence. The pwimage/pwlink plugins are ported from ProcessWire's
 * InputfieldTinyMCE and stay MPL-2.0 (see LICENSE).
 */
class InputfieldJodit extends InputfieldTextarea {

	public static function getModuleInfo() {
		return [
			'title' => 'Jodit',
			'summary' => 'Jodit rich text editor, as a drop-in alternative to TinyMCE for Textarea fields',
			'version' => 1,
			'author' => 'Castus',
			'href' => 'https://github.com/castusdesign/pw-module-inputfield-jodit',
			'icon' => 'pencil-square-o',
			'requires' => 'ProcessWire>=3.0.200, MarkupHTMLPurifier',
		];
	}

	const defaultToolbar = 'paragraph, bold, italic, underline, strikethrough, |, ul, ol, indent, outdent, |, pwlink, unlink, pwimage, table, hr, |, styles, |, undo, redo, eraser, source, fullsize';

	/** @var bool Whether the shared assets have been queued for this request */
	protected static $assetsReady = false;

	/** @var array Default value of every jodit* setting */
	protected $joditDefaults = [];

	/** @var array Settings fields already warned about, so each warning shows once */
	protected static $settingsFieldWarned = [];

	public function __construct() {
		parent::__construct();
		$this->set('joditToolbar', self::defaultToolbar);
		$this->set('joditHeight', 400);
		$this->set('joditContentCss', '');
		// TinyMCE's class, so content stylesheets scoped for TinyMCE work unchanged
		$this->set('joditBodyClass', 'mce-content-body');
		$this->set('joditClasses', '');
		$this->set('joditFormats', 'p,h2,h3,h4,blockquote');
		$this->set('joditPurifier', 1);
		$this->set('joditSettingsField', '');
		foreach ($this->getArray() as $key => $value) {
			if (strpos($key, 'jodit') === 0) $this->joditDefaults[$key] = $value;
		}
	}

	public function init() {
		parent::init();
		$this->set('contentType', FieldtypeTextarea::contentTypeHTML);
	}

	/**
	 * Queue Jodit, the module script and its plugins (once per request)
	 */
	protected function renderReadyAssets() {
		if (self::$assetsReady) return;
		self::$assetsReady = true;

		$config = $this->wire()->config;
		$url = $config->urls($this);

		$config->styles->add($url . 'jodit/jodit.min.css');
		$config->styles->add($url . 'InputfieldJodit.css');
		$config->scripts->add($url . 'jodit/jodit.min.js');
		$config->scripts->add($url . 'plugins/pwimage.js');
		$config->scripts->add($url . 'plugins/pwlink.js');
		$config->scripts->add($url . 'plugins/styles.js');
		$config->scripts->add($url . 'InputfieldJodit.js');

		/** @var JqueryUI $jQueryUI */
		$jQueryUI = $this->wire()->modules->get('JqueryUI');
		$jQueryUI->use('modal');

		$config->js($this->className(), [
			'labels' => [
				'selectImage' => $this->_('Select image'),
				'captionText' => $this->_('Your caption text here'),
				'savingImage' => $this->_('Saving image'),
				'cancel' => $this->_('Cancel'),
				'insertImage' => $this->_('Insert image'),
				'selectAnotherImage' => $this->_('Select another'),
				'insertLink' => $this->_('Insert link'),
				'image' => $this->_('Image'),
				'link' => $this->_('Link'),
			],
		]);
	}

	public function renderReady(?Inputfield $parent = null, $renderValueMode = false) {
		$this->renderReadyAssets();
		return parent::renderReady($parent, $renderValueMode);
	}

	/**
	 * The field this field takes its editor settings from, if any
	 *
	 * Only one level: the chosen field's own "Use settings from" is ignored, so
	 * fields pointing at each other can't loop.
	 */
	protected function settingsField(): ?Field {
		$name = (string) $this->joditSettingsField;
		if ($name === '') return null;

		$field = $this->wire()->fields->get($name);
		$own = $this->hasField ? $this->hasField->name : '';
		if ($field && $field->name !== $own && $field->inputfieldClass === $this->className()) return $field;

		$key = $this->attr('name') . '>' . $name;
		if (empty(self::$settingsFieldWarned[$key])) {
			self::$settingsFieldWarned[$key] = true;
			$this->warning(sprintf($this->_('%1$s: settings field "%2$s" is not a Jodit field, so this field\'s own settings are used'), $this->attr('name'), $name));
		}
		return null;
	}

	/**
	 * A jodit* setting, from the settings field when there is one
	 *
	 * @return mixed
	 */
	protected function setting(string $name) {
		$field = $this->settingsField();
		if (!$field) return $this->get($name);
		$value = $field->get($name);
		return $value !== null ? $value : ($this->joditDefaults[$name] ?? null);
	}

	/**
	 * Editor settings passed to InputfieldJodit.js
	 */
	protected function editorSettings(): array {
		$lines = function ($value) {
			return array_values(array_filter(array_map('trim', preg_split('/[\r\n]+/', (string) $value))));
		};

		// "element.class=Label" styles an element; "class=Label" (or "span.class") styles text
		$styles = [];
		$classes = [];
		foreach ($lines($this->setting('joditClasses')) as $line) {
			[$selector, $label] = array_pad(array_map('trim', explode('=', $line, 2)), 2, '');
			[$tag, $class] = strpos($selector, '.') === false ? ['', $selector] : explode('.', $selector, 2);
			$tag = strtolower($tag) ?: 'span';
			$class = $this->wire()->sanitizer->name($class, false, 128, '-', ['allowedExtras' => ['-', '_']]);
			if ($class === '' || !preg_match('/^[a-z][a-z0-9]*$/', $tag)) continue;
			if ($label === '') $label = $class;
			$styles["$tag.$class"] = $label;
			if ($tag === 'span') $classes[$class] = $label;
		}

		$contentCss = $lines($this->setting('joditContentCss'));
		if (!count($contentCss)) $contentCss[] = $this->wire()->config->urls($this) . 'InputfieldJoditContent.css';

		$toolbar = array_values(array_filter(array_map('trim', explode(',', (string) $this->setting('joditToolbar')))));
		// The image dialog needs a page to pick images from. pwimage.js reads it from
		// the page editor's #Inputfield_id, so a page editor is enough even when
		// hasPage isn't set (Combo only sets it for InputfieldTinyMCE subfields).
		$inPageEditor = $this->wire()->process instanceof WirePageEditor;
		if (!$this->hasPage && !$inPageEditor) $toolbar = array_values(array_diff($toolbar, ['pwimage']));

		return [
			'buttons' => $toolbar,
			'height' => max(100, (int) $this->setting('joditHeight')),
			'contentCss' => $contentCss,
			'bodyClass' => trim(preg_replace('/[^\w\s-]/', '', (string) $this->setting('joditBodyClass'))),
			'styles' => $styles,
			'classes' => $classes,
			'formats' => array_values(array_intersect(
				array_map('trim', explode(',', (string) $this->setting('joditFormats'))),
				InputfieldJoditTinyMCE::formats
			)),
			'readonly' => (bool) $this->readonly,
		];
	}

	public function ___render() {
		$this->addClass('InputfieldJoditEditor');
		$this->attr('data-jodit', json_encode($this->editorSettings()));
		return parent::___render();
	}

	public function ___renderValue() {
		$value = $this->wire()->sanitizer->purify((string) $this->val());
		return "<div class='InputfieldJoditValue'>$value</div>";
	}

	public function ___processInput(WireInputData $input) {
		$name = $this->attr('name');
		$value = $input->$name;
		$previous = $this->val();

		if ($value !== null && $value !== $previous && !$this->readonly) {
			// parent::___processInput() sets the value to the submitted input, so
			// always replace it with the purified value
			parent::___processInput($input);
			$value = $this->purifyValue((string) $this->val());
			$this->val($value);
			if ($value === $previous) {
				$this->untrackChange('value');
			} else {
				$this->trackChange('value');
			}
		}

		return $this;
	}

	/**
	 * Normalise line endings and, unless turned off, run HTML Purifier
	 */
	public function purifyValue(string $value): string {
		$value = str_replace(["\r\n", "\r"], "\n", $value);
		if ($value === '' || !$this->setting('joditPurifier')) return $value;

		/** @var MarkupHTMLPurifier $purifier */
		$purifier = $this->wire()->modules->get('MarkupHTMLPurifier');
		$purifier->set('Attr.AllowedFrameTargets', ['_blank']);
		return $purifier->purify($value);
	}

	/**
	 * Copy a field's TinyMCE settings into its Jodit settings (the field isn't saved)
	 *
	 * Reads the settings TinyMCE would really use, so it's the same editor after
	 * switching. TinyMCE's own settings are left as they are.
	 *
	 * @param Field $field
	 * @param string $prefix Prefix of the settings, e.g. 'i2_' for a Combo subfield
	 * @return array Notes on anything Jodit can't do, which wasn't copied
	 */
	public function importTinyMCE(Field $field, string $prefix = ''): array {
		/** @var InputfieldJoditTinyMCE $import */
		$import = $this->wire(new InputfieldJoditTinyMCE());
		return $import->import($field, $prefix);
	}

	/**
	 * Import TinyMCE's settings if "Copy settings from TinyMCE" was ticked on the last save
	 */
	protected function importTinyMCERequested() {
		$field = $this->hasField;
		if (!$field || !$field->get('joditImportTinyMCE') || $field->inputfieldClass !== $this->className()) return;
		$notes = $this->importTinyMCE($field);
		$field->remove('joditImportTinyMCE');
		$this->wire()->fields->save($field);
		foreach ($field->getArray() as $key => $value) {
			if (strpos($key, 'jodit') === 0) $this->set($key, $value);
		}
		$this->message($this->_('Copied the TinyMCE settings into the Jodit settings below'));
		foreach ($notes as $note) $this->warning($this->_('Not copied from TinyMCE:') . ' ' . $note);
	}

	public function ___getConfigInputfields() {
		$this->importTinyMCERequested();
		$inputfields = parent::___getConfigInputfields();
		$modules = $this->wire()->modules;

		/** @var InputfieldFieldset $fs */
		$fs = $modules->get('InputfieldFieldset');
		$fs->label = $this->_('Jodit editor');
		$fs->icon = 'pencil-square-o';
		$inputfields->add($fs);

		/** @var InputfieldSelect $f */
		$f = $modules->get('InputfieldSelect');
		$f->attr('name', 'joditSettingsField');
		$f->label = $this->_('Use settings from');
		$f->description = $this->_('Use another Jodit field\'s editor settings, so a group of fields is configured in one place. The settings below are then ignored.');
		$own = $this->hasField ? $this->hasField->name : '';
		foreach ($this->wire()->fields as $field) {
			if ($field->name === $own || $field->inputfieldClass !== $this->className()) continue;
			$f->addOption($field->name, $field->label ? "$field->label ($field->name)" : $field->name);
		}
		$f->attr('value', (string) $this->joditSettingsField);
		$fs->add($f);

		if ($this->hasField && $this->hasField->inputfieldClass === $this->className()) {
			$f = $modules->get('InputfieldCheckbox');
			$f->attr('name', 'joditImportTinyMCE');
			$f->label = $this->_('Copy settings from TinyMCE');
			$f->description = $this->_('Replaces the settings below with this field\'s TinyMCE settings when you save, including "Use settings from". Anything Jodit can\'t do is listed after saving. The TinyMCE settings are kept, so switching back still works.');
			$f->attr('value', 1);
			$f->collapsed = Inputfield::collapsedYes;
			$fs->add($f);
		}

		$f = $modules->get('InputfieldText');
		$f->attr('name', 'joditToolbar');
		$f->label = $this->_('Toolbar');
		$f->description = $this->_('Comma-separated Jodit button names, with "|" for a separator. "pwimage" and "pwlink" open ProcessWire\'s image and link dialogs.');
		$f->notes = sprintf($this->_('Default: %s'), self::defaultToolbar);
		$f->attr('value', $this->joditToolbar);
		$fs->add($f);

		$f = $modules->get('InputfieldText');
		$f->attr('name', 'joditFormats');
		$f->label = $this->_('Block formats');
		$f->description = $this->_('Comma-separated, from: p, h1, h2, h3, h4, h5, h6, blockquote, pre');
		$f->attr('value', $this->joditFormats);
		$f->columnWidth = 50;
		$fs->add($f);

		$f = $modules->get('InputfieldInteger');
		$f->attr('name', 'joditHeight');
		$f->label = $this->_('Height (px)');
		$f->attr('value', (int) $this->joditHeight);
		$f->columnWidth = 50;
		$fs->add($f);

		$f = $modules->get('InputfieldTextarea');
		$f->attr('name', 'joditClasses');
		$f->label = $this->_('Styles editors can apply');
		$f->description = $this->_('One per line, shown in the "styles" toolbar button. "element.class=Label" puts the class on that element around the cursor, e.g. "ul.tick-list=Tick list" or "p.lead=Lead paragraph". "class=Label" wraps the selected text in a span with the class.');
		$f->attr('value', $this->joditClasses);
		$f->attr('rows', 4);
		$f->columnWidth = 50;
		$fs->add($f);

		$f = $modules->get('InputfieldTextarea');
		$f->attr('name', 'joditContentCss');
		$f->label = $this->_('Content stylesheets');
		$f->description = $this->_('URLs of stylesheets for the editing area, one per line, e.g. /site/assets/css/editor.css');
		$f->attr('value', $this->joditContentCss);
		$f->attr('rows', 4);
		$f->columnWidth = 50;
		$fs->add($f);

		$f = $modules->get('InputfieldText');
		$f->attr('name', 'joditBodyClass');
		$f->label = $this->_('Editing area body class');
		$f->description = $this->_('Class(es) added to the editing area\'s <body>, for content stylesheets that are scoped to a class.');
		$f->notes = $this->_('Default "mce-content-body" matches TinyMCE, so stylesheets written for TinyMCE work unchanged.');
		$f->attr('value', $this->joditBodyClass);
		$fs->add($f);

		$f = $modules->get('InputfieldCheckbox');
		$f->attr('name', 'joditPurifier');
		$f->label = $this->_('Purify HTML on save');
		$f->description = $this->_('Runs saved HTML through HTML Purifier, which strips scripts, event handlers and other unsafe markup. Recommended.');
		$f->attr('value', 1);
		if ($this->joditPurifier) $f->attr('checked', 'checked');
		$fs->add($f);

		return $inputfields;
	}

}
