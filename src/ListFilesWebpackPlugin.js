/*
 * @Date: 2019-11-04 10:48:58
 * @LastEditors: guangling
 * @LastEditTime: 2019-11-09 23:06:49
 */

const fs = require('fs')
const url = require('url')
const path = require('path')

const merge = require('lodash.merge');
const keys = require('lodash.keys');
const pick = require('lodash.pick');
const get = require('lodash.get');
const has = require('lodash.has');
const chalk = require('chalk');

const EventEmitter = require('events');

const CompilationAssets = require('./CompilationAssets')

const isMerging = Symbol('isMerging');
const PLUGIN_NAME = 'ListFilesWebpackPlugin';

class ListFilesWebpackPlugin extends EventEmitter {
  constructor(options) {
    super()
    
    options = options || Object.create(null);

    const defaults = {
      output: 'manifest.json',
      replacer: null,
      space: 2,
      writeToDisk: false,
      fileExtRegex: /\.\w{2,4}\.(?:map|gz)$|\.\w+$/i,
      sortManifest: true,
      merge: false,
      publicPath: null,
      customize: null,
      contextRelativeKeys: false,
    };

    this.options = pick(
      merge({}, defaults, options),
      keys(defaults)
    );

    this.assets = options.assets || Object.create(null);
    this.compiler = null;
    this.stats = null;

    [ 'apply', 'moduleAsset', 'processAssets', 'done' ].forEach( key => {
      if ( options[ key ] ) {
        this.on(key, options[ key ]);
      }
    }, this);
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  set(key, value) {
    if (this.isMerging && this.options.merge !== 'customize') {
      this.assets[key] = value;
      return this;
    }

    const originalValue = value;
    value = this.getPublicPath(value);

    if (this.options.customize && typeof this.options.customize === 'function') {
      const custom = this.options.customize(key, value, originalValue, this);

      if (custom === false) {
        return this;
      }

      if (typeof custom === 'object') {
        if (has(custom, 'key')) {
          key = custom.key;
        }

        if (has(custom, 'value')) {
          value = custom.value;
        }
      }
    }

    this.assets[this.fixKey(key)] = value;

    return this;
  }

  getStatsData(stats) {
    if (typeof stats !== 'object') {
      throw new TypeError('stats must be an object');
    }

    return this.stats = stats.toJson('verbose');
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  handleCompilation(compilation) {
    compilation.plugin('module-asset', this.handleModuleAsset.bind(this));
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  handleModuleAsset(module, hashedFile) {
    let key = path.join(path.dirname(hashedFile), path.basename(module.userRequest));

    if (this.options.contextRelativeKeys) {
      key = path.relative(this.compiler.context, module.userRequest);
    }

    this.set(key, hashedFile);

    this.emit('moduleAsset', this, key, hashedFile, module);
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  handleEmit(compilation, callback) {
    if (this.options.contextRelativeKeys) {
      this.processCompilationEntries(compilation);
    }

    this.processAssets(this.getStatsData(compilation.getStats()).assetsByChunkName);

    this.maybeMerge();

    let output = this.inDevServer() ?
      path.basename(this.getOutputPath()) :
      path.relative(this.compiler.outputPath, this.getOutputPath());

    output = compilation.getPath(output, {
      chunk: {
        name: 'manifest'
      },
      filename: 'manifest.json'
    });

    compilation.assets[output] = new CompilationAssets(this);

    callback();
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  maybeMerge() {
    if (this.options.merge) {
      try {
        this[isMerging] = true;

        const data = JSON.parse(fs.readFileSync(this.getOutputPath()));

        for (const key in data) {
          if (!this.has(key)) {
            this.set(key, data[key]);
          }
        }
      } catch (err) { // eslint-disable-line
      } finally {
        delete this[isMerging];
      }
    }
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  inDevServer() {
    if (process.argv.some(arg => arg.includes('webpack-dev-server'))) {
      return true;
    }

    return !!this.compiler && this.compiler.outputFileSystem.constructor.name === 'MemoryFileSystem';
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  getOutputPath() {
    if (!this.compiler) {
      return '';
    }

    if (path.isAbsolute(this.options.output)) {
      return this.options.output;
    }

    if (this.inDevServer()) {
      let outputPath = get(this, 'compiler.options.devServer.outputPath', get(this, 'compiler.outputPath', '/'));

      if (outputPath === '/') {
        console.warn(chalk.cyan('Webpack Assets Manifest: Please use an absolute path in options.output when using webpack-dev-server.'));
        outputPath = get(this, 'compiler.context', process.cwd());
      }

      return path.resolve(outputPath, this.options.output);
    }

    return path.resolve(this.compiler.outputPath, this.options.output);
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  fixKey(key) {
    return key.replace(/\\/g, '/');
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  getPublicPath(filename) {
    const publicPath = this.options.publicPath;

    if (typeof publicPath === 'function') {
      return publicPath(filename, this);
    }

    if (typeof filename === 'string') {
      if (typeof publicPath === 'string') {
        return url.resolve(publicPath, filename);
      }

      if (publicPath === true) {
        return url.resolve(this.compiler.options.output.publicPath, filename);
      }
    }

    return filename;
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  processCompilationEntries(compilation) {
    compilation.entries.forEach(this.processCompilationEntry.bind(this, compilation));
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  processAssets(assets) {
    const keys = Object.keys(assets);
    let index = keys.length;

    while (index--) {
      const name = keys[index];
      let filenames = assets[name];

      if (!Array.isArray(filenames)) {
        filenames = [filenames];
      }

      for (let i = 0, l = filenames.length; i < l; ++i) {
        const filename = name + this.getExtension(filenames[i]);

        this.set(filename, filenames[i]);
      }
    }

    this.emit('processAssets', this, assets);

    return this.assets;
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  getExtension(filename) {
    if (!filename) {
      return '';
    }

    filename = filename.split(/[?#]/)[0];

    if (this.options.fileExtRegex) {
      const ext = filename.match(this.options.fileExtRegex);

      return ext && ext.length ? ext[0] : '';
    }

    return path.extname(filename);
  }

  /**
   * @description: 
   * @param {type} 
   * @return: 
   */
  handleAfterEmit(compilation, callback) {
    if (!this.options.writeToDisk) {
      callback();
      return;
    }

    const output = this.getOutputPath();

    require('mkdirp')(
      path.dirname(output),
      () => {
        fs.writeFile(
          output,
          this.toString(),
          () => {
            callback();
          }
        );
      }
    );
  }


  /**
   * @description: core
   * @param {type} 
   * @return: 
   */
  apply(compiler) {

    this.compiler = compiler;

    console.time('listFiles')
    compiler.plugin('compilation', this.handleCompilation.bind(this));
    compiler.plugin('emit', this.handleEmit.bind(this));
    compiler.plugin('after-emit', this.handleAfterEmit.bind(this));
    compiler.plugin('done', this.emit.bind(this, 'done', this));

    this.emit('apply', this);
    console.timeEnd('listFiles')
  }
}

module.exports = ListFilesWebpackPlugin