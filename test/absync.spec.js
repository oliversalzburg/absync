// jscs:disable requireNamedUnassignedFunctions
"use strict";

describe( "absync", function() {
	var $httpBackend;
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
					entityUri      : "/api/device"
				};

				_absyncProvider_.collection( "devices", serviceDefinition );
			} )
			.constant( "Device", {} );


		module( "absync", "test" );
	} );

	beforeEach( inject( function( _$httpBackend_ ) {
		$httpBackend = _$httpBackend_;

		$httpBackend
			.when( "GET", "/api/devices" )
			.respond( [ {
				id   : 1,
				name : "My Device"
			} ] );
	} ) );

	beforeEach( inject( function( _devices_ ) {
		devices = _devices_;
	} ) );

	it( "should construct a caching service", function() {
		expect( devices ).to.be.an( "object" );
	} );
} );
