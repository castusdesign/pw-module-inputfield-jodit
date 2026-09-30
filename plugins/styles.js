/**
 * InputfieldJodit "styles" toolbar button: apply the field's styles
 *
 * Each style is "element.class" (the list's keys, labels as values):
 * - "span.class" wraps the selected text in <span class="class">, as Jodit's
 *   own classSpan button does;
 * - any other element, e.g. "ul.tick-list" or "p.lead", toggles the class on
 *   that element around the cursor, like TinyMCE's block and selector styles.
 *   It's disabled while the cursor isn't in one.
 *
 * Keys always contain a dot, so they can't be mistaken for Jodit control names.
 */
var InputfieldJoditStyles = {

	/** @returns {{tag: string, cls: string}} */
	parse: function(key) {
		var dot = key.indexOf('.');
		return { tag: key.slice(0, dot).toLowerCase(), cls: key.slice(dot + 1) };
	},

	/**
	 * The element around the cursor that an element style applies to, if any
	 *
	 * @param {import('jodit').Jodit} editor
	 * @param {string} tag
	 * @returns {Element|null}
	 */
	target: function(editor, tag) {
		var node = editor.s.current();
		if(node && node.nodeType === 3) node = node.parentNode;
		var el = node && node.nodeType === 1 ? /** @type {Element} */ (node).closest(tag) : null;
		return el && el !== editor.editor && editor.editor.contains(el) ? el : null;
	},

	/** @param {import('jodit').Jodit} editor */
	apply: function(editor, key) {
		var style = this.parse(key);
		if(style.tag === 'span') {
			editor.s.commitStyle({ element: 'span', attributes: { class: style.cls } });
		} else {
			var el = this.target(editor, style.tag);
			if(!el) return;
			el.classList.toggle(style.cls);
			if(!el.classList.length) el.removeAttribute('class');
		}
		editor.synchronizeValues();
		editor.e.fire('change');
	},

	/** @param {import('jodit').Jodit} editor */
	isActive: function(editor, key) {
		var style = this.parse(key);
		var el = this.target(editor, style.tag === 'span' ? 'span.' + style.cls : style.tag);
		return !!el && el.classList.contains(style.cls);
	}
};

Jodit.defaultOptions.controls.styles = {
	icon: 'class-span',
	tooltip: 'Styles',
	list: {},
	childExec: function(editor, current, options) {
		InputfieldJoditStyles.apply(editor, String(options.control.args[0]));
	},
	isChildActive: function(editor, button) {
		return InputfieldJoditStyles.isActive(editor, String(button.control.args[0]));
	},
	isChildDisabled: function(editor, button) {
		var style = InputfieldJoditStyles.parse(String(button.control.args[0]));
		return style.tag !== 'span' && !InputfieldJoditStyles.target(editor, style.tag);
	}
};
