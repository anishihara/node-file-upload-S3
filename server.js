var express = require("express"),
    app = express(),
    cfenv = require("cfenv"),
    skipper = require("skipper"),
    skipperS3 = require('skipper-s3'),
    extend = require('extend'),
    S3Lister = require("s3-lister");
    var knox = require('knox');

//load Object Storage (S3) credentials
var s3config = null
try {
  s3config = require("./s3-credentials.json");
}
catch (e) {}

var appEnv = cfenv.getAppEnv();

app.use(express.static(__dirname + "/public"));
app.use(skipper());


//fetch a single document from S3 storage
app.get("/file", function (request, response) {
    const file = request.query.file;
    const path = request.query.path === '/'? '' : request.query.path;
    const filepath = `${path}/${file}`;
    console.log(filepath)
    var adapter = skipperS3(s3config);
    var readStream = adapter.read(filepath);
    response.set({"Content-Disposition": 'attachment; filename="'+file+'"'});
    readStream.pipe(response);
});


//list documents from S3 storage
app.get("/files", function (request, response) {
    var adapter = skipperS3(s3config);
    const path = request.query.path || '/';
    adapter.ls(path, function (error, files) {
        if (error) {
            console.log(error);
            response.send(error);
        }
        else {
            console.log(files);
            response.send(files);
        }
    });
});

app.get("/folders", function (request, response) {
 var client = knox.createClient({
        key: s3config.key,
        secret: s3config.secret,
        bucket: s3config.bucket,
        endpoint: s3config.endpoint,
      });
    client.list({ delimiter: '/' }, function (err, data) {
        const folders = data.CommonPrefixes.map(prefix=>prefix.Prefix);
        response.status(200).json(folders);
    });
})



//upload a document to S3 storage
app.post("/upload", function (request, response) {
    
    var file = request.file('file');
    const path = request.query.path || '';
    var filename = file._files[0].stream.filename;
    var options = extend({}, s3config, {
        adapter: skipperS3,
        headers: {
            'x-amz-acl': 'private'
        },
        saveAs: path+'/'+filename
    });

    file.upload(options, function (err, uploadedFiles) {
        if (err) {
            console.log(err);
            return response.send(err);
        }
        else {
            return response.redirect("/");
        }
    });
});



// BEGIN monkey-patch to override default maxKeys value in S3Lister
// if you do not set the default maxKeys value, you will get "400 Bad Request" errors from S3 when listing contents
S3Lister.prototype.__read = S3Lister.prototype._read;
S3Lister.prototype._read = function () { 
    this.options.maxKeys = 1000;
    S3Lister.prototype.__read.apply(this, arguments);
}
// END monkey-patch




//start the app
var port = process.env.PORT || 8080;
app.listen(port, function() {
    console.log('listening on port', port);
});


require("cf-deployment-tracker-client").track();
