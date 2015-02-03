"use strict";

var _ = require( "lodash" );

var ChangeSet = (function() {
	/**
	 * Construct a new ChangeSet for two instances of a given type.
	 * @constructor
	 */
	function ChangeSet() {
		this.changes = [];
	}

	ChangeSet.prototype.any = function any() {
		return 0 < this.changes.length;
	};

	ChangeSet.prototype.push = function push( change ) {
		this.changes.push( change );
	};

	ChangeSet.TYPE_TYPE = "type";
	ChangeSet.TYPE_TEXTUAL = "textual";
	ChangeSet.TYPE_NUMERIC = "numeric";
	ChangeSet.TYPE_ADDITION = "addition";
	ChangeSet.TYPE_DELETION = "deletion";

	ChangeSet.from = function from( base, head ) {
		var changeSet = new ChangeSet();

		if( typeof base != typeof head ) {
			changeSet.push( { type : ChangeSet.TYPE_TYPE } );
			return changeSet;
		}

		if( typeof base === "string" ) {
			if( base.localeCompare( head ) !== 0 ) {
				changeSet.push( { type : ChangeSet.TYPE_TEXTUAL } );
			}
			return changeSet;
		}

		if( typeof base === "number" ) {
			if( base !== head ) {
				changeSet.push( { type : ChangeSet.TYPE_NUMERIC } );
			}
			return changeSet;
		}

		// Sort keys of base and head.
		var baseKeys = (Array.isArray( base )) ? _.range( base.length ) : Object.keys( base ).sort();
		var headKeys = (Array.isArray( head )) ? _.range( head.length ) : Object.keys( head ).sort();

		var baseIndex = 0, headIndex = 0;
		while( baseIndex < baseKeys.length && headIndex < headKeys.length ) {
			if( baseKeys[ baseIndex ] != headKeys[ headIndex ] ) {
				// Key was deleted from head or head gained a new key.
				// Determine if the change was an addition or a deletion by comparing the keys.
				var next = baseKeys[ baseIndex ].localeCompare( headKeys[ headIndex ] );
				if( 1 === next ) {
					// The property at headIndex would appear before baseIndex.
					// This means it was added to head.
					changeSet.push( { type : ChangeSet.TYPE_ADDITION, key : headKeys[ headIndex ] } );
					++headIndex;
				} else {
					changeSet.push( { type : ChangeSet.TYPE_DELETION, key : baseKeys[ baseIndex ] } );
					++baseIndex;
				}

			} else {
				// Keys exist on both sides, recurse.
				var propertyChanges = ChangeSet.from( base[ baseKeys[ baseIndex ] ], head[ headKeys[ headIndex ] ] );
				if( propertyChanges.changes.length ) {
					changeSet.push( { type : propertyChanges.changes, key : baseKeys[ baseIndex ] } );
				}
				++baseIndex;
				++headIndex;
			}
		}
		// Process the remaining keys, because the loop above stops after it hits the end of either object.
		if( baseIndex < baseKeys.length ) {
			for( ; baseIndex < baseKeys.length; ++baseIndex ) {
				changeSet.push( { type : ChangeSet.TYPE_DELETION, key : baseKeys[ baseIndex ] } );
			}
		}
		if( headIndex < headKeys.length ) {
			for( ; headIndex < headKeys.length; ++headIndex ) {
				changeSet.push( { type : ChangeSet.TYPE_ADDITION, key : headKeys[ headIndex ] } );
			}
		}

		return changeSet;
	};

	return ChangeSet;
})();

module.exports = ChangeSet;
