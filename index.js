var through = require("through2");
var gutil = require("gulp-util");
var PluginError = gutil.PluginError;
var File = gutil.File;
var xmlrpc = require("xmlrpc");
var Mime = require("mime");
var async = require("async");
var fs = require("fs");


var lastModifiedXQL = (function () {/*  
	declare option exist:serialize "method=json media-type=text/javascript";
	declare function local:ls($collection as xs:string) as element()* {
	      for $child in xmldb:get-child-collections($collection)
	      let $path := concat($collection, '/', $child)
	      order by $child 
	      return
	          local:ls($path),
	           for $child in xmldb:get-child-resources($collection)
	            let $path := concat($collection, '/', $child)
	            order by $child 
	            return
	                <files path="{$path}" mod="{xmldb:last-modified($collection, $child)}"/>
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
		target: (function(){
			if (!options.hasOwnProperty("target")) {
				return "/"
			} else {
				return /\/$/.test(options.target) ? options.target : options.target + "/";
			}
		})(),
		create_collection: options.hasOwnProperty("create_collection")? options.create_collection : true,
		changed_only: options.hasOwnProperty("changed_only") && options.changed_only,
		post_install: options.post_install
	};


	var lastModifiedMap = null;
	var firstFile = null;


	var storeFile = function(file, enc, callback) {
		if (file.isStream()) {
			return this.emit("error", new PluginError("gulp-exist",  "Streaming not supported"));
		}

		if (file.isDirectory()) {
			var collectionPath = conf.target  + file.relative;
			gutil.log('Creating collection "' + collectionPath + '"...');
			client.methodCall('createCollection', [collectionPath], callback);
			return;
		}

		if (file.isNull()) {
			callback(); return;
		}

		if (lastModifiedMap
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

		gutil.log('Storing "' + file.path + '" (' + mime + ')...');
		client.methodCall('upload', [file.contents, file.contents.length], function(error, handle) {
			if (error) {
				callback(new PluginError("gulp-exist", error));
				return;
			}

			gutil.log('Parsing "' + file.relative + '" (' + mime + ')...');
			client.methodCall('parseLocal', [handle, conf.target + file.relative, true, mime], callback);

		});		
	};

	var getLastModified = function(target, callback) {
		var xql = lastModifiedXQL + ' 	\
			<result>{local:ls("' + target + '")}</result> 	\
		';

		client.methodCall('query', [xql, 1, 1, {}], function(error, result) {
			if (error) {
				callback(error); return;
			}

			var resultJson = result.replace(/(<([^>]+)>)/ig,"");
			if (resultJson.replace(/\s/g, "") == "null") {
				callback(null, {files: []}); return;
			}

			var map = {};
			JSON.parse(resultJson).files.forEach(function(item) {
				var normalizedPath = decodeURIComponent(item.path
										.replace(conf.target, "")
										.replace(/^\//, "")
									);

				map[normalizedPath] = new Date(item.mod);
			})
			callback(null, map);
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
					gutil.log('Creating target collection "' + conf.target + '"...');
					client.methodCall('createCollection', [conf.target], callback);
				},
				function(callback) {
					if (!conf.changed_only) {
						callback(null); return;
					} 
					
					gutil.log('Retrieving modification dates from server...');
					getLastModified(conf.target, function(error, result) {
						lastModifiedMap = result;
						callback();
					});
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