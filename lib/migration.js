const debug = require("debug")("migration"),
	async = require("async"),
	path = require("path"),
	fs = require("fs-extra");
function Migration(opts, config, stores) {
	if (!opts.title) throw new Error("All migrations must have titles");
	if (!opts.dbs) throw new Error("Empty migration");

	this.title = opts.title;
	this.dbs = opts.dbs;
	this.migrationFolder = config.folder;
	this.userStore = stores.userStore;
	this.claimsStore = stores.claimsStore;
	this.domainStore = stores.domainStore;
	this.menuStore = stores.menuStore;
	this.roleStore = stores.roleStore;
	this.clientStore = stores.clientStore;
	this.engine = stores.dynamoEngine;
}

Migration.prototype.getMigrationFolder = function() {
	return this.migrationFolder;
};

/**
 * Used to map stores to collection names
 * @param  {String} name Collection name
 * @return {Object}      Store containing methods for retrieving objects of type {name}
 */
Migration.prototype.getStoreFor = function(name) {
	switch (name) {
		case "User":
			return this.userStore;
		case "Claim":
			return this.claimsStore;
		case "Domain":
			return this.domainStore;
		case "Menu":
			return this.menuStore;
		case "Role":
			return this.roleStore;
		case "Client":
			return this.clientStore;
		default:
			throw new Error(`cannot locate the right store for ${name}`);
	}
};


/**
 * This generates the migration package.
 * @param  {Function} fn Callback function
 * @return {String}                Message
 */
Migration.prototype.generate = function(fn) {
	debug("generating migration package...");
	let tasks = [];
	this.dbs.forEach(db => {
		tasks.push(callback => {
			let dbPath = path.join(this.getMigrationFolder(), db.name);
			fs.ensureDirSync(dbPath);
			let collectionTasks = [];
			db.collections.forEach(collection => {
				collectionTasks.push(colCallback => {
					let filter =
						(collection.items &&
						collection.items.length && {
							_id: { $in: collection.items }
						}) ||
						{};
					switch (collection.type) {
						case "dynamo":
							this.engine.query(
								collection.name,
								filter,
								colCallback
							);
							break;
						case "dynamo_web":
							try {
								this.getStoreFor(collection.name).get(
									filter,
									colCallback
								);
							} catch (e) {
								setImmediate(colCallback, e);
							}

							break;
						default:
							setImmediate(
								colCallback,
								new Error("Unknown collection type")
							);
					}
				});
			});

			async.parallel(collectionTasks, (er, results) => {
				if (er) return callback(er);
				let writeTasks = results.map((result, index) => {
					return writeCallback => {
						let writePath = path.join(
							dbPath,
							db.collections[index].name + ".json"
						);

						fs.writeJson(writePath, result, writeCallback);
					};
				});

				async.parallel(writeTasks, callback);
			});
		});
	});

	async.parallel(tasks, er => {
		if (er) return fn(er);

		return fn(null, "successfully generated migration package");
	});
};

module.exports = Migration;