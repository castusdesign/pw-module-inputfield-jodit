<?php namespace ProcessWire;

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
 * @property string $joditToolbar Comma-separated Jodit button names
 * @property int $joditHeight Editor height in pixels
 * @property string $joditContentCss Stylesheet URLs for the editing area, one per line
 * @property string $joditBodyClass Class(es) on the editing area's <body>, for content stylesheets
 * @property string $joditClasses CSS classes editors can apply, one per line as "class" or "class=Label"
 * @property string $joditFormats Block formats, comma-separated from p,h2,h3,h4,h5,h6,blockquote,pre
 * @property int $joditPurifier Run saved HTML through HTML Purifier (1) or not (0)
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

	const defaultToolbar = 'paragraph, bold, italic, underline, strikethrough, |, ul, ol, indent, outdent, |, pwlink, unlink, pwimage, table, hr, |, classSpan, |, undo, redo, eraser, source, fullsize';

	/** @var bool Whether the shared assets have been queued for this request */
	protected static $assetsReady = false;

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
	 * Editor settings passed to InputfieldJodit.js
	 */
	protected function editorSettings(): array {
		$lines = function ($value) {
			return array_values(array_filter(array_map('trim', preg_split('/[\r\n]+/', (string) $value))));
		};

		$classes = [];
		foreach ($lines($this->joditClasses) as $line) {
			[$class, $label] = array_pad(array_map('trim', explode('=', $line, 2)), 2, '');
			$class = $this->wire()->sanitizer->name($class, false, 128, '-', ['allowedExtras' => ['-', '_']]);
			if ($class !== '') $classes[$class] = $label !== '' ? $label : $class;
		}

		$contentCss = $lines($this->joditContentCss);
		if (!count($contentCss)) $contentCss[] = $this->wire()->config->urls($this) . 'InputfieldJoditContent.css';

		$toolbar = array_values(array_filter(array_map('trim', explode(',', (string) $this->joditToolbar))));
		// The image dialog needs a page to pick images from. pwimage.js reads it from
		// the page editor's #Inputfield_id, so a page editor is enough even when
		// hasPage isn't set (Combo only sets it for InputfieldTinyMCE subfields).
		$inPageEditor = $this->wire()->process instanceof WirePageEditor;
		if (!$this->hasPage && !$inPageEditor) $toolbar = array_values(array_diff($toolbar, ['pwimage']));

		return [
			'buttons' => $toolbar,
			'height' => max(100, (int) $this->joditHeight),
			'contentCss' => $contentCss,
			'bodyClass' => trim(preg_replace('/[^\w\s-]/', '', (string) $this->joditBodyClass)),
			'classes' => $classes,
			'formats' => array_values(array_intersect(
				array_map('trim', explode(',', (string) $this->joditFormats)),
				['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre']
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
			parent::___processInput($input);
			$value = $this->purifyValue((string) $this->val());
			if ($value !== $previous) {
				$this->val($value);
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
		if ($value === '' || !$this->joditPurifier) return $value;

		/** @var MarkupHTMLPurifier $purifier */
		$purifier = $this->wire()->modules->get('MarkupHTMLPurifier');
		$purifier->set('Attr.AllowedFrameTargets', ['_blank']);
		return $purifier->purify($value);
	}

	public function ___getConfigInputfields() {
		$inputfields = parent::___getConfigInputfields();
		$modules = $this->wire()->modules;

		/** @var InputfieldFieldset $fs */
		$fs = $modules->get('InputfieldFieldset');
		$fs->label = $this->_('Jodit editor');
		$fs->icon = 'pencil-square-o';
		$inputfields->add($fs);

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
		$f->description = $this->_('Comma-separated, from: p, h2, h3, h4, h5, h6, blockquote, pre');
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
		$f->label = $this->_('Classes editors can apply');
		$f->description = $this->_('One per line, as "class" or "class=Label". Shown in the "classSpan" toolbar button.');
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
