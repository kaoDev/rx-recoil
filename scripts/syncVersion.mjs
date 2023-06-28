// @ts-check

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import rootPackage from '../package.json' assert { type: 'json' }

const __dirname = path.dirname(
	fileURLToPath(
		// @ts-ignore
		import.meta.url,
	),
)

const rootPath = path.join(__dirname, '../')
const libsPath = path.join(rootPath, 'packages')

const rootVersion = rootPackage.version
const rootLicense = rootPackage.license
const rootAuthor = rootPackage.author
const rootRepository = rootPackage.repository

fs.readdirSync(libsPath).forEach((file) => {
	try {
		const libraryPackagePath = path.join(libsPath, file, 'package.json')
		if (
			fs.statSync(path.join(libsPath, file)).isDirectory() &&
			fs.statSync(libraryPackagePath).isFile()
		) {
			const libraryPackage = JSON.parse(
				fs.readFileSync(libraryPackagePath, 'utf8'),
			)
			libraryPackage.version = rootVersion
			libraryPackage.license = rootLicense
			libraryPackage.author = rootAuthor
			libraryPackage.repository = rootRepository

			fs.writeFileSync(
				libraryPackagePath,
				JSON.stringify(libraryPackage, null, 2) + '\n',
				{ encoding: 'utf-8' },
			)
			console.log(`updated version of ${file} to ${rootVersion}`)
		}
	} catch (e) {}
})
