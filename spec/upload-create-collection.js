import { test } from 'node:test'
import assert from 'node:assert'

import { src } from 'gulp'
import { createClient } from '../index.js'
import { getXmlRpcClient } from '@existdb/node-exist'
import connectionOptions from './dbconnection.js'

const srcOptions = { cwd: 'spec/files' }
const targetCollection = '/tmp'

async function teardown () {
  const db = getXmlRpcClient(connectionOptions)
  await db.collections.remove(targetCollection)
}

async function checkContents (t) {
  const db = getXmlRpcClient(connectionOptions)
  const r1 = await db.resources.describe(targetCollection + '/test.xml')
  assert.ok(r1, 'resource exists at expected path')
  const r2 = await db.resources.describe(targetCollection + '/collection/test.xml')
  assert.ok(r2, 'resource exists at expected path')
}

// collections and resources are created and have the correct path
test('create collections and resources (target has trailing slash)', async (t) => {
  const testClient = createClient(connectionOptions)
  const trailingSlashTarget = `${targetCollection}/`

  await t.test('setup', (st, done) => {
    src('**/test.xml', srcOptions)
      .pipe(testClient.dest({ target: trailingSlashTarget }))
      .on('error', e => st.fail(e))
      .on('finish', done)
  })

  await t.test('check contents', checkContents)

  await t.test('tearDown', teardown)
})

test('create collections and resources (target has no trailing slash)', async (t) => {
  const testClient = createClient(connectionOptions)

  await t.test('setup', (st, done) => {
    src('**/test.xml', srcOptions)
      .pipe(testClient.dest({ target: targetCollection }))
      .on('error', e => st.fail(e))
      .on('finish', done)
  })

  await t.test('check contents', checkContents)

  await t.test('tearDown', teardown)
})
