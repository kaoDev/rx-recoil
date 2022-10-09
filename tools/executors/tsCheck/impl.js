'use strict'
var __awaiter =
	(this && this.__awaiter) ||
	function (thisArg, _arguments, P, generator) {
		function adopt(value) {
			return value instanceof P
				? value
				: new P(function (resolve) {
						resolve(value)
				  })
		}
		return new (P || (P = Promise))(function (resolve, reject) {
			function fulfilled(value) {
				try {
					step(generator.next(value))
				} catch (e) {
					reject(e)
				}
			}
			function rejected(value) {
				try {
					step(generator['throw'](value))
				} catch (e) {
					reject(e)
				}
			}
			function step(result) {
				result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected)
			}
			step((generator = generator.apply(thisArg, _arguments || [])).next())
		})
	}
var __generator =
	(this && this.__generator) ||
	function (thisArg, body) {
		var _ = {
				label: 0,
				sent: function () {
					if (t[0] & 1) throw t[1]
					return t[1]
				},
				trys: [],
				ops: [],
			},
			f,
			y,
			t,
			g
		return (
			(g = { next: verb(0), throw: verb(1), return: verb(2) }),
			typeof Symbol === 'function' &&
				(g[Symbol.iterator] = function () {
					return this
				}),
			g
		)
		function verb(n) {
			return function (v) {
				return step([n, v])
			}
		}
		function step(op) {
			if (f) throw new TypeError('Generator is already executing.')
			while (_)
				try {
					if (
						((f = 1),
						y &&
							(t =
								op[0] & 2
									? y['return']
									: op[0]
									? y['throw'] || ((t = y['return']) && t.call(y), 0)
									: y.next) &&
							!(t = t.call(y, op[1])).done)
					)
						return t
					if (((y = 0), t)) op = [op[0] & 2, t.value]
					switch (op[0]) {
						case 0:
						case 1:
							t = op
							break
						case 4:
							_.label++
							return { value: op[1], done: false }
						case 5:
							_.label++
							y = op[1]
							op = [0]
							continue
						case 7:
							op = _.ops.pop()
							_.trys.pop()
							continue
						default:
							if (
								!((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
								(op[0] === 6 || op[0] === 2)
							) {
								_ = 0
								continue
							}
							if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
								_.label = op[1]
								break
							}
							if (op[0] === 6 && _.label < t[1]) {
								_.label = t[1]
								t = op
								break
							}
							if (t && _.label < t[2]) {
								_.label = t[2]
								_.ops.push(op)
								break
							}
							if (t[2]) _.ops.pop()
							_.trys.pop()
							continue
					}
					op = body.call(thisArg, _)
				} catch (e) {
					op = [6, e]
					y = 0
				} finally {
					f = t = 0
				}
			if (op[0] & 5) throw op[1]
			return { value: op[0] ? op[1] : void 0, done: true }
		}
	}
exports.__esModule = true
var package_manager_1 = require('@nrwl/tao/src/shared/package-manager')
var child_process_1 = require('child_process')
var fs_1 = require('fs')
function tscExecutor(_options, context) {
	return __awaiter(this, void 0, void 0, function () {
		var packageManagerCmd,
			libRoot,
			tsConfigAppExists,
			tsConfigLibExists,
			tsConfigSpecExists,
			tsConfigs,
			executionCodes
		return __generator(this, function (_a) {
			switch (_a.label) {
				case 0:
					packageManagerCmd = 'npx'
					if (!context.projectName) {
						throw new Error('Project name is required')
					}
					libRoot = context.workspace.projects[context.projectName].root
					tsConfigAppExists = (0, fs_1.existsSync)(''.concat(libRoot, '/tsconfig.app.json'))
					tsConfigLibExists = (0, fs_1.existsSync)(''.concat(libRoot, '/tsconfig.lib.json'))
					tsConfigs = [
						tsConfigAppExists ? 'tsconfig.app.json' : null,
						tsConfigLibExists ? 'tsconfig.lib.json' : null,
					].filter(Boolean)
					return [
						4 /*yield*/,
						Promise.all(
							tsConfigs.map(function (configFile) {
								return new Promise(function (resolve) {
									var child = (0, child_process_1.spawn)(
										packageManagerCmd,
										['tsc', '-p', ''.concat(libRoot, '/').concat(configFile), '--noEmit'],
										{
											stdio: 'inherit',
										},
									)
									child.on('data', function (args) {
										return console.log(args)
									})
									child.on('close', function (code) {
										return resolve(code)
									})
								})
							}),
						),
					]
				case 1:
					executionCodes = _a.sent()
					return [
						2 /*return*/,
						{
							success: executionCodes.every(function (code) {
								return code === 0
							}),
						},
					]
			}
		})
	})
}
exports['default'] = tscExecutor
