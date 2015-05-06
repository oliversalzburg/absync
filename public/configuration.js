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
	 * Using this type is entirely optional. Providing a hash with the same configuration options will work just fine.
	 * @param {Object|String} model Reference to a constructor for the model type, or it's name.
	 * If a name is given, absync will try to retrieve instances of the type through injection.
	 * @param {String} collectionUri The REST API URI where the collection can be found.
	 * @param {String} entityUri The REST API URI where single entities out of the collection can be found.
	 * @param {String} [collectionName] The name of the collection. Uses the model name suffixed with "s" by default.
	 * Using the default value is not recommended.
	 * @param {String} [entityName] The name of an entity. Uses the model name by default.
	 * Using the default value is not recommended.
	 * @param {Function} [deserialize] A function that takes an object received from the server and turns it into a model.
	 * By default, absync will just store the raw object without extending it to the model type.
	 * Deserializers operate on the actual data received from the websocket.
	 * @param {Function} [serialize] A function that takes a model and turns it into something the server expects.
	 * By default, absync will just send the complete model.
	 * Serializers operate on a copy of the actual model, which already had complex members reduced to their IDs.
	 * @param {Function} [injector] An injector to use for model instantiation. Uses $injector by default.
	 * Usually, you don't need to provide an alternative here.
	 * @constructor
	 */
	function AbsyncServiceConfiguration( model, collectionUri, entityUri, collectionName, entityName, deserialize, serialize, injector ) {
		this.model = model;
		this.collectionUri = collectionUri;
		this.entityUri = entityUri;

		var _modelName = model.prototype.constructor.name.toLowerCase();
		this.collectionName = collectionName || ( _modelName + "s" );
		this.entityName = entityName || _modelName;

		this.deserialize = deserialize || undefined;
		this.serialize = serialize || undefined;

		this.injector = injector || undefined;
	}

}());
