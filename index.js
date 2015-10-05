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
		  <collections json:array="true">{$collection}</collections>,
	      for $child in xmldb:get-child-collections($collection)
	      let $path := concat($collection, '/', $child)
	      order by $child 
	      return
	          local:ls($path),
	           for $child in xmldb:get-child-resources($collection)
	            let $path := concat($collection, '/', $child)
	            order by $child 
	            return
	                <files json:array="true" path="{$path}" mod="{xmldb:last-modified($collection, $child)}"/>
	};       
*/}).toString().match(/[^]*\/\*([^]*)\*\/\}$/)[1];


module.exports = function(options) {

	var self = null;

	var existError = function(error) {
		throw new PluginError("gulp-exist", error);
	};
	 if(!options) {
	 	throw new PluginError("gulp-exist", "Missing options.");
	 }

	var client = xmlrpc.createClient({
		host: options.hasOwnProperty("host")? options.host : 'localhost',
		port: options.hasOwnProperty("port")? options.port : '8080', 
		path: options.hasOwnProperty("path")? options.path : '/exist/xmlrpc',
		basic_auth: {
			user: options.hasOwnProperty("username")? options.username : "guest",
			pass: options.hasOwnProperty("password")? options.password : "guest"
		}
	});

	var conf = {
		target: 				(function(){
									if (!options.hasOwnProperty("target")) {
										return "/"
									} else {
										return /\/$/.test(options.target) ? options.target : options.target + "/";
									}
								})(),
		create_collection: 		options.hasOwnProperty("create_collection")? options.create_collection : true,
		changed_only: 			options.hasOwnProperty("changed_only") && options.changed_only,
		skip_info_retrieval: 	options.hasOwnProperty("skip_info_retrieval") && options.skip_info_retrieval,
		post_install: 			options.post_install,
		permissions: 			options.permissions || {}
	};


	var lastModifiedMap = {};
	var existingCollections = [];
	var firstFile = null;

	function createCollectionIfNotExistent(collection, callback) {
		if (existingCollections.indexOf(collection) > -1) {
			callback(); return;
		}

		gutil.log('Creating collection "' + collection + '"...');
		client.methodCall('createCollection', [collection], callback);
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
			else 
				return Mime.lookup(file.path);
		})();

		var uploadFile = function(callback){
			client.methodCall('upload', [file.contents, file.contents.length], callback);
		}

		var parseFile = function(fileHandle, callback) {
			client.methodCall('parseLocal', [fileHandle, conf.target + file.relative, true, mime], callback);
		}

		var setPermissions = function(result, callback) {
			if (conf.permissions && conf.permissions[file.relative]) {
				gutil.log('Setting permissions for "' + file.relative + '" (' + conf.permissions[file.relative] + ')...');
				client.methodCall(
					'setPermissions',
					[conf.target + file.relative, conf.permissions[file.relative]],
					callback
				);
				return;
			}

			callback(null);
		};

		gutil.log('Storing "' + file.path + '" (' + mime + ')...');
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

	function executeXqlFromFile(path, callback) {
		async.waterfall([
			function(callback) {
				fs.readFile(path, callback);
			},
			function(contents, callback) {
				client.methodCall('executeQuery', [contents, {}], callback)
			}
		], callback);
	}

	function handleFile(file, enc, callback) {

		if (!firstFile) {
			firstFile = file;

			async.series([
				function(callback) {
					if (!conf.skip_info_retrieval)	{			
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

				storeFile(file, enc, callback);
			});
			
			return;
		}
			
		storeFile(file, enc, callback);
	}


	function endStream(done) {

		if (conf.post_install) {
			gutil.log('Running post-install script on server: ' + conf.post_install);
			executeXqlFromFile(conf.post_install, done);
			return;
		}
		

		done(null);
	}

	return through.obj(handleFile, endStream);
}