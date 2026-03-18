// tests
import { test } from 'node:test'
import assert from 'node:assert'

import { src } from 'gulp'
import { createClient } from '../index.js'
import connectionOptions from './dbconnection.js'
const srcOptions = { cwd: 'spec/files' }

const targetCollection = '/tmp'

test('run query, expect XML', (t, done) => {
  const testClient = createClient(connectionOptions)
  src('test.xql', srcOptions)
    .pipe(testClient.query({
      target: targetCollection,
      xqlOutputExt: 'xml'
    }))
    .on('data', function (d) {
      assert.ok(d.relative.match(/^test\.(.*)?\.xml$/), 'expected filename')
      assert.ok(d.contents.toString() === '<result>beep</result>', 'expected contents')
      done()
    })
    .on('error', e => {
      t.fail(e)
    })
})

test('run query, expect json', (t, done) => {
  const testClient = createClient(connectionOptions)
  src('test.json.xql', srcOptions)
    .pipe(testClient.query({
      target: targetCollection,
      xqlOutputExt: 'json'
    }))
    .on('data', function (d) {
      assert.ok(d.relative.match(/^test\.(.*)?\.json$/), 'expected filename')
      // since JSON is expected, it should parse
      const parsedContents = JSON.parse(d.contents)
      // inspect the results
      // muliple elements in sequence are converted to an array
      assert.ok(Array.isArray(parsedContents.item), 'item(s) is an array')
      // all values are strings by default
      assert.deepEqual(parsedContents.item, ['1', '2', '3'], 'all items present')
      done()
    })
    .on('error', e => t.fail(e))
})

test('run query with variables', (t, done) => {
  const testClient = createClient(connectionOptions)
  src('test-variables.xql', srcOptions)
    .pipe(testClient.query({
      target: targetCollection,
      queryParams: {
        variables: {
          variable: 'test'
        }
      }
    }))
    .on('data', function (d) {
      const contents = d.contents.toString()

      // inspect the results
      // result should be the string set by the variables object in the query params
      assert.equal(contents, 'test', 'variable has been set')
      done()
    })
    .on('error', e => t.fail(e))
})
