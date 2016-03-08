# gulp-exist

[![version](https://img.shields.io/npm/v/gulp-exist.svg)](https://www.npmjs.com/package/gulp-exist)

> A gulp plugin to deploy to and query an eXist-db using eXist's XML-RPC API.

## Usage

`gulp deploy` will store all files in the ```build``` directory to 
**/db/apps/myapp** collection in eXist.


```js
var gulp = require('gulp'),
    exist = require('gulp-exist')

// authenticate against eXist
var connectionOptions = {
    basic_auth: {
        user: "admin",
        pass: "****************"
    }
}

var exClient = exist.createClient(connectionOptions)

// send all 
gulp.task('deploy', function() {
    return gulp.src('**/*', {cwd: 'build'})
        .pipe(exClient.dest({target: '/db/apps/myapp/'});
})
```

NOTE: Non-existing collections and sub-folders will be created automatically.

### exist.createClient(options)

Returns a set of functions to interact with an existDB instance.
What you can do is dependent on the permissions of the user specified
in the connection options.

NOTE: The connection options are passed through to the XMLRPC client 
library. 
So it might be possible to use different authentication methods or
to pass in more options than mentioned below as long as your eXistDB 
installation understands them.

#### Options

##### host

Type: `string`
Default: `'localhost'`

##### port

Type: `number`
Default: `8080`

##### path

Path to eXist's XML-RPC endpoint

Type: `string`
Default: `'/exist/xmlrpc'`

##### basic_auth

*Required*
Type: `Object`
Default: ```{ user: 'guest', pass: 'guest' }``` 

#### Example

```js
var exClient = exist.createClient()
```

### existClient.dest(options)

Uploads input files to a target collection in eXist.

#### Options

##### target

Remote deployment target collection. Non-existent collections will be created.

Type: `string`
Default `'/db'`

##### html5AsBinary

When set to true, any HTML file that cannot be 
parsed as valid XML, will be uploaded as a binary file instead.
HTML5 documents tend to be non well-formed XML.

Formerly `binary_fallback`. 
NOTE: Binary documents can not be indexed and therefore are also not 
searchable by the eXistDB. This option is only useful for template files.

Type: `boolean`
Default: `false`

##### permissions

Specify remote permissions for files as path-permission pairs.

Type: `Object{path: permissions}`
Default: `{}`

```js
{
    '.secrets/key':   'rwx------',
    'controller.xql': 'rwxr-xr-x'
}
```

#### Example

```js
var exClient = exist.createClient(connectionOptions)

gulp.task('deploy', function() {
    return gulp.src('**/*', {cwd: 'build'})
        .pipe(exClient.dest({
            target: '/db/apps/myapp/',
            permissions: { 'controller.xql': 'rwxr-xr-x' }
        });
})
```

### existClient.newer(options)

Filters the input stream for files that are newer than their remote counterpart.

#### Options

##### target

Which collection to compare the local files to.

#### Example

Only upload modified files.

```js
var gulp = require('gulp'),
    exist = require('gulp-exist')

// override defaults
var connectionOptions = {
    basic_auth: {
        user: 'admin',
        pass: '****************'
    }
}

var exClient = exist.createClient(connectionOptions)
var targetOptions = {
    target: '/db/apps/myapp/',  // the collection to write
    html5AsBinary: true         // upload HTML5 templates as binary
}

gulp.task('deploy', function() {
	return gulp.src('**/*', {cwd: 'build'})
		.pipe(exClient.newer(targetOptions))
		.pipe(exClient.dest(targetOptions));
});
```

### existClient.query(options)

Execute input files as XQuery on the server.

The input files will not be stored in eXist but read locally and executed directly. The query results will be logged in the console (can be disabled by setting ```print_xql_results``` to ```false```). For each input file, the result of the query will also be emitted as an output file that can optionally be copied into a local directory for logging. Timestamps will be appended to the filename. The filename extension of the output files can be controlled with ```xql_output_ext``` (default is ```xml```).

#### Query options

##### print_xql_results

Whether to print the results of executed XQuerys to console.

Type: `boolean`
Default: `true`

##### xql_output_ext

The filename extension that will be used for XQuery result files emitted by ```exist.query()```.

Type: `string`
Default: `'xml'`

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
var gulp = require('gulp'),
    exist = require('gulp-exist')

// override defaults
var connectionOptions = {
    basic_auth: {
        user: "admin",
        pass: "****************"
    }
}

var exClient = exist.createClient(connectionOptions)

var exist_config = {
	target: '/db/system/config/db/apps/myapp/data',
	xql_output_ext: 'json'
};

gulp.task('upload-index-conf', function() {
	return gulp.src('collection.xconf', {cwd: '.'})
		.pipe(exClient.dest(exist_config));
});

gulp.task('reindex', ['upload-index-conf'], function() {
	return gulp.src('scripts/reindex.xql')
		.pipe(exClient.query(exist_config))
		
		// optional: store the query result locally in 'logs'
		.pipe(gulp.dest('logs'));
});
```

## Define Custom Mime Types

Override the mime type used to store files in exist based on their extension.
`defineMimeTypes` just exposes `mime.define()`.

Extended by default: 
`{
    'application/xquery': ['xq', 'xql', 'xqm'],
    'application/xml': ['xconf']
}`

Type: `Object{mimetype: [extensions]}`

##### Example

```js
exist.defineMimeTypes({ 'text/foo': ['bar'] })
```

## Test

### Prerequisites

A running instance of eXistDB v2.2+ at localhost port 8080 with an 
admin user that has a blank password.

### Run the Tests

    npm test
