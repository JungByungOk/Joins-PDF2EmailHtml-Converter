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
        const projectRoot = path.resolve(__dirname);

        // 1. sharp + 런타임 의존성 복사
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

        // 2. 불필요한 Electron DLL 삭제 (~20MB 절감)
        const appRoot = path.resolve(buildPath, '..', '..');
        const deleteFiles = [
          'vk_swiftshader.dll',       // Vulkan 소프트웨어 렌더러 (5MB)
          'vk_swiftshader_icd.json',  // Vulkan 설정
          'vulkan-1.dll',             // Vulkan 런타임 로더 (925KB)
          'd3dcompiler_47.dll',       // DirectX 컴파일러 (4.7MB)
          'libGLESv2.dll',            // OpenGL ES (7.5MB)
          'libEGL.dll',               // EGL
          'LICENSES.chromium.html',   // 라이센스 파일
        ];
        for (const file of deleteFiles) {
          const fp = path.join(appRoot, file);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }

        // 3. 불필요한 로케일 제거 — en-US, ko만 유지 (~35MB 절감)
        const localesDir = path.join(appRoot, 'locales');
        const keepLocales = new Set(['en-US.pak', 'ko.pak']);
        if (fs.existsSync(localesDir)) {
          for (const file of fs.readdirSync(localesDir)) {
            if (!keepLocales.has(file)) {
              fs.unlinkSync(path.join(localesDir, file));
            }
          }
        }

        // 4. node_modules 내 불필요한 개발/문서 파일 정리 (~444KB 절감)
        const cleanPatterns = [/\.md$/i, /\.d\.ts$/, /CHANGELOG/i, /\.cc$/, /\.h$/, /\.gyp$/];
        const cleanDirs = ['src', 'install'].map(d => path.join(buildPath, 'node_modules', 'sharp', d));
        for (const dir of cleanDirs) {
          if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        }
        const nmDir = path.join(buildPath, 'node_modules');
        if (fs.existsSync(nmDir)) {
          const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const fp = path.join(dir, entry.name);
              if (entry.isDirectory()) walk(fp);
              else if (cleanPatterns.some(p => p.test(entry.name))) {
                fs.unlinkSync(fp);
              }
            }
          };
          walk(nmDir);
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
