// tests

var gulp = require('gulp4')
var test = require('tape')
var gulpExist = require('../index')
var exist = require('node-exist')

var srcOptions = { cwd: 'spec/files' }

var targetCollection = '/tmp'

var connectionOptions = {
  basic_auth: {
    user: 'admin',
    pass: ''
  }
}

test('check for default mime type extensions', function (t) {
  var types = gulpExist.getMimeTypes()
  t.equals(types['xq'], 'application/xquery')
  t.equals(types['xql'], 'application/xquery')
  t.equals(types['xqm'], 'application/xquery')
  t.equals(types['xconf'], 'application/xml')
  t.equals(types['odd'], 'application/xml')
  t.end()
})

test('extend mime type definitions', function (t) {
  gulpExist.defineMimeTypes({ 'text/foo': ['bar'] })
  t.equals(gulpExist.getMimeTypes()['bar'], 'text/foo')
  t.end()
})

test('create connection with default settings', function (t) {
  var testClient = gulpExist.createClient()
  t.equals(typeof testClient.dest, 'function')
  t.equals(typeof testClient.query, 'function')
  t.equals(typeof testClient.newer, 'function')
  t.end()
})

test('check-user-permission', function (t) {
  t.skip('not implemented yet')
  t.end()
})

test('run query, expect XML', function (t) {
  var testClient = gulpExist.createClient(connectionOptions)
  return gulp.src('test.xql', srcOptions)
    .pipe(testClient.query({
      target: targetCollection,
      xqlOutputExt: 'xml'
    }))
    .on('data', function (d) {
      console.log(d.contents.toString())
      console.log(d.relative.toString())
      t.ok(d.relative.match(/^test\.(.*)?\.xml$/), 'expected filename')
      t.ok(d.contents.toString() === '<result>beep</result>', 'expected contents')
    })
    .on('error', e => t.fail(e))
    .on('finish', _ => t.end())
})

test('run query, expect json', function (t) {
  var testClient = gulpExist.createClient(connectionOptions)
  return gulp.src('test.json.xql', srcOptions)
    .pipe(testClient.query({
      target: targetCollection,
      xqlOutputExt: 'json'
    }))
    .on('data', function (d) {
      t.ok(d.relative.match(/^test\.(.*)?\.json$/), 'expected filename')
      // since JSON is expected, it should parse
      var parsedContents = JSON.parse(d.contents)
      // inspect the results
      // muliple elements in sequence are converted to an array
      t.ok(Array.isArray(parsedContents.item), 'item(s) is an array')
      // all values are strings by default
      t.deepEqual(parsedContents.item, ['1', '2', '3'], 'all items present')
    })
    .on('error', e => t.fail(e))
    .on('finish', _ => t.end())
})

// collections and resources are created and have the correct path

test('setup: remove test collection', function (t) {
  var db = exist.connect(connectionOptions)
  return db.collections.remove(targetCollection)
    .then(_ => t.end(), _ => t.end())
})

test('create collections and resources (target has trailing slash)', function (t) {
  t.plan(2)
  var trailingSlashTarget = targetCollection + '/'
  var testClient = gulpExist.createClient(connectionOptions)
  return gulp.src('**/test.xml', srcOptions)
    .pipe(testClient.dest({
      target: trailingSlashTarget
    }))
    .on('error', e => t.fail('errored', e))
    .on('finish', function () {
      var db = exist.connect(connectionOptions)
      db.resources.describe(trailingSlashTarget + 'test.xml')
        .then(function (result) {
          t.pass('test.xql exists')
          return db.resources.describe(trailingSlashTarget + 'collection/test.xml')
        })
        .then(function (result) {
          t.pass('collection/test.xql exists')
          t.end()
        })
        .catch(e => t.fail(e))
    })
})

test('setup: remove test collection', function (t) {
  var db = exist.connect(connectionOptions)
  return db.collections.remove(targetCollection)
    .then(_ => t.end(), _ => t.fail())
})

test('create collections and resources (target does not have trailing slash)', function (t) {
  t.plan(2)
  var testClient = gulpExist.createClient(connectionOptions)
  return gulp.src('**/test.xml', srcOptions)
    .pipe(testClient.dest({
      target: targetCollection
    }))
    .on('error', e => t.fail(e))
    .on('finish', function () {
      var db = exist.connect(connectionOptions)
      db.resources.describe(targetCollection + 'test.xml')
        .then(function (result) {
          t.pass('test.xql exists')
          return db.resources.describe(targetCollection + 'collection/test.xml')
        })
        .then(function (result) {
          t.pass('collection/test.xql exists')
          t.end()
        })
        .catch(e => t.fail(e))
    })
})

// well formed xml
test('well-formed-xml', function (t) {
  var testClient = gulpExist.createClient(connectionOptions)
  gulp.src('test.xml', srcOptions)
    .pipe(testClient.dest({
      target: targetCollection
    }))
    .on('finish', function () {
      t.ok('finished')
      t.end()
    })
    .on('error', e => t.fail(e))
})

// xquery file with permission changes
test('xql-change-perms', function (t) {
  var testClient = gulpExist.createClient(connectionOptions)
  gulp.src('test.xql', srcOptions)
    .pipe(testClient.dest({
      target: targetCollection,
      permissions: {
        'test.xql': 'rwxr-xr-x'
      }
    }))
    .on('finish', function () {
      t.pass('uploaded')
      var db = exist.connect(connectionOptions)
      db.resources.getPermissions(targetCollection + '/test.xql')
        .then(function (result) {
          t.ok(result.permissions === 493, 'permissions correctly set')
          t.end()
        })
        .catch(e => t.fail(e))
    })
    .on('error', e => t.fail(e))
})

// upload HTML5 file without retry
test('up-html5-no-retry', function (t) {
  var testClient = gulpExist.createClient(connectionOptions)
  gulp.src('test.html', srcOptions)
    .pipe(testClient.dest({
      target: targetCollection
    }))
    .on('error', function (e) {
      t.ok(e, 'errored')
      t.end()
    })
})

// upload HTML5 file with retry
test('up-html5-with-retry', function (t) {
  var testClient = gulpExist.createClient(connectionOptions)
  gulp.src('test.html', srcOptions)
    .pipe(testClient.dest({
      target: targetCollection,
      html5AsBinary: true
    }))
    .on('finish', function () {
      t.ok('finished')
      t.end()
    })
    .on('error', function () {
      t.fail('errored')
      t.end()
    })
})

test('non well formed XML will not be uploaded as binary', function (t) {
  var testClient = gulpExist.createClient(connectionOptions)
  gulp.src('invalid.xml', srcOptions)
    .pipe(testClient.dest({
      target: targetCollection,
      html5AsBinary: true
    }))
    .on('error', function () {
      t.pass('invalid XML was not uploaded')
      t.end()
    })
})

// with newer (should not re-send any file)
test('newer-no-resend', function (t) {
  var testClient = gulpExist.createClient(connectionOptions)
  var files = 0
  gulp.src('test.*', srcOptions)
    .pipe(testClient.newer({target: targetCollection}))
    .on('data', function (c) {
      files += 1
      if (c.relative === 'test.json.xql') {
        return t.ok(true, 'found test.json.xql')
      } else {
        t.fail('attempted to send the file: ' + c.relative)
      }
    })
    .on('finish', function () {
      t.ok(files === 1, 'all but one file filtered')
      t.end()
    })
    .on('error', function () {
      t.fail('errored')
      t.end()
    })
})
