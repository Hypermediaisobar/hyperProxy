var Proxy = require('../proxy.js');
var fs = require('fs');
var id3;

try {
  id3 = require('id3')
} catch(err) {
  console.log("node-id3 not present")
}

// Processor 
simpleProcessor = function(proxy) {
  var filename;
  var file;
  var header;

  proxy.on('response', function(response, req_hostname, req_pathname) {
    if(response.headers["content-type"] == "audio/mpeg") {
      console.log("Found audio stream")
      filename = Date.now() + ".mp3";
      file = fs.createWriteStream(filename, {flags:'w', 'encoding':null});
    }
  });

  proxy.on('response_data', function(data) {
    if(file) {
      if(!header) header = data;  // first packet only
      file.write(data);
    }
  });

  proxy.on('response_end', function() {
    if(file) {
      file.end();

      if(id3) { 
        var mp3_id3 = new id3(header);
        var tags = mp3_id3.getTags();
        var composer = (tags.TPE1 && tags.TPE1.data) || (tags.TPE1 && tags.TP1.data) || (tags.TPE2 && tags.TPE2.data) || (tags.TP2 && tags.TP2.data);
        var title = (tags.TIT2 && tags.TIT2.data) || (tags.TT2 && tags.TT2.data);
        var album = (tags.TALB && tags.TALB.data) || (tags.TAL && tags.TAL.data);

        if(composer && title) {
          composer = composer.replace(/[\u0000-\u0010]/g, "");
          title = title.replace(/[\u0000-\u0010]/g, "");
          if(album) album = album.replace(/[\u0000-\u0010]/g, "");

          var new_filename = composer + ( album ? " - " + album : "" ) + " - " + title + ".mp3";
          fs.rename(filename, new_filename, function() { 
            console.log("Created audio file: " + new_filename)
          })
        } else {
          console.log("No composer and title found - Created audio file: " + filename)  
        }
      } else {
        console.log("No ID3 module found - Created audio file: " + filename)
      }
    }
  });
};

// Proxy
new Proxy({proxy_port: 8080, verbose: false}, simpleProcessor);
