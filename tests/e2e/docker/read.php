<?php namespace ProcessWire;
/**
 * Prints the test page's stored values as JSON, straight from the database:
 * {"pageId", "body", "blockId", "block", "imageUrl"}
 */
include '/var/www/html/index.php';
/** @var ProcessWire $wire */
$wire->pages->uncacheAll();
$page = $wire->pages->get('/jodit-test/');
$page->of(false);
$block = $page->blocks->first();
echo json_encode([
    'pageId' => $page->id,
    'body' => (string) $page->body,
    'blockId' => $block ? $block->id : 0,
    'block' => $block ? (string) $block->body : '',
    'imageUrl' => $page->images->count() ? $page->images->first()->url : '',
]);
