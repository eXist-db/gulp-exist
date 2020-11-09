const test = require('tape')

const gulp = require('gulp')
const { connect } = require('@existdb/node-exist')
const { createClient } = require('../index')

const connectionOptions = require('./dbconnection')

test('install XAR package', function (t) {
  const testClient = createClient(connectionOptions)
  const packageUri = 'http://exist-db.org/apps/test-app'
  const packageTarget = '/db/apps/test-app'
  const db = connect(connectionOptions)
  function tearDown (e) {
    const end = _ => e ? t.fail(e) : t.end()
    db.app.remove(packageUri)
      .then(end)
      .catch(end)
  }

  return gulp.src('test-app.xar', { cwd: 'spec/files' })
    .pipe(testClient.install({ packageUri }))
    .on('data', function (d) {
      t.plan(3)
      t.true(d.success, 'succeeded')
      t.false(d.result.update, 'first install')
      t.equal(d.result.target, packageTarget, 'correct target')
    })
    .on('error', e => tearDown(e))
    .on('finish', _ => tearDown())
})
