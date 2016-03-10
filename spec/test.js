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
    t.equals(typeof testClient.dest, 'function')
    t.equals(typeof testClient.query, 'function')
    t.equals(typeof testClient.newer, 'function')
    t.end()
})

test('check-user-permission', function (t) {
    t.skip('not implemented yet')
    t.end()
})

test('create collection', function (t) {
    t.skip('not implemented yet')
    t.end()
})

test('run query, expect XML', function (t) {
    var testClient = exist.createClient(connectionOptions)
    return gulp.src('test.xql', srcOptions)
        .pipe(testClient.query({
            target: targetCollection,
            xql_output_ext: 'json'
        }))
        .on('data', function (d) {
            t.ok(d.relative.match(/^test\.(.*)?\.json$/), 'expected filename')
            t.ok(d.contents.toString() === '<result>beep</result>', 'expected contents')
        })
        .on('error', function (e) {
            t.fail(e)
        })
        .on('finish', t.end)
})

test('run query, expect json', function (t) {
    var testClient = exist.createClient(connectionOptions)
    return gulp.src('test.json.xql', srcOptions)
        .pipe(testClient.query({
            target: targetCollection,
            xql_output_ext: 'json'
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
        .on('error', function (e) {
            t.fail(e)
        })
        .on('finish', t.end)
})

// well formed xml
test('well-formed-xml', function (t) {
    var testClient = exist.createClient(connectionOptions)
    gulp.src('test.xml', srcOptions)
        .pipe(testClient.dest({
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
        .pipe(testClient.dest({
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
        .pipe(testClient.dest({
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
    var testClient = exist.createClient(connectionOptions)
    gulp.src('invalid.xml', srcOptions)
        .pipe(testClient.dest({
            target: targetCollection,
            html5AsBinary: true
        }))
        .on('finish', function () {
            t.fail('finished')
            t.end()
        }) // should not finish
        .on('error', function () {
            t.ok('errored')
            t.end()
        })
})

// with newer (should not re-send any file)
test('newer-no-resend', function (t) {
    var testClient = exist.createClient(connectionOptions)
    var files = 0
    gulp.src('test.*', srcOptions)
        .pipe(testClient.newer({target: targetCollection}))
        .on('data', function (c) {
            files += 1
            if (c.relative === 'test.json.xql') {
                return t.ok(true, 'found test.json.xql')
            }
            if (c.relative === 'test.unsent.xql') {
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
