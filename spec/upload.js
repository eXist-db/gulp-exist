const { src } = require('gulp')
const test = require('tape')
const { createClient } = require('../index')
const { connect } = require('@existdb/node-exist')

const srcOptions = { cwd: 'spec/files' }

const targetCollection = '/tmp'

const connectionOptions = require('./dbconnection')

// well formed xml
test('well-formed-xml', function (t) {
  const testClient = createClient(connectionOptions)
  src('test.xml', srcOptions)
    .pipe(testClient.dest({
      target: targetCollection
    }))
    .on('error', e => t.end(e))
    .on('finish', _ => {
      t.ok('finished')
      t.end()
    })
})

// xquery file with permission changes
test('xql-change-perms', function (t) {
  const testClient = createClient(connectionOptions)
  src('test.xql', srcOptions)
    .pipe(testClient.dest({
      target: targetCollection,
      permissions: {
        'test.xql': 'rwxr-xr-x'
      }
    }))
    .on('error', e => t.end(e))
    .on('finish', function () {
      t.pass('uploaded')
      const db = connect(connectionOptions)
      db.resources.getPermissions(targetCollection + '/test.xql')
        .then(function (result) {
          t.ok(result.permissions === 493, 'permissions correctly set')
          t.end()
        })
        .catch(e => t.end(e))
    })
})

// upload HTML5 file without retry
test('up-html5-no-retry', function (t) {
  const testClient = createClient(connectionOptions)
  src('test.html', srcOptions)
    .pipe(testClient.dest({
      target: targetCollection
    }))
    .on('error', e => {
      t.ok(e, 'errored')
      t.end()
    })
    .on('finish', _ => t.end(false))
})

// upload HTML5 file with retry
test('up-html5-with-retry', function (t) {
  const testClient = createClient(connectionOptions)
  src('test.html', srcOptions)
    .pipe(testClient.dest({
      target: targetCollection,
      html5AsBinary: true
    }))
    .on('finish', function () {
      t.ok('finished')
      t.end()
    })
    .on('error', e => t.end(e))
})

test('non well formed XML will not be uploaded as binary', function (t) {
  const testClient = createClient(connectionOptions)
  src('invalid.xml', srcOptions)
    .pipe(testClient.dest({
      target: targetCollection,
      html5AsBinary: true
    }))
    .on('error', _ => {
      t.pass('invalid XML was not uploaded')
      t.end()
    })
    .on('finish', _ => t.end())
})

// with newer (should not re-send any file)
test('newer-no-resend', function (t) {
  const testClient = createClient(connectionOptions)
  let files = 0
  src('test.*', srcOptions)
    .pipe(testClient.newer({ target: targetCollection }))
    .on('data', function (c) {
      files += 1
      if (c.relative === 'test.json.xql') {
        return t.ok(true, 'found test.json.xql')
      }
      t.fail('attempted to send the file: ' + c.relative)
    })
    .on('finish', function () {
      t.ok(files === 1, 'all but one file filtered')
      t.end()
    })
    .on('error', e => t.end(e))
})
