var User = require('../models/user');
var Task = require('../models/task');
var h = require('./helpers.js');
var HttpError = h.HttpError;

var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function validateUser(body, existingID) {
    body = body || {};

    if (body.name  === undefined || body.name === null || body.name === '') {
        throw new HttpError(400, ' User must have a name.');
    }

    if (typeof body.name !== 'string' || body.name.trim() === '') {
        throw new HttpError(400, 'The "name" parameter must be a non-empty string.');
    }

    if (body.email === undefined || body.email === null || body.email === '') {
        throw new HttpError(400, 'The "email" parameter must be a non-empty string.');
    }

    if (typeof body.email !== 'string' || !EMAIL_PATTERN.test(body.email.trim())) {
        throw new HttpError(400, 'The "email" parameter must be a valid email address.');
    }

    var pendingTasks = body.pendingTasks;
    if (pendingTasks === undefined || pendingTasks === null) {
        pendingTasks = [];
    } else if (typeof pendingTasks === 'string') {
        pendingTasks = pendingTasks.trim() === '' ? [] : [pendingTasks.trim()];
    } else if (!Array.isArray(pendingTasks)) {
        throw new HttpError(400, 'The "pendingTasks" parameter must be an array of task IDs.');
    }

    for (var i = 0; i < pendingTasks.length; i++) {
        if (!h.isValidId(pendingTasks[i])) {
            throw new HttpError(400, 'pending task contains and invalid task ID: ' + pendingTasks[i]);
        }
    }

    pendingTasks = pendingTasks.filter(function (id,index) {
        return pendingTasks.indexOf(id) === index;
    });

    var emailQuery = { email: body.email };
    if (existingID) {
        emailQuery._id = { $ne: existingID };
    }
    if (await User.exists(emailQuery)) {
        throw new HttpError(400, 'A user with the email "' + body.email + '" already exists.');
    }

    var task = await Task.find({ _id: { $in: pendingTasks } });
    for (var j = 0; j < task.length; j++) {
        if (task[j].completed) {
            throw new HttpError(400, 'The task with ID "' + task[j]._id + '" is already completed and cannot be assigned to a user.');
        }
    }

    if (task.length !== pendingTasks.length) {
        throw new HttpError(400, 'One or more task IDs in "pendingTasks" do not exist.');
    }

    return {
        name: body.name.trim(),
        email: body.email.trim(),
        pendingTasks: pendingTasks
    };
}
async function syncTasksForUser(user, oldPending) {
    var uid = String(user._id);
    var newPending = user.pendingTasks.slice();
    var dropped = oldPending.filter(function (id) { return newPending.indexOf(id) === -1; });
 
    
    await Task.updateMany(
        {
            assignedUser: uid,
            _id: { $nin: newPending },
            $or: [{ _id: { $in: dropped } }, { completed: false }]
        },
        { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
    );
 
    if (newPending.length > 0) {
        await User.updateMany(
            { _id: { $ne: user._id }, pendingTasks: { $in: newPending } },
            { $pull: { pendingTasks: { $in: newPending } } }
        );
    }
 
    await Task.updateMany(
        { $or: [{ _id: { $in: newPending } }, { assignedUser: uid }] },
        { $set: { assignedUser: uid, assignedUserName: user.name } }
    );
}
 
module.exports = function (router) {
 
    router.route('/users')
        .get(h.handle(function (req, res) {
            return h.sendList(User, req, res, undefined);
        }))
        .post(h.handle(async function (req, res) {
            var input = await validateUser(req.body, null);
            var user = new User({
                name: input.name,
                email: input.email,
                pendingTasks: input.pendingTasks
            });
            await user.save();
            await syncTasksForUser(user, []);
            return h.send(res, 201, 'User created', user);
        }));
 
    router.route('/users/:id')
        .get(h.handle(function (req, res) {
            return h.sendOne(User, req, res, 'User');
        }))
        .put(h.handle(async function (req, res) {
            var id = req.params.id;
            var user = h.isValidId(id) ? await User.findById(id) : null;
            if (!user) {
                throw new HttpError(404, 'User not found.');
            }
 
            var input = await validateUser(req.body, user._id);
            var oldPending = user.pendingTasks.slice();
 
            user.name = input.name;
            user.email = input.email;
            user.pendingTasks = input.pendingTasks;
            await user.save();
            await syncTasksForUser(user, oldPending);
            return h.send(res, 200, 'User updated', user);
        }))
        .delete(h.handle(async function (req, res) {
            var id = req.params.id;
            var user = h.isValidId(id) ? await User.findById(id) : null;
            if (!user) {
                throw new HttpError(404, 'User not found.');
            }
 
            await Task.updateMany(
                { assignedUser: String(user._id) },
                { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
            );
            await User.deleteOne({ _id: user._id });
            return res.status(204).end();
        }));
 
    return router;
};
 
