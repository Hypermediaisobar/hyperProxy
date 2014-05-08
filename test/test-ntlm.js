/*
 *	Run this test with mocha:
 *	http://visionmedia.github.io/mocha/
 *
 *	These tests contain and use example data collected and prepared by Eric Glass
 *	available at from http://davenport.sourceforge.net/ntlm.html
 */

var assert = require('assert');
var path = require('path');

describe('NTLM', function(){
	'use strict';

	var ntlm;

	var PASSWORD = 'SecREt01';
	var DOMAIN = 'DOMAIN';
	var WORKSTATION = 'WORKSTATION';
	var USER = 'user';

	it('should exist', function(){
		var NTLM = require(path.join(path.dirname(module.filename), '..', 'lib', 'NTLM.js'));
		assert.ok(NTLM);
		ntlm = NTLM();
		assert.ok(ntlm);
	});

	it('should create correct UInt64LE buffer', function(){
		var correct = '0100000000000000';
		var hex = ntlm.createUInt64LE(1);
		assert.strictEqual(hex.toString('hex'), correct);
	});

	it('should create correct ntlm timestamp', function(){
		var correct = '0090d336b734c301';
		var timestamp = ntlm.createTimestamp(1055844000);
		assert.strictEqual(timestamp.toString('hex'), correct);
	});

	it('should read correct ntlm timestamp', function(){
		var correct = 1055844000;
		var timestamp = ntlm.readTimestamp(new Buffer('0090d336b734c301', 'hex'));
		assert.strictEqual(timestamp, correct);
	});

	it('should create random nonce', function(){
		var zero   = '00000000000000000000000000000000';
		var nonce1 = ntlm.createNonce();
		var nonce2 = ntlm.createNonce();

		assert.strictEqual(nonce1.toString('hex') != zero, true, 'First nonce is zero');
		assert.strictEqual(nonce2.toString('hex') != zero, true, 'Second nonce is zero');
		assert.strictEqual(nonce1.toString('hex') != nonce2.toString('hex'), true, 'First and second nonce are the same');
	});

	it('should create valid OSVersion object', function(){
		var version = ntlm.OSVersion();
		assert.ok(version instanceof Object);
		assert.ok(version.hasOwnProperty('major') && !isNaN(version.major));
		assert.ok(version.hasOwnProperty('minor') && !isNaN(version.minor));
		assert.ok(version.hasOwnProperty('build') && !isNaN(version.build));
	});

	it('should correctly adjust parity in bytes', function(){
		var correct = '01070107';
		var buffer = new Buffer('00060106', 'hex');
		ntlm.adjustBytesParity(buffer);
		assert.strictEqual(buffer.toString('hex'), correct);
	});

	it('should create correct 64bit DES key from 56bit key', function(){
		var correct = '52a2516b252a5161';
		var key56 = new Buffer('53454352455430', 'hex');
		var key64 = ntlm.createDESKey(key56);
		assert.strictEqual(key64.toString('hex'), correct);
	});

	it('should create correct lm_hash_password', function(){
		var correct = 'ff3750bcc2b22412c2265b23734e0dac';
		var hash = ntlm.lm_hash_password(PASSWORD);
		assert.strictEqual(hash.toString('hex'), correct);
	});

	it('should create zeroed lm_hash_password if password is longer than 15 characters', function(){
		var correct = '00000000000000000000000000000000';
		var hash = ntlm.lm_hash_password('01234567890123456');
		assert.strictEqual(hash.toString('hex'), correct);
	});

	it('should create correct ntlm_hash_password', function(){
		var correct = 'cd06ca7c7e10c99b1d33b7485a2ed808';
		var hash = ntlm.ntlm_hash_password(PASSWORD);
		assert.strictEqual(hash.toString('hex'), correct);
	});

	it('should create correct ntlm2_hash_password', function(){
		var correct = '04b8e0ba74289cc540826bab1dee63ae';
		var hash = ntlm.ntlm2_hash_password(USER, DOMAIN, PASSWORD);
		assert.strictEqual(hash.toString('hex'), correct);
	});

	it('should create valid credentials', function(){
		var credentials = ntlm.credentials(USER, DOMAIN, PASSWORD, WORKSTATION);
		assert.ok(credentials instanceof Object);
		assert.ok(credentials instanceof ntlm.credentials);

		assert.strictEqual(credentials.username, USER);
		assert.strictEqual(credentials.domain, DOMAIN);
		assert.strictEqual(credentials.workstation, WORKSTATION);
		assert.ok(credentials.lm_password_hash);
		assert.ok(credentials.ntlm_password_hash);
		assert.ok(credentials.ntlm2_password_hash);

		var Flags = require(path.join(path.dirname(module.filename), '..', 'lib', 'Flags.js'));
		assert.ok(credentials.flags instanceof Flags);
		assert.ok(credentials.version instanceof ntlm.OSVersion);

		assert.ok(credentials.timestamp);
		assert.ok(credentials.nonce);
	});

	it('should read valid flags', function(){
		var Flags = require(path.join(path.dirname(module.filename), '..', 'lib', 'Flags.js'));
		// These are the flags used by CNTLM (http://cntlm.sourceforge.net/)
		var setups = [0xa208b205, 0xa208b207, 0xb207, 0xb205, 0xb206];
		setups.forEach(function(value){
			var flags = new Flags(value, ntlm.FLAGS);
			console.log();
			console.log('Flags '+flags.toString('hex'));
			console.log(flags);
		});
	});

	describe('Messaging', function(){

		var credentials;
		var anonymous;
		var inputMessage2 = '4e544c4d53535000020000000c000c0030000000010281000123456789abcdef0000000000000000620062003c00000044004f004d00410049004e0002000c0044004f004d00410049004e0001000c005300450052005600450052000400140064006f006d00610069006e002e0063006f006d00030022007300650072007600650072002e0064006f006d00610069006e002e0063006f006d0000000000';
		var message2 = false;

		before(function(){
			credentials = ntlm.credentials(USER, DOMAIN, PASSWORD, WORKSTATION);
			credentials.version.major = 5;
			credentials.version.minor = 0;
			credentials.version.build = 2195;

			credentials.nonce = new Buffer('ffffff0011223344', 'hex');
			credentials.timestamp = new Buffer('0090d336b734c301', 'hex');

			anonymous = ntlm.credentials('', DOMAIN, '', WORKSTATION);
			anonymous.version.major = 5;
			anonymous.version.minor = 0;
			anonymous.version.build = 2195;

			anonymous.nonce = new Buffer('ffffff0011223344', 'hex');
			anonymous.timestamp = new Buffer('0090d336b734c301', 'hex');
		});

		beforeEach(function(){
			credentials.flags.unsetAll();
		});

		it('should create valid Type1 message', function(){
			credentials.flags.negotiateUnicode = true;
			credentials.flags.negotiateOEM = true;
			credentials.flags.requestTarget = true;
			credentials.flags.negotiateNTLM = true;
			credentials.flags.negotiateDomain = true;
			credentials.flags.negotiateWorkstation = true;
			credentials.flags.negotiateVersion = true;

			ntlm.clientVersion = 3;
			var message = ntlm.createType1Message(credentials);

			var correct = '4e544c4d53535000010000000732000206000600330000000b000b0028000000050093080000000f574f524b53544154494f4e444f4d41494e';
			assert.strictEqual(message.toString('hex'), correct);
		});

		it('should recognize invalid Type2 Message string', function(){
			var base64 = (new Buffer(inputMessage2, 'hex')).toString('base64');
			assert.strictEqual(ntlm.readType2Message('NT '+base64), false);
			assert.ok(ntlm.readType2Message('NTLM '+base64) instanceof Object);
		});

		it('should recognize invalid Type2 Message string', function(){
			var base64 = (new Buffer(inputMessage2, 'hex')).toString('base64');
			message2 = ntlm.readType2Message(base64);

			assert.strictEqual(message2.signature, 'NTLMSSP', 'Wrong signature');
			assert.strictEqual(message2.type, 2, 'Wrong type');

			assert.strictEqual(message2.targetNameBuffer.length, 12, 'Wrong length of targetName');
			assert.strictEqual(message2.targetNameBuffer.space, 12, 'Wrong space of targetName');
			assert.strictEqual(message2.targetNameBuffer.offset, 48, 'Wrong offset of targetName');

			assert.strictEqual(message2.flags.negotiateUnicode, true, 'Wrong value of negotiateUnicode flag');
			assert.strictEqual(message2.flags.negotiateOEM, false, 'Wrong value of negotiateOEM flag');

			assert.strictEqual(message2.flags.negotiateNTLM, true, 'Wrong value of negotiateNTLM flag');
			assert.strictEqual(message2.flags.targetTypeDomain, true, 'Wrong value of targetTypeDomain flag');
			assert.strictEqual(message2.flags.negotiateTargetInfo, true, 'Wrong value of negotiateTargetInfo flag');

			assert.strictEqual(+message2.flags, 0x00000001 | 0x00000200 | 0x00010000 | 0x00800000, 'Wrong value of flags');

			assert.strictEqual(message2.challenge.toString('hex'), '0123456789abcdef', 'Wrong challenge');
			assert.strictEqual(message2.context.toString('hex'), '0000000000000000', 'Wrong context');

			assert.strictEqual(message2.targetInfoBuffer.length, 98, 'Wrong length of targetInfo data');
			assert.strictEqual(message2.targetInfoBuffer.space, 98, 'Wrong space of targetInfo data');
			assert.strictEqual(message2.targetInfoBuffer.offset, 60, 'Wrong offset of targetInfo data');

			assert.strictEqual(message2.targetName.toString('ucs2'), 'DOMAIN', 'Wrong targetName value');

			assert.ok(message2.targetInfo.computerName !== undefined, 'Missing computerName');
			assert.strictEqual(message2.targetInfo.computerName.toString('ucs2'), 'SERVER', 'Wrong computerName');

			assert.ok(message2.targetInfo.domainName !== undefined, 'Missing domainName');
			assert.strictEqual(message2.targetInfo.domainName.toString('ucs2'), 'DOMAIN', 'Wrong domainName');

			assert.strictEqual(message2.targetInfo.dnsComputerName.toString('ucs2'), 'server.domain.com', 'Wrong server name');
			assert.strictEqual(message2.targetInfo.dnsDomainName.toString('ucs2'), 'domain.com', 'Wrong server name');
		});

		it('should create correct LM response', function(){
			var response = ntlm.lm_response(message2, credentials);

			var correct = 'c337cd5cbd44fc9782a667af6d427c6de67c20c2d3e77c56';
			assert.strictEqual(response.toString('hex'), correct);

			correct = 'ff3750bcc2b224120000000000000000';
			assert.strictEqual(credentials.sessionKey.toString('hex'), correct, 'Session Key is incorrect');
		});

		it('should create correct Anonymous LM response', function(){
			var response = ntlm.lm_response(message2, anonymous);

			var correct = '00';
			assert.strictEqual(response.toString('hex'), correct, 'Wrong LM response');

			correct = '00000000000000000000000000000000';
			assert.strictEqual(anonymous.sessionKey.toString('hex'), correct, 'Session Key is incorrect');
		});

		it('should create correct NTLM response', function(){
			var response = ntlm.ntlm_response(message2, credentials);

			var correct = '25a98c1c31e81847466b29b2df4680f39958fb8c213a9cc6';
			assert.strictEqual(response.toString('hex'), correct);

			correct = '3f373ea8e4af954f14faa506f8eebdc4';
			assert.strictEqual(credentials.sessionKey.toString('hex'), correct, 'Session Key is incorrect');
		});

		it('should create correct Anonymous NTLM response', function(){
			var response = ntlm.ntlm_response(message2, anonymous);

			var correct = '';
			assert.strictEqual(response.toString('hex'), correct, 'Wrong NTLM response');

			correct = '00000000000000000000000000000000';
			assert.strictEqual(anonymous.sessionKey.toString('hex'), correct, 'Session Key is incorrect');
		});

		it('should create correct LM2 response', function(){
			var response = ntlm.lm2_response(message2, credentials);

			var correct = 'd6e6152ea25d03b7c6ba6629c2d6aaf0ffffff0011223344';
			assert.strictEqual(response.toString('hex'), correct);

			correct = 'f3dfe1248f50c327c458b6842d3c5d3f';
			assert.strictEqual(credentials.sessionKey.toString('hex'), correct, 'Session Key is incorrect');
		});

		it('should create correct Anonymous LM2 response', function(){
			var response = ntlm.lm2_response(message2, anonymous);

			var correct = '00';
			assert.strictEqual(response.toString('hex'), correct);

			correct = '00000000000000000000000000000000';
			assert.strictEqual(anonymous.sessionKey.toString('hex'), correct, 'Session Key is incorrect');
		});

		it('should create correct NTLM2 response', function(){
			var response = ntlm.ntlm2_response(message2, credentials);

			var correct = 'cbabbca713eb795d04c97abc01ee498301010000000000000090d336b734c301ffffff00112233440000000002000c0044004f004d00410049004e0001000c005300450052005600450052000400140064006f006d00610069006e002e0063006f006d00030022007300650072007600650072002e0064006f006d00610069006e002e0063006f006d000000000000000000';
			assert.strictEqual(response.toString('hex'), correct);

			correct = 'b94a239bb4c6d1ec08306a071d2b90f0';
			assert.strictEqual(credentials.sessionKey.toString('hex'), correct, 'Session Key is incorrect');
		});

		it('should create correct Anonymous NTLM2 response', function(){
			var response = ntlm.ntlm2_response(message2, anonymous);

			var correct = '';
			assert.strictEqual(response.toString('hex'), correct);

			correct = '00000000000000000000000000000000';
			assert.strictEqual(anonymous.sessionKey.toString('hex'), correct, 'Session Key is incorrect');
		});

		it('should create correct NTLM session response', function(){
			var response = ntlm.ntlm_sr_response(message2, credentials);

			var correct = 'ffffff001122334400000000000000000000000000000000';
			assert.strictEqual(response.lm.toString('hex'), correct, 'Wrong LM response');

			correct = '10d550832d12b2ccb79d5ad1f4eed3df82aca4c3681dd455';
			assert.strictEqual(response.ntlm.toString('hex'), correct, 'Wrong NTLM response');

			correct = '8aad1bfc514b171dba5ab17a7b072ef8';
			assert.strictEqual(credentials.sessionKey.toString('hex'), correct, 'Session Key is incorrect');
		});

		it('should create correct Anonymous NTLM session response', function(){
			var response = ntlm.ntlm_sr_response(message2, anonymous);

			var correct = '00';
			assert.strictEqual(response.lm.toString('hex'), correct, 'Wrong LM response');

			correct = '';
			assert.strictEqual(response.ntlm.toString('hex'), correct, 'Wrong NTLM response');
		});

		it('should create correct Anonymous session response', function(){
			var response = ntlm.anonymous_response(message2, credentials);

			var correct = '00';
			assert.strictEqual(response.lm.toString('hex'), correct, 'Wrong LM response');

			correct = '';
			assert.strictEqual(response.ntlm.toString('hex'), correct, 'Wrong NTLM response');

			correct = '00000000000000000000000000000000';
			assert.strictEqual(anonymous.sessionKey.toString('hex'), correct, 'Session Key is incorrect');
		});

		it('should create correct NTLM Type3 message', function(){
			credentials.flags.negotiateUnicode = true;
			credentials.flags.negotiateOEM = true;
			credentials.flags.requestTarget = true;
			credentials.flags.negotiateNTLM = true;
			credentials.flags.negotiateDomain = true;
			credentials.flags.negotiateWorkstation = true;

			var flags = +message2.flags;
			message2.flags.unsetAll();
			message2.flags.negotiateNTLM = true;
			message2.flags.negotiateUnicode = true;

			ntlm.securityLevel = 2;

			var message3 = ntlm.createType3Message(message2, credentials);

			var correct = '4e544c4d5353500003000000180018006a00000018001800820000000c000c0040000000080008004c0000001600160054000000000000009a0000000102000044004f004d00410049004e00750073006500720057004f0052004b00530054004100540049004f004e00c337cd5cbd44fc9782a667af6d427c6de67c20c2d3e77c5625a98c1c31e81847466b29b2df4680f39958fb8c213a9cc6';
			assert.strictEqual(message3.toString('hex'), correct);
		});

		it('should create correct LM session key', function(){
			var key = ntlm.lm_session_key(credentials);

			var correct = 'ff3750bcc2b224120000000000000000';
			assert.strictEqual(key.toString('hex'), correct);
		});

		it('should create correct NTLM session key', function(){
			var key = ntlm.ntlm_session_key(credentials);

			var correct = '3f373ea8e4af954f14faa506f8eebdc4';
			assert.strictEqual(key.toString('hex'), correct);
		});

		it('should create correct Lan Manager session key', function(){
			var lm_response = ntlm.lm_response(message2, credentials);

			var correct = 'c337cd5cbd44fc9782a667af6d427c6de67c20c2d3e77c56';
			assert.strictEqual(lm_response.toString('hex'), correct, 'Wrong LM response');

			var lan_manager_key = ntlm.lan_manager_session_key(lm_response, credentials);

			correct = '8cc1065bc799112ca1171d50fde4f5de';
			assert.strictEqual(lan_manager_key.toString('hex'), correct, 'Wrong Lan Manager Session Key');
		});

		it('should create correct RC-4 encrypted randomSessionKey', function(){
			credentials.randomSessionKey = new Buffer('f0f0aabb00112233445566778899aabb', 'hex');

			var lm_response = ntlm.lm_response(message2, credentials);
			credentials.currentKey = credentials.sessionKey;

			var correct = 'e41873887ad8201aae335ca33451ccfa';
			assert.strictEqual(ntlm.master_session_key(credentials).toString('hex'), correct, 'Wrong when using LM session key');

			var ntlm_response = ntlm.ntlm_response(message2, credentials);
			credentials.currentKey = credentials.sessionKey;

			correct = '1d3355eb71c82850a9a2d65c2952e6f3';
			assert.strictEqual(ntlm.master_session_key(credentials).toString('hex'), correct, 'Wrong when using NTLM sesion key');

			var lan_manager_key = ntlm.lan_manager_session_key(lm_response, credentials);
			credentials.currentKey = lan_manager_key;

			correct = '70e61dc3a3eb655aadf96d22e97b5fa1';
			assert.strictEqual(ntlm.master_session_key(credentials).toString('hex'), correct, 'Wrong when using Lan Manager sesion key');
		});



		it('should work on real server data', function(done){
			// FIXME: ENTER YOUR REAL CREDENTIALS HERE
			var user = '';
			var domain = '';
			var password = '';

			assert.ok(user, 'Real user name is required for this test');
			assert.ok(domain, 'Real domain name is required for this test');
			assert.ok(password, 'Real user password is required for this test');

			var credentials = new ntlm.credentials(user, domain, password);

			ntlm.securityLevel = 4;
			var message1 = ntlm.createType1Message(credentials);

			var headers = '';
			var stage = 1;

			var net = require('net');
			var client = net.connect({host: 'proxy.hyper', port: 3128}, function(){
				stage = 1;
				client.write("HEAD http://jquery.com/ HTTP/1.1\r\nHost: jquery.com\r\nConnection: keep-alive\r\nProxy-Authorization: NTLM "+message1.toString('base64')+"\r\n\r\n");
			});
			client.on('data', function(data){
				if (stage === 1) {
					headers += data.toString();
					if (!headers.match(/\r\n\r\n/)) {
						return;
					}

					var auth = headers.match(/Proxy-Authenticate:\s*([^\r\n]+)/);
					if (!auth) {
						console.warn('Something went wrong, we did not receive Type2 message.');
						client.end();
					}

					var message2 = ntlm.readType2Message(auth[1]);
					assert.ok(message2, 'Wrong Type2 Message from server');

					var message3 = ntlm.createType3Message(message2, credentials);
					stage = 2;
					headers = '';

					client.write("GET http://jquery.com/ HTTP/1.1\r\nHost: jquery.com\r\nConnection: keep-alive\r\nProxy-Authorization: NTLM "+message3.toString('base64')+"\r\n\r\n");
				}
				else if (stage === 2) {
					headers += data.toString();
					if (!headers.match(/\r\n\r\n/)) {
						return;
					}

					var code = headers.match(/HTTP\/1\.\d\s+(\d+)/);
					assert.ok(code[1] != 407, 'Looks like NTLM authentication failed.');
				}
				else {
					assert('Unknown stage: '+stage);
				}

			});
			client.on('end', function(){
				done();
			});
			client.setKeepAlive(true);
		});
	});
});
