/* eslint-disable */

export default {
	displayName: 'persistence',
	preset: '../../jest.preset.js',
	transform: {
		'^.+\\.[tj]sx?$': 'ts-jest',
	},
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
	coverageDirectory: '../../coverage/packages/persistence',
};
