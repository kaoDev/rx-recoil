/* eslint-disable */
export default {
	displayName: 'core',
	preset: '../../jest.preset.js',
	transform: {
		'^.+\\.[tj]sx?$': 'ts-jest',
	},
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
	coverageDirectory: '../../coverage/packages/core',
};
