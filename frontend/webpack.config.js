const path = require('path');
const webpack = require('webpack');

module.exports = {
  resolve: {
    // Resolve node.js core modules to browser-safe alternatives
    fallback: {
      buffer: require.resolve('buffer/'),
      process: require.resolve('process/browser'),
      fs: false, // Ignore fs module (since it's not used in the browser)
      path: require.resolve('path-browserify'), // Only include path if it's used
      os: require.resolve('os-browserify/browser'), // Include os-browserify if necessary
    },
  },
  plugins: [
    // Provide global variables for compatibility
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),

    // Ignore 'fs' in the browser build (it’s not needed in the frontend)
    new webpack.IgnorePlugin({
      resourceRegExp: /^fs$/, // Ignore fs module entirely
    }),
  ],
  devServer: {
    // Fix the deprecation warnings by using setupMiddlewares
    setupMiddlewares: (middlewares, devServer) => {
      if (!devServer) {
        throw new Error('webpack-dev-server is not defined');
      }

      // You can add custom middleware here if needed

      // Return the middlewares array as is
      return middlewares;
    },
  },
  // Optional: You can also define your `output` to specify where to place bundled files
  output: {
    path: path.resolve(__dirname, 'dist'), // Adjust output directory as necessary
    filename: 'bundle.js', // Define your desired output filename
  },
};
