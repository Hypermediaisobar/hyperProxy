// TODO: string encodings to support various ASCII (ISO?) encodings?

var crypto = require('crypto');
var path = require('path');
var os = require('os');

var Flags = require(path.join(path.dirname(module.filename), 'Flags.js'));

/**
 *	This module implements parts of NTLM Authentication Protocol.
 *
 *	It's based on and contains parts of the document written by Eric Glass and available at:
 *	http://davenport.sourceforge.net/ntlm.html
 *
 *	It's also based on the official documentation:
 *	http://msdn.microsoft.com/en-us/library/cc236621.aspx
 *	which i would never know about if not for the post i stumbled upon:
 *	http://blogs.msdn.com/b/openspecification/archive/2010/11/15/ntlm-terminology-ms-nlmp-vs-http-davenport-sourceforge-net-ntlm-html.aspx?Redirected=true
 *
 *	Example of proxy NTLM authentication:
 *	http://msdn.microsoft.com/en-us/library/dd925287(v=office.12).aspx
 *
 *	@constructor
 */
function NTLM(){
	'use strict';

	if (!(this instanceof NTLM)) {
		return new NTLM();
	}

	/**
	 *	@private
	 */
	var self = this;

	/**
	 *	Definitions used for Flags objects.
	 *	@public
	 */
	this.FLAGS = {
		'negotiateUnicode'       : 0x00000001, // Indicates that Unicode strings are supported for use in security buffer data.
		'negotiateOEM'           : 0x00000002, // Indicates that OEM strings are supported for use in security buffer data.
		'requestTarget'          : 0x00000004, // Requests that the server's authentication realm be included in the Type 2 message.
		'_reserved10'            : 0x00000008, // This flag's usage has not been identified.
		'negotiateSign'          : 0x00000010, // Specifies that authenticated communication between the client and server should carry a digital signature (message integrity).
		'negotiateSeal'          : 0x00000020, // Specifies that authenticated communication between the client and server should be encrypted (message confidentiality).
		'negotiateDatagram'      : 0x00000040, // Indicates that datagram authentication is being used.
		'negotiateLanManagerKey' : 0x00000080, // Indicates that the Lan Manager Session Key should be used for signing and sealing authenticated communications.
		'_reserved9'             : 0x00000100, // This flag's usage has not been identified.
		'negotiateNTLM'          : 0x00000200, // Indicates that NTLM authentication is being used.
		'_reserved8'             : 0x00000400, // This flag's usage has not been identified.
		'negotiateAnonymous'     : 0x00000800, // Sent by the client in the Type 3 message to indicate that an anonymous context has been established. This also affects the response fields (as detailed in the "Anonymous Response" section).
		'negotiateDomain'        : 0x00001000, // Sent by the client in the Type 1 message to indicate that the name of the domain in which the client workstation has membership is included in the message. This is used by the server to determine whether the client is eligible for local authentication.
		'negotiateWorkstation'   : 0x00002000, // Sent by the client in the Type 1 message to indicate that the client workstation's name is included in the message. This is used by the server to determine whether the client is eligible for local authentication.
		//'negotiateLocalCall'     : 0x00004000, // Sent by the server to indicate that the server and client are on the same machine. Implies that the client may use the established local credentials for authentication instead of calculating a response to the challenge.
		'_reserved7'             : 0x00004000, // This flag's usage has not been identified.
		'negotiateAlwaysSign'    : 0x00008000, // Indicates that authenticated communication between the client and server should be signed with a "dummy" signature.
		'targetTypeDomain'       : 0x00010000, // Sent by the server in the Type 2 message to indicate that the target authentication realm is a domain.
		'targetTypeServer'       : 0x00020000, // Sent by the server in the Type 2 message to indicate that the target authentication realm is a server.
		'_reserved6'             : 0x00040000, // This flag's usage has not been identified.
		'negotiateNTLM2Key'      : 0x00080000, // Indicates that the NTLM2 signing and sealing scheme should be used for protecting authenticated communications. Note that this refers to a particular session security scheme, and is not related to the use of NTLMv2 authentication. This flag can, however, have an effect on the response calculations (as detailed in the "NTLM2 Session Response" section).
		'negotiateIdentify'      : 0x00100000, // Requests identify level token.
		'_reserved5'             : 0x00200000, // This flag's usage has not been identified.
		'requestNonNTSessionKey' : 0x00400000, // This flag's usage has not been identified.
		'negotiateTargetInfo'    : 0x00800000, // Sent by the server in the Type 2 message to indicate that it is including a Target Information block in the message. The Target Information block is used in the calculation of the NTLMv2 response.
		'_reserved4'             : 0x01000000, // This flag's usage has not been identified.
		'negotiateVersion'       : 0x02000000, // Indicates that NTLM protocol version should be provided in the Version part of the messages.
		'_reserved3'             : 0x04000000, // This flag's usage has not been identified.
		'_reserved2'             : 0x08000000, // This flag's usage has not been identified.
		'_reserved1'             : 0x10000000, // This flag's usage has not been identified.
		'negotiate128'           : 0x20000000, // Indicates that 128-bit encryption is supported.
		'negotiateKeyExchange'   : 0x40000000, // Indicates that the client will provide an encrypted master key in the "Session Key" field of the Type 3 message.
		'negotiate56'            : 0x80000000  // Indicates that 56-bit encryption is supported.
	};

	/**
	 *	Types of data in information buffers.
	 *	@private
	 */
	this.INFO_ATTRIBUTES = {
		'0'                      : 'EOL',
		'1'                      : 'computerName',
		'2'                      : 'domainName',
		'3'                      : 'dnsComputerName',
		'4'                      : 'dnsDomainName',
		'5'                      : 'dnsTreeName',
		'6'                      : 'flags',
		'7'                      : 'timestamp',
		'8'                      : 'singleHost',
		'9'                      : 'targetName',
		'10'                     : 'channelBindings'
	};

	/**
	 *	Client version. It can be:
	 *
	 *	1 - oldest version, does not use include additional OS version info, domain name, etc... in communication.
	 *	2 - contains additional information buffers, but no OS version information.
	 *	3 - contains all the data possible so far.
	 */
	this.clientVersion = 2;

	/**
	 *	Security level is used to decide which encryption to use.
	 *
	 *	4 - NTLMv2
	 *	3 - NTLM Session Response
	 *	2 - NTLM
	 *	1 - LM
	 */
	this.securityLevel = 4;

	/**
	 *	Create Buffer with LM hash of the provided password.
	 *
	 *	@param {string} password
	 *	@returns {Buffer}
	 */
	this.lm_hash_password = function(password) {
		var ascii = (new Buffer(password.toUpperCase(), 'utf8')).toString('ascii');
		var pass;

		if (ascii.length > 14) {
			pass = new Buffer(16);
			pass.fill(0);
			return pass;
		}

		pass = new Buffer(14);
		pass.fill(0);
		
		pass.write(ascii, 0, Math.min(ascii.length, 14), 'ascii');

		var cipher1 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(0, 7)), '');
		var cipher2 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(7, 14)), '');

		var text = new Buffer('KGS!@#$%', 'ascii');

		var out1 = cipher1.update(text);
		var out2 = cipher2.update(text);

		return Buffer.concat([out1, out2], out1.length + out2.length);
	};

	/**
	 *	Create Buffer with NTLM hash of the provided password.
	 *
	 *	@param {string} password
	 *	@returns {Buffer}
	 */
	this.ntlm_hash_password = function(password) {
		var pass = new Buffer(password, 'ucs2');
		var md4 = crypto.createHash('md4');
		md4.update(pass);
		return md4.digest();
	};

	/**
	 *	Create Buffer with NTLMv2 hash of the provided password.
	 *
	 *	@param {string} username
	 *	@param {string} domain name
	 *	@param {string} password
	 *	@returns {Buffer}
	 */
	this.ntlm2_hash_password = function(username, domain, password) {
		var pass = new Buffer(username.toUpperCase()+domain.toUpperCase(), 'ucs2');
		var hmac = crypto.createHmac('md5', self.ntlm_hash_password(password));
		hmac.update(pass);
		return hmac.digest();
	};

	/**
	 *	Create LM session key.
	 *
	 *	@param {Credentials} credentials
	 *	@returns {Buffer}
	 */
	this.lm_session_key = function(credentials) {
		var result = new Buffer(16);
		result.fill(0);

		credentials.lm_password_hash.slice(0, 8).copy(result);

		return result;
	};

	/**
	 *	Create NTLM session key.
	 *
	 *	@params {Credentials} credentials
	 *	@returns {Buffer}
	 */
	this.ntlm_session_key = function(credentials) {
		var md4 = crypto.createHash('md4');
		md4.update(credentials.ntlm_password_hash);
		return md4.digest();
	};

	/**
	 *	Create Anonymous session key.
	 *
	 *	@returns {Buffer}
	 */
	this.anonymous_session_key = function() {
		var result = new Buffer(16);
		result.fill(0);
		return result;
	};

	/**
	 *	Create Lan Manager session key.
	 *
	 *	@param {Buffer} lm_response
	 *	@params {Credentials} credentials
	 *	@returns {Buffer}
	 */
	this.lan_manager_session_key = function(lm_response, credentials) {
		var pass = new Buffer(14);
		pass.fill(0xbd);

		credentials.lm_password_hash.copy(pass, 0, 0, 8);

		var cipher1 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(0, 7)), '');
		var cipher2 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(7, 14)), '');

		var out1 = cipher1.update(lm_response.slice(0, 8));
		var out2 = cipher2.update(lm_response.slice(0, 8));

		return Buffer.concat([out1, out2], out1.length + out2.length);
	};

	/**
	 *	Create new Master key.
	 *
	 *	@params {Credentials} credentials
	 *	@returns {Buffer}
	 */
	this.master_session_key = function(credentials) {
		var cipher = crypto.createCipheriv('RC4', credentials.currentKey, '');
		return cipher.update(credentials.randomSessionKey);
	};

	/**
	 *	Create LM response.
	 *	It updates credentials with LM session key.
	 *	WARNING: call this BEFORE `ntlm_response()`, because LM session key cannot be used when NTLM is used.
	 *
	 *	@param {Object} message2
	 *	@param {Credentials} credentials
	 *	@returns {Buffer}
	 */
	this.lm_response = function(message2, credentials) {
		if (!credentials.username && !credentials.password) {
			// Anonymous response
			if (!credentials.sessionKey) {
				credentials.sessionKey = self.anonymous_session_key();
			}
			return new Buffer('00', 'hex');
		}

		var pass = new Buffer(21);
		pass.fill(0);

		credentials.lm_password_hash.copy(pass, 0);

		var cipher1 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(0, 7)), '');
		var cipher2 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(7, 14)), '');
		var cipher3 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(14, 21)), '');

		var out1 = cipher1.update(message2.challenge);
		var out2 = cipher2.update(message2.challenge);
		var out3 = cipher3.update(message2.challenge);

		// Session Key by-product
		credentials.sessionKey = self.lm_session_key(credentials);

		return Buffer.concat([out1, out2, out3], out1.length + out2.length + out3.length);
	};

	/**
	 *	Create NTLM response.
	 *	It updates credentials with NTLM session key.
	 *
	 *	@param {Object} message2
	 *	@param {Credentials} credentials
	 *	@returns {Buffer}
	 */
	this.ntlm_response = function(message2, credentials) {
		if (!credentials.username && !credentials.password) {
			// Anonymous response
			if (!credentials.sessionKey) {
				credentials.sessionKey = self.anonymous_session_key();
			}
			return new Buffer(0);
		}

		var pass = new Buffer(21);
		pass.fill(0);
		
		credentials.ntlm_password_hash.copy(pass, 0);

		var cipher1 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(0, 7)), '');
		var cipher2 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(7, 14)), '');
		var cipher3 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(14, 21)), '');

		var out1 = cipher1.update(message2.challenge);
		var out2 = cipher2.update(message2.challenge);
		var out3 = cipher3.update(message2.challenge);

		// Session Key by-product
		if (!message2.flags.requestNonNTSessionKey || !credentials.sessionKey) {
			credentials.sessionKey = self.ntlm_session_key(credentials);
		}

		return Buffer.concat([out1, out2, out3], out1.length + out2.length + out3.length);
	};

	/**
	 *	Create LM2 response.
	 *	It updates credentials with LM2 session key.
	 *	WARNING: call this BEFORE `ntlm2_response()`, because LM2 session key cannot be used when NTLM2 is used.
	 *
	 *	@param {Object} message2
	 *	@param {Credentials} credentials
	 *	@returns {Buffer}
	 */
	this.lm2_response = function(message2, credentials) {
		if (!credentials.username && !credentials.password) {
			// Anonymous response
			if (!credentials.sessionKey) {
				credentials.sessionKey = self.anonymous_session_key();
			}
			return new Buffer('00', 'hex');
		}

		// Hash created from USER + TARGET and credentials.ntlm_password_hash
		var hmac = crypto.createHmac('md5', credentials.ntlm_password_hash);
		hmac.update(new Buffer(credentials.username.toUpperCase()+message2.targetName.toString('ucs2'), 'ucs2'));
		var hash = hmac.digest();

		// Hash created from challenge + nonce and hash
		hmac = crypto.createHmac('md5', hash);
		hmac.update(message2.challenge);
		hmac.update(credentials.nonce);
		hash = hmac.digest();

		// Session Key by-product
		hmac = crypto.createHmac('md5', credentials.ntlm2_password_hash);
		hmac.update(hash);
		credentials.sessionKey = hmac.digest();

		// Response created from hash + blob
		return Buffer.concat([hash, credentials.nonce], hash.length + credentials.nonce.length);
	};

	/**
	 *	Create NTLM2 response.
	 *	It updates credentials with NTLM2 session key.
	 *
	 *	@param {Object} message2
	 *	@param {Credentials} credentials
	 *	@returns {Buffer}
	 */
	this.ntlm2_response = function(message2, credentials) {
		if (!credentials.username && !credentials.password) {
			// Anonymous response
			if (!credentials.sessionKey) {
				credentials.sessionKey = self.anonymous_session_key();
			}
			return new Buffer(0);
		}

		var blob = new Buffer(28 + message2.targetInfoBuffer.length + 4);

		// Signature: RespType
		blob.writeUInt8(0x01, 0);
		// Signature: HighRespType
		blob.writeUInt8(0x01, 1);
		// Reserved
		blob.writeUInt16LE(0, 2);
		blob.writeUInt32LE(0, 4);
		// Windows Timestamp
		credentials.timestamp.copy(blob, 8, 0, 8);
		// Nonce
		credentials.nonce.copy(blob, 16, 0, 8);
		// Reserved
		blob.writeUInt32LE(0, 24);
		// Target Information (official doc: AV_Pairs?)
		message2._raw.copy(blob, 28, message2.targetInfoBuffer.offset, message2.targetInfoBuffer.offset + message2.targetInfoBuffer.length);
		// Unknown
		// TODO: is it needed? structure above should already contain terminator bytes.
		blob.writeUInt32LE(0, 28 + message2.targetInfoBuffer.length);

		// Hash created from challenge + blob
		var hmac = crypto.createHmac('md5', credentials.ntlm2_password_hash);
		hmac.update(message2.challenge);
		hmac.update(blob);
		var hash = hmac.digest();

		// Session Key by-product
		hmac = crypto.createHmac('md5', credentials.ntlm2_password_hash);
		hmac.update(hash);
		credentials.sessionKey = hmac.digest();

		// Response created from hash + blob
		return Buffer.concat([hash, blob], hash.length + blob.length);
	};

	/**
	 *	Create NTLM with v2 authorization response.
	 *	It updates credentials with NTLM Session Response session key.
	 *
	 *	Returns Object with `lm` and `ntlm` Buffers.
	 *
	 *	@param {Object} message2
	 *	@param {Credentials} credentials
	 *	@returns {Object}
	 */
	this.ntlm_sr_response = function(message2, credentials) {
		if (!credentials.username && !credentials.password) {
			// Anonymous response
			return self.anonymous_response(message2, credentials);
		}

		var result = {
			lm   : new Buffer(24),
			ntlm : false
		};
		result.lm.fill(0);
		credentials.nonce.copy(result.lm);

		var md5 = crypto.createHash('md5');
		md5.update(message2.challenge);
		md5.update(credentials.nonce);
		var hash = md5.digest();

		// Session Key by-product
		var hmac = crypto.createHmac('md5', self.ntlm_session_key(credentials));
		hmac.update(message2.challenge);
		hmac.update(credentials.nonce);
		credentials.sessionKey = hmac.digest();

		var pass = new Buffer(21);
		pass.fill(0);
		
		credentials.ntlm_password_hash.copy(pass, 0);

		var cipher1 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(0, 7)), '');
		var cipher2 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(7, 14)), '');
		var cipher3 = crypto.createCipheriv('DES-ECB', self.createDESKey(pass.slice(14, 21)), '');

		var out1 = cipher1.update(hash.slice(0, 8));
		var out2 = cipher2.update(hash.slice(0, 8));
		var out3 = cipher3.update(hash.slice(0, 8));

		result.ntlm = new Buffer.concat([out1, out2, out3], out1.length + out2.length + out3.length);

		return result;
	};

	/**
	 *	Create NTLM with v2 authorization response.
	 *	It updates credentials with Anonymous session key.
	 *
	 *	Returns Object with `lm` and `ntlm` Buffers.
	 *
	 *	@param {Object} message2
	 *	@param {Credentials} credentials
	 *	@returns {Object}
	 */
	this.anonymous_response = function(message2, credentials) {
		// Session Key by-product
		credentials.sessionKey = self.anonymous_session_key();

		return {
			lm   : new Buffer('00', 'hex'),
			ntlm : new Buffer(0)
		};
	};

	/**
	 *	Create Type 1 Message.
	 *
	 *	@param {Credentials} credentials
	 *	@returns {Buffer}
	 */
	this.createType1Message = function(credentials) {
		var dlen = (new Buffer(credentials.domain, 'utf8')).length;
		var wlen = (new Buffer(credentials.workstation, 'utf8')).length;

		var version = self.clientVersion > 2 && credentials.version ? credentials.version : false;

		if (!credentials.flags.valueOf()) {
			credentials.flags.set(
				self.FLAGS.negotiateUnicode |
				self.FLAGS.negotiateOEM |
				self.FLAGS.requestTarget |
				self.FLAGS.negotiateNTLM |
				self.FLAGS.negotiateDomain |
				self.FLAGS.negotiateWorkstation |
				self.FLAGS.negotiateAlwaysSign |
				self.FLAGS.negotiateVersion |
				self.FLAGS.negotiate128 |
				0
			);
		}

		var result = new Buffer((version ? 40 : 32)+dlen+wlen);
		// Signature
		result.write('NTLMSSP\0');
		//result.writeUInt8(0, 7);
		// Type
		result.writeUInt32LE(1, 8);

		result.writeUInt32LE(credentials.flags.valueOf(), 12);
		result.writeUInt16LE(dlen, 16);
		result.writeUInt16LE(dlen, 18);
		result.writeUInt32LE((version ? 40 : 32)+wlen, 20);
		result.writeUInt16LE(wlen, 24);
		result.writeUInt16LE(wlen, 26);
		result.writeUInt32LE((version ? 40 : 32), 28);

		if (version && credentials.flags.negotiateVersion) {
			result.writeUInt8(version.major, 32);
			result.writeUInt8(version.minor, 33);
			result.writeUInt16LE(version.build, 34);
			result.writeUInt32LE(version.reserved, 36);
		}

		result.write(credentials.workstation.toUpperCase(), (version ? 40 : 32));
		result.write(credentials.domain.toUpperCase(), (version ? 40 : 32)+wlen);

		return result;
	};

	/**
	 *	Read data from base64-encoded string or Buffer (containing binary data decoded from base64 string) and return Type1 Message Object.
	 *	String usually will come from `Proxy-Authorization` or `WWW-Authorization` HTTP header.
	 *	This function is mainly for debugging because client does not need to read Type1 messages.
	 *
	 *	@param {string|Buffer} message1
	 *	@returns {Object|false}
	 */
	this.readType1Message = function(message1) {
		var data = message1;
		if (!(data instanceof Buffer)) {
			// HTTP version starts with 'NTLM ',.
			// POP3 and IMAP starts with '+ '.
			// SMTP starts with '334 '.
			var prefix = false;
			if (data.match(/\s/) && !(prefix = data.match(/^(NTLM|\+|334)\s/))) {
				return false;
			}

			if (prefix && prefix.length) {
				data = new Buffer(data.substring(prefix[0].length), 'base64');
			}
			else {
				data = new Buffer(data, 'base64');
			}
		}

		// Valid message must contain minimum 32 bytes of data.
		if (data.length < 32) {
			return false;
		}

		var result = {};

		result.signature = data.toString('utf8', 0, 7);
		result.type = data.readUInt32LE(8);
		result.flags = new Flags(data.readUInt32LE(12), self.FLAGS);

		result.domainNameBuffer = self.readSecurityBuffer(data, 16);
		result.domainName = self.readValue(data, result.domainNameBuffer);

		result.workstationNameBuffer = self.readSecurityBuffer(data, 24);
		result.workstationName = self.readValue(data, result.workstationNameBuffer);

		if (result.flags.negotiateVersion) {
			result.version = {
				major: data.readUInt8(32),
				minor: data.readUInt8(33),
				build: data.readUInt16LE(34),
				reserved: data.readUInt32LE(36)
			};
		}

		return result;
	};

	/**
	 *	Create Type 2 Message.
	 *	This function is mainly for debugging because client does not need to create Type2 messages.
	 *
	 *	@param {string} targetName
	 *	@param {Flags} flags
	 *	@param {Buffer} challenge
	 *	@param {Buffer} [context]
	 *	@param {Object} [targetInfo]
	 *	@param {OSVersion} [version]
	 *	@returns {Buffer}
	 */
	this.createType2Message = function(targetName, flags, challenge, context, targetInfo, version){
		var size = 0;

		size += 8; // signature
		size += 4; // message type
		size += 8; // targetName buffer info
		size += 4; // flags
		size += 8; // challenge

		var dataOffset = size;

		// Context should be optional, in theory, but it seems that it's always there, no matter the flags.
		if (!context) {
			context = new Buffer(8);
			context.writeUInt32LE(0, 0);
			context.writeUInt32LE(0, 4);
		}

		if (context) {
			dataOffset += 8;
			size += 8; // context
		}

		var info = {};
		var infoSize = 0;
		if (targetInfo) {
			dataOffset += 8;
			size += 8; // targetInfo buffer info

			// Target Info data
			infoSize = Object.keys(self.INFO_ATTRIBUTES).reduce(function(prev, index){
				var key = self.INFO_ATTRIBUTES[index];

				if (!targetInfo.hasOwnProperty(key)) {
					return prev;
				}

				prev += 2; // into type
				prev += 2; // number of bytes in string
				info[key] = new Buffer(new Buffer(targetInfo[key], 'ucs2').toString(flags.negotiateUnicode ? 'ucs2' : 'utf8'), flags.negotiateUnicode ? 'ucs2' : 'utf8');
				prev += info[key].length; // length of string
				return prev;
			}, 0);

			infoSize += 4; // targetInfo terminator
			size += infoSize; // targetInfo data
		}

		if (version) {
			dataOffset += 8;
			size += 8; // OSVersion buffer info
			size += 8; // OSVersion data
		}

		var target = new Buffer(new Buffer(targetName, 'ucs2').toString(flags.negotiateUnicode ? 'ucs2' : 'utf8'), flags.negotiateUnicode ? 'ucs2' : 'utf8');
		size += target.length;

		var result = new Buffer(size);
		var offset = 0;
		// Signature
		result.write('NTLMSSP\0');
		//result.writeUInt8(0, 7);
		// Type
		result.writeUInt32LE(0x2, 8);
		// Target Name buffer
		result.writeUInt16LE(target.length, 12);
		result.writeUInt16LE(target.length, 14);
		result.writeUInt32LE(dataOffset, 16);
		// Target Name data
		target.copy(result, dataOffset);
		dataOffset += target.length;
		// Flags
		result.writeUInt32LE(+flags, 20);
		// Challenge
		challenge.copy(result, 24);

		offset = 32;

		// Context
		if (context) {
			context.copy(result, offset);
			offset += 8;
		}

		// TargetInfo
		if (targetInfo) {
			// Target Info buffer info
			result.writeUInt16LE(infoSize, offset);
			result.writeUInt16LE(infoSize, offset + 2);
			result.writeUInt32LE(dataOffset, offset + 4);
			offset += 8;

			// Target Info data
			Object.keys(self.INFO_ATTRIBUTES).forEach(function(index){
				var key = self.INFO_ATTRIBUTES[index];

				if (!info.hasOwnProperty(key)) {
					return;
				}

				result.writeUInt16LE(index, dataOffset);
				result.writeUInt16LE(info[key].length, dataOffset + 2);
				info[key].copy(result, dataOffset + 4);
				dataOffset += 4 + info[key].length;
			});

			// Target Info data terminator subblock
			result.writeUInt16LE(0, dataOffset);
			result.writeUInt16LE(0, dataOffset + 2);
			dataOffset += 4;
		}

		// OS version
		if (version) {
			result.writeUInt8(version.major, dataOffset);
			result.writeUInt8(version.minor, dataOffset + 1);
			result.writeUInt16LE(version.build, dataOffset + 2);
			result.writeUInt32LE(version.reserved, dataOffset + 4);
		}

		return result;
	};

	/**
	 *	Read data from base64-encoded string or Buffer (containing binary data decoded from base64 string) and return Type2 Message Object.
	 *	String usually will come from `Proxy-Authenticate` or `WWW-Authenticate` HTTP header.
	 *
	 *	@param {string|Buffer} message2
	 *	@returns {Object|false}
	 */
	this.readType2Message = function(message2){
		var data = message2;
		if (!(data instanceof Buffer)) {
			// HTTP version starts with 'NTLM ',.
			// POP3 and IMAP starts with '+ '.
			// SMTP starts with '334 '.
			var prefix = false;
			if (data.match(/\s/) && !(prefix = data.match(/^(NTLM|\+|334)\s/))) {
				return false;
			}

			if (prefix && prefix.length) {
				data = new Buffer(data.substring(prefix[0].length), 'base64');
			}
			else {
				data = new Buffer(data, 'base64');
			}
		}

		// Valid message must contain minimum 32 bytes of data.
		if (data.length < 32) {
			return false;
		}

		var result = {};

		result.signature        = data.toString('utf8', 0, 7);
		result.type             = data.readUInt32LE(8);
		result.targetNameBuffer = self.readSecurityBuffer(data, 12);
		result.flags            = new Flags(data.readUInt32LE(20), self.FLAGS);
		result.challenge        = new Buffer(8);
		result.context          = new Buffer(8);
		result.targetInfoBuffer = false;
		result.version          = false;
		result.targetName       = self.readValue(data, result.targetNameBuffer);
		result.targetInfo       = false;

		data.copy(result.challenge, 0, 24, 32);
		result.context.fill(0);

		if (result.targetNameBuffer.offset >= 32) {
			if (result.flags.negotiateLocalCall) {
				data.copy(result.context, 0, 32, 40);
			}
		}

		if (result.targetNameBuffer.offset >= 48) {
			result.targetInfoBuffer = self.readSecurityBuffer(data, 40);

			if (result.targetInfoBuffer.length && result.targetInfoBuffer.offset && (result.targetInfoBuffer.offset + result.targetInfoBuffer.length <= data.length)) {
				result.targetInfo = {};

				var index = result.targetInfoBuffer.offset;
				var type, length;
				while (index <= data.length) {
					type = data.readUInt16LE(index);
					index += 2;

					length = data.readUInt16LE(index);
					index += 2;

					if (!self.INFO_ATTRIBUTES.hasOwnProperty(type)) {
						index += length;
						continue;
					}

					type = self.INFO_ATTRIBUTES[type];

					// Terminator block
					if (type === 'EOL') {
						break;
					}

					result.targetInfo[type] = data.slice(index, index+length);

					index += length;
				}
			}
		}

		if (result.targetNameBuffer.offset >= 56) {
			result.version = self.OSVersion(data.readUInt8(48), data.readUInt8(49), data.readUInt16LE(50), data.readUInt32LE(52));
		}

		result._raw = data;

		return result;
	};

	/**
	 *	Create Type 3 Message.
	 *
	 *	@param {Object} message2
	 *	@param {Credentials} credentials
	 *	@returns {Buffer}
	 */
	this.createType3Message = function(message2, credentials){
		if (!(message2 instanceof Object)) {
			message2 = self.readType2Message(message2);
		}

		if ((message2.flags.negotiateOEM) && (message2.flags.negotiateUnicode)) {
			message2.flags.negotiateOEM = false;
		}

		if (message2.flags.negotiate56 && message2.flags.negotiate128) {
			message2.flags.negotiate56 = false;
		}

		if (message2.flags.negotiateSign && message2.flags.negotiateSeal) {
			message2.flags.negotiateAlwaysSign = false;
		}

		//var username = new Buffer(new Buffer(credentials.username, 'ucs2').toString((message2.flags.negotiateUnicode ? 'ucs2' : 'utf8')), (message2.flags.negotiateUnicode ? 'ucs2' : 'utf8'));
		//var target = message2.targetName;
		//var workstation = new Buffer(new Buffer(credentials.workstation, 'ucs2').toString((message2.flags.negotiateUnicode ? 'ucs2' : 'utf8')), (message2.flags.negotiateUnicode ? 'ucs2' : 'utf8'));
		var username = new Buffer(credentials.username, message2.flags.negotiateUnicode ? 'ucs2' : 'utf8');
		var target = new Buffer(message2.targetName.toString(message2.flags.negotiateUnicode ? 'ucs2' : 'utf8'), message2.flags.negotiateUnicode ? 'ucs2' : 'utf8');
		var workstation = new Buffer(credentials.workstation.toUpperCase(), message2.flags.negotiateUnicode ? 'ucs2' : 'utf8');

		var responses = {
			lm: false,
			ntlm: false
		};

		if (self.securityLevel === 4) {
			responses.lm = self.lm2_response(message2, credentials);
			responses.ntlm = self.ntlm2_response(message2, credentials);
		}
		else if (self.securityLevel === 3) {
			responses = self.ntlm_sr_response(message2, credentials);
		}
		else if (self.securityLevel === 2) {
			responses.lm = self.lm_response(message2, credentials);
			responses.ntlm = self.ntlm_response(message2, credentials);
		}
		else if (self.securityLevel === 1) {
			responses.lm = self.lm_response(message2, credentials);
		}

		if (self.securityLevel < 3 && message2.flags.negotiateLanManagerKey) {
			credentials.lanManagerKey = self.lan_manager_session_key(responses.lm, credentials);
		}

		var version = self.clientVersion > 2 && credentials.version && message2.flags.negotiateVersion ? credentials.version : false;
		var keyExchange = self.clientVersion > 1 && message2.flags.negotiateKeyExchange;

		var result = new Buffer(52+(self.clientVersion > 1 ? 12 : 0)+(version ? 8 : 0)+(responses.lm ? responses.lm.length : 0)+(responses.ntlm ? responses.ntlm.length : 0)+target.length+username.length+workstation.length+(keyExchange ? 16 : 0));
		var offset;

		// Signature
		result.write('NTLMSSP\0');
		//result.writeUInt8(0, 7);
		// Type
		result.writeUInt32LE(3, 8);
		// LM/LM2 buffer
		result.writeUInt16LE((responses.lm ? responses.lm.length : 0), 12);
		result.writeUInt16LE((responses.lm ? responses.lm.length : 0), 14);
		offset = 52 + (self.clientVersion > 1 ? 12 : 0) + (version ? 8 : 0) + target.length + username.length + workstation.length;
		result.writeUInt32LE(offset, 16);
		// LM/LM2 blob
		if (responses.lm && responses.lm.length) {
			responses.lm.copy(result, offset);
		}
		// NTLM/NTLM2 buffer
		result.writeUInt16LE((responses.ntlm ? responses.ntlm.length : 0), 20);
		result.writeUInt16LE((responses.ntlm ? responses.ntlm.length : 0), 22);
		offset = 52 + (self.clientVersion > 1 ? 12 : 0) + (version ? 8 : 0) + target.length + username.length + workstation.length + (responses.lm ? responses.lm.length : 0);
		result.writeUInt32LE(offset, 24);
		// NTLM/NTLM2 blob
		if (responses.ntlm && responses.ntlm.length) {
			responses.ntlm.copy(result, offset);
		}
		// Target Name buffer
		result.writeUInt16LE(target.length, 28);
		result.writeUInt16LE(target.length, 30);
		offset = 52 + (self.clientVersion > 1 ? 12 : 0) + (version ? 8 : 0);
		result.writeUInt32LE(offset, 32);
		// Target Name data
		target.copy(result, offset);
		// User Name buffer
		result.writeUInt16LE(username.length, 36);
		result.writeUInt16LE(username.length, 38);
		offset = 52 + (self.clientVersion > 1 ? 12 : 0) + (version ? 8 : 0) + target.length;
		result.writeUInt32LE(offset, 40);
		// User Name data
		username.copy(result, offset);
		// Workstation Name buffer
		result.writeUInt16LE(workstation.length, 44);
		result.writeUInt16LE(workstation.length, 46);
		offset = 52 + (self.clientVersion > 1 ? 12 : 0) + (version ? 8 : 0) + target.length + username.length;
		result.writeUInt32LE(offset, 48);
		// Workstation Name data
		workstation.copy(result, offset);

		credentials.currentKey = false;
		if (self.securityLevel < 3 && credentials.lanManagerKey && !message2.flags.negotiateNTLM2Key) {
			credentials.currentKey = credentials.lanManagerKey;
		}
		else {
			credentials.currentKey = credentials.sessionKey;
		}

		if (self.clientVersion > 1) {
			// Session Key buffer
			result.writeUInt16LE((keyExchange ? 16 : 0), 52);
			result.writeUInt16LE((keyExchange ? 16 : 0), 54);
			offset = 52 + (self.clientVersion > 1 ? 12 : 0) + (version ? 8 : 0) + target.length + username.length + workstation.length + (responses.lm ? responses.lm.length : 0) + (responses.ntlm ? responses.ntlm.length : 0);
			result.writeUInt32LE(offset, 56);

			if (keyExchange) {
				if (!credentials.randomSessionKey) {
					credentials.randomSessionKey = Buffer.concat([self.createNonce(), self.createNonce()], 16);
				}
				credentials.masterKey = self.master_session_key(credentials);
				credentials.masterKey.copy(result, offset);
			}

			// Flags
			result.writeUInt32LE(+message2.flags, 52 + (self.clientVersion > 1 ? 8 : 0));
		}

		// OS version
		if (version) {
			result.writeUInt8(version.major, 52 + (self.clientVersion > 1 ? 12 : 0));
			result.writeUInt8(version.minor, 52 + (self.clientVersion > 1 ? 12 : 0) + 1);
			result.writeUInt16LE(version.build, 52 + (self.clientVersion > 1 ? 12 : 0) + 2);
			result.writeUInt32LE(version.reserved, 52 + (self.clientVersion > 1 ? 12 : 0) + 4);
		}

		return result;
	};

	/**
	 *	Read data from base64-encoded string or Buffer (containing binary data decoded from base64 string) and return Type2 Message Object.
	 *	String usually will come from `Proxy-Authenticate` or `WWW-Authenticate` HTTP header.
	 *	This function is mainly for debugging because client does not need to read Type3 messages.
	 *
	 *	@param {string|Buffer} message3
	 *	@returns {Object|false}
	 */
	this.readType3Message = function(message3) {
		var data = message3;
		if (!(data instanceof Buffer)) {
			// HTTP version starts with 'NTLM ',.
			// POP3 and IMAP starts with '+ '.
			// SMTP starts with '334 '.
			var prefix = false;
			if (data.match(/\s/) && !(prefix = data.match(/^(NTLM|\+|334)\s/))) {
				return false;
			}

			if (prefix && prefix.length) {
				data = new Buffer(data.substring(prefix[0].length), 'base64');
			}
			else {
				data = new Buffer(data, 'base64');
			}
		}

		// Valid message must contain minimum 32 bytes of data.
		if (data.length < 32) {
			return false;
		}

		var result = {};

		result.signature = data.toString('utf8', 0, 7);
		result.type = data.readUInt32LE(8);

		var fields = {
			'lm_response': 12,
			'ntlm_response': 20,
			'targetName': 28,
			'userName': 36,
			'workstationName': 44
		};
		var fieldNames = Object.keys(fields);
		var minOffset = data.length;
		var buffer;
		for (var i = 0; i < fieldNames.length; i++) {
			buffer = fieldNames[i]+'Buffer';
			result[buffer] = self.readSecurityBuffer(data, fields[fieldNames[i]]);
			result[fieldNames[i]] = self.readValue(data, result[buffer]);
			if (result[buffer] && result[buffer].offset) {
				minOffset = Math.min(minOffset, result[buffer].offset);
			}
		}

		if (minOffset > 52) {
			result.sessionKeyBuffer = self.readSecurityBuffer(data, 52);
			result.sessionKey = self.readValue(data, result.sessionKeyBuffer);

			result.flags = new Flags(data.readUInt32LE(60), self.FLAGS);
		}

		if (minOffset > 64) {
			result.versionBuffer = self.readSecurityBuffer(data, 64);
			result.version = self.readValue(data, result.versionBuffer);
			if (result.version) {
				result.version = new OSVersion(
					result.version.readUint8(0),
					result.version.readUint8(1),
					result.version.readUint16LE(2),
					result.version.readUint32LE(4)
				);
			}
		}

		result._raw = data;

		return result;
	};

	/**
	 *	Read meta information about a value in the "blob" part of a message.
	 *
	 *	@param {Object} message
	 *	@param {integer} offset
	 *	@returns {SecurityBuffer}
	 */
	this.readSecurityBuffer = function(message, offset) {
		return {
			length: message.readUInt16LE(offset),
			space: message.readUInt16LE(offset + 2),
			offset: message.readUInt32LE(offset + 4)
		};
	};

	/**
	 *	Read value from the "blob" part of a message, described by securityBuffer,
	 *	and return "virtual" Buffer with it (that is not a copy of data, just a reference to it).
	 *
	 *	@param {Object} message
	 *	@param {SecurityBuffer} securityBuffer
	 *	@returns {Buffer}
	 */
	this.readValue = function(message, securityBuffer) {
		if (!securityBuffer || !securityBuffer.length || securityBuffer.length + securityBuffer.offset > message.length) {
			return false;
		}

		return message.slice(securityBuffer.offset, securityBuffer.offset + securityBuffer.length);
	};


	/**
	 *	Expand a 56-bit key buffer to the full 64-bits for DES.
	 *
	 *	Based on code sample in:
	 *	http://www.innovation.ch/personal/ronald/ntlm.html
	 *
	 *	From: https://github.com/jclulow/node-smbhash
	 */
	this.createDESKey = function(key56) {
		var key64 = new Buffer(8);

		key64[0] = key56[0] & 0xFE;
		key64[1] = ((key56[0] << 7) & 0xFF) | (key56[1] >> 1);
		key64[2] = ((key56[1] << 6) & 0xFF) | (key56[2] >> 2);
		key64[3] = ((key56[2] << 5) & 0xFF) | (key56[3] >> 3);
		key64[4] = ((key56[3] << 4) & 0xFF) | (key56[4] >> 4);
		key64[5] = ((key56[4] << 3) & 0xFF) | (key56[5] >> 5);
		key64[6] = ((key56[5] << 2) & 0xFF) | (key56[6] >> 6);
		key64[7] =  (key56[6] << 1) & 0xFF;

		self.adjustBytesParity(key64);

		return key64;
	};

	/**
	 *	Adjust parity on the provided bytes, so each byte has odd number of 1s.
	 *
	 *	Based on code sample in:
	 *	http://davenport.sourceforge.net/ntlm.html
	 *
	 *	@param {Buffer} bytes
	 */
	this.adjustBytesParity = function(bytes) {
		var b;
		var needsParity;
		for (var i = 0; i < bytes.length; i++) {
			b = bytes[i];
			needsParity = ((
				(b >>> 7) ^ (b >>> 6) ^ (b >>> 5) ^
				(b >>> 4) ^ (b >>> 3) ^ (b >>> 2) ^
				(b >>> 1)
			) & 0x01) === 0;

			if (needsParity) {
				bytes[i] |= 1;
			}
		}
	};

	/**
	 *	Create buffer with 64bit unsigned integer LE value.
	 *
	 *	@param {Number}	value
	 *	@returns {Buffer}
	 */
	this.createUInt64LE = function(value) {
		var result = new Buffer(8);
		result.fill(0);

		var bits = '0000000000000000000000000000000000000000000000000000000000000000' + value.toString(2);
		var bytes = bits.substring(bits.length - 64).match(/\d{8}/g);

		for (var i = 0; i < 8; i++) {
			result.writeUInt8(parseInt(bytes.pop(), 2), i);
		}

		return result;
	};

	/**
	 *	Create buffer with 64bit LE timestamp.
	 *
	 *	@param {integer}	[unix_timestamp] optional, if not provided, Date.now() will be used
	 *	@returns {Buffer}
	 */
	this.createTimestamp = function(unix_timestamp) {
		if (!unix_timestamp) {
			unix_timestamp = Math.round(Date.now() / 1000);
		}

		// FIXME: this may create number larger than max allowed by JavaScript
		return self.createUInt64LE((unix_timestamp + 11644473600) * 10000000);
	};

	/**
	 *	Create UNIX timestamp from buffer with 64bit LE Windows timestamp (FILETIME).
	 *	This function is mainly for debugging because client does not need to read timestamps.
	 *
	 *	@param {Buffer}	timestamp
	 *	@returns {integer}
	 */
	this.readTimestamp = function(timestamp) {
		var result = 0;

		// Leaving multiplications for readability
		result += timestamp.readUInt8(0);
		result += timestamp.readUInt8(1) * 256;
		result += timestamp.readUInt8(2) * 256 * 256;
		result += timestamp.readUInt8(3) * 256 * 256 * 256;
		result += timestamp.readUInt8(4) * 256 * 256 * 256 * 256;
		result += timestamp.readUInt8(5) * 256 * 256 * 256 * 256 * 256;
		result += timestamp.readUInt8(6) * 256 * 256 * 256 * 256 * 256 * 256;
		result += timestamp.readUInt8(7) * 256 * 256 * 256 * 256 * 256 * 256 * 256;

		return result / 10000000 - 11644473600;
	};

	/**
	 *	Create buffer with 64bit random nonce.
	 *
	 *	@returns {Buffer}
	 */
	this.createNonce = function() {
		var result = new Buffer(8);
		result.fill(0);

		var value = Math.random() * (Math.random().toString().replace(/[^\.]+\./, ''));
		result.writeDoubleLE(value, 0);

		return result;
	};

	/**
	 *	Return OS Version object.
	 *	If no parameters are passed, version number will be read from the operating system.
	 *
	 *	@param {integer} [major] part of version number
	 *	@param {integer} [minor] part of version number
	 *	@param {integer} [build] part of version number
	 *	@param {integer} [reserved] part of version number
	 *	@returns {OSVersion}
	 */
	this.OSVersion = function(major, minor, build, reserved) {
		if (!(this instanceof self.OSVersion)) {
			return new self.OSVersion();
		}

		this.major = major || 0;
		this.minor = minor || 0;
		this.build = build || 0;
		// This actually is 3 reserved bytes and one byte of NTLMRevisionCurrent
		// that currently can only be 0x0f (version 15 of the NTLMSSP is in use).
		this.reserved = reserved || 0x0f000000;

		if (major || minor || build || reserved) {
			// Version was passed in arguments, do not automatically get it from the OS.
			return;
		}

		// TODO: this gives true version (even on Linux :), but MS-NLMP documentation says that only a few version numbers are OK.
		var version = os.release().split('.');
		if (version && version.length > 2) {
			version[0] = parseInt(version[0], 10);
			version[1] = parseInt(version[1], 10);
			version[2] = parseInt(version[2], 10);

			if (!isNaN(version[0]) && !isNaN(version[1]) && !isNaN(version[2])) {
				this.major = version[0];
				this.minor = version[1];
				this.build = version[2];
			}
		}
	};

	/**
	 *	Return Credentials object.
	 *
	 *	@param {string} username
	 *	@param {string} domain name
	 *	@param {string} password
	 *	@param {string} workstation name
	 *	@returns {Credentials}
	 */
	this.credentials = function(username, domain, password, workstation) {
		if (!(this instanceof self.credentials)) {
			return new self.credentials(username, domain, password, workstation);
		}

		this.username = username || '';
		this.domain = domain || '';
		this.workstation = workstation || os.hostname();

		this.lm_password_hash = self.lm_hash_password(password || '');
		this.ntlm_password_hash = self.ntlm_hash_password(password || '');
		this.ntlm2_password_hash = self.ntlm2_hash_password(this.username, this.domain, password || '');

		this.flags = new Flags(0, self.FLAGS);
		this.version = self.OSVersion();

		this.timestamp = self.createTimestamp();
		this.nonce = self.createNonce();

		this.sessionKey = false;
		this.lanManagerKey = false;
		this.randomSessionKey = false;

		password = '';
	};
}

/*
 *	Exports
 */
module.exports = NTLM;