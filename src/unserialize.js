// @flow

import invariant from 'assert'
// Disabling because that file only requires a type exported from this file
// eslint-disable-next-line import/no-cycle
import Parser from './parser'
import { isInteger, getClass, getIncompleteClass, __PHP_Incomplete_Class } from './helpers'

export type Options = {|
  strict: boolean,
  encoding: 'utf8' | 'binary',
|}

function getClassReference(className: string, scope: Object, strict: boolean): Object {
  let container
  const classReference = scope[className]
  invariant(classReference || !strict, `Class ${className} not found in given scope`)
  if (classReference) {
    container = new (getClass(classReference.prototype))()
  } else {
    container = getIncompleteClass(className)
  }
  return container
}

function unserializePairs(parser: Parser, length: number, scope: Object, options: Options) {
  const pairs = []
  for (let i = 0; i < length; i += 1) {
    const key = unserializeItem(parser, scope, options)
    parser.seekExpected(';')
    const value = unserializeItem(parser, scope, options)
    if (parser.peekAhead(1) === ';') {
      parser.advance(1)
    }
    pairs.push({ key, value })
  }
  return pairs
}

function unserializeItem(parser: Parser, scope: Object, options: Options) {
  const type = parser.getType()
  if (type === 'null') {
    return null
  }
  if (type === 'int' || type === 'float') {
    const value = parser.readUntil(';')
    return type === 'int' ? parseInt(value, 10) : parseFloat(value)
  }
  if (type === 'boolean') {
    const value = parser.readAhead(1)
    return value === '1'
  }
  if (type === 'string') {
    return parser.getByLength('"', '"', length => parser.readAhead(length))
  }
  if (type === 'array-object') {
    const pairs = parser.getByLength('{', '}', length => unserializePairs(parser, length, scope, options))

    const isArray = pairs.every(item => isInteger(item.key))
    const result = isArray ? [] : {}
    pairs.forEach(function({ key, value }: Object) {
      result[key] = value
    })
    return result
  }
  if (type === 'notserializable-class') {
    const name = parser.getByLength('"', '"', length => parser.readAhead(length))
    parser.seekExpected(':')
    const pairs = parser.getByLength('{', '}', length => unserializePairs(parser, length, scope, options))
    const result = getClassReference(name, scope, options.strict)
    pairs.forEach(function({ key, value }: Object) {
      result[key] = value
    })
    return result
  }
  if (type === 'serializable-class') {
    const name = parser.getByLength('"', '"', length => parser.readAhead(length))
    parser.seekExpected(':')
    const payload = parser.getByLength('{', '}', length => parser.readAhead(length))
    const result = getClassReference(name, scope, options.strict)
    if (!(result instanceof __PHP_Incomplete_Class)) {
      invariant(result.unserialize, `unserialize not found on class when processing '${name}'`)
      result.unserialize(payload)
    }
    return result
  }
  throw new Error(`Invalid type '${type}' encounterd while unserializing`)
}

function unserialize(item: string | Buffer, scope: Object = {}, givenOptions: Object = {}): any {
  const options: any = Object.assign({}, givenOptions)
  if (typeof options.strict === 'undefined') {
    options.strict = true
  }
  if (typeof options.encoding === 'undefined') {
    options.encoding = 'utf8'
  }
  const parser = new Parser(Buffer.from(item), 0, options)
  return unserializeItem(parser, scope, options)
}

export default unserialize
