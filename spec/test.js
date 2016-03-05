// tests

var gulp = require('gulp'),
    test = require('tape'),
    exist = require('../index')

var srcOptions = { cwd: 'spec/files' }
var targetCollection = '/tmp/'

var connectionOptions = {
    basic_auth: {
        user: 'admin',
        pass: ''
    }
}

test('check for default mime type extensions', function (t) {
    var types = exist.getMimeTypes()
    t.equals(types['xq'], 'application/xquery')
    t.equals(types['xql'], 'application/xquery')
    t.equals(types['xqm'], 'application/xquery')
    t.equals(types['xconf'], 'application/xml')
    t.end()
})

test('extend mime type definitions', function (t) {
    exist.defineMimeTypes({ 'text/foo': ['bar'] })
    t.equals(exist.getMimeTypes()['bar'], 'text/foo')
    t.end()
})

test('create connection with default settings', function (t) {
    var testClient = exist.createClient()
    t.equals(typeof testClient.sendTo, 'function')
    t.equals(typeof testClient.query, 'function')
    t.equals(typeof testClient.newer, 'function')
    t.end()
})

test('check-user-permission', function (t) {
    t.fail('not implemented yet')
    t.end()
})

test('create collection', function (t) {
    t.fail('not implemented yet')
    t.end()
})

test('run query', function (t) {
    t.fail('not implemented yet')
    t.end()
})

// well formed xml
test('well-formed-xml', function (t) {
    var testClient = exist.createClient(connectionOptions)
    gulp.src('test.xml', srcOptions)
        .pipe(testClient.sendTo({
            target: targetCollection
        }))
        .on('finish', function () {
            t.ok('finished')
            t.end()
        })
        .on('error', t.fail)
})

// xquery file with permission changes
test('xql-change-perms', function (t) {
    var testClient = exist.createClient(connectionOptions)
    gulp.src('test.xql', srcOptions)
        .pipe(testClient.sendTo({
            target: targetCollection,
            permissions: {
                'test.xql': 'rwxr-xr-x'
            }
        }))
        .on('finish', function () {
            t.ok('finished')
            t.end()
        })
        .on('error', t.fail)
})

// upload HTML5 file without retry
test('up-html5-no-retry', function (t) {
    var testClient = exist.createClient(connectionOptions)
    gulp.src('test.html', srcOptions)
        .pipe(testClient.sendTo({
            target: targetCollection
        }))
        .on('finish', t.fail) // should not finish
        .on('error', function () {
            t.ok('errored')
            t.end()
        })
})

// upload HTML5 file with retry
test('up-html5-with-retry', function (t) {
    var testClient = exist.createClient(connectionOptions)
    gulp.src('test.html', srcOptions)
        .pipe(testClient.sendTo({
            target: targetCollection,
            retry: true
        }))
        .on('finish', function () {
            t.ok('finished')
            t.end()
        })
        .on('error', t.fail)
})

// with newer (should not re-send any file)
test('newer-no-resend', function (t) {
    var testClient = exist.createClient(connectionOptions)
    gulp.src('test.*', srcOptions)
        .pipe(testClient.newer({target: targetCollection}))
        .pipe(testClient.sendTo({target: targetCollection}))
        .on('finish', function () {
            t.ok('finished')
            t.end()
        })
        .on('error', t.fail)
})
