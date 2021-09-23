const test = require('tape')
const { readOptionsFromEnv } = require('../index')

test('read connection options from environment', function (t) {
  t.equal(typeof readOptionsFromEnv, 'function')
  t.end()
})

test('read connection options from environment', function (t) {
  const optionsFromEnv = readOptionsFromEnv()
  const userIsSet = process.env.EXISTDB_USER && 'EXISTDB_PASS' in process.env
  const serverIsSet = process.env.EXISTDB_SERVER

  if (serverIsSet) {
    const { hostname, port, protocol } = new URL(process.env.EXISTDB_SERVER)
    t.equal(optionsFromEnv.port, port)
    t.equal(optionsFromEnv.secure, protocol === 'https:')
    t.equal(optionsFromEnv.host, hostname)
  } else {
    t.false('port' in optionsFromEnv)
    t.false('secure' in optionsFromEnv)
    t.false('host' in optionsFromEnv)
  }

  if (userIsSet) {
    t.ok(optionsFromEnv.basic_auth)
    t.equal(optionsFromEnv.basic_auth.user, process.env.EXISTDB_USER)
    t.equal(optionsFromEnv.basic_auth.pass, process.env.EXISTDB_PASS)
  } else {
    t.false('basic_auth' in optionsFromEnv)
  }

  t.end()
})
