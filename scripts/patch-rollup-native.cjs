// Replaces rollup's native.js with the WASM build from @rollup/wasm-node.
// Required on kernels where the native rollup binding causes SIGBUS (e.g. CachyOS).
// The two files export exactly the same API so this is a safe drop-in replacement.
const fs = require('node:fs');
const path = require('node:path');

const target = path.join(__dirname, '..', 'node_modules', 'rollup', 'dist', 'native.js');

if (!fs.existsSync(target)) {
    console.log('patch-rollup-native: rollup/dist/native.js not found, skipping');
    process.exit(0);
}

fs.writeFileSync(
    target,
    "// Redirected to WASM build by postinstall (avoids native-binding SIGBUS on CachyOS)\nmodule.exports = require('../../@rollup/wasm-node/dist/native.js');\n",
    'utf8'
);

console.log('patch-rollup-native: rollup/dist/native.js → @rollup/wasm-node/dist/native.js');
