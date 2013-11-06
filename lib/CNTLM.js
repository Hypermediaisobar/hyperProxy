/*
	Spawn cntlm process.

	@settings       Object containing:
					- port integer,
					- path string (to cntlm binary and cntlm.ini),
					- hitpoints integer (number of ports to try if port is already used)
					- killOnBeforeStart boolean (should we kill previously sawned cntlm?)
*/

module.exports = function(settings) {
	var spawn = require('child_process').spawn;
	var os = require('os');
	var path = require('path');

	var self = this;
	self.settings = settings;

	self.spawn = function(){
		// Needed for nodejs < 0.9, because it does not get kill signals and thus we cannot kill cntlm on exit.
		if (self.settings.killOnBeforeStart) {
			if (os.platform().match(/win/)) {
				console.log('Killing any CNTLM that is running already...');
				self.settings.killOnBeforeStart = false;
				var exec = require('child_process').exec;
				var killer = exec('taskkill /F /IM cntlm.EXE');
				killer.on('close', self.spawn);
			}
			else {
				// TODO: Linux/*NIX versions?
			}
			return;
		}

		console.log('Spawning cntlm on port '+self.settings.port);
		self._cntlm = spawn('cntlm', ['-v', '-l', self.settings.port, '-P', path.join(self.settings.path, 'cntlm.pid')], {cwd: self.settings.path, stdio: 'pipe'});
	/*
		self._cntlm.stdout.on('data', function (data) {
			console.log('stdout: ' + data);
		});
	*/

		self._cntlm.stderr.on('data', function (data) {
			//console.log('stderr: ' + data);
			/*
			var found = data.toString().match(/cntlm: Proxy listening on 127.0.0.1:(\d+)/i);
			if (found && found.length > 1) {
				self.settings.port = found[1];
				console.log('cntlm is listening on port '+self.settings.port);
				//process.emit('cntlmReady');
			}*/
			var found = data.toString().match(/cntlm: PID (\d+): Cntlm ready, staying in the foreground/i);
			if (found && found.length > 1) {
				self.settings._PID = found[1];
				self.settings.hitpoints = 0;
				process.emit('cntlmReady', self.settings._PID);
			}
			else if (data.toString().match(/Exitting with error./)) {
				self.settings._PID = false;
				process.emit('cntlmError');
			}
		});


		self._cntlm.on('exit', function (code) {
			console.log('child process exited with code ' + code);
			self.settings.hitpoints -= 1;
			if (self.settings.hitpoints <= 0) {
				setTimeout(function(){
					process.exit(1);
				}, 100);
			}
			else {
				++self.settings.port;
				setTimeout(self.spawn, 1000);
			}
		});
	};


	self.onExit = function(){
		console.log('Exiting...');
		if (self.settings._PID) {
			process.kill(self.settings._PID);
			self.settings._PID = false;
		}
		else if (self._cntlm && self._cntlm.pid) {
			process.kill(self._cntlm.pid);
		}

		// TODO: On Windows, if killing does not work, we may try this way:
		// http://stackoverflow.com/a/11276409
	};

	process.on('SIGINT', self.onExit);
	process.on('SIGTERM', self.onExit);

/*
	process.on('SIGHUP', function () {
		console.log('Got SIGHUP.	Press Control-D to exit.');
	});

	process.on('SIGUSR1', function () {
		console.log('Got SIGUSR1.	Press Control-D to exit.');
	});
*/

	process.on('exit', self.onExit);

	self.spawn();
};