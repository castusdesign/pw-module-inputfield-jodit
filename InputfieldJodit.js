/**
 * InputfieldJodit: start, stop and sync Jodit editors in the ProcessWire admin
 *
 * Editors are only started while visible (Jodit can't size itself when hidden),
 * so fields in closed Inputfields, unopened repeater items and inactive
 * language tabs start when they're shown. The textarea stays the source of
 * truth: ProcessWire saves it exactly as it would a plain textarea.
 */
var InputfieldJodit = {

	cls: {
		editor: 'InputfieldJoditEditor',
		loaded: 'InputfieldJoditLoaded'
	},

	// Plugins that call out, brand, or duplicate what pwimage/pwlink do
	disablePlugins: [
		'ai-assistant', 'powered-by-jodit', 'speech-recognize', 'about', 'debug',
		'print', 'file', 'video', 'image', 'image-properties', 'drag-and-drop'
	],

	labels: function() {
		var cfg = ProcessWire.config.InputfieldJodit;
		return cfg && cfg.labels ? cfg.labels : {};
	},

	/**
	 * A TinyMCE-style editor.selection for Jodit
	 *
	 * Lets the pwimage/pwlink plugins, ported from InputfieldTinyMCE, keep
	 * calling getNode(), select(), getContent() and setContent() as upstream
	 * does, so they stay a small diff from ProcessWire's originals. Adds
	 * save()/restore(), because ProcessWire's dialogs take focus and Jodit
	 * would otherwise lose the selection.
	 *
	 * @param {import('jodit').Jodit} editor
	 */
	selection: function(editor) {
		var selected = null; // node passed to select(); setContent() replaces it
		return {
			getNode: function() {
				var sel = editor.s.sel;
				var range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
				// A selected image (or other element) rather than a text range
				if(range && range.startContainer === range.endContainer && range.endOffset - range.startOffset === 1) {
					var child = range.startContainer.childNodes[range.startOffset];
					if(child && child.nodeType === 1) return child;
				}
				var node = editor.s.current();
				if(node && node.nodeType === 3) node = node.parentNode;
				return node || editor.editor;
			},
			select: function(node) {
				selected = node;
				editor.s.select(node);
			},
			getContent: function(options) {
				if(options && options.format === 'text') return editor.s.sel ? editor.s.sel.toString() : '';
				return editor.s.html;
			},
			setContent: function(html) {
				if(selected && selected.isConnected) {
					var tmp = editor.ed.createElement('div');
					tmp.innerHTML = html;
					selected.replaceWith.apply(selected, Array.prototype.slice.call(tmp.childNodes));
				} else {
					if(editor.s.hasMarkers) editor.s.restore();
					editor.s.insertHTML(html);
				}
				editor.synchronizeValues();
				editor.e.fire('change');
			},
			save: function() {
				editor.s.save();
			},
			restore: function() {
				if(editor.s.hasMarkers) editor.s.restore();
			}
		};
	},

	options: function(textarea) {
		var s = JSON.parse(textarea.getAttribute('data-jodit') || '{}');
		var formats = { p: 'Paragraph', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4', h5: 'Heading 5', h6: 'Heading 6', blockquote: 'Quote', pre: 'Code' };
		var formatList = {};
		(s.formats || ['p']).forEach(function(tag) { formatList[tag] = formats[tag] || tag; });

		var buttons = s.buttons || [];
		return {
			buttons: buttons,
			buttonsMD: buttons,
			buttonsSM: buttons,
			buttonsXS: buttons,
			toolbarAdaptive: false,
			toolbarSticky: true,
			height: s.height || 400,
			readonly: !!s.readonly,
			iframe: true,
			iframeCSSLinks: s.contentCss || [],
			editorClassName: ('InputfieldJoditContent ' + (s.bodyClass || '')).trim(),
			enter: 'p',
			language: 'en',
			disablePlugins: this.disablePlugins,
			showCharsCounter: false,
			showWordsCounter: false,
			showXPathInStatusbar: false,
			askBeforePasteHTML: false,
			askBeforePasteFromWord: false,
			defaultActionOnPaste: 'insert_clear_html',
			beautifyHTML: false,
			uploader: { insertImageAsBase64URI: false },
			controls: {
				paragraph: { list: formatList },
				classSpan: { list: s.classes || {} }
			},
			popup: {
				a: ['pwlink', 'unlink'],
				img: ['pwimage', 'pwlink', 'unlink']
			}
		};
	},

	init: function(textarea) {
		var $textarea = jQuery(textarea);
		if($textarea.hasClass(this.cls.loaded) || !$textarea.is(':visible')) return;

		var editor = Jodit.make(textarea, this.options(textarea));
		$textarea.addClass(this.cls.loaded).data('jodit', editor);

		// Double-click an image or link to edit it in ProcessWire's dialog
		editor.e.on(editor.editor, 'dblclick', function(e) {
			var target = e.target;
			if(!target || editor.o.readonly) return;
			if(target.nodeName === 'IMG' && typeof pwJodit_image === 'function') {
				editor.s.select(target);
				pwJodit_image(editor);
				return false;
			}
			if(target.closest && target.closest('a') && typeof pwJodit_link === 'function') {
				pwJodit_link(editor);
				return false;
			}
		});

		// Let ProcessWire know the field changed (unsaved-changes warning, dependencies)
		var $inputfield = $textarea.closest('.Inputfield');
		var timer = null;
		editor.events.on('change', function() {
			clearTimeout(timer);
			timer = setTimeout(function() { $inputfield.trigger('change'); }, 300);
		});
	},

	destroy: function(textarea) {
		var $textarea = jQuery(textarea);
		var editor = $textarea.data('jodit');
		if(!editor) return;
		editor.synchronizeValues();
		editor.destruct();
		$textarea.removeClass(this.cls.loaded).removeData('jodit');
	},

	initIn: function($wrapper) {
		var t = this;
		$wrapper.find('textarea.' + t.cls.editor + ':not(.' + t.cls.loaded + ')').each(function() { t.init(this); });
	},

	destroyIn: function($wrapper) {
		var t = this;
		$wrapper.find('textarea.' + t.cls.loaded).each(function() { t.destroy(this); });
	},

	syncAll: function() {
		jQuery('textarea.' + this.cls.loaded).each(function() {
			var editor = jQuery(this).data('jodit');
			if(editor) editor.synchronizeValues();
		});
	},

	ready: function() {
		var t = this;
		t.initIn(jQuery(document));

		jQuery(document)
			// Inputfield opened, or its content reloaded (e.g. a repeater item loaded by AJAX)
			.on('opened reloaded', '.Inputfield', function() { t.initIn(jQuery(this)); })
			// About to be replaced by AJAX: stop editors first so nothing leaks
			.on('reload', '.Inputfield', function() { t.destroyIn(jQuery(this)); })
			// Language tabs and WireTabs
			.on('clicklangtab wiretabclick', function(e, $tab) { if($tab) t.initIn(jQuery($tab)); })
			// Moving an iframe in the DOM resets it, so rebuild editors after sorting
			.on('sortstart', function(e) { t.destroyIn(jQuery(e.target)); })
			.on('sortstop', function(e) { t.initIn(jQuery(e.target)); })
			// Make sure the latest HTML is in each textarea before any submit
			.on('submit', 'form', function() { t.syncAll(); });
	}
};

jQuery(document).ready(function() {
	InputfieldJodit.ready();
});
