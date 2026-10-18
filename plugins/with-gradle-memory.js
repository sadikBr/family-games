/**
 * Gives the Android build (Gradle) more memory. Expo's default (-Xmx2048m, 512 MB metaspace) is too
 * small for this app's native modules (WebRTC, notifications…): builds failed with «Metaspace» in
 * tasks like mergeReleaseJniLibFolders.
 */
const { withGradleProperties } = require('expo/config-plugins');

const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === 'org.gradle.jvmargs'));
    props.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    cfg.modResults = props;
    return cfg;
  });
};
