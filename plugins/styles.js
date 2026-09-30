/**
 * InputfieldJodit "styles" toolbar button: apply the field's styles
 *
 * Each style's value is "tags|classes", e.g. "span|highlight" or
 * "ul,ol|tick-list". Like TinyMCE's style formats, what it does depends on the
 * element:
 * - inline elements (span, small, strong…) wrap the selected text;
 * - block elements (p, h1–h6, blockquote…) turn the selected blocks into that
 *   element with the classes;
 * - anything else (ul, table, img, a…) toggles the classes on those elements in
 *   the selection, and is disabled while there are none.
 *
 * Styles are {title, value} list items, so Jodit never mistakes a style for one
 * of its own controls (it looks up plain keys and labels as control names).
 */
var InputfieldJoditStyles = {

	inline: ['span', 'small', 'strong', 'em', 'b', 'i', 'u', 's', 'code', 'mark', 'sup', 'sub', 'abbr', 'cite', 'q', 'kbd'],
	block: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'div'],

	/** @returns {{tags: string[], classes: string[], kind: string}} */
	parse: function(value) {
		var parts = String(value).split('|');
		var tags = parts[0].split(',');
		var classes = (parts[1] || '').split(' ').filter(Boolean);
		var kind = 'element';
		if(tags.length === 1 && this.inline.indexOf(tags[0]) > -1) kind = 'inline';
		if(tags.length === 1 && this.block.indexOf(tags[0]) > -1) kind = 'block';
		return { tags: tags, classes: classes, kind: kind };
	},

	/**
	 * Elements with one of the tags that contain or are in the selection
	 *
	 * @param {import('jodit').Jodit} editor
	 * @param {string[]} tags
	 * @returns {Element[]}
	 */
	targets: function(editor, tags) {
		var root = editor.editor;
		var selector = tags.join(',');
		var found = [];
		var add = function(el) {
			if(el && el !== root && root.contains(el) && found.indexOf(el) === -1) found.push(el);
		};
		var closest = function(node) {
			if(node && node.nodeType === 3) node = node.parentNode;
			return node && node.nodeType === 1 ? /** @type {Element} */ (node).closest(selector) : null;
		};
		var sel = editor.s.sel;
		var range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
		if(!range) {
			add(closest(editor.s.current()));
			return found;
		}
		add(closest(range.startContainer));
		add(closest(range.endContainer));
		if(!range.collapsed) {
			Array.prototype.forEach.call(root.querySelectorAll(selector), function(el) {
				if(range.intersectsNode(el)) add(el);
			});
		}
		return found;
	},

	hasClasses: function(el, classes) {
		return classes.every(function(cls) { return el.classList.contains(cls); });
	},

	/** @param {import('jodit').Jodit} editor */
	apply: function(editor, value) {
		var style = this.parse(value);
		if(style.kind !== 'element') {
			editor.s.commitStyle({ element: /** @type {any} */ (style.tags[0]), attributes: { class: style.classes.join(' ') } });
			return;
		}
		var targets = this.targets(editor, style.tags);
		if(!targets.length) return;
		var t = this;
		var remove = targets.every(function(el) { return t.hasClasses(el, style.classes); });
		targets.forEach(function(el) {
			style.classes.forEach(function(cls) { el.classList.toggle(cls, !remove); });
			if(!el.classList.length) el.removeAttribute('class');
		});
		editor.synchronizeValues();
	},

	/** @param {import('jodit').Jodit} editor */
	isActive: function(editor, value) {
		var style = this.parse(value);
		var t = this;
		var targets = this.targets(editor, style.tags);
		return targets.length > 0 && targets.every(function(el) { return t.hasClasses(el, style.classes); });
	},

	/** @param {import('jodit').Jodit} editor */
	isDisabled: function(editor, value) {
		var style = this.parse(value);
		return style.kind === 'element' && !this.targets(editor, style.tags).length;
	}
};

Jodit.defaultOptions.controls.styles = {
	icon: 'class-span',
	tooltip: 'Styles',
	list: [],
	/** @param {import('jodit').Jodit} editor */
	childTemplate: function(editor, title) {
		var span = editor.ed.createElement('span');
		span.textContent = title;
		return span.outerHTML;
	},
	/** @param {import('jodit').Jodit} editor */
	childExec: function(editor, current, options) {
		InputfieldJoditStyles.apply(editor, options.control.args[1]);
	},
	/** @param {import('jodit').Jodit} editor */
	isChildActive: function(editor, button) {
		return InputfieldJoditStyles.isActive(editor, button.control.args[1]);
	},
	/** @param {import('jodit').Jodit} editor */
	isChildDisabled: function(editor, button) {
		return InputfieldJoditStyles.isDisabled(editor, button.control.args[1]);
	}
};
