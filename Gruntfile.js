/*jshint node:true */

module.exports = function (grunt) {

  var fs = require('fs'),

    historyFile = 'HISTORY.md',
    PUBLISH_COMMIT_MSG = 'Publishing npm release';

  // load plugins
  require('load-grunt-tasks')(grunt);

  // project configuration
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    clean: ['./tmp/*'],

    curl: {
      proxy: {
        src: [{
          url: 'http://registry.npmjs.org/<%=pkg.name%>/-/<%=pkg.name%>-<%=pkg.version%>.tgz',
          proxy: 'http://proxy.wellsfargo.com'
        }],
        dest: './tmp/registry-<%=pkg.name%>-<%=pkg.version%>.tgz'
      },
      noproxy: {
        src: [{
          url: 'http://registry.npmjs.org/<%=pkg.name%>/-/<%=pkg.name%>-<%=pkg.version%>.tgz'
        }],
        dest: './tmp/registry-<%=pkg.name%>-<%=pkg.version%>.tgz'
      }
    },

    copy: {
      main: {
        files: [{
          src: '<%=pkg.name%>-<%=pkg.version%>.tgz',
          dest: 'tmp/local-<%=pkg.name%>-<%=pkg.version%>.tgz'
        }]
      }
    },

    mkdir: {
      all: {
        options: {
          create: ['tmp/local', 'tmp/registry']
        },
      },
    },

    release: {
      options: {
        bump: true,
        add: true,
        commit: true,
        tag: true,
        push: true,
        pushTags: true,
        npm: true,
        commitMessage: PUBLISH_COMMIT_MSG + ' <%= version %>'
      }
    }

  });

  // register running tasks
  grunt.registerTask('default', ['help']);
  grunt.registerTask('publish', ['pre-release', 'test', 'release', 'history']);

  grunt.registerTask('test', 'Run code coverage and unit tests', function () {
    var done = this.async();
    grunt.util.spawn({
      cmd: 'npm',
      args: ['test']
    }, function (err, data) {
      if (!err) {
        grunt.log.write(data);
      }
      done(err);
    });
  });

  grunt.registerTask('pre-release', 'Checking if we can release', function () {
    var done = this.async();
    grunt.util.spawn({
      cmd: 'git',
      args: ['log', '-2', '--pretty=format:"%s"']
    }, function (err, data) {
      if (!err && data.stdout.match(PUBLISH_COMMIT_MSG)) {
        grunt.fail.warn('It looks like it\'s been published already?');
      }
      done(err);
    });
  });

  grunt.registerTask('history', 'Updating ' + historyFile, function () {
    var done = this.async();
    require('fedtools-utilities').git.getChangeLog({
      ignore: ['Publishing npm release', 'Updating HISTORY']
    }, function (err, log) {
      if (!err) {
        fs.writeFileSync(historyFile, log);
        grunt.util.spawn({
          cmd: 'git',
          args: ['add', historyFile]
        }, function (err) {
          if (err) {
            grunt.fail.fatal('Unable to run "git add" ' + err);
            done();
          } else {
            grunt.util.spawn({
              cmd: 'git',
              args: ['commit', '-m', 'Updating HISTORY']
            }, function (err) {
              if (err) {
                grunt.fail.fatal('Unable to run "git commit" ' + err);
                done();
              } else {
                grunt.util.spawn({
                  cmd: 'git',
                  args: ['push']
                }, function (err) {
                  if (err) {
                    grunt.fail.fatal('Unable to run "git push" ' + err);
                  }
                  done();
                });
              }
            });
          }
        });
      }
    });
  });

  grunt.registerTask('pack', 'Create package', function () {
    var done = this.async();
    grunt.log.subhead('Grunt [ ' + this.name.cyan + ' ]');
    grunt.util.spawn({
      cmd: 'npm',
      args: ['pack']
    }, function (err) {
      done(err);
    });
  });

  grunt.registerTask('pack-remove', 'Remove package', function () {
    var version = grunt.config.get('pkg').version,
      name = grunt.config.get('pkg').name;
    grunt.log.subhead('Grunt [ ' + this.name.cyan + ' ]');
    grunt.file.delete(name + '-' + version + '.tgz');
  });

  grunt.registerTask('untar', 'Untar packages', function () {
    var done = this.async(),
      version = grunt.config.get('pkg').version,
      name = grunt.config.get('pkg').name,
      localName = 'local-' + name + '-' + version + '.tgz',
      regName = 'registry-' + name + '-' + version + '.tgz';
    grunt.log.subhead('Grunt [ ' + this.name.cyan + ' ]');
    grunt.util.spawn({
      cmd: 'tar',
      args: ['xzf', regName, '-C', 'registry'],
      opts: {
        cwd: 'tmp'
      }
    }, function () {
      grunt.util.spawn({
        cmd: 'tar',
        args: ['xzf', localName, '-C', 'local'],
        opts: {
          cwd: 'tmp'
        }
      }, function (err) {
        done(err);
      });

    });
  });

  grunt.registerTask('diffd', 'Runs a diffd', function () {
    var done = this.async();
    grunt.log.subhead('Grunt [ ' + this.name.cyan + ' ]');
    grunt.util.spawn({
      cmd: 'diff',
      args: ['-b', '-q', '-r', 'local', 'registry'],
      opts: {
        cwd: 'tmp'
      }
    }, function (err, data) {
      if (data.stdout) {
        console.log('\n', data.stdout);
      }
      done(err);
    });
  });

  // need to check the release
  grunt.registerTask('check', 'Check the release validity', function (env) {
    grunt.log.subhead('Grunt [ ' + this.name.cyan + ' ]');
    grunt.task.run('clean');
    grunt.task.run('mkdir');
    if (env && env === 'noproxy') {
      grunt.task.run('curl:noproxy');
    } else {
      grunt.task.run('curl:proxy');
    }
    grunt.task.run('pack');
    grunt.task.run('copy');
    grunt.task.run('pack-remove');
    grunt.task.run('untar');
    grunt.task.run('diffd');
  });

  grunt.registerTask('help', 'Display help usage', function () {
    grunt.log.subhead('Grunt [ ' + this.name.cyan + ' ]');
    console.log();
    console.log('Type "grunt publish" to:');
    console.log(' - bump the version in package.json file.');
    console.log(' - stage the package.json file\'s change.');
    console.log(' - commit that change.');
    console.log(' - create a new git tag for the release.');
    console.log(' - push the changes out to github.');
    console.log(' - push the new tag out to github.');
    console.log(' - publish the new version to npm.');
    console.log();
    console.log('Type "grunt check" to:');
    console.log(' - check if the newly published package is valid.');
  });
};
