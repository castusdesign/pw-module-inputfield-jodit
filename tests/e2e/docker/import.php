<?php namespace ProcessWire;
/**
 * Prints, as JSON, what "Copy settings from TinyMCE" makes of a field's TinyMCE
 * settings, and the Jodit settings the field has stored:
 *   php import.php <field>   {"settings", "notes", "stored", "id"}
 */
include '/var/www/html/index.php';
/** @var ProcessWire $wire */
$field = $wire->fields->get($argv[1]);
$wire->modules->get('InputfieldJodit'); // loads InputfieldJoditTinyMCE
$import = $wire->wire(new InputfieldJoditTinyMCE());
$stored = [];
foreach ($field->getArray() as $key => $value) {
    if (strpos($key, 'jodit') === 0) $stored[$key] = $value;
}
echo json_encode($import->convert($field->getArray()) + ['stored' => $stored, 'id' => $field->id]);
