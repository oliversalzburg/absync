// jscs:disable requireNamedUnassignedFunctions
"use strict";

describe( "absync", function() {
	var $httpBackend;
	var $rootScope;
	var devices;

	beforeEach( function() {
		angular
			.module( "test", [] )
			.config( function( _absyncProvider_ ) {
				var serviceDefinition = {
					model          : "Device",
					collectionName : "devices",
					collectionUri  : "/api/devices",
					entityName     : "device",
					entityUri      : "/api/device",
					debug          : true
				};

				_absyncProvider_.collection( "devices", serviceDefinition );
			} )
			.constant( "Device", {} );


		module( "absync", "test" );
	} );

	beforeEach( inject( function( _$httpBackend_, _$rootScope_ ) {
		$httpBackend = _$httpBackend_;
		$rootScope   = _$rootScope_;

		$httpBackend
			.when( "GET", "/api/devices" )
			.respond( {
				devices : [ {
					id   : 1,
					name : "My Device"
				} ]
			} );
	} ) );

	beforeEach( inject( function( _devices_ ) {
		devices = _devices_;
	} ) );

	it( "should construct a caching service", function() {
		expect( devices ).to.be.an( "object" );
	} );

	it( "should load a collection", function() {
		devices.ensureLoaded();
		$httpBackend.flush();
		expect( devices.entityCache ).to.be.an( "array" ).with.length( 1 );
	} );

	it( "should provide an entity", function( done ) {
		devices.ensureLoaded();
		$httpBackend.flush();
		devices.read( 1 )
			.then( function( device ) {
				expect( device ).to.be.an( "object" ).with.property( "name" ).that.equals( "My Device" );
			} )
			.then( done )
			.catch( done );
		$rootScope.$digest();
	} );
} );
