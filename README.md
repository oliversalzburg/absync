![](doc/logo.png)

absync is a highly opinionated framework to synchronize data pools in MEAN applications.

It consists of:
- a type modeling tool set that builds on top of [mongoose](http://mongoosejs.com/)
- a transactional layer that builds on top of [socket.io](http://socket.io/)
- a caching service for Angular

One of the key concepts of absync is that model properties can be decorated with permission requirements that affect the data during transaction, which allows you to hide or change properties when the model is transferred between the server and the client (and vice versa).

## Usage
1. Construct domain model and decorate it.

	```js
	var mongoose = require( "mongoose-q" )();
	var Person = require( "./person.js" );
	var Schema = mongoose.Schema;
	var uuid = require( "node-uuid" );
	var TypeDecorator = require( "absync" ).TypeDecorator;
	var typeFactory = require( "absync" ).typeFactory;
	var TypeInfo = require( "absync" ).TypeInfo;
	
	var typeDescription = {
		__v   : { type : Number, select : false },
		guid  : { type : String, default : uuid.v4 },
		owner : { type : Schema.Types.ObjectId, ref : "Person" },
		added : { type : Date, default : Date.now }
	};
	
	new TypeDecorator( typeDescription )
		.decorate( "__v", TypeInfo.USERCLASS_USER, TypeInfo.HIDDEN )
		.decorate( "guid", TypeInfo.USERCLASS_USER, TypeInfo.READ_ONLY )
		.decorate( "added", TypeInfo.USERCLASS_USER, TypeInfo.HIDDEN )
	;
	
	var type = typeFactory.assemble( "Device", "devices", typeDescription );
	
	// Extend schema
	type.schema.pre( "remove", function( next ) {
		// …
	} );
	```
	
	absync supports model inheritance, through [mongoose-schema-extend](https://github.com/briankircho/mongoose-schema-extend):
	
	```js
	var extendedTypeDescription = {
		identifierForVendor : { type : String },
		deviceToken         : { type : String }
	};
	
	new TypeDecorator( extendedTypeDescription )
		.decorate( "identifierForVendor", TypeInfo.USERCLASS_USER, [ TypeInfo.HIDDEN, TypeInfo.READ_ONLY ] )
		.decorate( "deviceToken", TypeInfo.USERCLASS_USER, [ TypeInfo.CONCEALED, TypeInfo.READ_ONLY ] )
	;
	
	var extended = typeFactory.extend( "IosDevice", "Device", extendedTypeDescription );
	```

2. When data changes, use *typehelper* to sanitize inputs and *conductor* to synchronize updates with clients:

	```js
	module.exports.updateDevice = function( request, response ) {
		var device = request.body.device;
		var id = request.params.id;
		return Device.model.findByIdQ( id )
			.then( function( existingDevice ) {
				// Update the model with the sent data and persist it to the database.
				var updatedDeviceData = Device.typehelper.omitReadOnly( device, Device.typeinfo.USERCLASS_USER );
				_.extend( existingDevice, updatedDeviceData );
	
				// Persist the device record.
				return existingDevice.saveQ()
					.then( function( updatedDevice, numberAffected ) {
						// Send HTTP response
						conductor.respondToUser( updatedDevice, Device, response );
						// Push websocket update
						conductor.sendToUsers( updatedDevice, Device );
					} );
			} );
	};
	```

3. Construct caching services in Angular to hold the data:

	```js
	angular
		.module( "devices" )
		.config( registerDevicesService )
		.run( configureService );

	/* @ngInject */
	function registerDevicesService( absyncProvider ) {
		absyncProvider.collection( "devices",
			{
				model          : "Device",
				collectionName : "devices",
				collectionUri  : "/api/devices",
				entityName     : "device",
				entityUri      : "/api/device"
			}
		);
	}

	/* @ngInject */
	function configureService( devices ) {
		// Do something with your absync service
	}
	```

	Services emit `entityNew` and `entityUpdated` events. The data is contained in their `entityCache` member.