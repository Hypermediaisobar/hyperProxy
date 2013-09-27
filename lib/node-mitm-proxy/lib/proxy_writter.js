var fs 		= require('fs')
	, path 	= require('path')
	, clrs 	= require('colors')
	, mdp  	= require(path.join(__dirname, 'mkdirp.js'))
;

var proxyWritter = function(hostname, pathname) {
	var self = this;
	var stream = null;

	this.host = hostname.replace(/[^a-zA-Z0-9\-\.]/g, "");
	this.path = pathname.replace(/[^a-zA-Z0-9\-\.\_\/]/g, "_");

	if(this.path.length > 256) this.path = this.path.slice(0,256);

	var basepath = "/tmp/proxy/" + this.host;
	this.filename = path.resolve( basepath + this.path);

	// if path is beyond basepath, set relative request path
 	if(this.filename.indexOf(basepath) != 0) this.filename = basepath + "/relative_request_" + Date.now();

 	// if does not have extension, create directory and set file name to index.html
 	if(this.filename == basepath || path.basename(this.filename).indexOf(".") == -1) this.filename = this.filename + "/index.html";

	this.write = function(d) {
		if(stream) {
			try {
				stream.write(d)
			} catch(err) {
				console.log(("Ops, failed creating file: " + self.filename + ", reason: " + err).red);
				stream = null;
			}
		} else {
			console.log("Stream not open for file: " + self.filename.red);
		}
	}

	this.end = function() {
		if(stream) stream.end();
	}

	mdp.mkdirp(path.dirname(this.filename), 0755, function() {
		if(path.existsSync(self.filename)) {
			self.filename += "-" +  Date.now();
		}
		stream = fs.createWriteStream(self.filename, {flags:'w', 'encoding':null});
	})
}

module.exports = proxyWritter