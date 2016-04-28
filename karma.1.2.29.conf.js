module.exports = function( config ) {
	config.set( {
		basePath    : "",
		frameworks  : [ "mocha", "chai" ],
		files       : [
			"bower_components/angular-1.2.29/angular.js",
			"bower_components/angular-mocks-1.2.29/angular-mocks.js",
			"src/*.js",
			"test/*.spec.js"
		],
		reporters   : [ "progress" ],
		port        : 9876,
		colors      : true,
		logLevel    : config.LOG_INFO,
		autoWatch   : true,
		browsers    : [ "Chrome", "Firefox", "IE" ],
		singleRun   : false,
		concurrency : Infinity
	} );
};
