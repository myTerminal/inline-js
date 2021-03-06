/* eslint no-console: 0 */
var {describe, it} = require("mocha"),
	chai = require("chai"),
	{assert} = chai,
	proxyquire = require("proxyquire"),
	sinon = require("sinon"),
	conf = require("../.inline.js");
	
chai.use(require("chai-subset"));
	
var content = "";

var fs = {
	readFileSync: sinon.spy(() => content)
};

var fsExtra = {
	outputFileSync: sinon.spy()
};

var {
	inlines, inline, parseInline, createShortcuts
} = proxyquire("../index", {fs, "fs-extra": fsExtra});

describe("parseInline", () => {
	
	it(".shortcut", () => {
		var parsed = parseInline("$inline.shortcut('a', 'b')");
		assert.containSubset(parsed, {
			type: "$inline.shortcut",
			params: ["a", "b"]
		});
	});
});

describe("createShortcuts", () => {
	
	var prepare = (name, expand) => {
		var shortcuts = createShortcuts();
		shortcuts.addGlobal({name, expand});
		return shortcuts;
	};
	
	it("basic", () => {
		var shortcuts = prepare("test", "a.txt|tr:$1");
		assert.equal(shortcuts.expand("", "test:abc"), "a.txt|tr:abc");
	});
	
	it("multiple arguments", () => {
		var shortcuts = prepare("test", "a.txt|tr:$1|tr2:$2");
		assert.equal(shortcuts.expand("", "test:abc,123"), "a.txt|tr:abc|tr2:123");
	});
	
	it("$&", () => {
		var shortcuts = prepare("test", "a.txt|tr:$&");
		assert.equal(shortcuts.expand("", "test:abc,123"), "a.txt|tr:abc,123");
	});
	
	it("additional pipes", () => {
		var shortcuts = prepare("test", "a.txt|tr");
		assert.equal(shortcuts.expand("", "test|tr2|tr3"), "a.txt|tr|tr2|tr3");
	});
	
});

describe("inlines", () => {
	
	it("$inline", () => {
		var [parsed] = [...inlines("$inline('path/to/file')")];
		assert.containSubset(parsed, {
			type: "$inline",
			start: 0,
			end: 23
		});
	});
	
	it(".start .end", () => {
		var [parsed] = [...inlines("$inline.start('./a.txt')\ntest\n$inline.end")];
		assert.containSubset(parsed, {
			type: "$inline.start",
			start: 25,
			end: 29
		});
	});
	
	it(".line", () => {
		var [parsed] = [...inlines("test\ntest$inline.line('path/to/file')test\ntest")];
		assert.containSubset(parsed, {
			type: "$inline.line",
			start: 5,
			end: 41
		});
	});
	
	it(".shortcut", () => {
		var [parsed] = [...inlines("$inline.shortcut('test', 'file|t1:$2,$1')")];
		assert.containSubset(parsed, {
			type: "$inline.shortcut",
			params: ["test", "file|t1:$2,$1"]
		});
	});

});

describe("inline", () => {
	it("maxDepth", () => {
		var resourceCenter = {
			read: sinon.spy(() => {
				assert.isBelow(resourceCenter.read.callCount, 20);
				return "$inline('./self')";
			})
		};
		assert.throws(() => {
			inline({
				resourceCenter,
				resource: {name: "file", args: "./self"},
				maxDepth: 10, depth: 0
			});
		}, "Max recursion depth 10");
	});
	
	it("shortcut", () => {
		var resourceCenter = {
			read() {
				this.read = this.read2;
				return "$inline.shortcut('pkg', '../package.json|parse:$1')\n$inline('pkg:test')";
			},
			read2() {
				return JSON.stringify({test: "OK"});
			}
		};
		var transformer = {
			transform({resource, transforms = [], content}) {
				assert.equal(resource.args, "../package.json");
				assert.deepEqual(transforms, [{
					name: "parse",
					args: "test"
				}]);
				this.transform = this.transform2;
				return JSON.parse(content).test;
			},
			transform2({resource, content}) {
				assert.equal(resource.args, "entry");
				return content;
			}
		};
		assert.equal(inline({
			resourceCenter,
			resource: {name: "file", args: "entry"},
			transformer
		}).split("\n")[1], "OK");
	});
});

describe("transforms", () => {
	var tr = {};
	conf.transforms.forEach(tf => tr[tf.name] = tf.transform);
	
	it("eval", () => {
		assert.equal(
			tr.eval('{"hello": 123}', "JSON.parse($0).hello"),
			123
		);
	});
	
	it("parse", () => {
		var content = '{"version": "1.2.3","nested": {"prop": 123}}';
		assert.equal(tr.parse(content, "version"), "1.2.3");
		assert.equal(tr.parse(content, "nested", "prop"), 123);
	});
	
	it("markdown", () => {
		var content = "some text";
		assert.equal(tr.markdown(content, "codeblock"), "```\nsome text\n```");
		assert.equal(tr.markdown(content, "code"), "`some text`");
		assert.equal(tr.markdown(content, "quote"), "> some text");
	});
});