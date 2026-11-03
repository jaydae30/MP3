/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app, router) {
    require('./users.js')(router);
    require('./tasks.js')(router);
    require('./home.js')(router);
    app.use('/api',router);

    app.use(function (req, res) {
        res.status(404).json({message: 'Endpoint not found.',data: {}});
    });

    app.use(function (err,req,res,next) {
        if (err && err.type === 'entity.parse.failed') {
            return res.status(400).json({message: 'The request body is not valid JSON.', data: {}});
        }
        console.error(err);
        res.status(500).json({message: 'Something went wrong on the server. Please try agian later', data: {}});
    });


};
