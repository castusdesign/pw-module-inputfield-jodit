/**
 * pwimage for Jodit: insert or edit images with ProcessWire's image dialog
 *
 * Ported from ProcessWire's InputfieldTinyMCE plugins/pwimage.js
 * (https://github.com/processwire/processwire). This file stays under the
 * Mozilla Public License 2.0, like the original: https://mozilla.org/MPL/2.0/
 * Changes: TinyMCE selection calls replaced with Jodit's, the selection is
 * saved and restored around the dialog, and the button is a Jodit control.
 */
function pwJoditImage(editor, clickedImg) {

	var $ = jQuery;
	var modalUrl = ProcessWire.config.urls.admin + 'page/image/';
	var $link = null; // <a> wrapping the image, when editing a linked image
	var $figcaption = null;
	var $figure = null;
	var labels = jQuery.extend({
		captionText: 'Caption text',
		savingImage: 'Saving',
		insertImage: 'Insert',
		selectImage: 'Select',
		selectAnotherImage: 'Select another',
		cancel: 'Cancel'
	}, InputfieldJodit.labels());

	var node = clickedImg || currentElement();
	if(node && node.nodeName !== 'IMG') node = null; // inserting a new image
	var nodeParent = node ? node.parentNode : null;
	var nodeParentName = nodeParent ? nodeParent.nodeName.toUpperCase() : '';
	var nodeGrandparent = nodeParent ? nodeParent.parentNode : null;
	var nodeGrandparentName = nodeGrandparent ? nodeGrandparent.nodeName.toUpperCase() : '';

	function currentElement() {
		var n = editor.s.current();
		if(n && n.nodeType === 3) n = n.parentNode;
		return n;
	}

	/**
	 * Replace the image (and any <a>/<figure> around it), or insert at the cursor
	 */
	function putHtml(html) {
		var target = null;
		if(node) {
			if(nodeGrandparentName === 'FIGURE') target = nodeGrandparent;
			else if(nodeParentName === 'A' || nodeParentName === 'FIGURE') target = nodeParent;
			else target = node;
		}
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

	function insertImage(src, $i) {
		var $img = $('#selected_image', $i);
		var width = $img.attr('width');
		var alt = $('#selected_image_description', $i).val();
		var caption = $('#selected_image_caption', $i).is(':checked');
		var $hidpi = $('#selected_image_hidpi', $i);
		var hidpi = $hidpi.is(':checked') && !$hidpi.is(':disabled');
		var cls = ($img
			.removeClass('ui-resizable No Alignment resizable_setup')
			.removeClass('rotate90 rotate180 rotate270 rotate-90 rotate-180 rotate-270')
			.removeClass('flip_vertical flip_horizontal')
			.attr('class') || '').trim();
		var $linkToLarger = $('#selected_image_link', $i);
		var linkToLargerHref = $linkToLarger.is(':checked') ? $linkToLarger.val() : '';
		var $insert = $('<img />').attr('src', src).attr('alt', alt);

		if(hidpi) $insert.addClass('hidpi');
		if(caption === false && cls.length) $insert.addClass(cls); // with a caption the class goes on <figure>
		if(width > 0 && $img.attr('data-nosize') != '1') $insert.attr('width', width);

		if($link) {
			if(!linkToLargerHref && $linkToLarger.attr('data-was-checked') == 1) $link = null; // box unchecked
			if($link !== null) {
				if(linkToLargerHref) $link.attr('href', linkToLargerHref);
				$link.append($insert);
				$insert = $link;
			}
		} else if(linkToLargerHref) {
			$insert = $('<a />').attr('href', linkToLargerHref).append($insert);
		}

		if(caption) {
			var $newFigure = $('<figure />');
			if(cls.length) $newFigure.addClass(cls);
			if(!$figcaption || !$figcaption.length) {
				$figcaption = $('<figcaption />').append(alt && alt.length > 1 ? alt : labels.captionText);
			}
			$newFigure.append($figcaption).prepend($insert);
			$insert = $newFigure;
		}

		putHtml($insert[0].outerHTML);
	}

	function insertImageButtonClick($iframe) {
		var $i = $iframe.contents();
		var $img = $('#selected_image', $i);
		var width = $img.attr('width') || $img.width();
		var height = $img.attr('height') || $img.height();
		var file = ($img.attr('src') || '').split('/').pop();
		var imagePageId = $('#page_id', $i).val();
		var hidpi = $('#selected_image_hidpi', $i).is(':checked') ? 1 : 0;
		var rotate = parseInt($('#selected_image_rotate', $i).val());
		var version = pageVersion(imagePageId);

		$iframe.dialog('disable');
		$iframe.setTitle(labels.savingImage);
		$img.removeClass('resized');

		var resizeUrl = modalUrl + 'resize?id=' + imagePageId + '&file=' + file +
			'&width=' + width + '&height=' + height + '&hidpi=' + hidpi + '&version=' + version;
		if(rotate) resizeUrl += '&rotate=' + rotate;
		if($img.hasClass('flip_horizontal')) resizeUrl += '&flip=h';
		else if($img.hasClass('flip_vertical')) resizeUrl += '&flip=v';

		$.get(resizeUrl, function(data) {
			var src = $('<div></div>').html(data).find('#selected_image').attr('src');
			insertImage(src, $i);
			$iframe.dialog('close');
		});
	}

	function pageVersion(pageId) {
		var v = ProcessWire.config.PagesVersions;
		return (v && v.page == pageId) ? v.version : 0;
	}

	function iframeLoad($iframe) {
		var $i = $iframe.contents();
		var buttons = [];

		if($('#selected_image', $i).length) {
			buttons = [{
				html: "<i class='fa fa-camera'></i> " + labels.insertImage,
				click: function() { insertImageButtonClick($iframe); }
			}, {
				html: "<i class='fa fa-folder-open'></i> " + labels.selectAnotherImage,
				'class': 'ui-priority-secondary',
				click: function() {
					var imagePageId = $('#page_id', $iframe.contents()).val();
					$iframe.attr('src', modalUrl + '?id=' + imagePageId + '&modal=1&version=' + pageVersion(imagePageId));
					$iframe.setButtons({});
				}
			}];
		} else {
			// Picking an image: mirror the dialog's own buttons in the modal's button bar
			$('button.pw-modal-button, button[type=submit]:visible', $i).each(function() {
				var $button = $(this);
				buttons.push({ html: $button.html(), click: function() { $button.trigger('click'); } });
				if(!$button.hasClass('pw-modal-button-visible')) $button.hide();
			});
		}

		buttons.push({
			html: "<i class='fa fa-times-circle'></i> " + labels.cancel,
			'class': 'ui-priority-secondary',
			click: function() { $iframe.dialog('close'); }
		});

		$iframe.setButtons(buttons);
		var title = $i.find('title').html();
		if(title && title.length) $iframe.setTitle(title);
	}

	function buildQueryString() {
		var $inputfield = $(editor.element).closest('.Inputfield');
		var $in = $('#Inputfield_id');
		var pageId = $in.length ? $in.val() : $inputfield.attr('data-pid');
		var editPageId = pageId;
		var file = '', hidpi = false, imgWidth, imgHeight, imgDescription, imgLink = '', nodeClass;

		if(node && node.getAttribute('src')) {
			var $node = $(node);
			var imgClass = $node.attr('class');
			nodeClass = $figure ? $figure.attr('class') : imgClass;
			hidpi = imgClass && imgClass.indexOf('hidpi') > -1;
			imgWidth = $node.attr('width');
			imgHeight = $node.attr('height');
			imgDescription = $node.attr('alt');
			imgLink = nodeParentName === 'A' ? $(nodeParent).attr('href') : '';
			var parts = $node.attr('src').split('/');
			file = parts.pop();
			parts = parts.reverse();
			var pathPageId = '';
			// The image's page ID from its path: /1/2/3/ or /123/
			for(var n = 0; n < parts.length; n++) {
				if(parts[n].match(/^\d+$/)) pathPageId = parts[n] + pathPageId;
				else if(pathPageId.length) break;
			}
			if(pathPageId.length) pageId = parseInt(pathPageId);
		}

		var $repeaterItem = $inputfield.closest('.InputfieldRepeaterItem');
		if($repeaterItem.length && $repeaterItem.find('.InputfieldImage').length) {
			var dataPage = $repeaterItem.attr('data-page');
			if(typeof dataPage !== 'undefined') pageId = parseInt(dataPage);
		}

		var q = '?id=' + pageId + '&edit_page_id=' + editPageId + '&modal=1';
		if(file.length) q += '&file=' + file;
		if(imgWidth) q += '&width=' + imgWidth;
		if(imgHeight) q += '&height=' + imgHeight;
		if(nodeClass && nodeClass.length) q += '&class=' + encodeURIComponent(nodeClass);
		q += '&hidpi=' + (hidpi ? '1' : '0');
		if(imgDescription && imgDescription.length) q += '&description=' + encodeURIComponent(imgDescription);
		if($figcaption && $figcaption.length) q += '&caption=1';
		if(imgLink && imgLink.length) q += '&link=' + encodeURIComponent(imgLink);
		q += '&winwidth=' + ($(window).width() - 30);
		var version = pageVersion(pageId);
		if(version) q += '&version=' + version;
		return q;
	}

	function init() {
		if(nodeGrandparentName === 'FIGURE') $figure = $(nodeGrandparent.outerHTML);
		else if(nodeParentName === 'FIGURE') $figure = $(nodeParent.outerHTML);
		if($figure) {
			$figcaption = $figure.find('figcaption');
			$figure.find('img').remove();
		}
		if(nodeParentName === 'A') {
			$link = $(nodeParent.outerHTML);
			$link.find('img').remove();
		}

		editor.s.save(); // the dialog takes focus; restored before inserting

		var $iframe = pwModalWindow(modalUrl + buildQueryString(), {
			title: "<i class='fa fa-fw fa-folder-open'></i> " + labels.selectImage,
			close: function() { if(editor.s.hasMarkers) editor.s.restore(); }
		}, 'large');
		$iframe.on('load', function() { iframeLoad($iframe); });
	}

	init();
}

Jodit.defaultOptions.controls.pwimage = {
	icon: 'image',
	tooltip: 'Image',
	exec: function(editor) {
		var current = editor.s.current();
		pwJoditImage(editor, current && current.nodeName === 'IMG' ? current : null);
	}
};
