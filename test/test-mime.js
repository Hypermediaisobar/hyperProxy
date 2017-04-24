/*
 *	Run this test with mocha:
 *	http://visionmedia.github.io/mocha/
 */

var assert = require('assert');
var path = require('path');

describe('MIME', function(){
	'use strict';

	var mime;

	before(function(){
		mime = require(path.join(path.dirname(module.filename), '..', 'lib', 'MIME.js'));
	});

	it('should exist', function(){
		assert.ok(mime);
	});

	it('should be a function', function(){
		assert.strictEqual(typeof(mime), 'function');
	});

	describe('results', function(){
		it('should return correct HTML type', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.html'), 'text/html; charset=UTF-8');
		});
		it('should return correct CSS type', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.css'), 'text/css; charset=UTF-8');
		});
		it('should return correct JS type', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.js'), 'application/javascript; charset=UTF-8');
		});
		it('should return correct SWF type', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.swf'), 'application/x-shockwave-flash');
		});
		it('should return correct XML type', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.xml'), 'application/xml');
		});
		it('should return correct XSLT type', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.xslt'), 'application/xslt+xml');
		});
		it('should return correct PNG type', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.png'), 'image/png');
		});
		it('should return correct GIF type', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.gif'), 'image/gif');
		});
		it('should return correct JPEG type', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.jpg'), 'image/jpeg');
			assert.strictEqual(mime('/non/existant/path/to/example.jpeg'), 'image/jpeg');
		});
		it('should return correct WEBP type', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.webp'), 'image/webp');
		});
		it('should return correct SVG and SVGZ types', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.svg'), 'image/svg+xml');
			assert.strictEqual(mime('/non/existant/path/to/example.svgz'), 'image/svg+xml');
		});
		it('should return correct WOFF type', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.woff'), 'application/font-woff');
		});
		it('should return correct TTF and OTF types', function(){
			var type = mime('/non/existant/path/to/example.otf');
			assert.strictEqual(type === 'application/font-sfnt' || type === 'application/x-font-otf', true, 'Type should be either application/font-sfnt or application/x-font-otf, not '+type+'. See: http://stackoverflow.com/a/4657091 and http://www.iana.org/assignments/media-types/application/font-sfnt.');
			type = mime('/non/existant/path/to/example.ttf');
			assert.strictEqual(type === 'application/font-sfnt' || type === 'application/x-font-ttf', true, 'Type should be either application/font-sfnt or application/x-font-ttf');
		});
		it('should return correct generic type for unknown file type', function(){
			assert.strictEqual(mime('/non/existant/path/to/example.unknown'), 'application/octet-stream');
		});
	});
});
