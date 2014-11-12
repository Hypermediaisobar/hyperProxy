var path = require('path');
var util = require('util');
var http = require('http');
var url = require('url');

var NTLM = require(path.join(path.dirname(module.filename), '..', '..', 'lib', 'NTLM.js'));
var Flags = require(path.join(path.dirname(module.filename), '..', '..', 'lib', 'Flags.js'));

/**
 * @constructor
 * @class
 *
 * @param {string} DOMAIN
 * @param {Function} getUserCredentialsCallback
 */
var NTLMProxy = function(DOMAIN, getUserCredentialsCallback){
	'use strict';

	if (!(this instanceof NTLMProxy)) {
		return new NTLMProxy(DOMAIN, getUserCredentialsCallback);
	}

	var self = http.createServer();
	var ntlm = new NTLM();

	var respondUnauthorized = function(req, res) {
		var text = 'Proxy Authentication Required';
		res.writeHead(407, {
			'Content-Type': 'text/plain; charset=UTF8',
			'Content-Length': text.length,
			'Date': (new Date()).toUTCString(),
			'Proxy-Authenticate': 'NTLM',
			'Connection': 'close'
		});
		res.end(text);

		if (req.connection) {
			req.connection.end();
		}
	};

	var respondWithMessage = function(req, res, message) {
		var text = 'Proxy Authentication Required';
		res.writeHead(407, {
			'Content-Type': 'text/plain; charset=UTF8',
			'Content-Length': text.length,
			'Date': (new Date()).toUTCString(),
			'Proxy-Authenticate': 'NTLM '+message.toString('base64'),
			'Connection': 'keep-alive'
		});
		res.end(text);
	};

	var tunnelRequest = function(request, response) {
		var reqURL = url.parse(request.url, false, true);
		reqURL.protocol = reqURL.protocol || (request.connection.encrypted ? 'https:' : 'http:');
		reqURL.host = reqURL.host || ''; // Ugly: Just to allow splitting in next two lines.
		reqURL.hostname = reqURL.hostname || reqURL.host.split(':')[0] || request.headers.host.split(':')[0];
		reqURL.port = reqURL.port || reqURL.host.split(':')[1] || request.headers.host.split(':')[1] || (reqURL.protocol === 'https:' ? 443 : 80);
		reqURL.host = reqURL.hostname + (reqURL.port === 443 || reqURL.port === 80 ? '' : ':' + reqURL.port);
		reqURL.pathname = reqURL.pathname || '/';
		reqURL.path = reqURL.path || reqURL.pathname + (reqURL.search || '');
		reqURL.href = url.format(reqURL);

		var reqOptions = {
			host: reqURL.hostname,
			port: reqURL.port,
			path: reqURL.path,
			headers: request.headers,
			method: request.method
		};

		var destination = http.request(reqOptions, function(source){
			source.on('close', function(){
				source.connection.end();
			});

			source.on('error', function(error){
				self.emit('error', error, {hostname: reqURL.hostname, state: 'sourceError'});
			});

			response.writeHead(source.statusCode, source.headers);
			source.pipe(response);
		});

		destination.on('error', function(error){
			self.emit('error', error, {hostname: reqURL.hostname, state: 'destinationError'});
			response.end();
		});

		request.pipe(destination);

		request.on('close', function(){
			if (destination.connection) {
				destination.connection.end();
			}
		});

		request.on('error', function(error){
			response.end();
			self.emit('error', error, {hostname: reqURL.hostname, state: 'requestError'});
		});
	};

	self.on('connection', function(socket){
		socket.ntlmState = false;
	});

	self.on('request', function(req, res){
		var text = '';

		if (!req.headers.hasOwnProperty('proxy-authorization')) {
			return respondUnauthorized(req, res);
		}

		if (!req.connection.ntlmState) {
			var message1 = ntlm.readType1Message(req.headers['proxy-authorization']);

			if (!message1) {
				return respondUnauthorized(req, res);
			}

			var message2 = ntlm.createType2Message(DOMAIN, new Flags(ntlm.FLAGS.negotiateUnicode | ntlm.FLAGS.targetTypeDomain | ntlm.FLAGS.negotiateNTLM | ntlm.FLAGS.negotiateTargetInfo, ntlm.FLAGS), new Buffer('0123456789abcdef', 'hex'), null, {
				computerName: new Buffer('test', 'utf8').toString('ucs2'),
				domainName: new Buffer(DOMAIN, 'utf8').toString('ucs2'),
				dnsComputerName: new Buffer('test.hyperProxy.fake', 'utf8').toString('ucs2'),
				dnsDomainName: new Buffer('hyperProxy.fake', 'utf8').toString('ucs2')
			});

			req.connection.ntlmState = {
				message2: ntlm.readType2Message(message2)
			};

			return respondWithMessage(req, res, message2);
		}

		if (!req.connection.ntlmState.credentials) {
			var message3 = ntlm.readType3Message(req.headers['proxy-authorization']);
			if (!message3) {
				return respondUnauthorized(req, res);
			}

			var credentials = getUserCredentialsCallback(message3.userName.toString('ucs2'), message3.targetName.toString('ucs2'), message3.workstationName.toString('ucs2'));
			if (!credentials) {
				return respondUnauthorized(req, res);
			}

			// Make sure we'll use the same nonce as client
			message3.lm_response.copy(credentials.nonce, 0, message3.lm_response.length - 8);

			var message3Check = ntlm.readType3Message(ntlm.createType3Message(req.connection.ntlmState.message2, credentials));
			if (!message3Check || message3Check.lm_response.toString('hex') !== message3.lm_response.toString('hex') || message3Check.ntlm_response.toString('hex') !== message3.ntlm_response.toString('hex')) {
				return respondUnauthorized(req, res);
			}
		}

		delete req.headers['proxy-authorization'];
		tunnelRequest(req, res);
	});

	return self;
};

/*
 * Inherit from http.Server.
 */
util.inherits(NTLMProxy, http.Server);

/*
 * Export NTLMProxy.
 */
module.exports = NTLMProxy;