import test from 'tape'
import { src } from 'gulp'
import { getXmlRpcClient } from '@existdb/node-exist'
import { createClient } from '../index.js'

import connectionOptions from './dbconnection.js'

test('install XAR package', function (t) {
  const testClient = createClient(connectionOptions)
  const packageUri = 'http://exist-db.org/apps/test-app'
  const packageTarget = '/db/apps/test-app'
  const db = getXmlRpcClient(connectionOptions)
  function tearDown (e) {
    const end = _ => e ? t.fail(e) : t.end()
    db.app.remove(packageUri)
      .then(end)
      .catch(end)
  }

  return src('spec/files/test-app.xar', { encoding: false })
    .pipe(testClient.install())
    .on('data', function (d) {
      t.plan(3)
      t.true(d.success, 'succeeded')
      t.false(d.result.update, 'first install')
      t.equal(d.result.target, packageTarget, 'correct target')
    })
    .on('error', e => tearDown(e))
    .on('finish', _ => tearDown())
})
