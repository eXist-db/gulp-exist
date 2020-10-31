// tests

const gulp = require('gulp')
const test = require('tape')
const gulpExist = require('../index')
const connectionOptions = require('./dbconnection')
const srcOptions = { cwd: 'spec/files' }

const targetCollection = '/tmp'

test('run query, expect XML', function (t) {
  const testClient = gulpExist.createClient(connectionOptions)
  return gulp.src('test.xql', srcOptions)
    .pipe(testClient.query({
      target: targetCollection,
      xqlOutputExt: 'xml'
    }))
    .on('data', function (d) {
      // console.log(d.contents.toString())
      // console.log(d.relative.toString())
      t.ok(d.relative.match(/^test\.(.*)?\.xml$/), 'expected filename')
      t.ok(d.contents.toString() === '<result>beep</result>', 'expected contents')
    })
    .on('error', e => {
      t.fail(e)
    })
    .on('finish', _ => t.end())
})

test('run query, expect json', function (t) {
  const testClient = gulpExist.createClient(connectionOptions)
  return gulp.src('test.json.xql', srcOptions)
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
    })
    .on('error', e => t.fail(e))
    .on('finish', _ => t.end())
})
