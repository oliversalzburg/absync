module.exports = {
	// The base working directory.
	WorkingDirectory : "public",
	// Where are the source files located? Relative to WorkingDirectory.
	Sources          : {
		Scripts : [ "**/*.js", "*.js" ]
	},
	// Where should the output be placed?
	// We generate two sets of outputs, one used during development
	// and one used during production. Which resources are requested through HTML references
	// and which resources are served to the clients, depends on the FairManager run configuration (--dev argument).
	Output           : {
		// The development resources will be placed here. This is relative to the plugin root.
		Development    : "dist/development",
		// The production resources will be placed here. This is relative to the plugin root.
		Production     : "dist/production",
		// The root of the resource directory.
		All            : "dist",
		// The names for the directories into which the outputs will be placed.
		DirectoryNames : {
			Scripts : ""
		}
	}
};
