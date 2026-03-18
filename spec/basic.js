import { test } from 'node:test'
import assert from 'node:assert'
import { getMimeType, defineMimeTypes, createClient } from '../index.js'

const XQExtensions = ['xq', 'xqs', 'xql', 'xqm', 'xquery']
const XMLExtensions = ['xconf', 'odd']

test('check registered xquery file extensions', () => {
  for (const extension of XQExtensions) {
    assert.strictEqual(getMimeType(`test.${extension}`), 'application/xquery', `${extension} checked`)
  }
})

test('check registered XML file extensions', () => {
  for (const extension of XMLExtensions) {
    assert.strictEqual(getMimeType(`test.${extension}`), 'application/xml', `${extension} checked`)
  }
})

test('extend mime type definitions', () => {
  defineMimeTypes({ 'text/foo': ['bar'] })
  assert.strictEqual(getMimeType('test.bar'), 'text/foo')
})

test('create connection with default settings', () => {
  const testClient = createClient()
  assert.strictEqual(typeof testClient.dest, 'function')
  assert.strictEqual(typeof testClient.query, 'function')
  assert.strictEqual(typeof testClient.newer, 'function')
})

test.skip('check-user-permission', () => {})
