// dependencies
var os = require('os')
var through = require('through2')
var log = require('fancy-log')
var PluginError = require('plugin-error')
var assign = require('lodash.assign')
var File = require('vinyl')
var Path = require('path')
var exist = require('@existdb/node-exist')

var defaultRPCoptions = {
  host: 'localhost',
  port: '8080',
  path: '/exist/xmlrpc',
  basic_auth: {
    user: 'guest',
    pass: 'guest'
  }
}

var defaultUploadOptions = {
  html5AsBinary: false,
  target: '',
  permissions: null
}

var defaultQueryOptions = {
  printXqlResults: true,
  xqlOutputExt: 'xml'
}

var isWin = os.platform() === 'win32'

function isSaxParserError (error) {
  return error && error.faultString && /SAXParseException/.test(error.faultString)
}

function normalizePath (path) {
  return isWin ? Path.normalize(path).replace(/\\/g, '/') : Path.normalize(path)
}

function createCollection (client, collection) {
  var normalizedCollectionPath = normalizePath(collection)
  log('Creating collection "' + normalizedCollectionPath + '"...')
  return client.collections.create(normalizedCollectionPath)
}

module.exports.createClient = function createClient (options) {
  // TODO sanity checks
  var client = exist.connect(assign({}, defaultRPCoptions, options))
  return {
    dest: sendFilesWith(client),
    query: queryWith(client),
    newer: checkForNewerWith(client)
  }
}

module.exports.defineMimeTypes = function (mimeTypes) {
  exist.defineMimeTypes(mimeTypes)
}

module.exports.getMimeType = function (path) {
  return exist.getMimeType(path)
}

function sendFilesWith (client) {
  return function send (options) {
    var conf = assign({}, defaultUploadOptions, options)

    var storeFile = function (vf, enc, callback) {
      if (vf.isStream()) {
        return this.emit('error', new PluginError('gulp-exist', 'Streaming not supported'))
      }

      if (vf.isDirectory()) {
        return createCollection(client, normalizePath(conf.target + '/' + vf.relative))
          .then(function (result) {
            callback()
          })
      }

      if (vf.isNull()) {
        return callback()
      }

      // rewrap to newer version of vinyl file object
      var file = new File({
        base: vf.base,
        path: vf.path,
        contents: vf.contents
      })

      var remotePath = normalizePath(conf.target + '/' + file.relative)

      var folder = file.relative.substring(0, file.relative.length - file.basename.length)
      var collection = Path.normalize(conf.target) + '/' + folder

      // create target collection if neccessary
      return client.collections.describe(collection)
        .then(null, function () {
          return createCollection(client, collection)
        })

        // then upload file
        .then(function (result) {
          log('Storing "' + file.base + file.relative + '" as (' + exist.getMimeType(file.path) + ')...')
          return client.documents.upload(file.contents)
        })

        // parse file on server
        .then(function (result) {
          return client.documents.parseLocal(result, remotePath, { mimetype: exist.getMimeType(file.path) })
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
          log(' ✖ ' + remotePath + ' was not stored')
          return callback(error)
        })
    }

    return through.obj(storeFile)
  }
}

function queryWith (client) {
  return function query (options) {
    var conf = assign({}, defaultQueryOptions, options)

    function executeQuery (file, enc, callback) {
      if (file.isStream()) {
        return callback(new PluginError('gulp-exist', 'Streaming not supported'))
      }

      if (file.isDirectory() || file.isNull()) {
        callback()
        return
      }

      log('Running XQuery on server: ' + file.relative)

      client.queries.readAll(file.contents, {})
        .then(function (result) {
          var resultBuffer = Buffer.concat(result.pages)
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
}

function checkForNewerWith (client) {
  return function newer (options) {
    var conf = assign({}, defaultUploadOptions, options)

    function checkFile (file, enc, callback) {
      if (file.isDirectory()) {
        var collection = normalizePath(conf.target + '/' + file.relative)
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
          var newer = !resourceInfo.hasOwnProperty('modified') || (Date.parse(file.stat.mtime) > Date.parse(resourceInfo.modified))
          callback(null, newer ? file : null)
        })
        .catch(function (e) {
          callback(e)
        })
    }

    return through.obj(checkFile)
  }
}
