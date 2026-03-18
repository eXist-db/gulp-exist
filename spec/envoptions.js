import { test } from 'node:test'
import assert from 'node:assert'
import { readOptionsFromEnv } from '../index.js'

test('read connection options from environment (export exists)', () => {
  assert.strictEqual(typeof readOptionsFromEnv, 'function')
})

test('read connection options from environment (env parsing)', () => {
  const optionsFromEnv = readOptionsFromEnv()
  const userIsSet = process.env.EXISTDB_USER && 'EXISTDB_PASS' in process.env
  const serverIsSet = process.env.EXISTDB_SERVER

  if (serverIsSet) {
    const { hostname, port, protocol } = new URL(process.env.EXISTDB_SERVER)
    assert.strictEqual(optionsFromEnv.port, port)
    assert.strictEqual(optionsFromEnv.secure, protocol === 'https:')
    assert.strictEqual(optionsFromEnv.host, hostname)
  } else {
    assert.ok(!('port' in optionsFromEnv))
    assert.ok(!('secure' in optionsFromEnv))
    assert.ok(!('host' in optionsFromEnv))
  }

  if (userIsSet) {
    assert.ok(optionsFromEnv.basic_auth)
    assert.strictEqual(optionsFromEnv.basic_auth.user, process.env.EXISTDB_USER)
    assert.strictEqual(optionsFromEnv.basic_auth.pass, process.env.EXISTDB_PASS)
  } else {
    assert.ok(!('basic_auth' in optionsFromEnv))
  }
})
