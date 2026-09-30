// Globals the module's scripts use from the ProcessWire admin. jQuery and
// ProcessWire are deliberately untyped: the type check is there to catch
// changes in Jodit's API, not to type ProcessWire's admin code.
declare const jQuery: any;
declare const ProcessWire: any;
declare function pwModalWindow(url: string, settings?: object, size?: string): any;
declare const Jodit: typeof import('jodit').Jodit;
declare function pwJodit_image(editor: import('jodit').Jodit): void;
declare function pwJodit_link(editor: import('jodit').Jodit): void;
