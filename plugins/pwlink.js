/**
 * pwlink for Jodit: insert or edit links with ProcessWire's link dialog
 *
 * Ported from ProcessWire's InputfieldTinyMCE plugins/pwlink.js
 * (https://github.com/processwire/processwire). This file stays under the
 * Mozilla Public License 2.0, like the original: https://mozilla.org/MPL/2.0/
 * Changes: TinyMCE selection calls replaced with Jodit's, the selection is
 * saved and restored around the dialog, and the button is a Jodit control.
 */
function pwJoditLink(editor, clickedLink) {

	var $ = jQuery;
	var $iframe;
	var labels = jQuery.extend({ insertLink: 'Insert', cancel: 'Cancel' }, InputfieldJodit.labels());

	var node = clickedLink || editor.s.current();
	if(node && node.nodeType === 3) node = node.parentNode;
	var nodeName = node ? node.nodeName.toUpperCase() : '';
	var selectionText = editor.s.sel ? editor.s.sel.toString() : '';
	var selectionHtml = editor.s.html;
	var $existingLink = null;
	var target = null; // element to replace with the new link, if any

	function getPageId() {
		var $in = $('#Inputfield_id');
		return $in.length ? $in.val() : $(editor.element).closest('.Inputfield').attr('data-pid');
	}

	function putHtml(html) {
		if(target && target.isConnected) {
			var tmp = editor.ed.createElement('div');
			tmp.innerHTML = html;
			target.replaceWith.apply(target, Array.prototype.slice.call(tmp.childNodes));
		} else {
			editor.s.restore();
			editor.s.insertHTML(html);
		}
		editor.synchronizeValues();
		editor.e.fire('change');
	}

	function clickInsert() {
		var $i = $iframe.contents();
		var $a = $($('#link_markup', $i).text());
		if($a.attr('href') && $a.attr('href').length) {
			// Unchanged link text: keep the original markup (e.g. bold or an image inside the link)
			if($a.text() === selectionText || !$a.text().length) $a.html(selectionHtml);
			putHtml($('<div />').append($a).html());
		}
		$iframe.dialog('close');
	}

	function getAnchorIds() {
		var anchors = [];
		$('<div>' + editor.value + '</div>').find('a[id]').each(function() { anchors.push(this.id); });
		return anchors;
	}

	function buildModalUrl() {
		var $textarea = $(editor.element);
		var $langWrapper = $textarea.closest('.LanguageSupport');
		var url = ProcessWire.config.urls.admin + 'page/link/?modal=1&id=' + getPageId();
		var n;

		if($langWrapper.length) {
			url += '&lang=' + $langWrapper.data('language');
		} else {
			var $tableLang = $textarea.parents('.InputfieldTable_langTabs').find('li.ui-state-active a');
			if($tableLang.length && typeof $tableLang.data('lang') !== 'undefined') url += '&lang=' + $tableLang.data('lang');
			else if($('#pw-edit-lang').length) url += '&lang=' + $('#pw-edit-lang').val();
		}

		if($existingLink && $existingLink.length) {
			['href', 'title', 'class', 'rel', 'target'].forEach(function(attr) {
				var val = $existingLink.attr(attr);
				if(val && val.length) url += '&' + attr + '=' + encodeURIComponent(val);
			});
		}

		var anchors = getAnchorIds();
		for(n = 0; n < anchors.length; n++) url += '&anchors[]=' + encodeURIComponent(anchors[n]);

		var linkText = ($existingLink && $existingLink.text().length) ? $existingLink.text() : selectionText;
		if(nodeName !== 'IMG' && linkText.length) url += '&text=' + encodeURIComponent(linkText);
		return url;
	}

	function iframeLoad() {
		var $i = $iframe.contents();
		$i.find('#ProcessPageEditLinkForm').data('iframe', $iframe);
		// Enter in the URL box inserts the link
		$('#link_page_url_input', $i).on('keydown', function(event) {
			var val = ($(this).val() || '').trim();
			if(event.keyCode == 13) {
				event.preventDefault();
				if(val.length) clickInsert();
				return false;
			}
		});
	}

	function init() {
		// Inside a link (possibly within <em> etc.): edit the whole link
		var link = node && node.closest ? node.closest('a') : null;
		if(link) {
			node = link;
			nodeName = 'A';
		}

		if(nodeName === 'A') {
			$existingLink = $(node);
			selectionText = $existingLink.text();
			selectionHtml = $existingLink.html();
			target = node;
		} else if(nodeName === 'IMG') {
			var parentLink = node.closest('a');
			$existingLink = parentLink ? $(parentLink) : null;
			selectionText = node.outerHTML;
			selectionHtml = selectionText;
			target = parentLink || node;
		} else if(nodeName === 'TD' || nodeName === 'TH' || nodeName === 'TR') {
			var first = selectionText.substring(0, 1);
			if(first === '\n' || first === '\r') {
				ProcessWire.alert('Your selection includes part of the table. Please try selecting the text again.');
				return;
			}
		} else if(selectionText.length < 1) {
			return; // nothing selected and not on a link
		}

		editor.s.save(); // the dialog takes focus; restored before inserting

		$iframe = pwModalWindow(buildModalUrl(), {
			title: "<i class='fa fa-link'></i> " + labels.insertLink,
			close: function() { if(editor.s.hasMarkers) editor.s.restore(); },
			buttons: [{
				'class': 'pw_link_submit_insert',
				html: "<i class='fa fa-link'></i> " + labels.insertLink,
				click: clickInsert
			}, {
				html: "<i class='fa fa-times-circle'></i> " + labels.cancel,
				'class': 'ui-priority-secondary',
				click: function() { $iframe.dialog('close'); }
			}]
		}, 'medium');
		$iframe.on('load', iframeLoad);
	}

	init();
}

Jodit.defaultOptions.controls.pwlink = {
	icon: 'link',
	tooltip: 'Link',
	exec: function(editor) { pwJoditLink(editor); }
};
