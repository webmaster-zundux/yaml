import { YAMLSemanticError } from '../errors'
import toJSON from '../toJSON'
import YAMLMap from './Map'
import Merge from './Merge'
import Pair from './Pair'
import parseMap from './parseMap'

export class YAMLSet extends YAMLMap {
  toJSON(_, opt) {
    const set = new Set()
    for (const item of this.items) {
      if (item instanceof Merge) {
        const { items } = item.value
        for (let i = items.length - 1; i >= 0; --i) {
          const { source } = items[i]
          if (source instanceof YAMLMap) {
            for (const [key] of source.toJSMap(opt)) set.add(key)
          } else {
            throw new Error('Merge sources must be maps')
          }
        }
      } else {
        set.add(toJSON(item.key, '', opt))
      }
    }
    return set
  }

  toString(ctx, onComment, onChompKeep) {
    if (!ctx) return JSON.stringify(this)
    if (this.hasAllNullValues())
      return super.toString(ctx, onComment, onChompKeep)
    else throw new Error('Set items must all have null values')
  }
}

function parseSet(doc, cst) {
  const map = parseMap(doc, cst)
  if (!map.hasAllNullValues())
    throw new YAMLSemanticError(cst, 'Set items must all have null values')
  return Object.assign(new YAMLSet(), map)
}

function createSet(schema, iterable, wrapScalars) {
  const set = new YAMLSet()
  for (const value of iterable) {
    const v = schema.createNode(value, wrapScalars)
    set.items.push(new Pair(v))
  }
  return set
}

export default {
  class: Set,
  nodeClass: YAMLSet,
  default: false,
  tag: 'tag:yaml.org,2002:set',
  resolve: parseSet,
  createNode: createSet,
  stringify: (value, ctx, onComment, onChompKeep) =>
    value.toString(ctx, onComment, onChompKeep)
}