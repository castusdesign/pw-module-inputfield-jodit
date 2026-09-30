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
 * Each style makes one decision for the whole selection: if all of it already
 * has the style it's removed, otherwise it's added to all of it. (Jodit's
 * commitStyle toggles each element on its own, so it's only used to remove.)
 *
 * Styles are {title, value} list items, so Jodit never mistakes a style for one
 * of its own controls (it looks up plain keys and labels as control names).
 */
var InputfieldJoditStyles = {

	inline: ['abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'button', 'cite', 'code', 'del', 'dfn', 'em', 'i', 'ins',
		'kbd', 'label', 'mark', 'meter', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'tt', 'var'],
	block: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],

	// Blocks a block style can convert, and all block elements (which a converted block mustn't contain)
	textBlocks: 'p,h1,h2,h3,h4,h5,h6,div,pre,address',
	blocks: 'address,article,aside,blockquote,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,' +
		'header,hr,li,main,nav,ol,p,pre,section,table,tbody,td,tfoot,th,thead,tr,ul',

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
	 * @returns {Element[]}
	 */
	targets: function(editor, selector) {
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
		return found;
	},

	/**
	 * What a style applies to, as {el} or, for loose content in a container,
	 * {nodes}: for a block style the selected text blocks, and for any other
	 * non-inline style the matching elements
	 *
	 * @param {import('jodit').Jodit} editor
	 * @returns {Array<{el?: Element, nodes?: ChildNode[]}>}
	 */
	styleTargets: function(editor, style) {
		var t = this;
		if(style.kind !== 'block') return this.targets(editor, style.tags.join(',')).map(function(el) { return { el: el }; });
		var sel = editor.s.sel;
		var range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
		var items = [];
		this.targets(editor, this.textBlocks).forEach(function(el) {
			var isBlock = function(node) { return node.nodeType === 1 && /** @type {Element} */ (node).matches(t.blocks); };
			if(!Array.prototype.some.call(el.childNodes, isBlock)) {
				items.push({ el: el });
				return;
			}
			// A container with blocks inside, e.g. <div>Intro<p>Other</p></div>:
			// only the runs of loose content the selection is in
			var run = [];
			var end = function() {
				var text = run.map(function(node) { return node.textContent; }).join('');
				var selected = range && run.some(function(node) { return range.intersectsNode(node); });
				if(text.trim() !== '' && selected) items.push({ nodes: run });
				run = [];
			};
			Array.prototype.forEach.call(el.childNodes, function(node) {
				if(isBlock(node)) end(); else run.push(node);
			});
			end();
		});
		return items;
	},

	/** Whether a target already has the style (for block styles, is also that element) */
	has: function(item, style) {
		var el = item.el;
		if(!el || (style.kind === 'block' && el.nodeName.toLowerCase() !== style.tags[0])) return false;
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

	/**
	 * The selected text nodes, split at the selection's ends so each is wholly selected
	 *
	 * @param {import('jodit').Jodit} editor
	 * @returns {Text[]}
	 */
	selectedText: function(editor) {
		var sel = editor.s.sel;
		if(!sel || !sel.rangeCount || sel.getRangeAt(0).collapsed) return [];
		var range = sel.getRangeAt(0);
		var start = range.startContainer, startOffset = range.startOffset;
		var end = range.endContainer, endOffset = range.endOffset;
		// Split the end first, so the start's offset still applies
		if(end.nodeType === 3 && endOffset < /** @type {Text} */ (end).length) /** @type {Text} */ (end).splitText(endOffset);
		if(start.nodeType === 3 && startOffset > 0) {
			var tail = /** @type {Text} */ (start).splitText(startOffset);
			if(end === start) end = tail;
			start = tail;
			startOffset = 0;
		}
		range.setStart(start, startOffset);
		range.setEnd(end, end.nodeType === 3 ? /** @type {Text} */ (end).length : endOffset);
		var nodes = [];
		var walker = editor.ed.createTreeWalker(editor.editor, NodeFilter.SHOW_TEXT);
		while(walker.nextNode()) {
			var node = /** @type {Text} */ (walker.currentNode);
			if(node.textContent.trim() !== '' && range.intersectsNode(node)) nodes.push(node);
		}
		return nodes;
	},

	/** Whether a text node is inside the inline style's element with its classes */
	styledText: function(editor, node, style) {
		var el = node.parentElement;
		while(el && el !== editor.editor) {
			if(el.nodeName.toLowerCase() === style.tags[0] && style.classes.every(function(cls) { return el.classList.contains(cls); })) return true;
			el = el.parentElement;
		}
		return false;
	},

	/** @param {import('jodit').Jodit} editor */
	applyInline: function(editor, style) {
		var t = this;
		var commit = function() {
			editor.s.commitStyle({ element: /** @type {any} */ (style.tags[0]), attributes: { class: style.classes.join(' ') } });
		};
		var nodes = this.selectedText(editor);
		var unstyled = nodes.filter(function(node) { return !t.styledText(editor, node, style); });
		// Nothing selected (commitStyle styles what's typed next), or all styled: remove it
		if(!unstyled.length) return commit();
		var className = style.classes.join(' ');
		unstyled.forEach(function(node) {
			var prev = node.previousSibling;
			if(prev && prev.nodeType === 1 && prev.nodeName.toLowerCase() === style.tags[0] && /** @type {Element} */ (prev).getAttribute('class') === className) {
				prev.appendChild(node);
				return;
			}
			var el = editor.ed.createElement(style.tags[0]);
			el.className = className;
			node.replaceWith(el);
			el.appendChild(node);
		});
		var range = editor.ed.createRange();
		range.setStartBefore(nodes[0]);
		range.setEndAfter(nodes[nodes.length - 1]);
		editor.s.selectRange(range);
		editor.synchronizeValues();
	},

	/** @param {import('jodit').Jodit} editor */
	apply: function(editor, value) {
		var style = this.parse(value);
		if(style.kind === 'inline') return this.applyInline(editor, style);
		var t = this;
		var targets = this.styleTargets(editor, style);
		if(!targets.length) return;
		var remove = targets.every(function(item) { return t.has(item, style); });
		// The selection's text nodes stay in the document when blocks are renamed or wrapped
		var sel = editor.s.sel;
		var range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
		var styled = targets.map(function(item) {
			var el = item.el;
			if(item.nodes) {
				el = editor.ed.createElement(style.tags[0]);
				item.nodes[0].before(el);
				item.nodes.forEach(function(node) { el.appendChild(node); });
			} else if(!remove && style.kind === 'block') {
				el = t.rename(el, style.tags[0]);
			}
			style.classes.forEach(function(cls) { el.classList.toggle(cls, !remove); });
			if(!el.classList.length) el.removeAttribute('class');
			return el;
		});
		if(!range || !editor.editor.contains(range.startContainer) || !editor.editor.contains(range.endContainer)) {
			range = editor.ed.createRange();
			range.selectNodeContents(styled[0]);
			range.collapse(false);
		}
		editor.s.selectRange(range);
		editor.synchronizeValues();
	},

	/** @param {import('jodit').Jodit} editor */
	isActive: function(editor, value) {
		var style = this.parse(value);
		var t = this;
		if(style.kind === 'inline') {
			var spans = this.targets(editor, style.tags[0]);
			return spans.length > 0 && spans.every(function(el) { return t.has({ el: el }, style); });
		}
		var targets = this.styleTargets(editor, style);
		return targets.length > 0 && targets.every(function(item) { return t.has(item, style); });
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
