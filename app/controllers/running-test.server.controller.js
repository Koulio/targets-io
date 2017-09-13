'use strict';
/**
 * Module dependencies.
 */
var mongoose = require('mongoose');
var _ = require('lodash');
var winston = require('winston');
var RunningTest = mongoose.model('RunningTest');
var Event = mongoose.model('Event');
var Testrun = mongoose.model('Testrun');
var Dashboard = mongoose.model('Dashboard');
var Product = mongoose.model('Product');
var testRunsModule = require('./testruns.server.controller');
var md5 = require('MD5');
var redis = require("redis");
var config = require('../../config/config');
var pub = redis.createClient(config.redisPort, config.redisHost, { returnBuffers: true});
var sub = redis.createClient(config.redisPort, config.redisHost, {returnBuffers: true});
var mutex = require('node-mutex')({pub: pub, sub: sub});

pub.on('error', (err) => {
  console.log('error from pub');
  console.log(err);
});
sub.on('error', (err) => {
  console.log('error from sub');
  console.log(err);
});



exports.runningTest = runningTest;
exports.updateRunningTest = updateRunningTest;
exports.updateRunningTestAnnotations = updateRunningTestAnnotations;
exports.getRunningTests = getRunningTests;
exports.runningTestForDashboard = runningTestForDashboard;
exports.saveTestRun = saveTestRun;

function runningTestForDashboard(req, res){

  RunningTest.findOne({$and:[{productName: req.params.productName}, {dashboardName: req.params.dashboardName}]}).exec(function(err, runningTest){
    if(err){
      winston.error(err);
    }else{

      if(runningTest) {
        res.jsonp(runningTest);
      }else {
        res.jsonp({});
      }

    }


  });

}

function getRunningTests(req, res){

  RunningTest.find().exec(function(err, runningTests){

    if(err){
      winston.error(err);
    }else{
      res.jsonp(runningTests);
    }

  });
}


let runningTestHandler = function(err){

  winston.error('Error in running test  chain: ' + err.stack);
}

function createHash(testRunString) {
  var hashedKey;
  hashedKey = md5(testRunString);
  return hashedKey;
}

function runningTest(req, res){

  let lockId = createHash(req.body.productName + req.body.dashboardName + req.body.testRunId );

  mutex.lock( lockId, function( err, unlock ) {

    let runningTestKeepAlive = req.body;
    let productName = runningTestKeepAlive.productName;
    let dashboardName = runningTestKeepAlive.dashboardName;
    let testRunId = runningTestKeepAlive.testRunId.toUpperCase();

    if (req.params.command === 'end') {

      RunningTest.findOne({
        $and: [
          {productName: productName},
          {dashboardName: dashboardName},
          {testRunId: testRunId}
        ]
      }).exec(function (err, runningTest) {

        if (runningTest) {
          /* mark test run as completed */
          runningTest.completed = true;
          /* set test run end time*/
          runningTest.end = new Date().getTime();
          /* Save test run*/

          saveTestRun(runningTest)
              .then(testRunsModule.benchmarkAndPersistTestRunById)
              .then(function (testRun) {
                  unlock();
                  res.jsonp(testRun);
              })
              .catch(runningTestHandler);

        } else {

          unlock();
          return res.status(400).send({message: 'No running test found for this test run ID!'});

        }
      })
    } else {

      /* first check if test run exists for dashboard */

      Testrun.findOne({
        $and: [
          {productName: productName},
          {dashboardName: dashboardName},
          {testRunId: testRunId}
        ]
      }).exec(function (err, testRun) {

        /* if completed test run is found return error */
        if (testRun && testRun.completed === true) {

          unlock();
          return res.status(400).send({message: 'testRunId already exists for dashboard!'});

        } else {

          /* if incomplete test run is found, assume the test run was ended due to hiccup in keepalive calls.  */

          if (testRun && testRun.completed === false) {

            /* add original start time */
            runningTestKeepAlive.start = testRun.start;

            /* remove test run from collection */
            Testrun.remove({
              $and: [
                {productName: productName},
                {dashboardName: dashboardName},
                {testRunId: testRunId}
              ]
            }).exec(function (err, testRunDeleted) {

              var io = global.io;
              var room = testRun.productName + '-' + testRun.dashboardName;


              winston.info('emitting message to room: ' + room);
              io.sockets.in(room).emit('testrun', {event: 'removed', testrun: testRun});
              winston.info('emitting message to room: running-test');
              io.sockets.in('recent-test').emit('testrun', {event: 'removed', testrun: testRun});

              updateRunningTest(runningTestKeepAlive)
                  .then(function (message) {

                    unlock();
                    res.jsonp(message);

                  });
            });

          } else {

            updateRunningTest(runningTestKeepAlive)
                .then(function (message) {
                  unlock();
                  res.jsonp(message);

                });
          }
        }


      });
    }
  });
}

function updateRunningTestAnnotations(req, res) {

  RunningTest.findOne({$and:[{productName: req.body.productName}, {dashboardName: req.body.dashboardName}, {testRunId: req.body.testRunId.toUpperCase()}]}).exec(function(err, storedRunningTest){

    if(storedRunningTest) {

      storedRunningTest.annotations = req.body.annotations;

      storedRunningTest.save(function (err, runningTestSaved) {


        var io = global.io;
        var room = runningTestSaved.productName + '-' + runningTestSaved.dashboardName;

        winston.info('emitting message to room: ' + room);
        io.sockets.in(room).emit('runningTest', {event: 'saved', testrun: runningTestSaved});
        winston.info('emitting message to room: running-test');
        io.sockets.in('running-test').emit('runningTest', {event: 'saved', testrun: runningTestSaved});

        res.jsonp(runningTestSaved)

      });
    }else{

      return res.status(400).send({ message: 'No running test found for this test run ID!' });

    }

  });
}
  function updateRunningTest(runningTest) {

  return new Promise((resolve, reject) => {

    let newRunningTest;
    let dateNow = new Date().getTime();


    RunningTest.findOne({$and:[{productName: runningTest.productName}, {dashboardName: runningTest.dashboardName}, {testRunId: runningTest.testRunId.toUpperCase()}]}).exec(function(err, storedRunningTest){

      /* if entry exists just update the keep alive timestamp */
      if(storedRunningTest){

        storedRunningTest.keepAliveTimestamp = dateNow;
        storedRunningTest.end = dateNow + 30 * 1000;
        storedRunningTest.humanReadableDuration = testRunsModule.humanReadbleDuration(new Date().getTime() - storedRunningTest.start.getTime());
        if(runningTest.rampUpPeriod) storedRunningTest.rampUpPeriod = runningTest.rampUpPeriod;
        if(runningTest.duration) storedRunningTest.duration = runningTest.duration * 1000;
        storedRunningTest.annotations = runningTest.annotations;


        storedRunningTest.save(function(err, runnigTestSaved){

          var io = global.io;
          var room = runningTest.productName + '-' + runningTest.dashboardName;

          winston.info('emitting message to room: ' + room);
          io.sockets.in(room).emit('runningTest', {event: 'saved', testrun: storedRunningTest});
          winston.info('emitting message to room: running-test');
          io.sockets.in('running-test').emit('runningTest', {event: 'saved', testrun: storedRunningTest});

          resolve('running test updated!');
        });

        /* if entry does not exist, create new one */

      }else{

        /* get duration for last completed test run */

        Testrun.findOne({
          $and: [
            {productName: runningTest.productName},
            {dashboardName: runningTest.dashboardName},
            {completed: true}
          ]
        }).sort({end: -1}).exec(function (err, testRun) {


          newRunningTest = new RunningTest(runningTest);

          /* set timestamps */
          /* if start request, give some additional time to start up */

          newRunningTest.keepAliveTimestamp = dateNow + 30 * 1000;
          /* if duration is not set in running test request body (legacy) use the last completed test duration*/
          newRunningTest.duration = (runningTest.duration) ? runningTest.duration * 1000 : (testRun ? new Date(testRun.end).getTime() - new Date(testRun.start).getTime() : undefined);
          newRunningTest.end = dateNow + 30 * 1000;
          newRunningTest.humanReadableDuration = testRunsModule.humanReadbleDuration(new Date().getTime() - newRunningTest.start.getTime())
          newRunningTest.save(function(err, newRunningTest){

            var io = global.io;
            var room = runningTest.productName + '-' + runningTest.dashboardName;

            winston.info('emitting message to room: ' + room);
            io.sockets.in(room).emit('runningTest', {event: 'saved', testrun: newRunningTest});
            winston.info('emitting message to room: running-test ');
            io.sockets.in('running-test').emit('runningTest', {event: 'saved', testrun: newRunningTest});

            resolve('running test created!');
          });

        });

      }
    });
  });
}



function saveTestRun (runningTest){

  return new Promise((resolve, reject) => {

    let testRun = new Testrun();


    testRun.productName = runningTest.productName;
    testRun.productRelease = runningTest.productRelease;
    testRun.dashboardName = runningTest.dashboardName;
    testRun.testRunId = runningTest.testRunId;
    testRun.completed  = runningTest.completed;
    testRun.buildResultsUrl  = runningTest.buildResultsUrl;
    testRun.humanReadableDuration  = runningTest.humanReadableDuration;
    testRun.rampUpPeriod  = runningTest.rampUpPeriod;
    testRun.annotations  = runningTest.annotations;
    testRun.start  = runningTest.start;
    testRun.end  = runningTest.end;



    testRun.save(function (err, savedTestRun) {

      if (err) {

        /* In case of error still remove running test! */
        runningTest.remove(function (removeErr) {

          if(removeErr) {
            var io = global.io;
            var room = runningTest.productName + '-' + runningTest.dashboardName;


            winston.info('emitting message to room: ' + room);
            io.sockets.in(room).emit('runningTest', {event: 'removed', testrun: runningTest});
            winston.info('emitting message to room: running-test');
            io.sockets.in('running-test').emit('runningTest', {event: 'removed', testrun: runningTest});

            reject(err);
          }else{

            reject(removeErr);
          }

        });

      } else {

        var io = global.io;
        var room = runningTest.productName + '-' + runningTest.dashboardName;

        winston.info('emitting message to room: ' + room);
        io.sockets.in(room).emit('testrun', {event: 'saved', testrun: savedTestRun});
        io.sockets.in('recent-test').emit('testrun', {event: 'saved', testrun: savedTestRun});

        runningTest.remove(function (err) {


          winston.info('emitting message to room: ' + room);
          io.sockets.in(room).emit('runningTest', {event: 'removed', testrun: runningTest});
          winston.info('emitting message to room: running-test');
          io.sockets.in('running-test').emit('runningTest', {event: 'removed', testrun: runningTest});

          /* no matter if remove fails, still resolve*/
            resolve(savedTestRun);

        });
      }
    });

  });
}

