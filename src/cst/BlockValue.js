import { Type } from '../constants.js'
import { YAMLSemanticError } from '../errors.js'
import { Node } from './Node.js'
import { Range } from './Range.js'

export const Chomp = {
  CLIP: 'CLIP',
  KEEP: 'KEEP',
  STRIP: 'STRIP'
}

export class BlockValue extends Node {
  constructor(type, props) {
    super(type, props)
    this.blockIndent = null
    this.chomping = Chomp.CLIP
    this.header = null
  }

  get includesTrailingLines() {
    return this.chomping === Chomp.KEEP
  }

  get strValue() {
    if (!this.valueRange || !this.context) return null
    let { start, end } = this.valueRange
    const { indent, src } = this.context
    if (this.valueRange.isEmpty()) return ''
    let lastNewLine = null
    let ch = src[end - 1]
    while (ch === '\n' || ch === '\t' || ch === ' ') {
      end -= 1
      if (end <= start) {
        if (this.chomping === Chomp.KEEP) break
        else return '' // probably never happens
      }
      if (ch === '\n') lastNewLine = end
      ch = src[end - 1]
    }
    let keepStart = end + 1
    if (lastNewLine) {
      if (this.chomping === Chomp.KEEP) {
        keepStart = lastNewLine
        end = this.valueRange.end
      } else {
        end = lastNewLine
      }
    }
    const bi = indent + this.blockIndent
    const folded = this.type === Type.BLOCK_FOLDED
    let atStart = true
    let str = ''
    let sep = ''
    let prevMoreIndented = false
    for (let i = start; i < end; ++i) {
      for (let j = 0; j < bi; ++j) {
        if (src[i] !== ' ') break
        i += 1
      }
      const ch = src[i]
      if (ch === '\n') {
        if (sep === '\n') str += '\n'
        else sep = '\n'
      } else {
        const lineEnd = Node.endOfLine(src, i)
        const line = src.slice(i, lineEnd)
        i = lineEnd
        if (folded && (ch === ' ' || ch === '\t') && i < keepStart) {
          if (sep === ' ') sep = '\n'
          else if (!prevMoreIndented && !atStart && sep === '\n') sep = '\n\n'
          str += sep + line //+ ((lineEnd < end && src[lineEnd]) || '')
          sep = (lineEnd < end && src[lineEnd]) || ''
          prevMoreIndented = true
        } else {
          str += sep + line
          sep = folded && i < keepStart ? ' ' : '\n'
          prevMoreIndented = false
        }
        if (atStart && line !== '') atStart = false
      }
    }
    return this.chomping === Chomp.STRIP ? str : str + '\n'
  }

  parseBlockHeader(start) {
    const { src } = this.context
    let offset = start + 1
    let bi = ''
    while (true) {
      const ch = src[offset]
      switch (ch) {
        case '-':
          this.chomping = Chomp.STRIP
          break
        case '+':
          this.chomping = Chomp.KEEP
          break
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          bi += ch
          break
        default:
          this.blockIndent = Number(bi) || null
          this.header = new Range(start, offset)
          return offset
      }
      offset += 1
    }
  }

  parseBlockValue(start) {
    const { indent, src } = this.context
    const explicit = !!this.blockIndent
    let offset = start
    let valueEnd = start
    let minBlockIndent = 1
    for (let ch = src[offset]; ch === '\n'; ch = src[offset]) {
      offset += 1
      if (Node.atDocumentBoundary(src, offset)) break
      const end = Node.endOfBlockIndent(src, indent, offset) // should not include tab?
      if (end === null) break
      const ch = src[end]
      const lineIndent = end - (offset + indent)
      if (!this.blockIndent) {
        // no explicit block indent, none yet detected
        if (src[end] !== '\n') {
          // first line with non-whitespace content
          if (lineIndent < minBlockIndent) {
            const msg =
              'Block scalars with more-indented leading empty lines must use an explicit indentation indicator'
            this.error = new YAMLSemanticError(this, msg)
          }
          this.blockIndent = lineIndent
        } else if (lineIndent > minBlockIndent) {
          // empty line with more whitespace
          minBlockIndent = lineIndent
        }
      } else if (ch && ch !== '\n' && lineIndent < this.blockIndent) {
        if (src[end] === '#') break
        if (!this.error) {
          const src = explicit ? 'explicit indentation indicator' : 'first line'
          const msg = `Block scalars must not be less indented than their ${src}`
          this.error = new YAMLSemanticError(this, msg)
        }
      }
      if (src[end] === '\n') {
        offset = end
      } else {
        offset = valueEnd = Node.endOfLine(src, end)
      }
    }
    if (this.chomping !== Chomp.KEEP) {
      offset = src[valueEnd] ? valueEnd + 1 : valueEnd
    }
    this.valueRange = new Range(start + 1, offset)
    return offset
  }

  /**
   * Parses a block value from the source
   *
   * Accepted forms are:
   * ```
   * BS
   * block
   * lines
   *
   * BS #comment
   * block
   * lines
   * ```
   * where the block style BS matches the regexp `[|>][-+1-9]*` and block lines
   * are empty or have an indent level greater than `indent`.
   *
   * @param {ParseContext} context
   * @param {number} start - Index of first character
   * @returns {number} - Index of the character after this block
   */
  parse(context, start) {
    this.context = context
    trace: 'block-start', context.pretty, { start }
    const { src } = context
    let offset = this.parseBlockHeader(start)
    offset = Node.endOfWhiteSpace(src, offset)
    offset = this.parseComment(offset)
    offset = this.parseBlockValue(offset)
    trace: this.type,
      {
        style: this.blockStyle,
        valueRange: this.valueRange,
        comment: this.comment
      },
      JSON.stringify(this.rawValue)
    return offset
  }

  setOrigRanges(cr, offset) {
    offset = super.setOrigRanges(cr, offset)
    return this.header ? this.header.setOrigRange(cr, offset) : offset
  }
}
