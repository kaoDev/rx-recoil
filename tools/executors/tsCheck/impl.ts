import type { ExecutorContext } from '@nrwl/devkit'
import { spawn } from 'child_process'
import { existsSync } from 'fs'

export default async function tscExecutor(
	_options: unknown,
	context: ExecutorContext,
): Promise<{ success: boolean }> {
	const packageManagerCmd = 'npx'

	if (!context.projectName) {
		throw new Error('Project name is required')
	}

	const libRoot = context.workspace.projects[context.projectName].root

	const tsConfigAppExists = existsSync(`${libRoot}/tsconfig.app.json`)
	const tsConfigLibExists = existsSync(`${libRoot}/tsconfig.lib.json`)

	const tsConfigs = [
		tsConfigAppExists ? 'tsconfig.app.json' : null,
		tsConfigLibExists ? 'tsconfig.lib.json' : null,
	].filter(Boolean) as string[]

	const executionCodes = await Promise.all(
		tsConfigs.map((configFile) => {
			return new Promise((resolve) => {
				const child = spawn(
					packageManagerCmd,
					['tsc', '-p', `${libRoot}/${configFile}`, '--noEmit'],
					{
						stdio: 'inherit',
					},
				)
				child.on('data', (args) => console.log(args))
				child.on('close', (code) => resolve(code))
			})
		}),
	)

	return { success: executionCodes.every((code) => code === 0) }
}
