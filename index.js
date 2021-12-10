/**
 * @typedef { import("xmlrpc").Client } XMLRPCClient
 */

/**
 * @typedef { import("through2").TransformFunction } TransformFunction
 */

// dependencies
const os = require('os')
const through = require('through2')
const log = require('fancy-log')
const PluginError = require('plugin-error')
const assign = require('lodash.assign')
const File = require('vinyl')
const Path = require('path')
const { connect, getMimeType, defineMimeTypes, readOptionsFromEnv } = require('@existdb/node-exist')

/**
 * @typedef {Object} GulpExistConnectionOptions
 * @prop {string} [host] database host, default: "localhost"
 * @prop {string} [port] database port, default: "8080"
 * @prop {boolean} [secure] use HTTPS? default: false
 * @prop {string} [path] path to XMLRPC, default: "/exist/xmlrpc"
 * @prop {user:string, pass:string} [basic_auth] database user credentials, default: "guest/guest"
 */

/**
 * NOTE: gulp-exist will still default to HTTP!
 *
 * But if your existdb instance has a proper certificate,
 * you can now switch to HTTPS.
 * Set "secure" to true and the "port" to 8443 (the port
 * configured to serve HTTPS may differ in your installation)
 * @type {GulpExistConnectionOptions}
 */
const defaultRPCoptions = {
  host: 'localhost',
  port: '8443',
  secure: true,
  path: '/exist/xmlrpc',
  basic_auth: {
    user: 'guest',
    pass: 'guest'
  }
}

/**
 * @typedef {string} UnixPermission unix style permission string
 *
 */

/**
 * @typedef {Object} GulpExistUploadOptions
 * @prop {boolean} [html5AsBinary] override mimetype for invalid HTML, default: false
 * @prop {string} target collection to write to, default: ""
 * @prop {Object<string,UnixPermission>} [permissions] mapping of filename to unix style permission string
 */

/**
 * @type {GulpExistUploadOptions}
 */
const defaultUploadOptions = {
  html5AsBinary: false,
  target: '',
  permissions: null
}

/**
 * @typedef {Object} GulpExistQueryOptions
 * @prop {boolean} [printXqlResults] default: true
 * @prop {"xml"|"json"|string} xqlOutputExt the file extension the results are written to
 * @prop {Object} queryParams query parameters passed to eXist-db
 */

/**
 * @type {GulpExistQueryOptions}
 */
const defaultQueryOptions = {
  printXqlResults: true,
  xqlOutputExt: 'xml',
  queryParams: {}
}

const isWin = os.platform() === 'win32'

function isSaxParserError (error) {
  return error && error.faultString && /SAXParseException/.test(error.faultString)
}

function normalizePath (path) {
  return isWin ? Path.normalize(path).replace(/\\/g, '/') : Path.normalize(path)
}

function createCollection (client, collection) {
  const normalizedCollectionPath = normalizePath(collection)
  log('Creating collection "' + normalizedCollectionPath + '"...')
  return client.collections.create(normalizedCollectionPath)
}

/**
 * upload a file to the connected database
 * missing collections will be created
 *
 * @param {XMLRPCClient} client
 * @param {GulpExistUploadOptions} options
 * @return {TransformFunction} store files from stream
 */
function dest (client, options) {
  const conf = assign({}, defaultUploadOptions, options)

  function storeFile (vf, enc, callback) {
    if (vf.isStream()) {
      return this.emit('error', new PluginError('gulp-exist', 'Streaming not supported'))
    }

    if (vf.isDirectory()) {
      return createCollection(client, normalizePath(conf.target + '/' + vf.relative))
        .then(_ => callback())
        .catch(e => callback(e))
    }

    if (vf.isNull()) {
      return callback()
    }

    // rewrap to newer version of vinyl file object
    const file = new File({
      base: vf.base,
      path: vf.path,
      contents: vf.contents
    })

    const remotePath = normalizePath(conf.target + '/' + file.relative)

    const folder = file.relative.substring(0, file.relative.length - file.basename.length)
    const collection = Path.normalize(conf.target) + '/' + folder

    // create target collection if neccessary
    return client.collections.describe(collection)
      .then(null, function (e) {
        if (e.faultString) {
          log(`collection ${collection} not found`)
          return createCollection(client, collection)
        }
        // server may be down, unreachable or misconfigured
        return Promise.reject(e)
      })

      // then upload file
      .then(function (result) {
        log('Storing "' + file.base + file.relative + '" as (' + getMimeType(file.path) + ')...')
        return client.documents.upload(file.contents)
      })

      // parse file on server
      .then(function (result) {
        return client.documents.parseLocal(result, remotePath, { mimetype: getMimeType(file.path) })
      })

      // handle re-upload as octet stream if parsing failed and html5AsBinary is set
      .then(null, function (error) {
        if (isSaxParserError(error) && conf.html5AsBinary && file.extname === '.html') {
          log(file.relative + ' is not well-formed XML, storing as binary...')
          return client.documents.upload(file.contents)
            .then(function (result) {
              return client.documents.parseLocal(result, remotePath, { mimetype: 'application/octet-stream' })
            })
        } else {
          throw error
        }
      })

      // Then override permissions if specified in options
      .then(function (result) {
        if (conf.permissions && file.relative in conf.permissions) {
          log('Setting permissions for "' + normalizePath(file.relative) + '" (' + conf.permissions[file.relative] + ')...')
          return client.resources.setPermissions(remotePath, conf.permissions[file.relative])
        }
      })

      // Print result and proceed to next file
      .then(function (result) {
        log(' ✔ ︎' + remotePath + ' stored')
        return callback(null, file)
      })
      .catch(function (error) {
        let errorMessage
        if (isSaxParserError(error)) {
          // Failed to invoke method parseLocal in class org.exist.xmlrpc.RpcConnection: org.xml.sax.SAXException:
          errorMessage = error.faultString.split('\n')[0].substring(102)
        } else {
          errorMessage = error.message
        }
        log.error(' ✖ ' + remotePath + ' was not stored. Reason:', errorMessage)
        return callback(error)
      })
  }

  return through.obj(storeFile)
}

/**
 * upload and execute an xquery script
 * save the results to a file
 * appends the date of execution
 * and the expected file extension
 *
 * @param {XMLRPCClient} client
 * @param {GulpExistQueryOptions} options
 * @return {TransformFunction} upload and execute files from stream
 */
function query (client, options) {
  const conf = assign({}, defaultQueryOptions, options)

  function executeQuery (file, enc, callback) {
    if (file.isStream()) {
      return callback(new PluginError('gulp-exist', 'Streaming not supported'))
    }

    if (file.isDirectory() || file.isNull()) {
      callback()
      return
    }

    log('Running XQuery on server: ' + file.relative)

    client.queries.readAll(file.contents, conf.queryParams)
      .then(function (result) {
        const resultBuffer = Buffer.concat(result.pages)
        if (conf.printXqlResults) {
          log(resultBuffer.toString())
        }

        file.extname = `.${new Date().toJSON()}.${conf.xqlOutputExt}`
        file.contents = resultBuffer

        return callback(null, file)
      })
      .catch(function (error) {
        return callback(new PluginError('gulp-exist', 'Error running XQuery ' + file.relative + ':\n' + error))
      })
  }

  return through.obj(executeQuery)
}

/**
 * check if a file exists in the database and if the local file is newer
 *
 * @param {XMLRPCClient} client
 * @param {GulpExistUploadOptions} options
 * @return {TransformFunction} filter files from stream that are older
 */
function newer (client, options) {
  const conf = assign({}, defaultUploadOptions, options)

  function checkFile (file, enc, callback) {
    if (file.isDirectory()) {
      const collection = normalizePath(conf.target + '/' + file.relative)
      client.collections.describe(collection)
        .then(function () {
          callback(null)
        }, function () {
          callback(null, file)
        })

      return
    }

    client.resources.describe(normalizePath(conf.target + '/' + file.relative))
      .then(function (resourceInfo) {
        const newer = !Object.prototype.hasOwnProperty.call(resourceInfo, 'modified') || (Date.parse(file.stat.mtime) > Date.parse(resourceInfo.modified))
        callback(null, newer ? file : null)
      })
      .catch(function (e) {
        callback(e)
      })
  }

  return through.obj(checkFile)
}

/**
 * @typedef {Object} GulpExistInstallationOptions
 * @prop {string} [packageUri] deprecated
 * @prop {string} [customPackageRepoUrl]
 */

/**
 * Install a XAR package in the database
 *
 * @param {XMLRPCClient} client database client
 * @param {GulpExistInstallationOptions} options installation options
 * @return {TransformFunction} install XAR from vinyl file stream
 */
function install (client, options) {
  const customPackageRepoUrl = options && options.customPackageRepoUrl ? options.customPackageRepoUrl : null

  function installPackage (file, enc, callback) {
    const xarName = file.basename

    if (file.isStream()) { return callback(new PluginError('gulp-exist', 'Streaming not supported')) }
    if (file.isDirectory()) { return callback(new PluginError('gulp-exist', `Source "${xarName}" is a directory`)) }
    if (file.isNull()) { return callback(new PluginError('gulp-exist', `Source "${xarName}" is null`)) }
    if (file.extname !== '.xar') { return callback(new PluginError('gulp-exist', `Source "${xarName}" is not a XAR package`)) }

    log(`Uploading ${xarName} (${file.contents.length} bytes)`)

    client.app.upload(file.contents, xarName)
      .then(response => {
        if (!response.success) { return callback(new PluginError('gulp-exist', 'XAR was not uploaded')) }
        log(`Install ${xarName}`)
        return client.app.install(xarName, customPackageRepoUrl)
      })
      .then(response => {
        if (!response.success) { return callback(new PluginError('gulp-exist', 'XAR Installation failed')) }
        if (response.result.update) {
          log('Application was updated')
          return callback(null, response)
        }
        log('Application was installed')
        callback(null, response)
      })
      .catch(error => callback(new PluginError('gulp-exist', `XAR Installation failed: ${error}`)))
  }
  return through.obj(installPackage)
}

/**
 * @typedef {Object} GulpExist
 * @prop {(options:GulpExistUploadOptions) => TransformFunction} dest
 * @prop {(options:GulpExistQueryOptions) => TransformFunction} query
 * @prop {(options:GulpExistUploadOptions) => TransformFunction} newer
 * @prop {(options:GulpExistInstallationOptions) => TransformFunction} install
 */

/**
 * create database client and bind methods to it
 *
 * @param {GulpExistConnectionOptions} options
 * @return {GulpExist} bound methods
 */
function createClient (options) {
  // TODO sanity checks
  const _options = assign({}, defaultRPCoptions, options)
  const client = connect(_options)
  return {
    dest: dest.bind(null, client),
    query: query.bind(null, client),
    newer: newer.bind(null, client),
    install: install.bind(null, client)
  }
}

module.exports = {
  createClient,
  defineMimeTypes,
  getMimeType,
  readOptionsFromEnv
}
