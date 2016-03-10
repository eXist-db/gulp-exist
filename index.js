// dependencies
var os = require("os");
var through = require("through2");
var gutil = require("gulp-util");
var PluginError = gutil.PluginError;
var xmlrpc = require("xmlrpc");
var mime = require("mime");
var async = require("async");
var assign = require("lodash.assign");
var File = require('vinyl');
var Path = require("path");

var defaultRPCoptions = {
    host: 'localhost',
    port: '8080',
    path: '/exist/xmlrpc',
    basic_auth: {
        user: "guest",
        pass: "guest"
    }
};

var defaultUploadOptions = {
    html5AsBinary: false,
    target: '',
    permissions: null
};

var defaultQueryOptions = {
    printXqlResults: true,
    xqlOutputExt: "xml"
};

var isWin = os.platform() === 'win32';

// add common existDB file types
mime.define({
    'application/xquery': ['xq', 'xql', 'xqm'],
    'application/xml': ['xconf']
});

function isSaxParserError (error) {
    return error && error.faultString && /SAXParseException/.test(error.faultString)
}

var normalizePath = function (path) {
    return Path.normalize(isWin ? path.replace(/\\/g, "/") : path);
};

function createCollection(client, collection, callback) {
    var normalizedCollectionPath = normalizePath(collection);
    gutil.log('Creating collection "' + normalizedCollectionPath + '"...');
    client.methodCall('createCollection', [normalizedCollectionPath], callback);
}

module.exports.createClient = function createClient(options) {
    // TODO sanity checks
    var client = xmlrpc.createClient(assign({}, defaultRPCoptions, options))
    return {
        dest: sendFilesWith(client),
        query: queryWith(client),
        newer: checkForNewerWith(client)
    }
};

module.exports.defineMimeTypes = function (mimeTypes) {
    mime.define(mimeTypes);
};

module.exports.getMimeTypes = function () {
    return mime.types;
};

function sendFilesWith(client) {
    return function send(options) {
        var conf = assign({}, defaultUploadOptions, options)

        var storeFile = function (vf, enc, callback) {
            if (vf.isStream()) {
                return this.emit("error", new PluginError("gulp-exist", "Streaming not supported"));
            }

            if (vf.isDirectory()) {
                return createCollection(client, normalizePath(conf.target + "/" + vf.relative), callback);
            }

            if (vf.isNull()) {
                return callback();
            }

            // rewrap to newer version of vinyl file object
            var file = new File({
                base: vf.base,
                path: vf.path,
                contents: vf.contents
            });

            var remotePath = normalizePath(conf.target + "/" + file.relative);

            var uploadAndParse = function (file, remotePath, mimeType, callback) {
                // handle re-upload as octet stream if parsing failed and html5AsBinary is set
                function retryOnFail(error, result) {
                    if (isSaxParserError(error) && conf.html5AsBinary && file.extname === '.html' ) {
                        gutil.log(file.relative + " is not well-formed XML, storing as binary...");
                        return uploadAndParse(file, remotePath, "application/octet-stream", callback);
                    }
                    if (isSaxParserError(error)) {
                        gutil.log(' ✖ ' + remotePath + ' was not stored');
                        return callback(error, null);
                    }
                    gutil.log(' ✔ ︎' + remotePath + ' stored');
                    callback(error, result);
                }
                async.waterfall([
                    // First upload file
                    function (cb) {
                        gutil.log('Storing "' + file.base + file.relative + '" as (' + mimeType + ')...');
                        client.methodCall('upload', [file.contents, file.contents.length], cb);
                    },

                    // Then parse file on server and store to specified destination path
                    function (fileHandle, cb) {
                        client.methodCall('parseLocal', [fileHandle, remotePath, true, mimeType], cb);
                    }
                ], retryOnFail);
            };

            async.waterfall([
                    // check if the target collection / folder exists and create it if necessary
                    function (callback) {
                        var folder = file.relative.substring(0, file.relative.length - file.basename.length)
                        client.methodCall('describeCollection', [Path.normalize(conf.target) +  "/" + folder], function (error) {
                            if (!error) { return callback(null, true) }
                            createCollection(client, Path.normalize(conf.target) + "/" + folder, callback);
                        });
                    },

                    // Then upload and parse file
                    function (result, callback) {
                        var mimeType = mime.lookup(file.path);
                        uploadAndParse(file, remotePath, mimeType, callback);
                    },

                    // Then override permissions if specified in options
                    function (result, callback) {
                        if (!result || conf.permissions === null || !(file.relative in conf.permissions)) {
                            return callback(null);
                        }

                        gutil.log('Setting permissions for "' + normalizePath(file.relative) + '" (' + conf.permissions[file.relative] + ')...');
                        client.methodCall('setPermissions', [remotePath, conf.permissions[file.relative]], callback);
                    }
                ],
                // Handle errors and proceed to next file
                function (error) {
                    if (isSaxParserError(error)) {
                        // Delete file on server on parse error. This is necessary because eXist modifies the
                        // mtimes of existing files on a failed upload/parse-attempt which breaks
                        // date comparisons in the newer-stream
                        gutil.log("Removing " + remotePath + " due to parse error...");
                        return client.methodCall('remove', [remotePath], function () {
                            callback(error)
                        });
                    }
                    if (error) {
                        gutil.log("Error: " + error);
                        return callback(error);
                    }
                    callback();
                });
        };

        return through.obj(storeFile);
    };
}

function queryWith(client) {
    return function query(options) {
        var conf = assign({}, defaultQueryOptions, options);

        function executeQuery(file, enc, callback) {
            if (file.isStream()) {
                return callback(new PluginError("gulp-exist", "Streaming not supported"));
            }

            if (file.isDirectory() || file.isNull()) {
                callback();
                return;
            }

            gutil.log('Running XQuery on server: ' + file.relative);

            async.waterfall([
                    function (callback) {
                        client.methodCall('executeQuery', [file.contents, {}], callback);
                    },
                    function (resultHandle, callback) {
                        client.methodCall('getHits', [resultHandle], function (error, hitCount) {
                            callback(error, resultHandle, hitCount);
                        });
                    },
                    function (resultHandle, hitCount, callback) {
                        async.times(hitCount, function (n, next) {
                            client.methodCall('retrieve', [resultHandle, n, {}], next);
                        }, callback);
                    }
                ],
                function (error, results) {
                    if (error) {
                        var errorObject = new PluginError("gulp-exist", "Error running XQuery " + file.relative + ":\n" + error);
                        return callback(errorObject);
                    }

                    var result = Buffer.concat(results);

                    if (conf.printXqlResults) {
                        gutil.log(result.toString());
                    }

                    file.path = gutil.replaceExtension(file.path, "." + new Date().toJSON() + "." + conf.xqlOutputExt);
                    file.contents = result;

                    callback(null, file);
                });
        }

        return through.obj(executeQuery);
    };
}

function checkForNewerWith(client) {
    return function newer (options) {
        var conf = assign({}, defaultUploadOptions, options);

        function checkFile(file, enc, callback) {
            if (file.isDirectory()) {
                var collection = normalizePath(conf.target + "/" + file.relative);
                client.methodCall('describeCollection', [collection], function (error, result) {
                    // Include directory if it does not exist as a collection on a server
                    callback(null, result ? null : file);
                });
                return;
            }
    
            client.methodCall('describeResource', [normalizePath(conf.target + "/" + file.relative)], function (error, resourceInfo) {
                var newer = !resourceInfo.hasOwnProperty("modified") || (Date.parse(file.stat.mtime) > Date.parse(resourceInfo.modified));
                callback(error, newer ? file : null);
            });
        }

        return through.obj(checkFile);
    };
}
