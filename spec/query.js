// tests

const { src } = require('gulp')
const test = require('tape')
const { createClient } = require('../index')
const connectionOptions = require('./dbconnection')
const srcOptions = { cwd: 'spec/files' }

const targetCollection = '/tmp'

test('run query, expect XML', function (t) {
  const testClient = createClient(connectionOptions)
  return src('test.xql', srcOptions)
    .pipe(testClient.query({
      target: targetCollection,
      xqlOutputExt: 'xml'
    }))
    .on('data', function (d) {
      t.ok(d.relative.match(/^test\.(.*)?\.xml$/), 'expected filename')
      t.ok(d.contents.toString() === '<result>beep</result>', 'expected contents')
      t.end()
    })
    .on('error', e => {
      t.fail(e)
    })
})

test('run query, expect json', function (t) {
  const testClient = createClient(connectionOptions)
  return src('test.json.xql', srcOptions)
    .pipe(testClient.query({
      target: targetCollection,
      xqlOutputExt: 'json'
    }))
    .on('data', function (d) {
      t.ok(d.relative.match(/^test\.(.*)?\.json$/), 'expected filename')
      // since JSON is expected, it should parse
      const parsedContents = JSON.parse(d.contents)
      // inspect the results
      // muliple elements in sequence are converted to an array
      t.ok(Array.isArray(parsedContents.item), 'item(s) is an array')
      // all values are strings by default
      t.deepEqual(parsedContents.item, ['1', '2', '3'], 'all items present')
      t.end()
    })
    .on('error', e => t.fail(e))
})

test('run query with variables', function (t) {
  const testClient = createClient(connectionOptions)
  return src('test-variables.xql', srcOptions)
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
      t.equal(contents, 'test', 'variable has been set')
      t.end()
    })
    .on('error', e => t.fail(e))
})
