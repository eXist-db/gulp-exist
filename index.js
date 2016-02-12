var through = require("through2");
var gutil = require("gulp-util");
var PluginError = gutil.PluginError;
var xmlrpc = require("xmlrpc");
var mime = require("mime");
var async = require("async");

// add common existDB file types
mime.define({
    'application/xquery': ['xq', 'xql', 'xqm'],
    'application/xml': ['xconf']
});

function isSaxParserError (error) {
    return error && error.faultString && /SAXParseException/.test(error.faultString)
}

var getConfig = function (targetOrOptions, options) {
    if (typeof targetOrOptions === "object") {
        options = targetOrOptions;
    }

    return {
        rpc_conf: {
            host: options.hasOwnProperty("host") ? options.host : 'localhost',
            port: options.hasOwnProperty("port") ? options.port : '8080',
            path: options.hasOwnProperty("path") ? options.path : '/exist/xmlrpc',
            basic_auth: options.hasOwnProperty("auth") ? {
                user: options.auth.username,
                pass: options.auth.password
            } : {user: "guest", pass: "guest"}
        },
        target: (function () {
            var target = null;

            if (typeof targetOrOptions === "string") {
                target = targetOrOptions
            } else if (options.hasOwnProperty("target")) {
                target = options.target;
            } else {
                target = "";
            }

            return /\/$/.test(target) ? target : target + "/";
        })(),
        permissions: options.permissions || {},
        mime_types: options.mime_types || {},
        print_xql_results: options.hasOwnProperty("print_xql_results") ? options.print_xql_results : true,
        xql_output_ext: options.hasOwnProperty("xql_output_ext") ? options.xql_output_ext : "xml",
        binary_fallback: options.hasOwnProperty("binary_fallback") ? options.binary_fallback : false
    };
};

var normalizePath = function (path) {
    return /^win/.test(process.platform) ? path.replace(/\\/g, "/") : path;
};

function createCollection(client, collection, callback) {
    var normalizedCollectionPath = normalizePath(collection);
    gutil.log('Creating collection "' + normalizedCollectionPath + '"...');
    client.methodCall('createCollection', [normalizedCollectionPath], callback);
}

module.exports.defineMimeTypes = function (mimeTypes) {
    mime.define(mimeTypes);
};


module.exports.dest = function (targetOrOptions, options) {
    if (typeof targetOrOptions !== "object" && !options) {
        throw new PluginError("gulp-exist", "Missing options.");
    }

    var conf = getConfig(targetOrOptions, options);
    var client = xmlrpc.createClient(conf.rpc_conf);
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
            ],
            // handle re-upload as octet stream if parsing failed and binary_fallback is set
            function (error, result) {
                if (isSaxParserError(error) && conf.binary_fallback) {
                    gutil.log(file.relative + " not well-formed XML, trying to store as binary...");
                    return uploadAndParse(file, remotePath, "application/octet-stream", callback);
                }

                callback(error, result);
            });
        };

        async.waterfall([
            // If this is the first file in the stream, check if the target collection exists
            function (callback) {
                // skip if firstFile is set
                if (firstFile) { callback(null, true); }

                firstFile = file;
                client.methodCall('describeCollection', [conf.target], function (error) {
                    callback(null, (error == null))
                });
            },

            // Then create target collection if needed
            function (skip, callback) {
                if (skip) { return callback(); }
                createCollection(client, conf.target, callback);
            },

            // Then upload and parse file
            function (result, callback) {
                var mimeType = mime.lookup(file.extname);
                uploadAndParse(file, remotePath, mimeType, callback);
            },

            // Then override permissions if specified in options
            function (result, callback) {
                if (!conf.permissions || !conf.permissions[file.relative]) {
                    callback(null);
                }
                gutil.log('Setting permissions for "' + normalizePath(file.relative) + '" (' + conf.permissions[file.relative] + ')...');
                return client.methodCall(
                    'setPermissions',
                    [remotePath, conf.permissions[file.relative]],
                    callback
                );
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

    var conf = getConfig(void 0, options);
    var client = xmlrpc.createClient(conf.rpc_conf);

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


module.exports.newer = function (targetOrOptions, options) {
    var conf = getConfig(targetOrOptions, options);
    var client = xmlrpc.createClient(conf.rpc_conf);

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