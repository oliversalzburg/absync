var application = require( "./package.json" );
var cached = require( "gulp-cached" );
var concat = require( "gulp-concat" );
var config = require( "./gulp.config.js" );
var del = require( "del" );
var gulp = require( "gulp" );
var install = require( "gulp-install" );
var ngAnnotate = require( "gulp-ng-annotate" );
var order = require( "gulp-order" );
var path = require( "path" );
var remember = require( "gulp-remember" );
var rename = require( "gulp-rename" );
var slug = require( "slug" );
var sourcemaps = require( "gulp-sourcemaps" );
var uglify = require( "gulp-uglify" );
var vinylPaths = require( "vinyl-paths" );

// Remove compiled JS from the output directories.
gulp.task( "clean:js", function() {
	// Take all generated JS files...
	return gulp.src( [
			path.join( config.Output.Development, config.Output.DirectoryNames.Scripts ),
			path.join( config.Output.Production, config.Output.DirectoryNames.Scripts )
		]
	)

		// ...and delete them.
		.pipe( vinylPaths( del ) );
} );
gulp.task( "clean", [ "clean:js" ] );

// Core JS resource builder.
function buildJs() {
	// Construct a stream for the JS sources of our plugin, don't read file contents when compiling TypeScript.
	var sourceStream = gulp.src( config.Sources.Scripts, {
		cwd  : config.WorkingDirectory,
		read : true
	} );

	return sourceStream
		.pipe( order() )
		// Only pass through files that have changed since the last build iteration (relevant during "watch").
		.pipe( cached( path.join( config.Output.Production, config.Output.DirectoryNames.Scripts ) ) )
		// Generate sourcemaps
		.pipe( sourcemaps.init() )
		// Put Angular dependency injection annotation where needed.
		.pipe( ngAnnotate() )
		// Place the results in the development output directory.
		.pipe( gulp.dest( path.join( config.Output.Development, config.Output.DirectoryNames.Scripts ) ) )
		// Pull out files which haven't changed since our last build iteration and put them back into the stream.
		.pipe( remember( path.join( config.Output.Production, config.Output.DirectoryNames.Scripts ) ) )
		// Concatenate all files into a single one.
		.pipe( concat( slug( application.name ) + ".js", { newLine : ";" } ) )
		// Minify the file.
		.pipe( uglify() )
		// Rename it to indicate minification.
		.pipe( rename( { extname : ".min.js" } ) )
		// Write out sourcemaps
		.pipe( sourcemaps.write( "maps" ) )
		// Write the file to the production output directory.
		.pipe( gulp.dest( path.join( config.Output.Production, config.Output.DirectoryNames.Scripts ) ) );
}
// Watch task for JS. Doesn't care about dependencies.
gulp.task( "js:watch", function() {
	return buildJs();
} );
// Build task for JS. Makes sure dependencies are processed.
gulp.task( "js", [ "clean:js", "prepare" ], function() {
	return buildJs();
} );


// Main watch task.
gulp.task( "watch", function() {
	var jsWatcher = gulp.watch( config.Sources.Scripts, { cwd : config.WorkingDirectory }, [ "js:watch" ] );

	function handleChangeEvent( path ) {
		return function( event ) {
			if( event.type === "deleted" ) {
				if( !event.path ) {
					return;
				}
				if( cached.caches.scripts ) {
					delete cached.caches.scripts[ event.path ];
				}
				remember.forget( path, event.path );
			}
		}
	}

	jsWatcher.on( "change", handleChangeEvent( path.join( config.Output.Development, config.Output.DirectoryNames.Scripts ) ) );
} );

// Install all dependencies.
gulp.task( "prepare", function() {
	return gulp.src( [ "bower.json", "package.json" ] )
		.pipe( install() );
} );

// Build everything.
gulp.task( "default", [ "js" ] );
