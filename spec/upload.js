import { test } from 'node:test'
import assert from 'node:assert'
import { src } from 'gulp'
import { createClient } from '../index.js'
import { getXmlRpcClient } from '@existdb/node-exist'

import connectionOptions from './dbconnection.js'

const srcOptions = { cwd: 'spec/files' }
const targetCollection = '/upload-tests'

test('well-formed xml upload succeeds', (t, done) => {
  const testClient = createClient(connectionOptions)
  src('test.xml', srcOptions)
    .pipe(testClient.dest({ target: targetCollection }))
    .on('error', e => t.fail(e))
    .on('finish', done)
})

test('xquery file upload with permission changes', (t, done) => {
  const testClient = createClient(connectionOptions)
  src('test.xql', srcOptions)
    .pipe(testClient.dest({
      target: targetCollection,
      permissions: { 'test.xql': 'rwxr-xr-x' }
    }))
    .on('error', e => t.fail(e))
    .on('finish', async () => {
      const db = getXmlRpcClient(connectionOptions)
      const resourcePath = `${targetCollection}/test.xql`
      const result = await db.resources.getPermissions(resourcePath)
      assert.strictEqual(result.permissions, 493, 'permissions correctly set')
      done()
    })
})

test('upload html5 file without retry errors', (t, done) => {
  const testClient = createClient(connectionOptions)
  src('test.html', srcOptions)
    .pipe(testClient.dest({ target: targetCollection }))
    .on('error', r => {
      assert.ok(r)
      done()
    })
    .on('finish', () => {
      t.fail('expected an error')
    })
})

test('upload html5 file with retry succeeds', (t, done) => {
  const testClient = createClient(connectionOptions)
  src('test.html', srcOptions)
    .pipe(testClient.dest({ target: targetCollection, html5AsBinary: true }))
    .on('error', e => t.fail(e))
    .on('finish', r => {
      console.log(r)
      // assert.ok(r, 'expected successful upload')
      done()
    })
})

test('invalid xml will not be uploaded as binary', (t, done) => {
  const testClient = createClient(connectionOptions)
  src('invalid.xml', srcOptions)
    .pipe(testClient.dest({ target: targetCollection, html5AsBinary: true }))
    .on('error', e => {
      assert.ok(e, 'expected error for invalid XML')
      done()
    })
    .on('finish', r => t.fail(r))
})

test('newer filter only includes files newer than remote', (t, done) => {
  const testClient = createClient(connectionOptions)
  const seen = new Set()

  src('test.*', srcOptions)
    .pipe(testClient.newer({ target: targetCollection }))
    .on('data', function (c) {
      seen.add(c.relative)
    })
    .on('finish', () => {
      console.log(seen)
      assert.equal(seen.size, 1, 'expected only one file to be sent')
      assert.ok(seen.has('test.json.xql'), 'expected at least the new JSON query file to be sent')
      done()
    })
    .on('error', e => t.fail(e))
})
