const test = require('tape')
const gulpExist = require('../index')

const XQExtensions = ['xq', 'xqs', 'xql', 'xqm', 'xquery']
const XMLExtensions = ['xconf', 'odd']

test('check registered xquery file extensions', function (t) {
  for (const index in XQExtensions) {
    const extension = XQExtensions[index]
    t.equals(gulpExist.getMimeType('test.' + extension), 'application/xquery', extension + ' checked')
  }
  t.end()
})

test('check registered XML file extensions', function (t) {
  for (const index in XMLExtensions) {
    const extension = XMLExtensions[index]
    t.equals(gulpExist.getMimeType('test.' + extension), 'application/xml', extension + ' checked')
  }
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
