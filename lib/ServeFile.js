var path = require('path');
var fs = require('fs');
var os = require('os');

var mime = require(path.join(path.dirname(module.filename), 'MIME.js'));

/**
 * Prepare a function to be used to serve static files.
 *
 * Following options are supported:
 * - `documentRoot`: files outside of root path will not be served, defaults to process' current working directory
 * - `followSymbolicLinks`: if false (default), symbolic links will not be followed, i.e., they will not be served
 * - `cacheTimeInSeconds`: if 0 (default), HTTP cache will be disabled, otherwise HTTP headers will define how long
 *                         client should use cached version
 *
 * @param {Object} options
 * @return {Function|Error}
 */
function createFileResponseHandler (options) {
	options = options || {};
	options.documentRoot = options.documentRoot || process.cwd();
	options.followSymbolicLinks = options.followSymbolicLinks || false;
	options.cacheTimeInSeconds = options.cacheTimeInSeconds || 0;

	var root = null;
	try {
		root = fs.realpathSync(options.documentRoot);
		if (os.platform() === 'win32') {
			root = root.toLowerCase();
		}
	}
	catch (e) {
		return e;
	}

	/**
	 * Respond with 404 Not Found error.
	 *
	 * @param {Object} res - HTTP(S) response
	 */
	var notFound = function (res) {
		res.writeHead(404, {'Content-Type': 'text/plain'});
		res.end('404 Not Found\n');
	};

	/**
	 * Serve specified file.
	 *
	 * @param {Object} res - HTTP(S) response
	 * @param {string} filePath
	 * @param {Object} [reqHeaders] - headers from HTTP(S) request
	 * @param {Object} [fileStats] - fs.Stats describing filePath
	 */
	return function serveFile (res, filePath, reqHeaders, fileStats) {
		reqHeaders = reqHeaders || {};
		// If we did not get stats info, we have to get it first and then call ourselves again.
		if (!fileStats) {
			fs.realpath(filePath, function (err, realpath) {
				// On Windows we can get different cases for the same disk letter :/.
				var checkPath = realpath;
				if (os.platform() === 'win32' && realpath) {
					checkPath = realpath.toLowerCase();
				}

				if (err || checkPath.indexOf(root) !== 0) {
					return notFound(res);
				}

				fs.lstat(filePath, function (err, stats) {
					if (err || (!options.followSymbolicLinks && stats.isSymbolicLink()) || !stats.isFile()) {
						return notFound(res);
					}

					serveFile(res, realpath, reqHeaders, stats);
				});
			});

			return;
		}

		// Now we can serve the file
		// TODO: add support for If-Range: https://tools.ietf.org/html/rfc7233#section-3.2
		if (reqHeaders['if-modified-since']) {
			if (fileStats.mtime >= new Date(reqHeaders['if-modified-since'])) {
				res.writeHead(304, {Date: (new Date()).toUTCString()});
				return res.end();
			}
		}

		var maxEnd = fileStats.size - 1;
		var start = 0;
		var end = maxEnd;

		if (reqHeaders.range) {
			start = reqHeaders.range.replace(/^bytes=/, '').match(/(-?[^-]+)(?:-(.+)|)/);
			end = Math.min(parseInt(start[2] || maxEnd, 10) || 0, maxEnd);
			start = parseInt(start[1] || 0, 10) || 0;

			if (start < 0) {
				start = Math.max(maxEnd + start + 1, 0);
				end = maxEnd;
			}

			if (end < start) {
				res.writeHead(416, {'Content-Range': reqHeaders.range});
				return res.end();
			}
		}

		var stream = fs.createReadStream(filePath, {
			start: start,
			end  : end
		});

		if (!stream) {
			res.writeHead(500, {'Content-Type': 'text/plain'});
			return res.end('Interal Server Error: could not open the file\n');
		}

		var cache = options.cacheTimeInSeconds;
		var code = 200;
		var headers = {
			'Content-Type'  : mime(filePath),
			'Content-Length': Math.min(fileStats.size, end - start + 1),
			'Date'          : (new Date()).toUTCString(),
			'Last-Modified' : fileStats.mtime.toUTCString(),
			'Cache-Control' : (cache > 1 ? 'private, max-age=' + cache : 'no-cache, no-store, must-revalidate'),
			'Expires'       : (cache > 1 ? (new Date(Date.now() + (cache * 1000))).toUTCString() : '0')
		};

		if (cache < 1) {
			headers.Pragma = 'no-cache';
		}

		if (reqHeaders.range) {
			code = 206;
			headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + fileStats.size;
			headers['Accept-Ranges'] = 'bytes';
		}

		res.writeHead(code, headers);
		stream.pipe(res);
	};
}

/*
 * Exports
 */
module.exports.createFileResponseHandler = createFileResponseHandler;
