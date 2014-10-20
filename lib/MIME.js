var path = require('path');

var mime;

try {
	mime = require('mime');
}
catch (e) {
	mime = false;
}

/**
 *	List of most commonly used types for our fallback usage.
 *
 *	@private
 */
var TYPES = {
	'js'  : 'application/javascript; charset=UTF-8',
	'json': 'application/json; charset=UTF-8',
	'css' : 'text/css; charset=UTF-8',
	'htm' : 'text/html; charset=UTF-8',
	'html': 'text/html; charset=UTF-8',
	'swf' : 'application/x-shockwave-flash',
	'xml' : 'application/xml',
	'xslt': 'application/xslt+xml',
	'png' : 'image/png',
	'gif' : 'image/gif',
	'jpg' : 'image/jpeg',
	'jpeg': 'image/jpeg',
	'webp': 'image/webp',
	'svg' : 'image/svg+xml',
	'svgz': 'image/svg+xml',
	'woff': 'application/font-woff',
	'ttf' : 'application/font-sfnt',
	'otf' : 'application/font-sfnt',
	'eot' : 'application/vnd.ms-fontobject',
	'mp4' : 'video/mp4',
	'mov' : 'video/quicktime',
	'3gp' : 'video/3gpp',
	'avi' : 'video/x-msvideo',
	'wmv' : 'video/x-ms-wmv',
	'ogv' : 'video/ogg'
};

/**
 *	Wrapper for the optional `mime` module, so we can fallback to most commonly
 *	used default types when module is not installed.
 *
 *	@param {String} filename can be a full path
 *	@returns {String} mime type
 */
var PathToMime = function(filename){
	'use strict';

	var result;

	if (mime) {
		result = mime.lookup(filename);
		var charset = mime.charsets.lookup(result);

		// TODO: remove this if/when mime module recognizes charset for javascript.
		if (!charset && (result === 'application/javascript' || result === 'application/json')) {
			charset = 'UTF-8';
		}

		if (charset) {
			result += '; charset=' + charset;
		}
	}
	else {
		result = TYPES[path.extname(filename).toLowerCase().substring(1)] || 'application/octet-stream';
	}

	return result;
};


/*
 *	Exports
 */
module.exports = PathToMime;
