// @ts-check
const typescript = require('rollup-plugin-typescript2')

// based on @nrwl/react/plugins/bundle-rollup.js
Object.defineProperty(exports, '__esModule', { value: true })
function getRollupOptions(options) {
	const extraGlobals = {
		react: 'React',
		'react-dom': 'ReactDOM',
		'styled-components': 'styled',
		'@emotion/react': 'emotionReact',
		'@emotion/styled': 'emotionStyled',
	}
	if (Array.isArray(options.output)) {
		options.output.forEach((o) => {
			o.globals = Object.assign(Object.assign({}, o.globals), extraGlobals)
		})
	} else {
		options.output = Object.assign(Object.assign({}, options.output), {
			globals: Object.assign(
				Object.assign({}, options.output.globals),
				extraGlobals,
			),
		})
	}

	options.plugins = options.plugins
		.map((p) => {
			if (p !== 'rpt2') {
				return p
			}

			if (options.output.format === 'esm') {
				return typescript.default({
					tsconfigOverride: {
						compilerOptions: {
							lib: ['es5', 'es6', 'dom'],
							target: 'es2018',
							declaration: true,
							noEmitOnError: true,
						},
					},
				})
			} else {
				return typescript.default({
					tsconfigOverride: {
						compilerOptions: {
							lib: ['es5', 'es6', 'dom'],
							target: 'es5',
							declaration: true,
							noEmitOnError: true,
						},
					},
				})
			}
		})
		.filter((p) => p.name !== 'babel')

	return options
}
module.exports = getRollupOptions
//# sourceMappingURL=bundle-rollup.js.map
