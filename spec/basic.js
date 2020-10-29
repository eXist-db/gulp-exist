const test = require('tape')
const gulpExist = require('../index')

test('check for default mime type extensions', function (t) {
  t.equals(gulpExist.getMimeType('test.xq'), 'application/xquery')
  t.equals(gulpExist.getMimeType('test.xqs'), 'application/xquery')
  t.equals(gulpExist.getMimeType('test.xql'), 'application/xquery')
  t.equals(gulpExist.getMimeType('test.xqm'), 'application/xquery')
  t.equals(gulpExist.getMimeType('test.xquery'), 'application/xquery')
  t.equals(gulpExist.getMimeType('test.xconf'), 'application/xml')
  t.equals(gulpExist.getMimeType('test.odd'), 'application/xml')
  t.end()
})

test('extend mime type definitions', function (t) {
  gulpExist.defineMimeTypes({ 'text/foo': ['bar'] })
  t.equals(gulpExist.getMimeType('test.bar'), 'text/foo')
  t.end()
})

test('create connection with default settings', function (t) {
  const testClient = gulpExist.createClient()
  t.equals(typeof testClient.dest, 'function')
  t.equals(typeof testClient.query, 'function')
  t.equals(typeof testClient.newer, 'function')
  t.end()
})
  
test('check-user-permission', function (t) {
  t.skip('not implemented yet')
  t.end()
})
