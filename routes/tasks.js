var User = require('../models/user');
var Task = require('../models/task');
var h = require('./helpers.js');
var HttpError = h.HttpError;

function parseDeadline(value) {
    if (value === undefined || value == null || value === '') {
        throw new HttpError(400, 'The "deadline" parameter is required and must be a valid date.');
    }
    var date;

    if (typeof value === 'number') {
        date = new Date(value);
    } else if (typeof value === 'string') {
        date = /^\d+$/.test(value.trim()) ? new Date(Number(value)) : new Date(value);
    } else {
        throw new HttpError(400, 'The "deadline" parameter must be a valid date.');
    }

    if (isNaN(date.getTime())) {
        throw new HttpError(400, 'The "deadline" parameter must be a valid date.');
    }
    return date;
}

function parseCompleted(value) {
    if (value === undefined || value == null) return false;
    if (value === true || value === 'true' ) return true;
    if (value === false || value === 'false') return false;
    throw new HttpError(400, 'The "completed" parameter must be a boolean value (true or false).');
}

async function validateTask(body) {
    body = body || {};

    if ( body.name === undefined || body.name === null || body.name.trim() === '') {
        throw new HttpError(400, 'The "name" parameter is required and must be a non-empty string.');
    }
    if (typeof body.name !== 'string' || body.name.trim() === '') {
        throw new HttpError(400, 'The "name" parameter must be a non-empty string.');
    }

    var deadline = parseDeadline(body.deadline);
    var description = body.description;
    if (description === undefined || description === null ) {
        description = '';
    } else if (typeof description !== 'string' ) {
        throw new HttpError(400, 'The "description" parameter is required and must be a non-empty string.');
    }

    var completed = parseCompleted(body.completed);
    var assignedUser = body.assignedUser;
    if (assignedUser === undefined || assignedUser === null ) {
        assignedUser = '';
    } else if (typeof assignedUser !== 'string' ) {
        throw new HttpError(400, 'The "assignedUser" parameter must be a string.');
    }

    if (assignedUser !== '' && !h.isValidId(assignedUser)) {
        throw new HttpError(400, 'The "assignedUser" parameter must be a valid user ID.');
    }
var assignedUserName = body.assignedUserName;
    if (assignedUserName === null) assignedUserName = undefined;
    if (assignedUserName !== undefined && typeof assignedUserName !== 'string') {
        throw new HttpError(400, 'assignedUserName must be a string.');
    }
 
    if (assignedUser === '') {
        if (assignedUserName !== undefined && assignedUserName !== '' && assignedUserName !== 'unassigned') {
            throw new HttpError(400, 'assignedUserName must be "unassigned" when no user is assigned.');
        }
        assignedUserName = 'unassigned';
    } else {
        var user = await User.findById(assignedUser);
        if (!user) {
            throw new HttpError(404, 'The assigned user does not exist.');
        }
        if (assignedUserName !== undefined && assignedUserName !== '' && assignedUserName !== user.name) {
            throw new HttpError(400, 'assignedUserName does not match the name of the assigned user.');
        }
        assignedUserName = user.name;
    }
 
    return {
        name: body.name,
        description: description,
        deadline: deadline,
        completed: completed,
        assignedUser: assignedUser,
        assignedUserName: assignedUserName
    };
}
 
async function syncUsersForTask(task) {
    var tid = String(task._id);
    var uid = task.assignedUser;
 
    
    var others = { pendingTasks: tid };
    if (uid) others._id = { $ne: uid };
    await User.updateMany(others, { $pull: { pendingTasks: tid } });
 
    if (uid) {
        if (task.completed) {
            await User.updateOne({ _id: uid }, { $pull: { pendingTasks: tid } });
        } else {
            await User.updateOne({ _id: uid }, { $addToSet: { pendingTasks: tid } });
        }
    }
}
 
module.exports = function (router) {
 
    router.route('/tasks')
        .get(h.handle(function (req, res) {
            return h.sendList(Task, req, res, 100);
        }))
        .post(h.handle(async function (req, res) {
            var input = await validateTask(req.body);
            var task = new Task(input);
            await task.save();
            await syncUsersForTask(task);
            return h.send(res, 201, 'Task created', task);
        }));
 
    router.route('/tasks/:id')
        .get(h.handle(function (req, res) {
            return h.sendOne(Task, req, res, 'Task');
        }))
        .put(h.handle(async function (req, res) {
            var id = req.params.id;
            var task = h.isValidId(id) ? await Task.findById(id) : null;
            if (!task) {
                throw new HttpError(404, 'Task not found.');
            }
 
            var input = await validateTask(req.body);
            task.name = input.name;
            task.description = input.description;
            task.deadline = input.deadline;
            task.completed = input.completed;
            task.assignedUser = input.assignedUser;
            task.assignedUserName = input.assignedUserName;
            await task.save();
            await syncUsersForTask(task);
            return h.send(res, 200, 'Task updated', task);
        }))
        .delete(h.handle(async function (req, res) {
            var id = req.params.id;
            var task = h.isValidId(id) ? await Task.findById(id) : null;
            if (!task) {
                throw new HttpError(404, 'Task not found.');
            }
 
            await User.updateMany(
                { pendingTasks: String(task._id) },
                { $pull: { pendingTasks: String(task._id) } }
            );
            await Task.deleteOne({ _id: task._id });
            return h.send(res, 200, 'Task deleted', task);
        }));
 
    return router;
};
 