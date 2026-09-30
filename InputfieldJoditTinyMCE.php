<?php namespace ProcessWire;

/**
 * Copies a field's InputfieldTinyMCE settings into InputfieldJodit's settings
 *
 * The settings TinyMCE would really use are read from InputfieldTinyMCE itself
 * (field settings over module defaults, defaultsJSON, styleFormatsCSS and so
 * on), then translated. Anything Jodit can't do is left out and listed in the
 * notes returned, so nothing is lost silently. TinyMCE's settings are only
 * read, so switching the field back to TinyMCE still works.
 */
class InputfieldJoditTinyMCE extends Wire {

	/** TinyMCE toolbar button => Jodit button ('' = add to block formats instead) */
	const buttons = [
		'styles' => 'paragraph', 'blocks' => 'paragraph',
		'bold' => 'bold', 'italic' => 'italic', 'underline' => 'underline', 'strikethrough' => 'strikethrough',
		'superscript' => 'superscript', 'subscript' => 'subscript',
		'bullist' => 'ul', 'numlist' => 'ol', 'indent' => 'indent', 'outdent' => 'outdent',
		'alignleft' => 'align', 'aligncenter' => 'align', 'alignright' => 'align', 'alignjustify' => 'align', 'alignnone' => 'align',
		'pwlink' => 'pwlink', 'link' => 'pwlink', 'unlink' => 'unlink',
		'pwimage' => 'pwimage', 'image' => 'pwimage',
		'table' => 'table', 'hr' => 'hr', 'charmap' => 'symbols', 'forecolor' => 'brush', 'backcolor' => 'brush',
		'removeformat' => 'eraser', 'undo' => 'undo', 'redo' => 'redo', 'code' => 'source', 'fullscreen' => 'fullsize',
		'selectall' => 'selectall', 'cut' => 'cut', 'copy' => 'copy', 'paste' => 'paste', 'searchreplace' => 'find',
		'blockquote' => '',
	];

	/** Block formats Jodit's paragraph button supports, in menu order */
	const formats = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre'];

	/**
	 * Jodit settings for the given TinyMCE settings
	 *
	 * @param array $data TinyMCE settings as stored on a field (e.g. $field->getArray())
	 * @return array ['settings' => [joditName => value], 'notes' => [string]]
	 */
	public function convert(array $data): array {
		$notes = [];
		$settings = [];

		/** @var InputfieldTinyMCE|null $mce */
		$mce = $this->wire()->modules->get('InputfieldTinyMCE');
		if (!$mce) throw new WireException('InputfieldTinyMCE is not available');
		foreach ($data as $key => $value) $mce->set($key, $value);

		/** @var InputfieldTinyMCESettings $helper */
		$helper = $mce->settings;
		$defaults = $helper->getDefaults();
		$layers = [$helper->getAddDefaults()];
		if (in_array('settingsJSON', (array) $mce->optionals)) {
			$tools = $mce->tools;
			$file = (string) $mce->settingsFile;
			if ($file !== '') $layers[] = (array) $tools->jsonDecodeFile($this->wire()->config->paths->root . ltrim($file, '/'), 'settingsFile');
			$json = trim((string) $mce->settingsJSON);
			if ($json !== '') $layers[] = (array) $tools->jsonDecode($json, 'settingsJSON');
		}
		$mceSettings = array_merge($defaults, $helper->getSettings($defaults));
		// Without the field settings, whose content_style includes styleFormatsCSS
		$siteSettings = $defaults;
		foreach ($layers as $layer) {
			$mceSettings = $this->applyAdd($mceSettings, $layer);
			$siteSettings = $this->applyAdd($siteSettings, $layer);
		}

		$settingsField = (string) $mce->settingsField;
		if ($settingsField !== '') {
			$name = explode(':', $settingsField)[0];
			$field = $this->wire()->fields->get(ctype_digit($name) ? (int) $name : $name);
			if ($field) {
				$settings['joditSettingsField'] = $field->name;
			} else {
				$notes[] = sprintf($this->_('Settings field "%s" doesn\'t exist, so it isn\'t used'), $settingsField);
			}
		}

		// Toolbar and block formats
		$styles = [];
		$toolbar = [];
		$formats = [];
		$dropped = [];
		foreach (preg_split('/\s+/', trim(str_replace('|', ' | ', (string) ($mceSettings['toolbar'] ?? '')))) as $button) {
			if ($button === '') continue;
			if ($button === '|') {
				$toolbar[] = '|';
			} else if (!array_key_exists($button, self::buttons)) {
				$dropped[] = $button;
			} else if (self::buttons[$button] === '') {
				$formats[] = $button;
			} else {
				$toolbar[] = self::buttons[$button];
				if ($button === 'blocks') {
					$formats = array_merge($formats, $this->blockFormatTags((string) ($mceSettings['block_formats'] ?? '')));
				} else if ($button === 'styles') {
					// TinyMCE's styles menu holds both block formats and classes
					$formats = array_merge($formats, $this->styleFormatTags($mceSettings['style_formats'] ?? []));
					$styles = $this->styles($mceSettings['style_formats'] ?? [], $notes);
				}
				// As TinyMCE does, separate its styles/blocks menu from the other buttons
				if ($button === 'styles' || $button === 'blocks') $toolbar[] = '|';
				if (count($styles) && end($toolbar) === '|' && !in_array('styles', $toolbar)) array_push($toolbar, 'styles', '|');
				// TinyMCE removes links from the link's own toolbar; Jodit needs the button
				if ($button === 'pwlink' && !preg_match('/\bunlink\b/', (string) $mceSettings['toolbar'])) $toolbar[] = 'unlink';
			}
		}
		if (count($dropped)) $notes[] = sprintf($this->_('Toolbar buttons Jodit doesn\'t have: %s'), implode(', ', $dropped));
		$settings['joditToolbar'] = implode(', ', $this->tidyToolbar($toolbar));
		if (in_array('paragraph', $toolbar)) {
			$formats = array_values(array_intersect(self::formats, array_merge(['p'], $formats)));
			$settings['joditFormats'] = implode(',', $formats);
		}
		// Text styles as plain "class", as the setting has always taken them
		$settings['joditClasses'] = implode("\n", array_map(function ($style, $label) {
			if (strpos($style, 'span.') === 0) $style = substr($style, 5);
			return $label === '' ? $style : "$style=$label";
		}, array_keys($styles), $styles));

		// Editing area
		$css = (string) $helper->getContentCssUrl((string) ($mceSettings['content_css'] ?? ''));
		if (strpos($css, '/InputfieldTinyMCE/content_css/') !== false) {
			$settings['joditContentCss'] = '';
			if (basename($css, '.css') !== 'wire') $notes[] = sprintf($this->_('TinyMCE\'s built-in "%s" content style isn\'t available, so Jodit\'s default is used'), basename($css, '.css'));
		} else {
			$settings['joditContentCss'] = preg_replace('/\?.*$/', '', $css);
		}
		$tinymceStyle = $this->tinymceDefault($mce, 'content_style');
		if (trim((string) ($siteSettings['content_style'] ?? '')) !== trim((string) $tinymceStyle)) $notes[] = $this->_('Extra content CSS (content_style) isn\'t imported: add it to a content stylesheet');
		$settings['joditBodyClass'] = trim('mce-content-body ' . ($mceSettings['body_class'] ?? ''));
		if ((int) ($mceSettings['height'] ?? 0) > 0) $settings['joditHeight'] = (int) $mceSettings['height'];
		if ($mce->inlineMode) $notes[] = $this->_('Inline mode isn\'t supported, so the normal editor is used');

		$settings['joditPurifier'] = $mce->useFeature('purifier') ? 1 : 0;

		// The settings field's own import reports what it can't do, and this
		// field's own settings are ignored while it has one
		if (isset($settings['joditSettingsField'])) $notes = [];

		// Translated strings come back entity-encoded; these are plain text
		$notes = array_map([$this->wire()->sanitizer, 'unentities'], $notes);

		return ['settings' => $settings, 'notes' => $notes];
	}

	/**
	 * A setting's value in TinyMCE's own defaults.json, before any site's changes
	 *
	 * @return mixed
	 */
	protected function tinymceDefault(InputfieldTinyMCE $mce, string $name) {
		$file = $this->wire()->config->paths($mce) . 'defaults.json';
		$defaults = is_file($file) ? json_decode((string) file_get_contents($file), true) : [];
		return $defaults[$name] ?? null;
	}

	/**
	 * Import TinyMCE settings into a field's Jodit settings (the field isn't saved)
	 *
	 * @param Field $field
	 * @param string $prefix Prefix of the settings, e.g. 'i2_' for a Combo subfield
	 * @return array Notes on anything that wasn't imported
	 */
	public function import(Field $field, string $prefix = ''): array {
		$data = [];
		foreach ($field->getArray() as $key => $value) {
			if ($prefix === '' || strpos($key, $prefix) === 0) $data[substr($key, strlen($prefix))] = $value;
		}
		$result = $this->convert($data);
		foreach ($result['settings'] as $key => $value) $field->set($prefix . $key, $value);
		return $result['notes'];
	}

	/**
	 * Apply settings over others the way TinyMCE does: add_ and append_ add to
	 * a setting, replace_ replaces it, and anything else replaces it
	 */
	protected function applyAdd(array $settings, array $add): array {
		foreach ($add as $key => $value) {
			if (preg_match('/^(add|append|replace)_(.+)$/', $key, $m)) {
				$key = $m[2];
				$current = $settings[$key] ?? null;
				if ($m[1] !== 'replace' && is_string($current) && is_string($value)) {
					$value = "$current $value";
				} else if ($m[1] !== 'replace' && is_array($current) && is_array($value)) {
					$value = array_merge($current, $value);
				}
			}
			$settings[$key] = $value;
		}
		return $settings;
	}

	/**
	 * Styles for the "styles" button, from style formats that put one class on
	 * text or on an element
	 *
	 * @return array "element.class" => label ('' when TinyMCE's style had no title)
	 */
	protected function styles(array $styleFormats, array &$notes): array {
		$styles = [];
		$skipped = [];
		$walk = function (array $items) use (&$walk, &$styles, &$skipped) {
			foreach ($items as $item) {
				if (!is_array($item)) continue;
				if (isset($item['items'])) {
					$walk($item['items']);
					continue;
				}
				if (empty($item['classes'])) continue;
				$class = trim((string) $item['classes']);
				$title = (string) ($item['title'] ?? $class);
				// styleFormatsCSS styles without a title comment are titled with their selector
				$label = $title === $class || preg_match('/^[\w-]*\.[\w.-]+$/', $title) ? '' : $title;
				if (!empty($item['selector'])) {
					$tags = array_map('trim', explode(',', (string) $item['selector']));
				} else if (!empty($item['block'])) {
					$tags = [(string) $item['block']];
				} else {
					$tags = [(string) ($item['inline'] ?? '')];
				}
				$simple = !preg_match('/\s/', $class) && !array_filter($tags, function ($tag) {
					return !preg_match('/^[a-z][a-z0-9]*$/', $tag);
				});
				if (!$simple) {
					$skipped[] = $title;
					continue;
				}
				foreach ($tags as $tag) $styles["$tag.$class"] = $label;
			}
		};
		$walk($styleFormats);
		if (count($skipped)) $notes[] = sprintf($this->_('Styles Jodit can\'t apply, because they use more than one class or a complex selector: %s'), implode(', ', $skipped));
		return $styles;
	}

	/** Block format tags in TinyMCE's style formats (the "styles" button) */
	protected function styleFormatTags(array $styleFormats): array {
		$tags = [];
		$walk = function (array $items) use (&$walk, &$tags) {
			foreach ($items as $item) {
				if (!is_array($item)) continue;
				if (isset($item['items'])) $walk($item['items']);
				foreach (['format', 'block'] as $key) {
					if (isset($item[$key]) && empty($item['classes']) && in_array($item[$key], self::formats, true)) $tags[] = $item[$key];
				}
			}
		};
		$walk($styleFormats);
		return $tags;
	}

	/** Block format tags in TinyMCE's block_formats (the "blocks" button), e.g. "Paragraph=p; Heading 2=h2" */
	protected function blockFormatTags(string $blockFormats): array {
		$tags = [];
		foreach (explode(';', $blockFormats) as $format) {
			$parts = explode('=', $format);
			$tag = trim(end($parts));
			if ($tag !== '') $tags[] = $tag;
		}
		return $tags;
	}

	/** Remove repeated buttons and separators, and separators at either end */
	protected function tidyToolbar(array $toolbar): array {
		$out = [];
		foreach ($toolbar as $button) {
			if ($button !== '|' && in_array($button, $out, true)) continue;
			if ($button === '|' && (!count($out) || end($out) === '|')) continue;
			$out[] = $button;
		}
		while (count($out) && end($out) === '|') array_pop($out);
		return $out;
	}
}
