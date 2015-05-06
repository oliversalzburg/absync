(function( undefined ) {
	"use strict";

	angular
		.module( "absync" )
		.service( "AbsyncServiceConfiguration", AbsyncServiceConfigurationFactory );

	function AbsyncServiceConfigurationFactory() {
		return AbsyncServiceConfiguration;
	}

	/**
	 * Configuration for an absync service.
	 * @param {Object|String} model Reference to a constructor for the model type, or it's name.
	 * If a name is given, absync will try to retrieve instances of the type through injection.
	 * @param {String} collectionUri The REST API URI where the collection can be found.
	 * @param {String} entityUri The REST API URI where single entities out of the collection can be found.
	 * @param {String} [collectionName] The name of the collection. Uses the model name suffixed with "s" by default.
	 * Using the default value is not recommended.
	 * @param {String} [entityName] The name of an entity. Uses the model name by default.
	 * Using the default value is not recommended.
	 * @constructor
	 */
	function AbsyncServiceConfiguration( model, collectionUri, entityUri, collectionName, entityName ) {
		this.model = model;
		this.collectionUri = collectionUri;
		this.entityUri = entityUri;

		var _modelName = model.prototype.toString().toLowerCase();
		this.collectionName = collectionName || ( _modelName + "s" );
		this.entityName = entityName || _modelName;
	}

}());
