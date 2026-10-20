/**
 * What the runtime version (the fingerprint that decides which APKs take an over-the-air update)
 * leaves out: the package.json "scripts" (helper commands, nothing native) and .gitignore, so adding
 * a script or ignoring a file never cuts the phones off from updates. See docs: expo.dev/fingerprint
 */
/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['PackageJsonScriptsAll', 'GitIgnore'],
};
