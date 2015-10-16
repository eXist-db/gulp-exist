var through = require("through2");
var gutil = require("gulp-util");
var PluginError = gutil.PluginError;
var File = gutil.File;
var xmlrpc = require("xmlrpc");
var Mime = require("mime");
var async = require("async");
var fs = require("fs");

var getConfig = function(options) {
	return {
		rpc_conf: {
			host: options.hasOwnProperty("host")? options.host : 'localhost',
			port: options.hasOwnProperty("port")? options.port : '8080', 
			path: options.hasOwnProperty("path")? options.path : '/exist/xmlrpc',
			basic_auth: options.hasOwnProperty("auth")? {user: options.auth.username, pass: options.auth.password} : { user: "guest", pass: "guest"}
		},
		target: 				(function(){
									if (!options.hasOwnProperty("target")) {
										return "/"
									} else {
										return /\/$/.test(options.target) ? options.target : options.target + "/";
									}
								})(),
		permissions: 			options.permissions || {},
		print_xql_results: 		options.hasOwnProperty("print_xql_results")? options.print_xql_results : true,
		xql_output_ext:         options.hasOwnProperty("xql_output_ext")? options.xql_output_ext : "xml"
	};
}

var normalizePath = function(path) {
	
	return /^win/.test(process.platform) ? path.replace(/\\/g,"/") : path;
}

function createCollection(client, collection, callback) {
	
	var normalizedCollectionPath = normalizePath(collection);

	gutil.log('Creating collection "' + normalizedCollectionPath + '"...');
	client.methodCall('createCollection', [normalizedCollectionPath], callback);
}


module.exports.dest = function(options) {

	var self = null;

	var existError = function(error) {
		throw new PluginError("gulp-exist", error);
	};
	 if(!options) {
	 	throw new PluginError("gulp-exist", "Missing options.");
	 }

	var conf = getConfig(options);
	var client = xmlrpc.createClient(conf.rpc_conf);

	var firstFile = null;

	var storeFile = function(file, enc, callback) {
		if (file.isStream()) {
			return this.emit("error", new PluginError("gulp-exist",  "Streaming not supported"));
		}

		if (file.isDirectory()) {
			return createCollection(client, normalizePath(conf.target  + file.relative), callback);
		}

		if (file.isNull()) {
			return callback();
		}

		var mime = (function() {
			var ext = file.path.substring(file.path.lastIndexOf("."));
			if (ext == ".xq" || ext == ".xql" || ext == ".xqm") 
				return "application/xquery";
			else if (ext == ".xconf")
				return "application/xml";
			else 
				return Mime.lookup(file.path);
		})();

		var setPermissions = function(result, callback) {
			if (conf.permissions && conf.permissions[file.relative]) {
				gutil.log('Setting permissions for "' + normalizePath(file.relative) + '" (' + conf.permissions[file.relative] + ')...');
				client.methodCall(
					'setPermissions',
					[normalizePath(conf.target + file.relative), conf.permissions[file.relative]],
					callback
				);
				return;
			}
			callback(null);
		};

		gutil.log('Storing "' + normalizePath(conf.target + file.relative) + '" (' + mime + ')...');
		async.waterfall([

			// First upload file
			function(callback){
				client.methodCall('upload', [file.contents, file.contents.length], callback);
			},

			// Then parse file on server and store to specified destination path
			function(fileHandle, callback) {
				client.methodCall('parseLocal', [fileHandle, normalizePath(conf.target + file.relative), true, mime], callback);
			},
			// Then override permissions if specified in options
			function(result, callback) {
				if (conf.permissions && conf.permissions[file.relative]) {
					gutil.log('Setting permissions for "' + normalizePath(file.relative) + '" (' + conf.permissions[file.relative] + ')...');
					return client.methodCall(
						'setPermissions',
						[normalizePath(conf.target + file.relative), conf.permissions[file.relative]],
						callback
					);
				}

				callback(null);
			}

		// Finally proceed to next file	
		], callback);	
	};

	return through.obj(storeFile);
}


module.exports.query = function(options) {

	var conf = getConfig(options);
	var client = xmlrpc.createClient(conf.rpc_conf);

	function executeQuery(file, enc, callback) {

		if (file.isStream()) {
			callback(); return this.emit("error", new PluginError("gulp-exist",  "Streaming not supported"));
		}

		if (file.isDirectory() || file.isNull()) {
			callback(); return;
		}

		var self = this;


		gutil.log('Running XQuery on server: ' + file.relative);

		async.waterfall([
			function(callback) {
				fs.readFile(file.path, callback);
			},
			function(contents, callback) {
				client.methodCall('executeQuery', [contents, {}], callback);
			},
			function(resultHandle, callback) {
				client.methodCall('getHits', [resultHandle], function(error, hitCount) {
					callback(error, resultHandle, hitCount);
				});
			},
			function(resultHandle, hitCount, callback) {
				async.times(hitCount, function(n, next) {
					client.methodCall('retrieve', [resultHandle, n, {}], next);
				}, callback);
			} 
		], function(error, results) {
			if (error) {
				self.emit("error", new PluginError("gulp-exist", "Error running XQuery " + file.relative + ":\n" + error));
				callback(); return;
			}

			var  result = Buffer.concat(results); 

			if (conf.print_xql_results) {
				gutil.log(result.toString());
			}

			file.path = gutil.replaceExtension(file.path, "." + new Date().toJSON() + "." + conf.xql_output_ext);
			file.contents = result;

			callback(null, file);
		});
	}

	return through.obj(executeQuery);
}


module.exports.newer = function(options) {

	var conf = getConfig(options);
	var client = xmlrpc.createClient(conf.rpc_conf);

	function checkFile(file, enc, callback) {

		var self = this;

		if (file.isDirectory()) {
			var collection = normalizePath(conf.target + file.relative);
			client.methodCall('describeCollection', [collection], function(error, result) {

				// Include directory if it does not exist as a collection on a server
				callback(null, result ? null : file);
			});
			return;
		}

		async.waterfall([
			function(callback) {
				client.methodCall('describeResource', [normalizePath(conf.target + file.relative)], callback);
			}, 
			function(resourceInfo, callback) {
				fs.stat(file.path, function(error, localStats) { callback(error, resourceInfo, localStats); });
			}

		], function(error, resourceInfo, localStats) {
			if (error) {
				return self.emit("error", new PluginError("gulp-exist", "Error on checking file " + file.relative + ":\n" + error));
			}
			// console.log(resourceInfo);
			var newer = !resourceInfo.hasOwnProperty("modified") || (Date.parse(localStats.mtime) > Date.parse(resourceInfo.modified));
			callback(error, newer ? file : null);
		});
	}

	return through.obj(checkFile);

}