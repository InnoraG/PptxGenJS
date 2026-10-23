/**
 * PptxGenJS: UnicodeMath (linear format) build-up
 *
 * Converts the common subset of UnicodeMath linear format into the equation
 * template tree rendered by gen-equations, so `COP=Q_h/W` becomes a native
 * fraction with a subscripted numerator instead of one literal math run.
 *
 * Supported: subscripts `_`, superscripts `^` (and both together), fractions
 * `/` (numerator and denominator are the operands between surrounding
 * operators), radicals `√x` / `√(n&x)`, n-ary operators `∑ ∏ ∫ …` with limits,
 * bracket groups `( ) [ ] { } | |`, and invisible grouping `〖 〗`. Parentheses
 * that only delimit a script or fraction operand are removed, as in
 * PowerPoint's own build-up. Anything else stays as literal math text.
 */

import { EquationTemplate } from './core-interfaces'

type Node = EquationTemplate

const OPEN_TO_CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}', '〖': '〗', '⟨': '⟩', '⌊': '⌋', '⌈': '⌉' }
const CLOSERS = new Set(Object.values(OPEN_TO_CLOSE))
const NARY = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '∯', '∰', '⋀', '⋁', '⋂', '⋃', '⨀', '⨁', '⨂'])
const INTEGRALS = new Set(['∫', '∬', '∭', '∮', '∯', '∰'])
// Binary/relational operators and separators end a fraction operand.
const OPERATORS = new Set([
	'=', '+', '-', '−', '±', '∓', '×', '·', '⋅', '∙', '÷', '*', '<', '>', '≤', '≥', '≠', '≈', '≡', '∼', '≃', '≅', '∝',
	'→', '←', '↔', '⇒', '⇐', '⇔', '↦', '∈', '∉', '⊂', '⊃', '⊆', '⊇', '∪', '∩', '∧', '∨', ',', ';', ':', '!', '∘', '⊕', '⊗',
])
const FUNCTION_NAMES = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'deg', 'gcd', 'mod', 'arg', 'dim', 'ker', 'Pr'])

function isDigit(ch: string): boolean {
	return ch >= '0' && ch <= '9'
}

function isSpace(ch: string): boolean {
	return ch === ' ' || ch === ' '
}

function isLetter(ch: string): boolean {
	return ch.toLowerCase() !== ch.toUpperCase()
}

class UnicodeMathParser {
	private readonly chars: string[]
	private index = 0

	constructor(source: string) {
		this.chars = Array.from(source)
	}

	parse(): Node {
		const node = this.expression(new Set())
		// Unmatched closers are kept as literal text rather than dropped.
		const rest: Node[] = []
		while (this.index < this.chars.length) {
			rest.push(this.chars[this.index++])
			const more = this.expression(new Set())
			if (more !== '') rest.push(more)
		}
		return rest.length ? row([node, ...rest]) : node
	}

	private peek(offset = 0): string | undefined {
		return this.chars[this.index + offset]
	}

	/** expression := operand (operator operand)* until a closer in `stop`. */
	private expression(stop: Set<string>): Node {
		const items: Node[] = []
		while (this.index < this.chars.length) {
			const ch = this.peek() as string
			if (stop.has(ch)) break
			if (isSpace(ch)) {
				// Spaces between operands are kept as authored text.
				this.index++
				items.push(ch)
				continue
			}
			if (OPERATORS.has(ch)) {
				this.index++
				items.push(ch)
				continue
			}
			if (CLOSERS.has(ch)) {
				// A stray closer that the caller is not waiting for: literal text.
				if (!stop.size) break
				this.index++
				items.push(ch)
				continue
			}
			const before = this.index
			items.push(this.fractionTerm(stop))
			if (this.index === before) items.push(this.chars[this.index++])
		}
		return row(items)
	}

	/** term := factors ('/' factors)* — UnicodeMath fractions bind tighter than operators. */
	private fractionTerm(stop: Set<string>): Node {
		let numerator = this.factors(stop)
		while (this.peek(this.spacesAhead()) === '/') {
			this.index += this.spacesAhead() + 1
			this.index += this.spacesAhead()
			const denominator = this.factors(stop)
			numerator = { kind: 'fraction', numerator: unwrapOperand(numerator), denominator: unwrapOperand(denominator) }
		}
		return numerator
	}

	private factors(stop: Set<string>): Node {
		const items: Node[] = []
		while (this.index < this.chars.length) {
			const ch = this.peek() as string
			if (stop.has(ch) || ch === '/' || isSpace(ch) || OPERATORS.has(ch)) break
			if (CLOSERS.has(ch)) break
			const before = this.index
			items.push(this.scripted())
			if (this.index === before) break
		}
		return row(items)
	}

	/** factor with optional `_sub` / `^sup` scripts. */
	private scripted(): Node {
		const ch = this.peek() as string
		if (NARY.has(ch)) return this.nary()
		const start = this.index
		const base = this.primary()
		// Scripts on a letter run apply to its last letter (mc^2 is m·c²), unless
		// the run is a function name.
		if ((this.peek() === '_' || this.peek() === '^') && typeof base === 'string' && Array.from(base).length > 1 && isLetter(base[0])) {
			this.index = start + Array.from(base).length - 1
			const lead = this.chars.slice(start, this.index).join('')
			const last = this.chars[this.index++]
			return row([lead, this.attachScripts(last)])
		}
		return this.attachScripts(base)
	}

	private spacesAhead(): number {
		let count = 0
		while (this.peek(count) !== undefined && isSpace(this.peek(count) as string)) count++
		return count
	}

	private attachScripts(base: Node): Node {
		let sub: Node | undefined
		let sup: Node | undefined
		while (this.peek() === '_' || this.peek() === '^') {
			const marker = this.chars[this.index++]
			const arg = this.scriptArgument()
			if ((marker === '_' && sub !== undefined) || (marker === '^' && sup !== undefined)) {
				// A repeated script (x_a_b) nests onto the already-scripted base.
				base = scriptNode(base, sub, sup)
				sub = undefined
				sup = undefined
			}
			if (marker === '_') sub = arg
			else sup = arg
		}
		return scriptNode(base, sub, sup)
	}

	/** Script operand: a bracketed group (parentheses removed), a signed number, or one alphanumeric run. */
	private scriptArgument(): Node {
		const ch = this.peek()
		if (ch === undefined) return ''
		if ((ch === '-' || ch === '−' || ch === '+') && this.peek(1) !== undefined && (isDigit(this.peek(1) as string) || isLetter(this.peek(1) as string))) {
			this.index++
			return row([ch, this.primary()])
		}
		if (ch === '∞') {
			this.index++
			return ch
		}
		return unwrapOperand(this.primary())
	}

	private nary(): Node {
		const symbol = this.chars[this.index++]
		let lower: Node | undefined
		let upper: Node | undefined
		while (this.peek() === '_' || this.peek() === '^') {
			const marker = this.chars[this.index++]
			const arg = this.scriptArgument()
			if (marker === '_') lower = arg
			else upper = arg
		}
		this.index += this.spacesAhead()
		// `▒` (U+2592) explicitly introduces the n-ary body.
		if (this.peek() === '▒') this.index++
		const body = this.index < this.chars.length && !OPERATORS.has(this.peek() as string) && !CLOSERS.has(this.peek() as string) && this.peek() !== '|'
			? unwrapOperand(this.fractionTerm(new Set()))
			: ''
		return {
			kind: 'nary',
			symbol,
			limitLocation: INTEGRALS.has(symbol) ? 'subSup' : 'undOvr',
			...(lower === undefined ? { hideSub: true } : { lower }),
			...(upper === undefined ? { hideSup: true } : { upper }),
			body,
		}
	}

	private primary(): Node {
		const ch = this.peek()
		if (ch === undefined) return ''
		if (OPEN_TO_CLOSE[ch]) return this.group(ch, OPEN_TO_CLOSE[ch])
		if (ch === '|' || ch === '‖') return this.group(ch, ch)
		if (ch === '√' || ch === '∛' || ch === '∜') {
			this.index++
			const degree = ch === '∛' ? '3' : ch === '∜' ? '4' : undefined
			if (this.peek() === '(') {
				const start = this.index
				const group = this.group('(', ')')
				if (typeof group === 'string') return { kind: 'radical', ...(degree ? { degree } : {}), radicand: group }
				// `√(n&x)` is the UnicodeMath form of an n-th root.
				const text = this.chars.slice(start + 1, this.index - 1)
				const ampersand = text.indexOf('&')
				if (ampersand >= 0 && degree === undefined) {
					return {
						kind: 'radical',
						degree: new UnicodeMathParser(text.slice(0, ampersand).join('')).parse(),
						radicand: new UnicodeMathParser(text.slice(ampersand + 1).join('')).parse(),
					}
				}
				return { kind: 'radical', ...(degree ? { degree } : {}), radicand: unwrapOperand(group) }
			}
			return { kind: 'radical', ...(degree ? { degree } : {}), radicand: unwrapOperand(this.attachScripts(this.primary())) }
		}
		if (isDigit(ch) || (ch === '.' && this.peek(1) !== undefined && isDigit(this.peek(1) as string))) {
			let text = ''
			while (this.peek() !== undefined && (isDigit(this.peek() as string) || (this.peek() === '.' && this.peek(1) !== undefined && isDigit(this.peek(1) as string)))) text += this.chars[this.index++]
			return text
		}
		if (isLetter(ch)) {
			let text = ''
			while (this.peek() !== undefined && isLetter(this.peek() as string)) text += this.chars[this.index++]
			if (FUNCTION_NAMES.has(text)) return { kind: 'text', text, italic: false }
			return text
		}
		this.index++
		return ch
	}

	private group(open: string, close: string): Node {
		const start = this.index
		this.index++
		const inner = this.expression(new Set([close]))
		if (this.peek() !== close) {
			// Unbalanced: keep the opener as literal text.
			this.index = start + 1
			return open
		}
		this.index++
		if (open === '〖') return { kind: 'group', items: [inner] }
		return { kind: 'delimiter', left: open, right: close, items: [inner] }
	}
}

function row(items: Node[]): Node {
	const flat: Node[] = []
	for (const item of items) {
		if (item === '' || item === undefined || item === null) continue
		if (typeof item === 'object' && item.kind === 'row' && Array.isArray(item.items)) flat.push(...item.items)
		else flat.push(item)
	}
	// Merge adjacent plain strings so text stays in as few math runs as possible.
	const merged: Node[] = []
	for (const item of flat) {
		const last = merged[merged.length - 1]
		if (typeof item === 'string' && typeof last === 'string') merged[merged.length - 1] = last + item
		else merged.push(item)
	}
	if (merged.length === 0) return ''
	if (merged.length === 1) return merged[0]
	return { kind: 'row', items: merged }
}

/** PowerPoint removes the parentheses that only delimit a script or fraction operand. */
function unwrapOperand(node: Node): Node {
	if (node && typeof node === 'object' && node.kind === 'delimiter' && node.left === '(' && node.right === ')' && Array.isArray(node.items) && node.items.length === 1) return node.items[0]
	if (node && typeof node === 'object' && node.kind === 'group' && Array.isArray(node.items) && node.items.length === 1) return node.items[0]
	return node
}

function scriptNode(base: Node, sub: Node | undefined, sup: Node | undefined): Node {
	if (sub !== undefined && sup !== undefined) return { kind: 'subsup', base, subscript: sub, exponent: sup }
	if (sub !== undefined) return { kind: 'subscript', base, subscript: sub }
	if (sup !== undefined) return { kind: 'superscript', base, exponent: sup }
	return base
}

/**
 * Build up a UnicodeMath linear-format string into an equation template tree.
 * Plain text without build-up operators comes back as the same string.
 */
export function buildUpUnicodeMath(source: string): EquationTemplate {
	return new UnicodeMathParser(String(source ?? '')).parse()
}
