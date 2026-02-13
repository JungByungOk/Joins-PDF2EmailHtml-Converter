const path = require('path');
const fs = require('fs');

/**
 * Recursively copy a directory.
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

module.exports = {
  packagerConfig: {
    asar: {
      unpackDir: 'node_modules/{sharp,@img,color,color-convert,color-name,color-string,simple-swizzle,is-arrayish,detect-libc,semver}',
    },
    name: 'Joins-PDF2Email-Converter',
    icon: path.join(__dirname, 'src', 'assets', 'icon'),
    afterCopy: [
      (buildPath, electronVersion, platform, arch, callback) => {
        // Copy sharp and @img native binaries into the packaged app's node_modules
        const projectRoot = path.resolve(__dirname);
        // sharp + all its dependencies + @img native binaries
        const modules = [
          'sharp', '@img',
          'color', 'color-convert', 'color-name', 'color-string',
          'simple-swizzle', 'is-arrayish',
          'detect-libc', 'semver',
        ];
        for (const mod of modules) {
          const src = path.join(projectRoot, 'node_modules', mod);
          const dest = path.join(buildPath, 'node_modules', mod);
          if (fs.existsSync(src)) {
            copyDirSync(src, dest);
          }
        }
        callback();
      },
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'pdf2email',
        iconUrl: 'file://' + path.join(__dirname, 'src', 'assets', 'icon.ico').replace(/\\/g, '/'),
        setupIcon: path.join(__dirname, 'src', 'assets', 'icon.ico'),
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './src/renderer/index.html',
              js: './src/renderer/renderer.js',
              name: 'main_window',
              preload: {
                js: './src/preload/preload.js',
              },
            },
          ],
        },
      },
    },
  ],
};
