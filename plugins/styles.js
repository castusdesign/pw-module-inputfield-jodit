/**
 * InputfieldJodit "styles" toolbar button: apply the field's styles
 *
 * Each style's value is "tags|classes", e.g. "span|highlight" or
 * "ul,ol|tick-list". What it does depends on the element, as for TinyMCE's
 * styleFormatsCSS (the same element lists as InputfieldTinyMCEFormats):
 * - inline elements (span, small, strong…) wrap the selected text;
 * - p and h1–h6 turn the selected blocks into that element with the classes;
 * - anything else (ul, table, img, blockquote…) changes those elements in the
 *   selection, and is disabled while there are none.
 * Block and other styles make one decision for the whole selection: if every
 * target already has the style it's removed, otherwise it's added to all.
 *
 * Styles are {title, value} list items, so Jodit never mistakes a style for one
 * of its own controls (it looks up plain keys and labels as control names).
 */
var InputfieldJoditStyles = {

	inline: ['abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'button', 'cite', 'code', 'del', 'dfn', 'em', 'i', 'ins',
		'kbd', 'label', 'mark', 'meter', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'tt', 'var'],
	block: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],

	// Blocks a block style can convert (the innermost of these around the text)
	textBlocks: 'p,h1,h2,h3,h4,h5,h6,div,pre,address',

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
	 * Elements matching the selector that contain or are in the selection
	 *
	 * @param {import('jodit').Jodit} editor
	 * @param {string} selector
	 * @param {boolean} [innermost] Leave out any that contain another match
	 * @returns {Element[]}
	 */
	targets: function(editor, selector, innermost) {
		var root = editor.editor;
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
		} else {
			add(closest(range.startContainer));
			add(closest(range.endContainer));
			if(!range.collapsed) {
				Array.prototype.forEach.call(root.querySelectorAll(selector), function(el) {
					if(range.intersectsNode(el)) add(el);
				});
			}
		}
		if(!innermost) return found;
		return found.filter(function(el) {
			return !found.some(function(other) { return other !== el && el.contains(other); });
		});
	},

	/**
	 * What a style applies to: the selected text blocks for a block style, or
	 * the matching elements for any other non-inline style
	 *
	 * @param {import('jodit').Jodit} editor
	 */
	styleTargets: function(editor, style) {
		return style.kind === 'block' ? this.targets(editor, this.textBlocks, true) : this.targets(editor, style.tags.join(','));
	},

	/** Whether the element already has the style (for block styles, is also that element) */
	has: function(el, style) {
		if(style.kind === 'block' && el.nodeName.toLowerCase() !== style.tags[0]) return false;
		return style.classes.every(function(cls) { return el.classList.contains(cls); });
	},

	/**
	 * Replace an element with one of another tag, keeping its attributes and content
	 *
	 * @param {Element} el
	 * @returns {Element}
	 */
	rename: function(el, tag) {
		if(el.nodeName.toLowerCase() === tag) return el;
		var renamed = el.ownerDocument.createElement(tag);
		Array.prototype.forEach.call(el.attributes, function(attr) { renamed.setAttribute(attr.name, attr.value); });
		while(el.firstChild) renamed.appendChild(el.firstChild);
		el.replaceWith(renamed);
		return renamed;
	},

	/** @param {import('jodit').Jodit} editor */
	apply: function(editor, value) {
		var style = this.parse(value);
		if(style.kind === 'inline') {
			editor.s.commitStyle({ element: /** @type {any} */ (style.tags[0]), attributes: { class: style.classes.join(' ') } });
			return;
		}
		var t = this;
		var targets = this.styleTargets(editor, style);
		if(!targets.length) return;
		var remove = targets.every(function(el) { return t.has(el, style); });
		// Markers keep the selection through renamed blocks
		editor.s.save();
		targets.forEach(function(el) {
			if(!remove && style.kind === 'block') el = t.rename(el, style.tags[0]);
			style.classes.forEach(function(cls) { el.classList.toggle(cls, !remove); });
			if(!el.classList.length) el.removeAttribute('class');
		});
		editor.s.restore();
		editor.synchronizeValues();
	},

	/** @param {import('jodit').Jodit} editor */
	isActive: function(editor, value) {
		var style = this.parse(value);
		var t = this;
		var targets = style.kind === 'inline' ? this.targets(editor, style.tags[0]) : this.styleTargets(editor, style);
		return targets.length > 0 && targets.every(function(el) {
			return style.kind === 'inline' ? style.classes.every(function(cls) { return el.classList.contains(cls); }) : t.has(el, style);
		});
	},

	/** @param {import('jodit').Jodit} editor */
	isDisabled: function(editor, value) {
		var style = this.parse(value);
		return style.kind !== 'inline' && !this.styleTargets(editor, style).length;
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
