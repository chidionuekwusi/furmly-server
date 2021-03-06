const debug = require("debug")("furmly-server:route-utils");
const createError = require("http-errors");
const infrastructure = require("../lib/setup_infrastructure");
const furmlyEngine = require("../lib/setup_furmly_engine");

function createContext(req) {
  const context =
    (req.body && Object.keys(req.body).length && req.body) || req.query || {};
  const authorized = req._clientAuthorized;
  const domain = Object.assign({}, req._domain);
  const uiOnDemand =
    (req.body && req.body.$uiOnDemand) || (req.query && req.query.$uiOnDemand);
  const user = Object.assign({}, req.user);
  const requestContext = Object.assign({}, req.headers, { secure: req.secure });
  Object.defineProperties(context, {
    $authorized: {
      enumerable: false,
      get: function() {
        return authorized;
      }
    },
    $domain: {
      enumerable: false,
      get: function() {
        return domain;
      }
    },
    $user: {
      enumerable: false,
      get: function() {
        return user;
      }
    },
    $requestContext: {
      enumerable: false,
      get: function() {
        return requestContext;
      }
    },
    $uiOnDemand: {
      enumerable: false,
      get: function() {
        return uiOnDemand;
      }
    }
  });

  return context;
}

function checkIfClaimIsRequired(type, value, req, res, next) {
  infrastructure.getClaims(
    {
      type: type,
      value: value(req)
    },
    function(er, result) {
      if (er) return next(new createError.Unauthorized());
      if (result.length) return next(new createError.Unauthorized());
      debug("a claim is not required for this request");
      req._claimNotRequired = true;
      next();
    }
  );
}

function VerificationOverride(fn) {
  this.fn = fn;
}
VerificationOverride.prototype.verify = function(req, res, next) {
  return this.fn(req, res, next);
};

function getDomain(domainId, req, fn) {
  infrastructure.getDomains(
    getObjectIdOrQuery(domainId, { uid: domainId }),
    (er, domains) => {
      if (er) return fn(er);
      if (domains.length) {
        req._domain = domains[0];
        req._domain.config =
          req._domain.config &&
          req._domain.config.reduce((sum, x) => {
            return (sum[x.name] = x.value), sum;
          }, {});
      }
      fn();
    }
  );
}

function checkClaim(type, value, checkNext, req, res, next) {
  if (Array.prototype.slice(arguments).length == 5) {
    next = res;
    res = req;
    req = checkNext;
    checkNext = null;
  }
  var _value = value;

  if (req.user) {
    value = value(req);
    var joinedClaims = req.user.roles.reduce(
      function(m, x) {
        return m.claims.concat(x.claims);
      },
      {
        claims: []
      }
    );
    debug(`object to be checked:${value}`);
    var hasClaim = joinedClaims.filter(function(claim) {
      return claim.type == type && claim.value == value;
    });

    if (hasClaim.length) {
      debug(`user has claim for ${value}`);
      next();
      return;
    }

    debug(`user does not have claim of type:${type} and value:${value}`);
  }

  if (checkNext) return checkNext(type, _value, req, res, next);
  next(new createError.Unauthorized());
}

function getObjectIdOrQuery(id, or, propName) {
  var query = { $or: [or] };

  if (furmlyEngine.isValidID(id)) {
    query.$or.push({ [propName || "_id"]: id });
  }
  return query;
}

function removeNonASCIICharacters(str) {
  /* eslint no-useless-escape: 0 */
  return str.replace(
    /[^A-Za-z 0-9 \.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~]*/g,
    ""
  );
}

function sendResponse(next, er, result) {
  if (er) return next(er);
  this.send(result);
}

function getRangeQuery(req, forceId) {
  var query = req.query.lastId
    ? {
        _id: {
          $lt:
            (!forceId && req.query.lastId) ||
            furmlyEngine.createId(req.query.lastId)
        }
      }
    : {};
  return query;
}
function getMongoQuery(item) {
  return item.split(",").reduce(function(sum, x) {
    var prop_value = x.split("=");
    sum[prop_value[0]] = new RegExp(prop_value[1], "i");
    return sum;
  }, {});
}
function toRegex(string) {
  return new RegExp(string, "i");
}

function emptyVal() {
  return null;
}
module.exports = {
  emptyVal,
  createContext,
  checkIfClaimIsRequired,
  getMongoQuery,
  toRegex,
  getRangeQuery,
  getObjectIdOrQuery,
  getDomain,
  sendResponse,
  removeNonASCIICharacters,
  checkClaim,
  VerificationOverride
};
