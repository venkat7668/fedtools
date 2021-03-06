var async = require('async'),
  fs = require('fs'),
  path = require('path'),
  _ = require('underscore'),
  rimraf = require('rimraf'),
  mkdirp = require('mkdirp'),

  log = require('fedtools-logs'),
  cmd = require('fedtools-commands'),
  notifier = require('fedtools-notifier'),
  utilities = require('fedtools-utilities'),

  deprecated = require('./deprecated'),


  gith = utilities.git,

  TYPE_WAR = 'War',
  TYPE_WATCH = 'Watch',
  TYPE_BUILD = 'Build',
  TYPE_SOY = 'Soy',
  TYPE_SERVER = 'Server',
  cwd = process.cwd();

exports.TYPE_WATCH = TYPE_WATCH;
exports.TYPE_BUILD = TYPE_BUILD;
exports.TYPE_WAR = TYPE_WAR;
exports.TYPE_SOY = TYPE_SOY;

exports.TYPE_SERVER = deprecated.TYPE_SERVER;
exports.SERVER_TYPE_SELLECK = deprecated.SERVER_TYPE_SELLECK;
exports.SERVER_TYPE_YUIDOC = deprecated.SERVER_TYPE_YUIDOC;

function _isComponentPath(options, done) {
  var buildPath = (options && options.cwd) ? options.cwd : cwd,
    buildJsonFile = buildPath + '/build.json',
    metaDir = buildPath + '/meta',
    wf2Dir = path.join(buildPath, '/../wf2');

  async.waterfall([

      function (callback) {
        if (!fs.existsSync(buildJsonFile)) {
          callback(1);
        } else {
          callback(null);
        }
      },
      function (callback) {
        if (!fs.existsSync(metaDir)) {
          callback(2);
        } else {
          callback(null);
        }
      },
      function (callback) {
        if (!fs.existsSync(wf2Dir)) {
          callback(3);
        } else {
          callback(null);
        }
      }
    ],
    function (err, data) {
      done(err, data);
    }
  );
}

function _checkAndPromptForComboFlag(shifterJsonFile, shifterCfg, done) {
  var comboFlag,
    COMBO_ENABLED = 'e',
    COMBO_DISABLED = 'd',
    disableMessage = 'Do you want to continue [c], abort [a] or disable it [' +
    COMBO_DISABLED.toUpperCase() + ']?',
    enableMessage = 'Do you want to continue [C], abort [a] or enable it [' +
    COMBO_ENABLED.toLowerCase() + ']?';

  if (shifterCfg['replace-wf2_combine'] === 'true' ||
    shifterCfg['replace-wf2_combine'] === true) {
    comboFlag = true;
    log.warning('With the current configuration, the build WILL use the Combo Loader');
  } else {
    comboFlag = false;
    log.warning('With the current configuration, the build will NOT use the Combo Loader');
  }
  log.echo();

  utilities.promptAndContinue({
    promptType: utilities.PROMPT_PROMPT,
    promptMsg: (comboFlag) ? disableMessage : enableMessage,
    defaultValue: (comboFlag) ? COMBO_DISABLED : 'c',
    validator: function (value) {
      value = value.toLowerCase();
      switch (value) {
      case 'a':
        return false;
      case 'c':
        return true;
      case COMBO_DISABLED:
        shifterCfg['replace-wf2_combine'] = 'false';
        fs.writeFileSync(shifterJsonFile, JSON.stringify(shifterCfg, null, 2));
        return true;
      case COMBO_ENABLED:
        shifterCfg['replace-wf2_combine'] = 'true';
        fs.writeFileSync(shifterJsonFile, JSON.stringify(shifterCfg, null, 2));
        return true;
      default:
        // invalid entry, just display the prompt again
        throw new Error();
      }
    }
  }, function (err, result) {
    if (err) {
      done(err);
    } else {
      if (result) {
        done(null);
      } else {
        log.echo('Bye then...');
        done(-1);
      }
    }
  });
}

function _processWarRequest(options, done) {
  var packageBuilder = require('./wria2-package');

  if (options.remote) {
    packageBuilder.processRemoteCommands(options, done);
  } else {
    packageBuilder.processLocalCommands(options, done);
  }
}

function _full(options, done) {
  var shifterCfg,
    comboFlag,
    wf2srcPath,
    SHIFTER = 'shifter',
    message = (options.type === TYPE_WATCH) ? 'watch' : 'build',
    fullBuild = [],
    fullWatch = [];

  if (!_.isUndefined(options.combo) && _.isBoolean(options.combo)) {
    comboFlag = options.combo;
  }

  fullWatch = [

    function (callback) {
      var cmdline = SHIFTER + ' --watch';
      log.notice('Shifter is going to watch your code...');
      cmd.run(cmdline, {
        pwd: wf2srcPath,
        verbose: true,
        status: false
      }, function (err) {
        if (!err) {
          callback(null);
        } else {
          callback(err);
        }
      });
    }
  ];

  fullBuild = [

    function (callback) {
      var yuiFile = path.join(options.srcPath, 'yui', 'js', 'yui.js');

      if (!fs.existsSync(yuiFile)) {
        log.error('Ooops! It looks like you\'re missing key YUI3 source files!');
        callback(-1);
      } else {
        callback(null);
      }
    },
    function (callback) {
      var shifterJsonFile = options.srcPath + '/.shifter.json';

      if (!fs.existsSync(shifterJsonFile)) {
        log.error('Ooops! It looks like you\'re missing a .shifter.json configuration file!');
        callback(-1);
      } else {
        callback(null, shifterJsonFile);
      }
    },
    function (shifterJsonFile, callback) {
      shifterCfg = JSON.parse(fs.readFileSync(shifterJsonFile, 'utf8'));

      if (options.prompt) {
        _checkAndPromptForComboFlag(shifterJsonFile, shifterCfg, callback);
      } else {
        // no prompt. if comboFlag is set, use it,
        // otherwise, just start the build
        if (_.isBoolean(comboFlag)) {
          shifterCfg['replace-wf2_combine'] = comboFlag.toString();
          fs.writeFileSync(shifterJsonFile, JSON.stringify(shifterCfg, null, 2));
        }
        callback(null);
      }
    },
    function (callback) {
      // need to run npm install in the build directory if needed
      var buildPath = path.join(options.srcPath, '..', '..', 'build');
      utilities.installLocalNpmPackages(buildPath, callback);
    },
    function (callback) {
      rimraf(path.join(options.srcPath, '..', 'build'), callback);
    },
    function (callback) {
      var baseCSStmplPath = path.join(options.srcPath, 'wt2-base-css', 'templates');
      if (!fs.existsSync(baseCSStmplPath)) {
        mkdirp(baseCSStmplPath, callback);
      } else {
        callback(null);
      }
    },
    function (callback) {
      var buildPath = path.join(options.srcPath, '..', '..', 'build', 'lib'),
        cmdline = 'node wf2_prebuild_loader_dependencies.js';
      cmd.run(cmdline, {
        pwd: buildPath,
        verbose: options.verbose,
        status: !options.silent
      }, function (err) {
        if (!err) {
          callback(null);
        } else {
          callback(err);
        }
      });
    },
    function (callback) {
      var buildPath = options.srcPath,
        cmdline = SHIFTER + ' --lint false --csslint false --walk';
      cmd.run(cmdline, {
        pwd: buildPath,
        verbose: options.verbose,
        status: !options.silent
      }, function (err, data) {
        if (!err) {
          callback(null);
        } else {
          callback(err, data);
        }
      });
    },
    function (callback) {
      var buildPath = path.join(options.srcPath, 'wf2'),
        cmdline = SHIFTER + ' --lint false --csslint false';

      if (fs.existsSync(buildPath)) {
        cmd.run(cmdline, {
          pwd: buildPath,
          verbose: options.verbose,
          status: !options.silent
        }, function (err, data) {
          if (!err) {
            callback(null);
          } else {
            callback(err, data);
          }
        });
      } else {
        callback();
      }
    }
  ];

  async.waterfall([

      function (callback) {
        gith.getCurrentBranch({
          cwd: options.srcPath
        }, function (err, branch) {
          if (err) {
            log.error('Unable to find the current branch of the git repository!');
            log.error(err);
            callback(err);
          } else {
            log.info('About to start a full ' + message + ' for branch \'' + branch + '\'');
            callback(null);
          }
        });
      },
      function (callback) {
        utilities.getWF2srcPath({
          cwd: options.srcPath
        }, callback);
      },
      function (srcPath, callback) {
        wf2srcPath = srcPath;
        if (options.type === TYPE_WATCH) {
          async.waterfall(fullWatch, callback);
        } else {
          async.waterfall(fullBuild, callback);
        }
      }
    ],
    function (err, data) {
      done(err, data);
    }
  );
}

function _solo(verbose, silent, options, done) {
  log.debug(options);
  var buildPath = (options && options.cwd) ? options.cwd : cwd,
    wf2Dir = path.join(buildPath, '/../wf2'),
    SHIFTER = 'shifter',
    COMPASS = 'compass',
    message = (options.type === TYPE_WATCH) ? 'watch' : 'build',
    soloBuild = [],
    soloWatch = [];

  soloWatch = [

    function (callback) {
      var cmdline = SHIFTER + ' --watch';
      log.notice('Shifter is going to watch your code...');
      cmd.run(cmdline, {
        verbose: true,
        status: false,
        foreground: (process.platform === 'win32') ? false : true,
        trigger: [{
          onlyOnce: false,
          regex: new RegExp(/build exited with 0/),
          callback: function () {
            var msg = 'Build looks good...';
            log.success(msg);
            notifier.notify({
              message: msg
            });
          }
        }, {
          onlyOnce: false,
          regex: new RegExp(/build failed/),
          callback: function () {
            var msg = 'Ooops build failed...';
            log.error(msg);
            notifier.notify({
              message: msg,
              sound: 'Sosumi'
            });
          }
        }]
      }, function (err) {
        if (!err) {
          callback(null);
        } else {
          callback(err);
        }
      });
    },
    function (callback) {
      var cmdline = 'compass watch';
      log.notice('Compass is going to watch your code...');
      cmd.run(cmdline, {
        verbose: true,
        status: false
      }, function (err) {
        if (!err) {
          callback(null);
        } else {
          callback(err);
        }
      });
    }
  ];

  soloBuild = [

    function (callback) {
      if (options.clean) {
        // user wants to clear CSS cache
        var cmdline = COMPASS + ' clean';
        log.notice('Removing generated CSS files and the SASS cache...');
        cmd.run(cmdline, {
          verbose: verbose,
          status: !silent
        }, function (err, stderr) {
          if (!err) {
            callback(null);
          } else {
            callback(err, stderr);
          }
        });
      } else {
        callback();
      }
    },
    function (callback) {
      // special case for wf2-base-css: we need to bypass the optimization
      // that was introduced for the full build (with md5sum file)
      rimraf(path.join(buildPath, '..', '..', 'build', 'md5sum'), function (err) {
        if (err) {
          log.warning('Unable to remove md5sum... moving on...');
        }
        // continue even in case of error...
        callback();
      });
    },
    function (callback) {
      var cmdline = SHIFTER + ' --lint-stderr';
      log.notice('Running shifter for ' + path.basename(buildPath) + '...');
      cmd.run(cmdline, {
        verbose: verbose,
        status: !silent
      }, function (err, stderr) {
        if (!err) {
          callback(null);
        } else {
          callback(err, stderr);
        }
      });
    },
    function (callback) {
      require('fedtools-notifier').notify({
        message: 'Build was successful',
        sound: 'Glass'
      });

      var msg = 'Do you also want to rebuild wf2 seed ? [y|N]';
      utilities.promptAndContinue({
        promptType: utilities.PROMPT_CONFIRM,
        promptMsg: msg,
        defaultValue: false
      }, function (err, value) {
        if (value) {
          callback();
        } else {
          log.echo('Bye then...');
          callback(-1);
        }
      });
    },
    function (callback) {
      var cmdline = SHIFTER + ' --lint false --csslint false';
      log.notice('Running shifter for wf2 seed ...');
      cmd.run(cmdline, {
        pwd: wf2Dir,
        verbose: verbose,
        status: !silent
      }, function (err, stderr) {
        if (!err) {
          callback(null);
        } else {
          callback(err, stderr);
        }
      });
    }
  ];

  gith.getCurrentBranch({
    cwd: buildPath
  }, function (err, branch) {
    if (err) {
      log.error('Unable to find the current branch of the git repository!');
      log.error(err);
      done(err);
    } else {
      if (options.type === TYPE_BUILD) {
        async.waterfall(soloBuild, done);
      } else {
        log.info('About to ' + message + ' \'' + path.basename(buildPath) +
          '\' on branch \'' + branch + '\'');
        log.echo();

        utilities.promptAndContinue({
          promptType: utilities.PROMPT_CONFIRM,
          promptMsg: 'Continue? [Y|n]',
          defaultValue: true
        }, function (err, answer) {
          if (!answer) {
            log.echo('Bye then!');
            done(-1);
          } else {
            async.parallel(soloWatch, done);
          }
        });
      }
    }
  });
}

function _soy(verbose, silent, options, done) {
  gith.findGitRootPath({
    cwd: (options && options.cwd) ? options.cwd : cwd
  }, function (err, rootPath) {
    if (err) {
      // nothing we can do there...
      log.error('The current path cannot be built. Is it a wria2 path?');
      log.echo();
      done(-1);
    } else {
      var cmdline = 'node wf2_templates.js',
        buildPath = path.join(rootPath, 'build', 'lib');
      log.info('Building all Soy templates...');
      log.echo('Running: ' + cmdline);

      cmd.run(cmdline, {
        pwd: buildPath,
        status: false,
        verbose: true
      }, done);
    }
  });
}

function _run(verbose, options, done) {
  // Depending on where the command is run, we are going to decide if we
  // have to run a full build, or just a single component build.
  var silent = false,
    promptOption,
    runType = TYPE_BUILD;

  if (!_.isUndefined(options.type)) {
    runType = options.type;
  } else {
    options.type = runType;
  }
  if (_.isUndefined(options.prompt)) {
    promptOption = true;
  } else {
    promptOption = options.prompt;
  }

  if (process.platform === 'win32') {
    verbose = true;
    silent = true;
    process.env.PATH = path.join(__dirname, '..', 'node_modules', '.bin') + ';' +
      process.env.PATH;
  } else {
    process.env.PATH = path.join(__dirname, '..', 'node_modules', '.bin') + ':' +
      process.env.PATH;
  }

  async.waterfall([

    function (callback) {
      if (options.type === TYPE_WAR) {
        _processWarRequest(_.extend(options, {
          verbose: verbose,
          silent: silent,
          pkgConfig: options.pkgConfig,
          prompt: _.isBoolean(promptOption) ? promptOption : true
        }), callback);

      } else if (options.type === TYPE_SERVER) {
        deprecated.startServer(verbose, silent, options, callback);
      } else if (options.type === TYPE_SOY) {
        _soy(verbose, silent, options, callback);
      } else {
        _isComponentPath(options, function (err) {
          if (!err) {
            // This is a component path!
            _solo(verbose, silent, options, callback);
          } else {
            // This is not a component path...
            // Can we do a full build instead?
            utilities.getWF2srcPath({
              cwd: (options && options.cwd) ? options.cwd : cwd
            }, function (err, srcPath) {
              if (err) {
                // nothing we can do there...
                log.error('The current path cannot be built. Is it a wria2 path?');
                callback(-1);
              } else {
                _full({
                  type: options.type,
                  verbose: verbose,
                  silent: silent,
                  srcPath: srcPath,
                  prompt: _.isBoolean(promptOption) ? promptOption : true,
                  combo: options.combo
                }, callback);
              }
            });
          }
        });
      }
    }
  ], function (err, data) {
    done(err, data);
  });
}

exports.run = _run;
