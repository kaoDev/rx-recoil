/* eslint-disable */
export default {
	displayName: 'query',
	preset: '../../jest.preset.js',
	transform: {
		'^.+\\.[tj]sx?$': 'ts-jest',
	},
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
	coverageDirectory: '../../coverage/packages/query',
}
