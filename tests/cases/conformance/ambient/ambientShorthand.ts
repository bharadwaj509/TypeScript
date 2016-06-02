// @Filename: declarations.d.ts
declare module "jquery";

// @Filename: user.ts
///<reference path="declarations.d.ts"/>
import foo, {bar} from "jquery";
import * as baz from "jquery";
foo(bar, baz);
