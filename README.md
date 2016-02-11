# gulp-exist

[![version](https://img.shields.io/npm/v/gulp-exist.svg)](https://www.npmjs.com/package/gulp-exist)

> A gulp plugin to deploy to eXist-db 

Using eXist's XML-RPC API.

## Usage

```var exist = require('gulp-exist')```

### exist.dest(options)

Uploads input files to a target collection in eXist.

#### Example

Store all files in the ```build``` directory to a target collection in eXist. Non-existing collections will be created automatically.

```js
var exist = require('gulp-exist')

gulp.task('deploy', function() {
	return gulp.src('build/**/*', {base: '.'})
		.pipe(exist.dest({
			host: 'localhost',
			port: '8080',
			auth: { username: 'admin', password: '' },
			path: '/exist/xmlrpc',
			target: '/db/apps/myapp',
			// optional: make controller.xql executable
			permissions: {
				'controller.xql': 'rwxr-xr-x'
			}
		});
});
```

### exist.newer(options)

Filters the input stream for files that are newer than their remote counterpart.

#### Example

Only upload modified files.

```js
var exist = require('gulp-exist')

var exist_config = {
	host: 'localhost',
	port: '8080',
	auth: { username: 'admin', password: '' },
	path: '/exist/xmlrpc',
	target: '/db/apps/myapp'
};

gulp.task('deploy', function() {
	return gulp.src('build/**/*', {base: '.'})
		.pipe(exist.newer(exist_config))
		.pipe(exist.dest(exist_config));
});
```

### exist.query(options)

Execute input files as XQuery on the server.

The input files will not be stored in eXist but read locally and executed directly. The query results will be logged in the console (can be disabled by setting ```print_xql_results``` to ```false```). For each input file, the result of the query will also be emitted as an output file that can optionally be copied into a local directory for logging. Timestamps will be appended to the filename. The filename extension of the output files can be controlled with ```xql_output_ext``` (default is ```xml```).

#### Example

Upload a collection index configuration file and re-index the collection

*```scripts/reindex.xql```*
```xquery
xquery version "3.0";
declare option exist:serialize "method=json media-type=text/javascript";
<result>
	<success>{xmldb:reindex('/db/apps/myapp/data')}</success>
</result>
```

*```gulpfile.js```*
```js
var exist = require('gulp-exist')

var exist_config = {
	host: 'localhost',
	port: '8080',
	auth: { username: 'admin', password: '' },
	path: '/exist/xmlrpc',
	target: '/db/system/config/db/apps/myapp/data',
	xql_output_ext: 'json'
};

gulp.task('upload-index-conf', function() {
	return gulp.src('collection.xconf', {base: '.'})
		.pipe(exist.dest(exist_config));
});

gulp.task('reindex', ['upload-index-conf'], function() {
	return gulp.src('scripts/reindex.xql')
		.pipe(exist.query(exist_config))
		
		// optional: store the query result locally in 'logs'
		.pipe(gulp.dest('logs'));
});
```

## options

#### options.host

Type: `string`  
Default: `'localhost'`

#### options.port

Type: `number`  
Default: `8080`

#### options.path

Path to eXist's XML-RPC endpoint

Type: `string`  
Default: `'/exist/xmlrpc'`

#### options.auth

*Required*  
Type: Object
Default: ```{ username: 'admin', password: '' }``` 

#### options.target

Remote deployment target collection. Non-existent collections will be created.

Type: `string`  
Default `'/db'`

#### options.permissions

Specify remote permissions for files

Type: `Object`  
Default: `{}`

##### Example

```js
{
	'controller.xql': 'rwxr-xr-x'
}
```

#### options.mime_types

Override the mime type used to store files in exist based on their extension or their relative paths.

Type: `Object`  
Default: `{}`

##### Example

```js
{
	'.txt': 'application/octet-stream',
	'data/index.html': 'application/octet-stream'
}
```

#### options.print_xql_results

Whether to print the results of executed XQuerys to console.

Type: `boolean`  
Default: `true`

#### options.xql_output_ext

The filename extension that will be used for XQuery result files emitted by ```exist.query()```.

Type: `string`  
Default: `'xml'`

#### options.binary_fallback

When set to true, HTML files that cannot be parsed by eXist as XHTML will be uploaded as binary files.

Type: `boolean`  
Default: `false`
