var through = require("through2");
var gutil = require("gulp-util");
var PluginError = gutil.PluginError;
var File = gutil.File;
var xmlrpc = require("xmlrpc");
var Mime = require("mime");
var async = require("async");
var fs = require("fs");


var lastModifiedXQL = (function () {/*  
	declare namespace json="http://www.json.org";
	declare option exist:serialize "method=json media-type=text/javascript";
	declare function local:ls($collection as xs:string) as element()* {
	      for $child in xmldb:get-child-collections($collection)
	      let $path := concat($collection, '/', $child)
	      return
	          local:ls($path),
	           for $child in xmldb:get-child-resources($collection)
	            let $path := concat($collection, '/', $child)
	            return
	                <files json:array="true" path="{$path}" mod="{xmldb:last-modified($collection, $child)}"/>
	};       
*/}).toString().match(/[^]*\/\*([^]*)\*\/\}$/)[1];

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
		create_collection: 		options.hasOwnProperty("create_collection")? options.create_collection : true,
		changed_only: 			options.hasOwnProperty("changed_only") && options.changed_only,
		permissions: 			options.permissions || {},
		print_xql_results: 		options.hasOwnProperty("print_xql_results")? options.print_xql_results : true,
		xql_output_ext:         options.hasOwnProperty("xql_output_ext")? options.xql_output_ext : "xml"
	};
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


	var lastModifiedMap = {};
	var existingCollections = [];
	var firstFile = null;

	var normalizePath = function(path) {
		return /^win/.test(process.platform) ? path.replace(/\\/g,"/") : path;
	}

	function createCollectionIfNotExistent(collection, callback) {
		
		var normalizedCollectionPath = normalizePath(collection);

		client.methodCall('describeCollection', [normalizedCollectionPath], function(error, result) {
			if (error) {
				gutil.log('Creating collection "' + normalizedCollectionPath + '"...');
				client.methodCall('createCollection', [normalizedCollectionPath], callback);
			} else {
				callback();
			}
		});
	}

	var storeFile = function(file, enc, callback) {
		if (file.isStream()) {
			return this.emit("error", new PluginError("gulp-exist",  "Streaming not supported"));
		}

		if (file.isDirectory()) {
			createCollectionIfNotExistent(conf.target  + file.relative, callback);
			return;
		}

		if (file.isNull()) {
			callback(); return;
		}

		if (conf.changed_only
			&& lastModifiedMap[file.relative] >= fs.statSync(file.path).mtime) {
			callback(); return;
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

		var uploadFile = function(callback){
			client.methodCall('upload', [file.contents, file.contents.length], callback);
		}

		var parseFile = function(fileHandle, callback) {
			client.methodCall('parseLocal', [fileHandle, normalizePath(conf.target + file.relative), true, mime], callback);
		}

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
			uploadFile,
			parseFile,
			setPermissions
		], callback);	
	};

	function getCollectionInfo(target, callback) {
		var xql = lastModifiedXQL + ' 							\
				if (xmldb:collection-available("' + target + '")) then \
					<result>{local:ls("' + target + '")}</result> 			\
				else ()									\
		';

		client.methodCall('query', [xql, 1, 1, {}], function(error, result) {
			if (error) {
				callback(error); return;
			}

			var resultJson = result.replace(/(<([^>]+)>)/ig,"").replace(/\s/g, "");
			if (resultJson == "" || resultJson == "null") {
				callback();
				return;
			}

			var parsedResult = JSON.parse(resultJson);

			var modifiedMap = {};
			if (parsedResult.files) {
				parsedResult.files.forEach(function(item) {
					var normalizedPath = decodeURIComponent(item.path
											.replace(conf.target, "")
											.replace(/^\//, "")
										);

					modifiedMap[normalizedPath] = new Date(item.mod);
				});
			}

			if (parsedResult.collections) {
				var normalizedCollections = parsedResult.collections.map(function(collection){
					return decodeURIComponent(collection.replace(/\/\//g, "/"));
				});
			}

			callback(null, modifiedMap, normalizedCollections);
		});
	};

	function handleFile(file, enc, callback) {

		if (!firstFile) {
			firstFile = file;

			async.series([
				function(callback) {
					if (conf.changed_only)	{			
						gutil.log('Retrieving list of existing resources...');
						getCollectionInfo(conf.target, function(error, mtimes, collections) {
							lastModifiedMap = mtimes || {};
							existingCollections = collections || [];
							callback(error);
						});	
					} else {
						callback(null);
					}
				}, 
				function(callback) {
					createCollectionIfNotExistent(conf.target, callback);
				}
			], function(error) {
				if (error) 
					callback(error);

				storeFile(file, enc, function() {callback(null, file)});
			});
			
			return;
		}
			
		storeFile(file, enc, function() {callback(null, file)});
	}

	return through.obj(handleFile);
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