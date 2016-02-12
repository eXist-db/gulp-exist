var through = require("through2");
var gutil = require("gulp-util");
var PluginError = gutil.PluginError;
var xmlrpc = require("xmlrpc");
var mime = require("mime");
var async = require("async");
var assign = require("lodash.assign");

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
    retry: false,
    target: '',
    permissions: null
};

var defaultQueryOptions = {
    print_xql_results: true,
    xql_output_ext: "xml"
};

var client;

// add common existDB file types
mime.define({
    'application/xquery': ['xq', 'xql', 'xqm'],
    'application/xml': ['xconf']
});

function isSaxParserError (error) {
    return error && error.faultString && /SAXParseException/.test(error.faultString)
}

var normalizePath = function (path) {
    return /^win/.test(process.platform) ? path.replace(/\\/g, "/") : path;
};

function createCollection(client, collection, callback) {
    var normalizedCollectionPath = normalizePath(collection);
    gutil.log('Creating collection "' + normalizedCollectionPath + '"...');
    client.methodCall('createCollection', [normalizedCollectionPath], callback);
}

module.exports.createClient = function createClient(options) {
    // TODO sanity checks
    client = xmlrpc.createClient(assign({}, defaultRPCoptions, options))
};

module.exports.defineMimeTypes = function (mimeTypes) {
    mime.define(mimeTypes);
};

module.exports.dest = function (options) {
    if (!client || !options) {
        throw new PluginError("gulp-exist", "Missing options.");
    }

    var conf = assign({}, defaultUploadOptions, options)
    var firstFile = null;

    var storeFile = function (file, enc, callback) {
        if (file.isStream()) {
            return this.emit("error", new PluginError("gulp-exist", "Streaming not supported"));
        }

        if (file.isDirectory()) {
            return createCollection(client, normalizePath(conf.target + file.relative), callback);
        }

        if (file.isNull()) {
            return callback();
        }

        var remotePath = normalizePath(conf.target + file.relative);

        var uploadAndParse = function (file, remotePath, mimeType, callback) {
            // handle re-upload as octet stream if parsing failed and binary_fallback is set
            function retryOnFail(error, result) {
                if (isSaxParserError(error) && conf.retry) {
                    gutil.log(file.relative + " not well-formed XML, trying to store as binary...");
                    return uploadAndParse(file, remotePath, "application/octet-stream", callback);
                }
                gutil.log(' ---> ' + remotePath + ' stored');
                callback(error, result);
            }
            async.waterfall([
                // First upload file
                function (cb) {
                    gutil.log('Storing "' + remotePath + '" (' + mimeType + ')...');
                    client.methodCall('upload', [file.contents, file.contents.length], cb);
                },

                // Then parse file on server and store to specified destination path
                function (fileHandle, cb) {
                    client.methodCall('parseLocal', [fileHandle, remotePath, true, mimeType], cb);
                }
            ], retryOnFail);
        };

        async.waterfall([
                // If this is the first file in the stream, check if the target collection exists
                function (callback) {
                    // skip if firstFile is set
                    if (firstFile) { return callback(null, true); }

                    firstFile = file;
                    client.methodCall('describeCollection', [conf.target], function (error) {
                        callback(null, (error == null))
                    });
                },

                // Then create target collection if needed
                function (skip, callback) {
                    if (skip) { return callback(null, null); }
                    createCollection(client, conf.target, callback);
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
                    return callback(error);
                }
                callback();
            });
    };

    return through.obj(storeFile);
};


module.exports.query = function (options) {
    var conf = assign({}, defaultQueryOptions, options);

    function executeQuery(file, enc, callback) {
        if (file.isStream()) {
            callback();
            return this.emit("error", new PluginError("gulp-exist", "Streaming not supported"));
        }

        if (file.isDirectory() || file.isNull()) {
            callback();
            return;
        }

        var self = this;

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
                    self.emit(
                        "error",
                        new PluginError("gulp-exist", "Error running XQuery " + file.relative + ":\n" + error)
                    );
                    callback();
                    return;
                }

                var result = Buffer.concat(results);

                if (conf.print_xql_results) {
                    gutil.log(result.toString());
                }

                file.path = gutil.replaceExtension(file.path, "." + new Date().toJSON() + "." + conf.xql_output_ext);
                file.contents = result;

                callback(null, file);
            });
    }

    return through.obj(executeQuery);
};


module.exports.newer = function (options) {
    var conf = assign({}, defaultUploadOptions, options);

    function checkFile(file, enc, callback) {
        var self = this;

        if (file.isDirectory()) {
            var collection = normalizePath(conf.target + file.relative);
            client.methodCall('describeCollection', [collection], function (error, result) {
                // Include directory if it does not exist as a collection on a server
                callback(null, result ? null : file);
            });
            return;
        }

        client.methodCall('describeResource', [normalizePath(conf.target + file.relative)], function (error, resourceInfo) {
            if (error) {
                return self.emit(
                    "error",
                    new PluginError("gulp-exist", "Error on checking file " + file.relative + ":\n" + error)
                );
            }

            var newer = !resourceInfo.hasOwnProperty("modified") || (Date.parse(file.stat.mtime) > Date.parse(resourceInfo.modified));
            callback(error, newer ? file : null);
        });

    }

    return through.obj(checkFile);
};
