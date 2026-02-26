module.exports = {
  entry: './src/main/main.js',
  module: {
    rules: [
      {
        test: /native_modules[/\\].+\.node$/,
        use: 'node-loader',
      },
      {
        test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
        parser: { amd: false },
        use: {
          loader: '@vercel/webpack-asset-relocator-loader',
          options: {
            outputAssetBase: 'native_modules',
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.json'],
  },
  externals: [
    { sharp: 'commonjs sharp' },
    // @aws-sdk 및 관련 패키지를 번들링하지 않고 런타임 require로 로드
    function ({ request }, callback) {
      if (
        /^@aws-sdk\//.test(request) ||
        /^@smithy\//.test(request) ||
        /^@aws-crypto\//.test(request) ||
        /^@aws\//.test(request) ||
        /^(tslib|fast-xml-parser|strnum|bowser)$/.test(request)
      ) {
        return callback(null, `commonjs ${request}`);
      }
      callback();
    },
  ],
};
