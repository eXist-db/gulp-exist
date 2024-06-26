# gulp-exist

[![version](https://img.shields.io/npm/v/@existdb/gulp-exist.svg)](https://www.npmjs.com/package/@existdb/gulp-exist)
![semantic release status](https://github.com/exist-db/gulp-exist/actions/workflows/semantic-release.yml/badge.svg)
[![windows ci](https://ci.appveyor.com/api/projects/status/wcbi1e0yx47prhl6?svg=true)](https://ci.appveyor.com/project/olvidalo/gulp-exist)


> A gulp plugin to deploy to and query an eXist-db using eXist's XML-RPC API.

## Prerequisites

In order to make use of `gulp-exist` you will need to have 
[gulp](https://gulpjs.com/docs/en/getting-started/quick-start) installed (in version 5 or later).

And a running [existdb](https://exist-db.org) instance, of course (version 4.11.1 or higher recommended).

## Installation

In your project folder run

```sh
npm install --save-dev gulp @existdb/gulp-exist
```

## Usage

Then create a file with the name `gulpfile.js` in the root of your project with the following contents

```js
const { src } = require('gulp'),
    { createClient } = require('@existdb/gulp-exist')

// authenticate against local eXist instance for development 
const connectionOptions = {
    basic_auth: {
        user: "admin",
        pass: ""
    }
}

const exClient = createClient(connectionOptions)

// deploy all
function deploy () {
    return src('**/*', { cwd: 'build', encoding: false })
        .pipe(exClient.dest({ target: '/db/apps/myapp/' }))
}

exports.default = deploy
```

Now, `gulp deploy` will store all files in the `build` directory to
**/db/apps/myapp** collection in eXist.

Also note, that non-existing collections and sub-folders will be created
automatically for you.

Have a look at the [example gulpfile](https://github.com/eXist-db/gulp-exist/tree/master/spec/examples/gulpfile.js)
for a more complete gulpfile offering more advanced tasks.

## API

### exist.readOptionsFromEnv()

Read connection options from environment variables.
Currently supported variables are listed in the table below.

| variable name | default | description
|----|----|----
| `EXISTDB_USER` | _none_ | the user used to connect to the database and to execute queries with
| `EXISTDB_PASS` | _none_ | the password to authenticate the user against the database
| `EXISTDB_SERVER` | `https://localhost:8443` | the URL of the database instance to connect to (only http and https protocol allowed)

#### Example

With the below setup the connection is then controlled by the variables
in the environment.  

```js
const { src } = require('gulp')
const { createClient, readOptionsFromEnv } = require('@existdb/gulp-exist')
const exClient = createClient(readOptionsFromEnv())

// deploy all
function deploy () {
    return src('**/*', { cwd: 'build', encoding: false })
        .pipe(exClient.dest({ target: '/db/apps/myapp/' }))
}

exports.default = deploy
```

```sh
EXISTDB_SERVER=http://localhost:8080 \
EXISTDB_USER=admin \
EXISTDB_PASS= \
gulp deploy
```

The npm package [dotenv-cli](https://www.npmjs.com/package/dotenv-cli) offers a great way to read and set environment
variables from files.

```sh
npm install -g dotenv-cli
```

Create a `.env` in your project root.

```sh
EXISTDB_SERVER=http://localhost:8080
EXISTDB_USER=admin
EXISTDB_PASS=
```
And then 

```sh
dotenv gulp deploy
```

### exist.createClient(options)

Returns a set of functions to interact with an eXist-db instance.
What you can do is dependent on the permissions of the user specified
in the connection options.

NOTE: The connection options are passed through to the XMLRPC client
library.
So it might be possible to use different authentication methods or
to pass in more options than mentioned below as long as your eXist-db
installation understands them.

#### Options

##### host

Type: `string`
Default: `'localhost'`

##### port

Type: `number`
Default: `8443`

##### path

Path to eXist's XML-RPC endpoint

Type: `string`
Default: `'/exist/xmlrpc'`

##### basic_auth

The credentials used to authenticate requests.
What you can and cannot do depends on the permissions
this user has.

Type: `Object`
Default: 
```js
{ user: 'guest', pass: 'guest' }
```

##### secure

Use HTTPS (or HTTP) to connect to the database instance.

**NOTE:** You need a valid certificate installed in the keystore of
exist for connections to remote servers.

Type: `Boolean`
Default: `true`

#### Example

Connecting to a remote server using a secure connection.

```js
const { createClient } = require('@existdb/gulp-exist')
const exClient = createClient({
    host: "my-server.tld",
    secure: true,
    port: 443,
    basic_auth: {
        user: "app",
        pass: "1 handmade eclectic eclaire"
    }
})
```

Connecting to localhost server using a insecure connection.

```js
const { createClient } = require('@existdb/gulp-exist')
const exClient = createClient({
    host: "localhost",
    secure: false,
    port: 8080
})
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
searchable by the eXist-db. This option is only useful for template files.

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
const { src } = require('gulp')
const { createClient } = require('@existdb/gulp-exist')

// override defaults
const exist = createClient({
    basic_auth: {
        user: 'admin',
        pass: ''
    }
})

function deployWithPermissions () {
    return src('**/*', { cwd: '.', encoding: false })
        .pipe(exist.dest({
            target: '/db/apps/myapp/',
            permissions: { 'controller.xql': 'rwxr-xr-x' }
        }))
}

exports.default = deployWithPermissions
```
### existClient.install(options)

#### Options

##### packageUri (deprecated)

The unique package descriptor of the application to be installed.

**NOTE:** For versions after v4.0.2 this option is ignored and will be read 
from the XAR itself.

##### customPackageRepoUrl

The application repository that will be used to resolve dependencies.
Only needs to be set if the default repository cannot be used.

#### Example

```js
const { src } = require('gulp')
const { createClient } = require('@existdb/gulp-exist')

// override defaults
const exist = createClient({
    basic_auth: {
        user: 'admin',
        pass: ''
    }
})

function install () {
    return src('spec/files/test-app.xar', { encoding: false })
        .pipe(exist.install())
}
```

### existClient.newer(options)

Filters the input stream for files that are newer than their remote counterpart.

#### Options

##### target

Which collection to compare the local files to.

#### Example

Only upload modified files.

```js
const { src } = require('gulp')
const { createClient } = require('@existdb/gulp-exist')

// override some default connection options
const exist = createClient({
    basic_auth: {
        user: 'admin',
        pass: ''
    }
})

const target = '/db/apps/myapp/'  // the collection to write to
const html5AsBinary = true        // upload HTML5 templates as binary


function deployNewer () {
	return src('**/*', { cwd: '.', encoding: false })
		.pipe(exist.newer({ target }))
		.pipe(exist.dest({ target, html5AsBinary }));
}

exports.default = deployNewer
```

### existClient.query(options)

Execute input files as XQuery on the server.

The input files will not be stored in eXist but read locally and executed 
directly. The query results will be logged in the console (can be disabled by
setting `printXqlResults` to `false`). For each input file, the result
of the query will also be emitted as an output file that can optionally be
copied into a local directory for logging. Timestamps will be appended to the
filename. The filename extension of the output files can be controlled with
`xqlOutputExt` (default is `xml`).

#### Query options

##### printXqlResults

Whether to print the results of executed XQuerys to console.

Type: `boolean`
Default: `true`

##### xqlOutputExt

The filename extension that will be used for XQuery result files emitted by
`exist.query()`. Possible values are 'xml' or 'json'.

Type: `string`
Default: `'xml'`

##### queryParams

Query params passed to the eXist-db XMLRPC API
(https://exist-db.org/exist/apps/doc/devguide_xmlrpc). Can be used to pass
query variables (see Example 2).

Type: `Object`
Default: `{}`

#### Example 1

Upload a collection index configuration file and re-index the collection

*scripts/reindex.xq*

```xquery
xquery version "3.1";
declare option exist:serialize "method=json media-type=text/javascript";

map { "success": xmldb:reindex('/db/apps/myapp/data') }
```

*gulpfile.js*

```js
const { src, dest } = require('gulp')
const { createClient } = require('@existdb/gulp-exist')

// override some default connection options
const exist = createClient({
    basic_auth: {
        user: "admin",
        pass: ""
    }
})

const queryConfig = {
	target: '/db/apps/myapp',
	xqlOutputExt: 'json'
}

function deployCollectionXConf () {
	return src('collection.xconf', { cwd: '.' })
		.pipe(exist.dest({
            target: `/db/system/config${queryConfig.target}`
        }))
}

function reindex () {
	return src('scripts/reindex.xq', { cwd: '.' })
		.pipe(exist.query(queryConfig))
        .pipe(dest('logs'))
}

exports.default = series(deployCollectionXConf, reindex)
```

#### Example 2

Pass a variable to the XQuery script.

*scripts/var.xq*

```xquery
(: optionally declare the variable as external :)
declare variable $someVariable external;

<result>{ $someVariable }</result>
```

*gulpfile.js*

```js
const { src, dest } = require('gulp')
const { createClient } = require('@existdb/gulp-exist')

// override some default connection options
const exist = createClient({
    basic_auth: {
        user: "admin",
        pass: ""
    }
})

// set `variables` query parameter
const queryConfig = {
	queryParams: {
	    variables: {
	        someVariable: "some value"
	    }
	}
}

function runQueryWithVariable () {
	return src('scripts/var.xq', { cwd: '.' })
		.pipe(exist.query(queryConfig))
        .pipe(dest('logs'))
}

exports.default = runQueryWithVarible
```

## Define Custom Mime Types

Override the mime type used to store files in exist based on their extension.
`defineMimeTypes` just exposes `mime.define()`.
*NOTE:* attempt to redefine a registered **extension** will throw an error.

Extended by default:
```js
{
    'application/xquery': ['xq', 'xquery', 'xqs', 'xql', 'xqm'],
    'application/xml': ['xconf', 'odd']
}
```

Type: `Object {mimetype: [extensions]}`

##### Example

```js
exist.defineMimeTypes({ 'text/foo': ['bar'] })
```

## More examples

Have a look at the [example gulpfile](https://github.com/eXist-db/gulp-exist/tree/master/spec/examples/gulpfile.js).

### Watch File Changes

`watch` will report when a file has changed. `deployBuild` will run
each time that happens uploading all files that have changed since its
last execution.

```js
const { watch, src, dest, lastRun } = require('gulp')
const { createClient } = require('@existdb/gulp-exist')

// override defaults
const connectionOptions = {
    basic_auth: {
        user: "admin",
        pass: ""
    }
}

const exist = createClient(connectionOptions)

function deployBuild () {
    return src('build/**/*', {
            base: 'build',
            since: lastRun(deployBuild),
            encoding: false
        })
        .pipe(exist.dest({target}))
}

exports.deploy = deployBuild

function watchBuild () {
    watch('build/**/*', series(deployBuild));
}
exports.watch = watchBuild

exports.default = series(deployBuild, watchDeploy)
```

### Create and Install XAR Archive

```js
const { src, dest } = require('gulp'),
    zip = require('gulp-zip'),
    pkg = require('./package.json'),
    { createClient } = require('@existdb/gulp-exist')

// override some default connection options
const exist = createClient({
    basic_auth: {
        user: "admin",
        pass: ""
    }
})

function build {
    // compile everything into the 'build' directory
}

function xar () {
    return src('build/**/*', { base: 'build', encoding: false })
            .pipe(zip(`${pkg.abbrev}-${pkg.version}.xar`))
            .pipe(dest("."));
}

function install () {
    return src(`${pkg.abbrev}-${pkg.version}.xar`, { encoding: false })
      .pipe(exist.install({ packageUri: "http://myapp" }))
}

exports.default = series(build, xar, install)
```

## Test

### Prerequisites

A running instance of eXist-db v2.2+ at localhost port 8443 with an
admin user that has a blank password.

You can override the above settings with environment variables (see [dbconnection.js](https://github.com/eXist-db/gulp-exist/tree/master/spec/dbconnection.js) for details).

### Run the Tests

```sh
npm test
```

[dotenv-cli](https://www.npmjs.com/package/dotenv-cli) can be used here, too:

```sh
dotenv npm test
```
