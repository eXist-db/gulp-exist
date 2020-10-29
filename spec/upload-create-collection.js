const gulp = require('gulp')
const test = require('tape')
const gulpExist = require('../index')
const exist = require('@existdb/node-exist')

const srcOptions = { cwd: 'spec/files' }

const targetCollection = '/tmp'

const connectionOptions = require('./dbconnection')

function teardown (t) {
  const db = exist.connect(connectionOptions)
  db.collections.remove(targetCollection)
    .then(_ => t.end())
    .catch(e => t.end(e))
}

async function checkContents (st) {
  st.plan(2)
  try {
    const db = exist.connect(connectionOptions)
    await db.resources.describe(targetCollection + '/test.xml')
    st.pass('test.xql exists')
    await db.resources.describe(targetCollection + '/collection/test.xml')
    st.pass('collection/test.xql exists')
    st.end()
  } catch (e) {
    st.end(e)
  }
}

// collections and resources are created and have the correct path
test('create collections and resources (target has trailing slash)', function (t) {
  const testClient = gulpExist.createClient(connectionOptions)
  const trailingSlashTarget = targetCollection + '/'

  t.test('setup', function (st) {
    gulp.src('**/test.xml', srcOptions)
      .pipe(testClient.dest({
        target: trailingSlashTarget
      }))
      .on('error', e => {
        st.error(e)
        st.end()
      })
      .on('finish', _ => st.end())
  })

  t.test('check contents', checkContents)
  t.test('tearDown', teardown)
})

test('create collections and resources (target has trailing slash)', function (t) {
  const testClient = gulpExist.createClient(connectionOptions)

  t.test('setup', function (st) {
    gulp.src('**/test.xml', srcOptions)
      .pipe(testClient.dest({
        target: targetCollection
      }))
      .on('error', e => {
        st.error(e)
        st.end()
      })
      .on('finish', _ => st.end())
  })

  t.test('check contents', checkContents)

  t.test('tearDown', teardown)
})
