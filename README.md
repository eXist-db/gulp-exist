# gulp-exist
> A gulp plugin to deploy to eXist-db 

Using eXist's XML-RPC API.

## Usage

```js
var	gulp = require('gulp'),
	exist = require('gulp-exist');

gulp.task('deploy-local', function() {
	return gulp.src(['./**/*', '!./node_modules{,/**}'], {base: "."})
		.pipe(exist({
			host: "localhost",
			port: 8080,
			path: "/exist/xmlrpc",
			username: "admin",
			password: "",
			target: "/db/apps/myapp",
			changed_only: true,
			permissions: {
				"controller.xql": "rwxr-xr-x"
			}
 			post_install: "post-install.xql"
		}));
});
```

## API

### exist(options)

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

#### options.username

*Required*  
Type: `string`

#### options.password

*Required*  
Type: `string`

#### options.target

Remote deployment target collection. Non-existent collections will be created.

Type: `string`  
Default `'/db'`

#### options.changed_only

Only upload changed files

Type: `boolean`  
Default: `false`

#### options.permissions

Specify remote permissions for files

Type: `Object`  
Default: `{}`

#### post_install

A XQL script to run on the server when all files have been uploaded

Type: `String`
Default: `null`
