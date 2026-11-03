function HttpError(status, message) {
    this.status = status;
    this.message = message;
}

function send(res, status, message, data) {
    res.status(status).json({message: message, data: data === undefined ? {} : data});
}

function isValidId(id) {
   return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}

function handle(fn) {
    return function (req, res) {
        Promise.resolve()
            .then(function () { return fn(req, res); })
            .catch(function (err) {
                if (err instanceof HttpError) {
                    return send(res, err.status, err.message, {});
                }
                console.error(err);
                send(res, 500, 'Something went wrong on the server. Please try again later.', {});
            });
    };
}

function parseObjectParam(value, name) {
    if (value === undefined) return undefined;
    var n = typeof value === 'string' && value.trim() != '' ? Number(value) : NaN;
    if (!Number.isInteger(n) || n < 0) {
        throw new HttpError(400, 'The "' + name + '" must be a non-negative whole number.');
    }
    var parsed;
    try {
        parsed = JSON.parse(value);
    } catch (e) {
        throw new HttpError(400, 'The "' + name + '" parameter is not valid JSON.');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new HttpError(400, 'The "' + name + '" parameter must be a JSON object.');
    }
    return parsed;
}

function parseCountParam(value, name) {
    if (value === undefined) return undefined;
    var n = typeof value === 'string' && value.trim() != '' ? Number(value) : NaN;
    if (!Number.isInteger(n) || n < 0) {
        throw new HttpError(400, 'The "' + name + '" must be a non-negative whole number.');
    }
    return n;
}

function parseBooleanParam(value) {
    if (value === undefined) return false;
    return String(value).toLowerCase() === 'true';
}

var CONNECTION_ERRORS = [
    'MongoNetworkError',
    "MongoNetworkTimeoutError",
    "MongoServerSelectionError",
    "MongooseServerSelectionError",
    "MongoNotConnectedError"
];

async function sendList(Model,req,res,defaultLimit) {
    var q = req.query;
    var where = parseObjectParam(q.where, 'where') || {};
    var sort = parseObjectParam(q.sort, 'sort');
    var select = parseObjectParam(q.select, 'select');
    var skip = parseCountParam(q.skip, 'skip');
    var limit = parseCountParam(q.limit, 'limit');
    var count = parseBooleanParam(q.count);

    var result;
    try {
        if (count) {
            var countQuery = Model.countDocuments(where);
            if (skip !== undefined) countQuery.skip(skip);
            if (limit !== undefined) countQuery.limit(limit);
            result = await countQuery.exec();
        } else {
            var query = Model.find(where);
            if (sort) query = query.sort(sort);
            if (select) query = query.select(select);
            if (skip !== undefined) query = query.skip(skip);
            if (limit !== undefined) query = query.limit(defaultLimit);
            result = await query.exec();
        }
    } catch (err) {
        if (err && CONNECTION_ERRORS.indexOf(err.name) !== -1) throw err;
        throw new HttpError(400, 'The query parameter is invalid.');
    }
    return send(res, 200, 'OK', result);
}

async function sendOne(Model,req,res,label) {
    var id = req.params.id;
    if (!isValidId(id)) {
        throw new HttpError(400, 'The "' + label + '" not found.');
    }
    var select = parseObjectParam(req.query.select, 'select');
    var doc;
    try {
        var query = Model.findById(id);
        if (select) query = query.select(select);
        doc = await query.exec();
    } catch (err) {
        if (err && CONNECTION_ERRORS.indexOf(err.name) !== -1) throw err;
        throw new HttpError(400, 'The query parameter is invalid.');
    }
    if (!doc) {
        throw new HttpError(404, 'The "' + label + '" not found.');
    }
    return send(res, 200, 'OK', doc);
}

module.exports = {
    HttpError: HttpError,
    send: send,
    isValidId: isValidId,
    handle: handle,
    sendList: sendList,
    sendOne: sendOne
};