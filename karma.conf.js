// Karma configuration
// Generated on Wed Nov 25 2015 12:07:52 GMT+0100 (W. Europe Standard Time)

module.exports = function( config ) {
	config.set( {

		// Base path that will be used to resolve all patterns (eg. files, exclude)
		basePath : "",

		// Frameworks to use
		// available frameworks: https://npmjs.org/browse/keyword/karma-adapter
		frameworks : [ "mocha", "chai" ],


		// List of files / patterns to load in the browser
		files : [
			"bower_components/angular/angular.js",
			"bower_components/angular-mocks/angular-mocks.js",
			"src/*.js",
			"test/*.spec.js"
		],


		// List of files to exclude
		exclude : [],


		// Preprocess matching files before serving them to the browser
		// available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
		preprocessors : {
			// source files, that you wanna generate coverage for
			// do not include tests or libraries
			// (these files will be instrumented by Istanbul)
			"src/*.js" : [ "coverage" ]
		},


		// Test results reporter to use
		// possible values: 'dots', 'progress'
		// available reporters: https://npmjs.org/browse/keyword/karma-reporter
		reporters : [ "progress", "coverage", "coveralls" ],

		coverageReporter : {
			type : "lcov", // lcov or lcovonly are required for generating lcov.info files
			dir  : "coverage/"
		},


		// Web server port
		port : 9876,


		// Enable / disable colors in the output (reporters and logs)
		colors : true,


		// Level of logging
		// possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
		logLevel : config.LOG_INFO,


		// Enable / disable watching file and executing tests whenever any file changes
		autoWatch : true,


		// Start these browsers
		// available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
		browsers : [ "Chrome", "Firefox", "IE" ],


		// Continuous Integration mode
		// if true, Karma captures browsers, runs the tests and exits
		singleRun : false,

		// Concurrency level
		// how many browser should be started simultaneous
		concurrency : Infinity
	} );
};
