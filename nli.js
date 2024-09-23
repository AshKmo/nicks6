const fs = require('fs');

// prints its arguments to the console and returns the last one
function tee(...x) {
	console.log(...x);
	return x.at(-1);
}

// all data types of all objects
const types = {
	token: {
		BRACKET: 0,
		SPECIAL: 1,
		OPERATOR: 2,
		WORD: 3,
		NUMBER: 4, // final
		STRING: 5, // final
		NULL: 6 // final
	},

	branch: {
		COMBINATION: 7,
		APPLICATION: 8,
		FUNCTION: 9,
		LIST: 10,
		DICTIONARY: 11,
		EXPRESSION: 12
	},

	element: {
		CLOSURE: 13, // final
		LIST: 14, // final
		DICTIONARY: 15 // final
	}
};

const fraction = {
	gcd: (a, b) => b ? fraction.gcd(b, a % b) : a,

	simplify: (n, d) => {
		const g = Math.abs(fraction.gcd(n, d), 0) || 1;
		return [n / g, d / g];
	},

	debool: x => ({ type: types.token.NUMBER, val: [+!!x, 1] }),

	deint: x => ({ type: types.token.NUMBER, val: [x, 1] }),

	operate: (op, a, b) => {
		switch (op) {
			case '*':
				{
					const f1 = fraction.simplify(a.val[0], b.val[1]);
					const f2 = fraction.simplify(b.val[0], a.val[1]);

					return {
						type: types.token.NUMBER,
						val: [f1[0] * f2[0], f1[1] * f2[1]]
					};
				};
				break;
			case '/':
				return fraction.operate('*', a, { ...b, val: [b.val[1], b.val[0]] });
			case '+':
				return {
					type: types.token.NUMBER,
					val: fraction.simplify(a.val[0] * b.val[1] + b.val[0] * a.val[1], a.val[1] * b.val[1])
				};
			case '-':
				return fraction.operate('+', a, { ...b, val: [-b.val[0], b.val[1]] });
			case '=':
				return fraction.debool(a.val[0] === b.val[0] && a.val[1] === b.val[1]);
			case '<':
				return fraction.debool(a.val[0] * b.val[1] < b.val[0] * a.val[1]);
			case '>':
				return fraction.operate('<', b, a);
			case '<=':
				return fraction.debool(fraction.operate('=', a, b).val[0] || fraction.operate('<', a, b).val[0]);
			case '>=':
				return fraction.operate('<=', b, a);
		}
	}
};

function interpret(script, ctx) {
	const precedence = [['.'], ['.>'], ['/<', '/>'], ['--'], ['++', '..', '//'], ['*', '/'], ['+', '-'], ['<<', '>>'], ['<=', '>=', '<', '>'], ['=', '~='], ['&', '|', '^']];

	function lex(script) {
		let tokens = [];

		let token = "";
		let ctype;

		let i = 0;

		function endToken(type = ctype) {
			ctype = null;

			if (token.length > 0) {
				tokens.push({
					type,
					val: token
				});
			}

			token = "";
		}

		for (; i < script.length; i++) {
			const c = script[i];

			if (c === '#') {
				i++;

				let escaped = false;

				for (; i < script.length; i++) {
					const c = script[i];

					if (c === '\\') {
						escaped = true;
						continue;
					}

					if (c === '#') {
						break;
					}

					escaped = false;
				}

				continue;
			}

			if (c === '"') {
				endToken();

				i++;

				let str = "";

				let escaped = false;

				for (; i < script.length; i++) {
					const c = script[i];

					if (!escaped && c === '\\') {
						escaped = true;
						continue;
					}

					if (!escaped && c === '"') {
						break;
					}

					if (escaped) {
						switch (c) {
							case 'n':
								str += '\n';
								break;
							case 't':
								str += '\t';
								break;
							default:
								str += c;
						}
					} else {
						str += c;
					}

					escaped = false
				}

				tokens.push({
					type: types.token.STRING,
					val: Buffer.from(str, 'utf8')
				});

				continue;
			}

			switch (c) {
				case ' ':
				case '\t':
				case '\r':
				case '\n':
					endToken();
					break;

				case '(':
				case ')':
				case '[':
				case ']':
				case '{':
				case '}':
					endToken();
					tokens.push({
						type: types.token.BRACKET,
						val: c
					});
					break;

				case '\\':
				case ':':
				case ',':
					endToken();
					tokens.push({
						type: types.token.SPECIAL,
						val: c
					});
					break;

				case '_':
					endToken();
					tokens.push({ type: types.token.NULL });
					break;

				case '@':
					endToken();
					tokens.push({
						type: types.token.NUMBER,
						val: [1, 0]
					});
					break;

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
					{
						// this could be done better such that it is less likely to go over the integer limit
						endToken();

						let ns = "";
						let dec;

						for (; i < script.length; i++) {
							const c = script[i];
							const v = c.charCodeAt(0);

							if (c === '.' && dec == null) {
								dec = i;
								continue;
							}

							if (48 <= v && v <= 57) {
								ns += c;
								continue;
							}

							if (c === '_') {
								continue;
							}

							break;
						}

						i--;

						let num = parseInt(ns);
						let denom = dec == null ? 1 : 10**(i - dec);

						[num, denom] = fraction.simplify(num, denom);

						tokens.push({
							type: types.token.NUMBER,
							val: [num, denom]
						});

						if (dec === i) {
							i--;
						}
					};
					break;

				case '+':
				case '-':
				case '*':
				case '/':
				case '<':
				case '>':
				case '=':
				case '.':
				case '~':
				case '&':
				case '|':
				case '^':
					if (ctype !== types.token.OPERATOR) {
						endToken();
						ctype = types.token.OPERATOR;
					}

					token += c;
					break;

				default:
					if (ctype !== types.token.WORD) {
						endToken();
						ctype = types.token.WORD;
					}

					token += c;
					break;
			}
		}

		return tokens;
	}

	function parse(tokens) {
		function plist(i) {
			let v = [];

			while (i < tokens.length) {
				let o;
				[o, i] = pexp(i);

				const endBracket = tokens[i].type === types.token.BRACKET && tokens[i].val === ']';

				if (endBracket && o.type === types.token.NULL) {
					break;
				}

				v.push(o);

				if (endBracket) {
					break;
				}

				i++;
			}

			return [{
				type: types.branch.LIST,
				val: v
			}, i];
		}

		function pdict(i) {
			let v = [];

			while (i < tokens.length) {
				let keyElement;
				[keyElement, i] = pexp(i);
				const key = keyElement.val;

				if (key.type === types.token.NULL && tokens[i].type === types.token.BRACKET && tokens[i].val === '}') {
					break;
				}

				if (tokens[i].type === types.token.SPECIAL && tokens[i].val === ',' || tokens[i].type === types.token.BRACKET && tokens[i].val === '}') {
					v.push([key, keyElement]);
					if (tokens[i].type === types.token.BRACKET && tokens[i].val === '}') {
						break;
					}
					i++;
					continue;
				}

				i++;

				let val;
				[val, i] = pexp(i);

				v.push([key, val]);

				if (tokens[i].type === types.token.BRACKET && tokens[i].val === '}') {
					break;
				}

				i++;
			}

			return [{
				type: types.branch.DICTIONARY,
				val: v
			}, i];
		}

		function pexp(i) {
			let branches = [];

			for (; i < tokens.length; i++) {
				const t = tokens[i];

				if ((t.type === types.token.BRACKET || t.type === types.token.SPECIAL) && [')', ']', '}', ',', ':'].includes(t.val)) {
					break;
				}

				switch (t.type) {
					case types.token.BRACKET:
						{
							let r;

							switch (t.val) {
								case '(':
									[r, i] = pexp(i + 1);
									break;
								case '[':
									[r, i] = plist(i + 1);
									break;
								case '{':
									[r, i] = pdict(i + 1);
									break;
							}

							branches.push(r);
						};
						break;
					case types.token.SPECIAL:
						switch (t.val) {
							case '\\':
								{
									i++;

									const variable = tokens[i].type === types.token.WORD ? tokens[i].val : null;

									let expression;
									[expression, i] = pexp(i + 1);
									i--;

									branches.push({
										type: types.branch.FUNCTION,
										val: {
											variable,
											expression
										}
									});
								};
								break;
						}
						break;
					default:
						branches.push(t);
				}
			}

			for (const ops of precedence) {
				for (let x = 1; x < branches.length; x++) {
					if (branches[x].type === types.token.OPERATOR) {
						const op = branches[x].val;

						if (ops.includes(op)) {
							const a = branches.splice(x - 1, 1)[0];
							const b = branches.splice(x, 1)[0];

							x--;

							branches[x] = {
								type: types.branch.COMBINATION,
								val: {
									op,
									a,
									b
								}
							};
						}
					} else if (branches[x - 1].type !== types.token.OPERATOR) {
						const a = branches.splice(x - 1, 1)[0];
						x--;
						const b = branches[x];

						branches[x] = {
							type: types.branch.APPLICATION,
							val: {
								a,
								b
							}
						};
					}
				}
			}

			return [{
				type: types.branch.EXPRESSION,
				val: branches[0] || { type: types.token.NULL }
			}, i];
		}

		return pexp(0)[0];
	}

	function evaluate(branch, ctx = {}) {
		switch (branch.type) {
			case types.branch.EXPRESSION:
				return evaluate(branch.val, ctx);
			case types.branch.COMBINATION:
				switch (branch.val.op) {
					case '.':
						{
							const a = evaluate(branch.val.a, ctx);

							let k;

							if (branch.val.b.type === types.token.WORD) {
								k = branch.val.b.val;
							} else {
								const b = evaluate(branch.val.b, ctx);

								switch (b.type) {
									case types.token.NUMBER:
										k = b.val[0];
										break;
									case types.token.STRING:
										k = b.val.toString('utf8');
								}
							}

							if (a.type === types.token.STRING) {
								if (!a.val[k]) {
									return { type: types.token.NULL };
								}

								return {
									type: types.token.STRING,
									val: a.val.slice(k, k + 1)
								};
							}

							return a.val[k] || { type: types.token.NULL };
						};
						break;

					case '..':
						return {
							type: types.token.STRING,
							val: Buffer.concat([evaluate(branch.val.a, ctx).val, evaluate(branch.val.b, ctx).val])
						};
					case '++':
						return {
							type: types.element.LIST,
							val: [...evaluate(branch.val.a, ctx).val, ...evaluate(branch.val.b, ctx).val]
						};
					case '//':
						return {
							type: types.element.DICTIONARY,
							val: { ...evaluate(branch.val.a, ctx), ...evaluate(branch.val.b, ctx) }
						};
					case '--':
						return fraction.operate('-', fraction.deint(evaluate(branch.val.a, ctx).val.length), evaluate(branch.val.b, ctx));

					case '.>':
						{
							const a = evaluate(branch.val.a, ctx);
							const f = evaluate(branch.val.b, ctx).val;

							if (a.type === types.element.DICTIONARY) {
								return {
									type: types.element.LIST,
									val: Object.keys(evaluate(branch.val.a, ctx).val).sort().map(x => f({
										type: types.token.STRING,
										val: Buffer.from(x)
									}))
								};
							}

							if (a.type === types.element.LIST) {
								return {
									type: types.element.LIST,
									val: a.val.map(x => f(x))
								};
							}
						};
						break;

					case '/<':
					case '/>':
						{
							const left = branch.val.op === '/<';
							const s = evaluate(branch.val.a, ctx).val;
							const n = evaluate(branch.val.b, ctx).val[0];

							return {
								type: types.token.STRING,
								val: s.subarray(left ? 0 : n, s.length - (left ? n : 0))
							};
						};

					case '<<':
					case '>>':
						{
							const left = branch.val.op === '<<';
							const a = evaluate(branch.val.a, ctx);
							const n = evaluate(branch.val.b, ctx).val[0];
							const ni = Math.floor(n / 8);
							const nr = n % 8;

							const res = Buffer.alloc(a.val.length);

							for (let i = 0; i < a.val.length; i++) {
								const source = left ? a.val.length - i - 1 : i;
								const dest = left ? source - ni : source + ni;
								if (dest > a.val.length || dest < 0) {
									break;
								}
								res[dest] = a.val[source];
							}

							let carry = 0;
							for (let i = 0; i < a.val.length; i++) {
								const p = left ? a.val.length - i - 1 : i;
								const v = res[p];
								res[p] = left ? res[p] << nr : res[p] >> nr;
								res[p] |= carry;
								carry = left ? v >> 8 - nr : v << 8 - nr;
							}

							return {
								type: types.token.STRING,
								val: res
							};
						};

					case '&':
					case '|':
					case '^':
						{
							const a = evaluate(branch.val.a, ctx).val;
							const b = evaluate(branch.val.b, ctx).val;
							const op = branch.val.op;

							const res = Buffer.alloc(a.length);

							for (let i = 0; i < a.length; i++) {
								res[i] = op === '&' ? a[i] & b[i] : op === '|' ? a[i] | b[i] : a[i] ^ b[i];
							}

							return {
								type: types.token.STRING,
								val: res
							};
						};
						break;

					case '+':
					case '-':
					case '*':
					case '/':
					case '<':
					case '>':
					case '<=':
					case '>=':
						return fraction.operate(branch.val.op, evaluate(branch.val.a, ctx), evaluate(branch.val.b, ctx));
					case '~=':
						return fraction.debool(evaluate(branch.val.a, ctx).type === evaluate(branch.val.b, ctx).type)
					case '=':
						return {
							type: types.token.NUMBER,
							val: [+(() => {
								const a = evaluate(branch.val.a, ctx);
								const b = evaluate(branch.val.b, ctx);

								if (a.type !== b.type) {
									return false;
								}

								switch (a.type) {
									case types.token.STRING:
										return a.val === b.val;
									case types.token.NUMBER:
										return fraction.operate('=', a, b).val[0];
									default:
										return false;
								}
							})(), 1]
						};
				}
				break;
			case types.branch.APPLICATION:
				return evaluate(branch.val.a, ctx).val(evaluate(branch.val.b, ctx));
			case types.branch.FUNCTION:
				{
					return {
						type: types.element.CLOSURE,
						val: x => {
							let newCtx = ctx;

							if (branch.val.variable) {
								newCtx = { ...ctx, [branch.val.variable]: x };
							}

							return evaluate(branch.val.expression, newCtx);
						}
					};
				};
			case types.token.WORD:
				return ctx[branch.val] || { type: types.token.NULL };
			case types.branch.DICTIONARY:
				{
					const res = {};

					for (const e of branch.val) {
						if (e[0].type === types.token.WORD) {
							res[e[0].val] = evaluate(e[1], ctx);
							continue;
						}

						res[evaluate(e[0], ctx).val.toString('utf8')] = evaluate(e[1], ctx);
					}

					return {
						type: types.element.DICTIONARY,
						val: res
					};
				};
				break;
			case types.branch.LIST:
				{
					const res = [];

					for (const e of branch.val) {
						res.push(evaluate(e, ctx));
					}

					return {
						type: types.element.LIST,
						val: res
					};
				};
				break;
			default:
				return branch;
		}
	}

	const tokens = lex(script);
	//console.log("TOKENS");
	//console.dir(tokens, { depth: null });

	const tree = parse(tokens);
	//console.log("TREE");
	//console.dir(tree, { depth: null });

	return evaluate(tree, ctx);
}

// turn an object into a pretty printed string
function pretty(v, tab = 0) {
	let res = "";

	switch (v.type) {
		case types.token.NUMBER:
			res = v.val[1] === 1 ? v.val[0].toString() : `${v.val[0]} / ${v.val[1]}`;
			break;
		case types.token.STRING:
			res = `"${v.val.toString("utf8").replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\t', '\\t')}"`;
			break;
		case types.token.NULL:
			res = `_`;
			break;
		case types.element.DICTIONARY:
			{
				res = '{\n';
				const tabs = new Array(tab + 1).join('\t');
				for (const key in v.val) {
					res += tabs + '\t';
					res += pretty({ type: types.token.STRING, val: Buffer.from(key, "utf8") }, tab);
					res += ': ';
					res += pretty(v.val[key], tab + 1);
					res += ',\n';
				}
				res += tabs + '}';
			};
			break;
		case types.element.LIST:
			res = `[${v.val.map(x => pretty(x, tab)).join(', ')}]`;
			break;
		case types.element.CLOSURE:
			res = `(\\x)`;
			break;
		default:
			res = '(# UNKNOWN #)';
	}

	return res;
}

const script = fs.readFileSync(process.argv[2]).toString();

const res = interpret(script, {
	TEE: {
		type: types.element.CLOSURE,
		val: x => (console.log(x), x)
	},
	
	// for JSON compatibility
	//"true": fraction.debool(true),
	//"false": fraction.debool(false),
	//"null": { type: types.token.NULL },
});

console.log(res);
console.log();
console.log(pretty(res));
