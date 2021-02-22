// @ts-check

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import rootPackage from '../package.json';

const __dirname = path.dirname(
  fileURLToPath(
    // @ts-ignore
    import.meta.url
  )
);

const rootPath = path.join(__dirname, '../');
const libsPath = path.join(rootPath, 'libs');

const rootVersion = rootPackage.version;
const rootLicense = rootPackage.license;
const rootAuthor = rootPackage.author;
const rootRepository = rootPackage.repository;

fs.readdirSync(libsPath).forEach((file) => {
  const libraryPacakgePath = path.join(libsPath, file, 'package.json');
  if (
    fs.statSync(path.join(libsPath, file)).isDirectory() &&
    fs.statSync(libraryPacakgePath).isFile()
  ) {
    const libraryPacakge = JSON.parse(
      fs.readFileSync(libraryPacakgePath, 'utf8')
    );
    libraryPacakge.version = rootVersion;
    libraryPacakge.license = rootLicense;
    libraryPacakge.author = rootAuthor;
    libraryPacakge.repository = rootRepository;

    fs.writeFileSync(
      libraryPacakgePath,
      JSON.stringify(libraryPacakge, null, 2) + '\n',
      { encoding: 'utf-8' }
    );
    console.log(`updated version of ${file} to ${rootVersion}`);
  }
});
