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
	'js'  : 'application/javascript',
	'css' : 'text/css',
	'htm' : 'text/html',
	'html': 'text/html',
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
	'eot' : 'application/vnd.ms-fontobject'
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

	if (mime) {
		return mime.lookup(filename);
	}

	var ext = path.extname(filename).toLowerCase().substring(1);

	return TYPES[ext] || 'application/octet-stream';
};


/*
 *	Exports
 */
module.exports = PathToMime;