![](doc/logo.png)

[![Build Status](https://travis-ci.org/oliversalzburg/absync.svg?branch=master)](https://travis-ci.org/oliversalzburg/absync)
[![Coverage Status](https://coveralls.io/repos/github/oliversalzburg/absync/badge.svg?branch=master)](https://coveralls.io/github/oliversalzburg/absync?branch=master)

## 2.0 Notice
2.0 no longer includes the backend data sanitation part that 1.0 provided.

If you still require that functionality, you can rely on the 1.0 code, or have a look at [sanitizr](https://github.com/oliversalzburg/sanitizr).

## Overview

absync is a tool to synchronize data pools in Angular applications.

## Concept
absync lets you construct caching services for entities. These entities are expected to be retrievable through REST API
endpoints. The absync caching services will initially attempt to retrieve the collection of the entity and populate the
internal cache.

When the service is instructed to retrieve an entity, it will first check the cache for the entity and, if the entity
isn't found, request it from the REST API and cache the result.

absync can also connect with the backend via socket.io websockets. In that scenario, it expects entities to be emitted
from the websocket.  
If you have a collection named "devices" where the entity is named "device", absync would expect an event named "device"
with the device entity as the payload. absync will then update the cache and emit `entityNew` and `entityUpdated` events
as appropriate.

Entity deletions are signaled by a payload that contains **only** the ID of the entity. absync will then emit an
`entityRemoved` event.

## Usage
1. Configure absync in your Angular app:

	```js
	angular.module( "app", [ "absync" ] )
		.config( configure );
	
	/* @ngInject */
	function configure( absyncProvider ) {
		// io is expected to be the global socket.io instance.
		absyncProvider.configure( io );
	}
	```

2. Construct caching services in Angular to hold the data:

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
