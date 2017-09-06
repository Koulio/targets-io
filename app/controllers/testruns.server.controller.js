/*jshint maxerr: 10000 */
'use strict';
/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
    winston = require('winston'),
    errorHandler = require('./errors.server.controller'),
    Event = mongoose.model('Event'),
    Testrun = mongoose.model('Testrun'),
    Dashboard = mongoose.model('Dashboard'),
    dashboard = require('./dashboards.server.controller'),
    Product = mongoose.model('Product'),
    _ = require('lodash'),
    graphite = require('./graphite.server.controller'),
    Utils = require('./utils.server.controller'),
    Requirements = require('./testruns.requirements.server.controller'),
    Benchmarks = require('./testruns.benchmarks.server.controller'),
    Metric = mongoose.model('Metric'),
    async = require('async'),
    TestrunSummary = mongoose.model('TestrunSummary'),
    RunningTest = mongoose.model('RunningTest'),
    Release = mongoose.model('Release'),
    cache = require('./redis.server.controller'),
    config = require('../../config/config'),
    ss = require('simple-statistics');



exports.getTestRunById = getTestRunById;
exports.productReleasesFromTestRuns = productReleasesFromTestRuns;
exports.benchmarkAndPersistTestRunById = benchmarkAndPersistTestRunById;
exports.testRunsForDashboard = testRunsForDashboard;
exports.testRunsForProduct = testRunsForProduct;
exports.testRunsForProductRelease = testRunsForProductRelease;
exports.testRunsForProductReleaseImpl = testRunsForProductReleaseImpl;
exports.deleteTestRunById = deleteTestRunById;
exports.testRunById = testRunById;
exports.refreshTestrun = refreshTestrun;
exports.updateTestrunsResults = updateTestrunsResults;
//exports.saveTestRunAfterBenchmark = saveTestRunAfterBenchmark;
exports.updateAllDashboardTestRuns = updateAllDashboardTestRuns;
exports.updateAllProductTestRuns = updateAllProductTestRuns;
exports.recentTestRuns = recentTestRuns;
exports.update = update;
exports.updateProductRelease = updateProductRelease;
exports.addTestRun = addTestRun;
exports.humanReadbleDuration = humanReadableDuration;
exports.runningTestsForDashboard = runningTestsForDashboard;
exports.getTestRunBenchmarks = getTestRunBenchmarks;

function addTestRun(req, res){

  let testRun = new Testrun(req.body);

  testRun.humanReadableDuration = humanReadableDuration(testRun.end.getTime() - testRun.start.getTime());
  testRun.meetsRequirement = null;

  testRun.save(function(err, testRun){

    if (err) {
      return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
    } else {

      benchmarkAndPersistTestRunById(testRun)
      .then(function(testRun){
        res.jsonp(testRun);
      });
    }

  });
}

/**
 * Update a test run
 */
function update (req, res) {

  //Testrun.findOne({$and: [
  //  { testRunId: req.body.testRunId },
  //  { productName: req.body.productName },
  //  { dashboardName: req.body.dashboardName }
  //]})
  Testrun.findOne({_id:req.body._id})
      .exec(function(err, testRun){

    if (err) {
      return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
    } else{

      testRun.start = req.body.start;
      testRun.end = req.body.end;
      testRun.productName = req.body.productName;
      testRun.productRelease = req.body.productRelease;
      testRun.dashboardName = req.body.dashboardName;
      testRun.testRunId = req.body.testRunId;
      testRun.completed = req.body.completed;
      testRun.buildResultsUrl = req.body.buildResultsUrl;
      testRun.rampUpPeriod = req.body.rampUpPeriod;
      testRun.annotations = req.body.annotations;
      testRun.humanReadableDuration = humanReadableDuration(new Date(req.body.end).getTime() - new Date(req.body.start).getTime());

      testRun.save(function(err, savedTestRun){

        if (err) {
          return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
        } else {

          res.jsonp(savedTestRun);

        }
      });
    }

  })


};

function updateProductRelease (req, res) {

  Testrun.findOne({$and: [
    { testRunId: req.params.originalTestRunId },
    { productName: req.body.productName },
    { dashboardName: req.body.dashboardName }
  ]}).exec(function(err, testRun){

    if (err) {
      return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
    } else{

      testRun.productRelease = req.body.productRelease;
      testRun.testRunId = req.body.testRunId;

      testRun.save(function(err, savedTestRun){

        if (err) {
          return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
        } else {

          res.jsonp(savedTestRun);

        }
      });
    }

  })


};


function recentTestRuns(req, res){

  /* Get all test runs from the specified number of days */
  var pastDay = new Date() - 1000 * 60 * 60 * 24 * req.params.numberOfDays;

  Testrun.find({end: {$gte: pastDay}}).exec(function (err, testRuns) {

    _.each(testRuns, function(testRun, i){

      testRuns[i].humanReadableDuration = humanReadableDuration(testRun.end.getTime() - testRun.start.getTime());

    });

      res.jsonp(testRuns);


  });
}



function updateTestrunsResults(req, res) {
  Testrun.find({
    $and: [
      { productName: req.params.productName },
      { dashboardName: req.params.dashboardName }
    ]
  }).sort({end: 1}).exec(function (err, testRuns) {
    if (err) {
      winston.error(err);
    } else {
      var count = 0;
      async.eachSeries(testRuns, function (testRun, callback) {

        benchmarkAndPersistTestRunById(testRun)
        .then(function(){

          count = count + 1;
          var io = global.io;
          var room = testRun.productName + '-' + testRun.dashboardName;

          winston.info('emitting message to room: ' + room);
          io.sockets.in(room).emit('progress', {progress: Math.round(count / testRuns.length * 100)  });

          callback();
        })

      }, function (err) {
        if (err)
          winston.error(err);
        /* return updated test runs */

        Testrun.find({
          $and: [
            { productName: req.params.productName },
            { dashboardName: req.params.dashboardName }
          ]
        }).exec(function (err, testRuns) {
          if (err) {
            winston.error(err);
          } else {
            res.json(testRuns);
          }
        });
      });
    }
  });
}
function  updateMetricsInTestrun(testRun) {

  return new Promise((resolve, reject) => {

    dashboard.getDashboard (testRun.productName, testRun.dashboardName)
    .then(function(dashboard){

        var updatedMetrics = [];

        _.each(testRun.metrics, function (testrunMetric) {

          var index = dashboard.metrics.map(function(dashboardMetric){return dashboardMetric._id.toString()}).indexOf(testrunMetric._id.toString());

          if (index !== -1) {
              testrunMetric.requirementOperator = dashboard.metrics[index].requirementOperator;
              testrunMetric.requirementValue = dashboard.metrics[index].requirementValue;
              testrunMetric.benchmarkOperator = dashboard.metrics[index].benchmarkOperator;
              testrunMetric.benchmarkValue = dashboard.metrics[index].benchmarkValue;
          }
            updatedMetrics.push(testrunMetric);
        });
        /* Save updated test run */

        Testrun.findOneAndUpdate({
              $and: [
                {productName: testRun.productName},
                {dashboardName: testRun.dashboardName},
                {testRunId: testRun.testRunId}
              ]
            }, {metrics: updatedMetrics}
            , {upsert: true}, function (err, savedTestRun) {
              if (err) {
                reject(err);
              } else {
                resolve(savedTestRun);
              }

            });


      });
  });
}
function deleteTestRunById(req, res) {
  Testrun.findOne({
    $and: [
      { productName: req.params.productName },
      { dashboardName: req.params.dashboardName },
      { testRunId: req.params.testRunId }
    ]
  }).exec(function (err, testRun) {
    if (err) {
      return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
    } else {
      if (testRun) {

        testRun.remove(function (err) {
          if (err) {
            return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
          }else{

            var io = global.io;
            var room = testRun.productName + '-' + testRun.dashboardName;

            winston.info('emitting message to room: ' + room);
            io.sockets.in(room).emit('testrun', {event: 'removed', testrun: testRun});
            io.sockets.in('recent-test').emit('testrun', {event: 'saved', testrun: testRun});

            /* remove test run summaries for this test run */

            TestrunSummary.findOne({
              $and: [
                {productName: testRun.productName},
                {dashboardName: testRun.dashboardName},
                {testRunId: testRun.testRunId.toUpperCase()}
              ]},function (err, relatedTestRunSummary) {

              if (err) {
                winston.error(err);
                res.jsonp({message: 'test run deleted!'});

              } else {

                if(relatedTestRunSummary){

                  relatedTestRunSummary.remove(function(err){

                    if (err) {
                      winston.error(err);
                      res.jsonp({message: 'test run deleted!'});

                    }else{

                      res.jsonp({message: 'test run and test run summary deleted!'});

                    }
                  })
                }else{

                  res.jsonp({message: 'test run deleted!'});

                }

              }

            });
          }
        });
      }
    }
  });
}
/**
 * select test runs for product
 */
function testRunsForProduct(req, res) {
  Testrun.find({productName: req.params.productName, completed: true}).sort({end: -1}).limit(parseInt(req.params.limit)).exec(function (err, testRuns) {
    if (err) {
      return res.status(400).send({message: errorHandler.getErrorMessage(err)});
    } else {

      _.each(testRuns, function(testRun, i){

        testRuns[i].humanReadableDuration = humanReadableDuration(testRun.end.getTime() - testRun.start.getTime());

      });

      res.jsonp(testRuns);

    }
  });
}

/**
 * get distinct releases for product
 */
function productReleasesFromTestRuns(req, res) {

  Product.findOne({name: req.params.productName}).exec(function(err, product){

    if (err) {
      return res.status(400).send({message: errorHandler.getErrorMessage(err)});

    } else {
      Testrun.find({$and: [{productName: product.name}, {completed: true}]}).sort({end: 1}).exec(function (err, testRuns) {
        if (err) {
          return res.status(400).send({message: errorHandler.getErrorMessage(err)});
        } else {

          var releaseFromTestRuns = distinctReleases(filterTestRunsBasedOnRequirements(testRuns, product.requirements));

          Release.find({name: product.name}).exec(function (err, releases) {
            if (err) {
              return res.status(400).send({message: errorHandler.getErrorMessage(err)});
            } else {

              _.each(releases, function (release) {

                if (releaseFromTestRuns.indexOf(release.productRelease) === -1) releaseFromTestRuns.push(release.productRelease);

              });

              res.jsonp(releaseFromTestRuns);
            }
          })

        }

      });
    }
  })
}

function distinctReleases(testRuns){

  var distinctReleases = [];

  _.each(testRuns, function(testRun){

    if(distinctReleases.indexOf(testRun.productRelease) === -1 && testRun.productRelease !== undefined  && testRun.productRelease !== ''){

      distinctReleases.push(testRun.productRelease);
    }
  })

  return distinctReleases;
}
/**
 * select test runs for product release
 */
function testRunsForProductRelease(req, res) {

  testRunsForProductReleaseImpl(req.params.productName, req.params.productRelease)
    .then(function(testRuns){

        res.jsonp(testRuns);
  })
}

function testRunsForProductReleaseImpl(productName, productRelease) {

  return new Promise((resolve, reject) => {

    Product.findOne({name: productName}).exec(function(err, product){

      if (err) {
        reject(err);
      } else {
        Testrun.find({$and: [{productName: productName}, {productRelease: productRelease}, {completed: true}]}).sort({end: 1}).exec(function (err, testRuns) {
          if (err) {
            reject(err);
          } else {

            TestrunSummary.find({$and: [{productName: productName}, {productRelease: productRelease}]}).sort({end: 1}).exec(function (err, testRunSumaries) {

              if (err) {
                reject(err);
              } else {

                var combinedTestrunAndSummaries = [];

                _.each(testRunSumaries, function(testRunSummary){

                  combinedTestrunAndSummaries.push(testRunSummary);

                })

                _.each(testRuns, function(testRun){

                  if (combinedTestrunAndSummaries.map(function(item){return item.testRunId;}).indexOf(testRun.testRunId) === -1) combinedTestrunAndSummaries.push(testRun);

                })



                resolve(filterTestRunsBasedOnRequirements(combinedTestrunAndSummaries, product.requirements));

              }
            });
          }
        });
      }
    })
  })
}

function filterTestRunsBasedOnRequirements(testRuns, requirements){

  var filteredTestruns = [];

  _.each(testRuns, function (testRun, i) {

    /* Only send test runs for dashboards that are linked to product requirements */

    _.each(requirements, function(requirement){

      if(requirement.relatedDashboards.indexOf(testRun.dashboardName) !== -1) {

        if (filteredTestruns.indexOf(testRun) == -1) {
          testRuns[i].humanReadableDuration = humanReadableDuration(testRun.end.getTime() - testRun.start.getTime());

               filteredTestruns.push(testRun);
        }

      }
    })
  });

  return filteredTestruns;
}
  function createTestRunSummaryFromEvents(events, callback) {
    var testRuns = [];
    for (var i = 0; i < events.length; i++) {
      if (events[i].eventDescription === 'start') {
        for (var j = 0; j < events.length; j++) {
          if (events[j].eventDescription === 'end' && events[j].testRunId == events[i].testRunId) {
            testRuns.push({
              start: events[i].eventTimestamp,
              startEpoch: events[i].eventTimestamp.getTime(),
              end: events[j].eventTimestamp,
              endEpoch: events[j].eventTimestamp.getTime(),
              productName: events[i].productName,
              dashboardName: events[i].dashboardName,
              testRunId: events[i].testRunId,
              humanReadbleDuration: humanReadableDuration(events[j].eventTimestamp.getTime() - events[i].eventTimestamp.getTime()),
              duration: events[j].eventTimestamp.getTime() - events[i].eventTimestamp.getTime()
            });

            break;
          }
        }
      }
    }

    callback(testRuns);
  }


function humanReadableDuration(durationInMs){

  var date = new Date(durationInMs);
  var readableDate = '';
  var daysLabel = (date.getUTCDate()-1 === 1) ? " day, " : " days, ";
  var hoursLabel = (date.getUTCHours() === 1) ? " hour, " : " hours, "
  var minutesLabel = (date.getUTCMinutes() === 1) ? " minute" : " minutes";
  var secondsLabel = (date.getUTCSeconds() === 1) ? "  second" : "  seconds";

  if(date.getUTCDate()-1 > 0) readableDate += date.getUTCDate()-1 + daysLabel;
  if(date.getUTCHours() > 0) readableDate += date.getUTCHours() + hoursLabel ;
  if(date.getUTCMinutes() > 0)readableDate += date.getUTCMinutes() + minutesLabel ;
  if(date.getUTCMinutes() === 0)readableDate += date.getUTCSeconds() + secondsLabel ;
  return readableDate;
}
/**
 * select test runs for dashboard
 */
function testRunsForDashboard(req, res) {



  TestrunSummary.find({
    $and: [
      { productName: req.params.productName },
      { dashboardName: req.params.dashboardName },
      { start:  {$lt: new Date((new Date())- 1000 * 60 * 60 * 24 * config.graphiteRetentionPeriod.split('d')[0])}}
    ]
  }, function(err, archivedTestRunSummaries){

    var query =  (req.params.completedTestRunsOnly === "true") ?
      [
        { productName: req.params.productName },
        { dashboardName: req.params.dashboardName },
        { completed: req.params.completedTestRunsOnly }
      ]
    :
      [
        { productName: req.params.productName },
        { dashboardName: req.params.dashboardName }
      ];



      Testrun.find({
        $and: query
      }).sort({end: -1 }).limit(parseInt(req.params.limit)).exec(function(err, testRuns) {
        if (err) {
          return res.status(400).send({message: 'Something went wrong getting test runs, error: ' + err});
        } else {

          /* check if fixed baseline is in the results */
         Product.findOne({name: req.params.productName}).exec(function(err, product){


          Dashboard.findOne({
            $and: [
              { productId: product._id },
              { name: req.params.dashboardName }
            ]
          }).exec(function(err, dashboard){

            var index = testRuns.map(function(testRun){return testRun.testRunId;}).indexOf(dashboard.baseline);

            /* if baseline is present in testRuns, return testRuns*/
            if (index !== -1){

              if(archivedTestRunSummaries.length > 0 && testRuns.length < req.params.limit){

                _.each(archivedTestRunSummaries, function(testRunSummary){

                  testRuns.push(createTestRunFromSummary(testRunSummary))
                })
              }

              res.jsonp(testRuns);

            }else{

              /* else fetch the baseline and push to testRuns */

              Testrun.findOne({
                $and: [
                  { productName: product.name },
                  { dashboardName: dashboard.name },
                  { testRunId: dashboard.baseline }
                ]
              }).exec(function(err, baseline){

                if(baseline){

                  testRuns.push(baseline);

                  if(archivedTestRunSummaries.length > 0 && testRuns.length < req.params.limit){

                    _.each(archivedTestRunSummaries, function(testRunSummary){

                      testRuns.push(createTestRunFromSummary(testRunSummary))
                    })
                  }

                  res.jsonp(testRuns);

                }else{

                  if(archivedTestRunSummaries.length > 0 && testRuns.length < req.params.limit){

                    _.each(archivedTestRunSummaries, function(testRunSummary){

                      testRuns.push(createTestRunFromSummary(testRunSummary))
                    })
                  }

                  res.jsonp(testRuns);

                }

              })

            }

          })

         })

        }
      });
  });

}


function createTestRunFromSummary(testRunSummary){

  var testRun = new Testrun(testRunSummary);

  testRun.hasSummary = true;
  testRun.graphiteDataExists = false;

  return testRun;
}

function runningTestsForDashboard(req, res) {


  /* Check for running tests */
  RunningTest.find({
    $and: [
      {productName: req.params.productName},
      {dashboardName: req.params.dashboardName}
    ]
  }).exec(function (err, runningTests) {

    if (err) {
      return res.status(400).send({message: errorHandler.getErrorMessage(err)});
    } else {

      Testrun.findOne({
        $and: [
          {productName: req.params.productName},
          {dashboardName: req.params.dashboardName},
          {completed: true}
        ]
      }).exec(function (err, testRun) {

        _.each(runningTests, function(runningTest){

          runningTest.humanReadableDuration = humanReadableDuration(new Date().getTime() - new Date(runningTest.start).getTime() );

          runningTest.duration = (runningTest.duration) ? runningTest.duration : (testRun ? new Date(testRun.end).getTime() - new Date(testRun.start).getTime() : undefined);
        })

        res.jsonp(runningTests);

      })


    }
  });
}


function testRunById(req, res) {
  Testrun.findOne({
    $and: [
      { productName: req.params.productName },
      { dashboardName: req.params.dashboardName },
      { testRunId: req.params.testRunId.toUpperCase() }
    ]
  }).sort('-end').exec(function (err, testRun) {
    if (err) {
      return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
    } else {
      if (testRun) {
        var testRunEpoch = testRun.toObject();
        testRunEpoch.startEpoch = testRun.startEpoch;
        testRunEpoch.endEpoch = testRun.endEpoch;
        //res.setHeader('Last-Modified', (new Date()).toUTCString()); //to prevent http 304's
        res.jsonp(testRunEpoch);
      } else {
        return res.status(404).send({ message: 'No test run with id ' + req.params.testRunId + 'has been found for this dashboard' });
      }
    }
  });
}
function getTestRunBenchmarks(req, res) {
  Testrun.findOne({
    $and: [
      { productName: req.params.productName },
      { dashboardName: req.params.dashboardName },
      { testRunId: req.params.testRunId.toUpperCase() }
    ]

  }).exec(function (err, testRun) {
    if (err) {
      return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
    } else {
      if (testRun && testRun.lastUpdated) {

        var response = {};

        response.meetsRequirement = (testRun.meetsRequirement == null || testRun.meetsRequirement == true) ? true : false;
        response.benchmarkResultPreviousOK = (testRun.benchmarkResultPreviousOK == null || testRun.benchmarkResultPreviousOK == true) ? true : false;
        response.benchmarkResultFixedOK = (testRun.benchmarkResultFixedOK == null || testRun.benchmarkResultFixedOK == true) ? true : false;

        res.jsonp(response);
      } else {
        return res.status(404).send({ message: 'No benchmarks found for testRun id ' + req.params.testRunId  });
      }
    }
  });
}

function refreshTestrun(req, res) {


  Testrun.findOne({
    $and: [
      { productName: req.params.productName },
      { dashboardName: req.params.dashboardName },
      { testRunId: req.params.testRunId }
    ]
  }).exec(function (err, testRun) {
    if (err){
      return res.status(404).send({ message: 'No test run with id ' + req.params.testRunId + 'has been found for this dashboard' });
    }else{

      /* flush the graphite cache */

      graphite.flushGraphiteCacheForTestRun(testRun, true, function(result){

        winston.info(result);
      })

      let newTestRun = new Testrun();

      newTestRun.start = testRun.start;
      newTestRun.end = testRun.end;
      newTestRun.productName = testRun.productName;
      newTestRun.productRelease = testRun.productRelease;
      newTestRun.dashboardName = testRun.dashboardName;
      newTestRun.testRunId = testRun.testRunId;
      newTestRun.completed = testRun.completed;
      newTestRun.annotations = testRun.annotations;
      newTestRun.humanReadableDuration = testRun.humanReadableDuration;
      newTestRun.rampUpPeriod = testRun.rampUpPeriod;
      newTestRun.buildResultsUrl = testRun.buildResultsUrl;

      testRun.remove(function(err){

        newTestRun.save(function(err, savedNewTestRun){

          if (err){
            return res.status(400).send({ message: 'Error while saving newTestRun:' + err.stack });
          }else {

            benchmarkAndPersistTestRunById(savedNewTestRun)
                .then(function (updatedTestRun) {
                  res.jsonp(updatedTestRun);
                });
          }
        })

      })
    }
  });
}
function getTestRunById(productName, dashboardName, testRunId, callback) {
  Testrun.findOne({
    $and: [
      { productName: productName },
      { dashboardName: dashboardName },
      { testRunId: testRunId }
    ]
  }).exec(function (err, testRun) {
    if (err) {
      return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
    } else {
      if (testRun) {
        callback(testRun);
      } else {

        callback();
      }
    }
  });
};

let upsertTestRun = function(testRun){

  return new Promise((resolve, reject) => {

    Testrun.findOne({$and:[
      {productName: testRun.productName},
      {dashboardName: testRun.dashboardName},
      {testRunId: testRun.testRunId}
    ]}).exec(function(err, storedTestRun){

        if (err) {
            reject(err);
        } else {

            storedTestRun.metrics = testRun.metrics;
            storedTestRun.meetsRequirement = testRun.meetsRequirement;
            storedTestRun.benchmarkResultFixedOK = testRun.benchmarkResultFixedOK;
            storedTestRun.benchmarkResultPreviousOK = testRun.benchmarkResultPreviousOK;
            storedTestRun.baseline = testRun.baseline;
            storedTestRun.previousBuild = testRun.previousBuild;
            storedTestRun.humanReadableDuration = humanReadableDuration(testRun.end.getTime() - testRun.start.getTime());
            storedTestRun.lastUpdated = new Date().getTime();

            storedTestRun.save(function(err, savedTestRun){

                if (err) {
                    reject(err);
                } else {

                    var io = global.io;
                    var room = savedTestRun.productName + '-' + savedTestRun.dashboardName;

                    winston.info('emitting message to room: ' + room);
                    io.sockets.in(room).emit('testrun', {event: 'saved', testrun: savedTestRun});
                    winston.info('emitting message to room: recent-test');
                    io.sockets.in('recent-test').emit('testrun', {event: 'saved', testrun: savedTestRun});

                    resolve(savedTestRun);
                }


            })
        }

       })

    });

}

function benchmarkAndPersistTestRunById(testRun) {

  return new Promise((resolve, reject) => {

    getDataForTestrun(testRun)
    .then(Requirements.setRequirementResultsForTestRun)
    .then(Benchmarks.setBenchmarkResultsPreviousBuildForTestRun)
    .then(Benchmarks.setBenchmarkResultsFixedBaselineForTestRun)
    .then(upsertTestRun)
    .then(function(completedTestrun){
      resolve(completedTestrun);
    })
    .catch(testRunErrorHandler);
  });
}

let testRunErrorHandler = function(err){

  winston.error('Error in test run chain: ' + err.stack);
}




function getDataForTestrun(testRun) {

  return new Promise((resolve, reject) => {

    if(testRun.productName) {
      Product.findOne({name: testRun.productName}).exec(function (err, product) {
        if (err)
          winston.error(err);
        Dashboard.findOne({
          $and: [
            {productId: product._id},
            {name: testRun.dashboardName}
          ]
        }).populate('metrics').exec(function (err, dashboard) {
          if (err)
            winston.error(err);
          var metrics = [];
          async.forEachLimit(dashboard.metrics, 16, function (metric, callbackMetric) {

            if (metric.requirementValue !== null || metric.benchmarkValue !== null) {

              let targets = [];
              let value;
              let start;
              /* if dashboard has startSteadyState configured and metric type = gradient use steady state period only */

              if (dashboard.startSteadyState && metric.type === 'Gradient') {

                start = new Date(testRun.start.getTime() + dashboard.startSteadyState * 1000).getTime();

              } else {

                /* if include ramp up is false, add ramp up period to start of test run */
                start = (testRun.rampUpPeriod && dashboard.includeRampUp === false) ? new Date(testRun.start.getTime() + testRun.rampUpPeriod * 1000).getTime() : testRun.start.getTime();

              }
              async.forEachLimit(metric.targets, 16, function (target, callbackTarget) {

                graphite.getGraphiteData(start, testRun.end.getTime(), target, 900, function (body) {
                  _.each(body, function (bodyTarget) {

                    /* save value based on metric type */


                    switch (metric.type) {

                      case 'Average':

                        value = bodyTarget.datapoints ? calculateAverage(bodyTarget.datapoints) : null;
                        break;

                      case 'Maximum':

                        value = bodyTarget.datapoints ? calculateMaximum(bodyTarget.datapoints) : null;
                        break;

                      case 'Minimum':

                        value = bodyTarget.datapoints ? calculateMinimum(bodyTarget.datapoints) : null;
                        break;

                      case 'Last':

                        value = bodyTarget.datapoints ? getLastDatapoint(bodyTarget.datapoints) : null;
                        break;

                      case 'Gradient':

                        value = bodyTarget.datapoints ? calculateLinearFit(bodyTarget.datapoints) : null;
                        break;
                    }


                    /* if target has values other than null values only, store it */
                    if (value !== null) {
                      targets.push({
                        target: bodyTarget.target,
                        value: value
                      });
                    }
                  });
                  callbackTarget();
                });
              }, function (err) {
                if (err)
                  return next(err);
                if (targets.length > 0) {
                  metrics.push({
                    _id: metric._id,
                    tags: metric.tags,
                    alias: metric.alias,
                    type: metric.type,
                    benchmarkValue: metric.benchmarkValue,
                    benchmarkOperator: metric.benchmarkOperator,
                    requirementValue: metric.requirementValue,
                    requirementOperator: metric.requirementOperator,
                    targets: targets
                  });

                  targets = [];
                }

                callbackMetric();


              });
            } else {

              callbackMetric();

            }
          }, function (err) {
            if (err) {
              reject(err);
            } else {
              /* save metrics to test run */

              winston.info('Retrieved data for:' + testRun.productName + '-' + testRun.dashboardName + 'testrunId: ' + testRun.testRunId);

              testRun.metrics = metrics;


              testRun.save(function (err, savedTestrun) {

                if (err) {
                  reject(err);
                } else {


                  resolve(savedTestrun);

                }

              });
            }
          });
        });
      });
    }else{

      reject("Test run has no productName. Test run ID: " + testRun.testRunId);
    }
 });
}
function calculateAverage(datapoints) {
  var count = 0;
  var total = 0;

  _.each(datapoints, function (datapoint) {
    if (datapoint[0] !== null) {
      count++;
      total += datapoint[0];
    }
  });
  if (count > 0)
    return Math.round(total / count * 100) / 100;
  else
    return null;
}

function calculateMaximum(datapoints){

  var maximum = null;

  for(var d=0;d<datapoints.length;d++){

    if (datapoints[d][0] !== null && datapoints[d][0] > maximum)
      maximum = datapoints[d][0];
  }

  var result = (maximum === null)? null : Math.round(maximum * 100)/100;

  return result;
}

function calculateMinimum(datapoints){

  var minimum = Infinity;

  for(var d=0;d<datapoints.length;d++){

    if (datapoints[d][0] < minimum)
      minimum = datapoints[d][0];
  }

  return minimum;
}

function getLastDatapoint(datapoints){


  for(var d=datapoints.length-1;d>=0;--d){

    if(datapoints[d][0]!= null) {

      /* if no valid number is calculated, return null*/

      var result = !isNaN(Math.round((datapoints[d][0]) * 100) / 100) ? Math.round((datapoints[d][0]) * 100) / 100 : null;
      return result;
    }
  }
}
function calculateLinearFit(datapoints){

  var data = [];

  for(var j=0;j< datapoints.length;j++){

    if(datapoints[j][0] !== null) {
      data.push([j, datapoints[j][0]]);
    }
  }

  var line = ss.linear_regression()
      .data(data)
      .line()

  var gradient = ss.linear_regression()
      .data(data)
      .m()
  //winston.info('stijgings percentage: ' + (line(data.length-1)-line(0))/ line(0)) / data.length * 100;
  //winston.info('gradient: ' + gradient * 100);
  //winston.info('line(0): ' + line(0));
  //winston.info('line(data.length-1): ' + line(data.length-1));

  /* if no valid number is calculated, return null*/

  var result = !isNaN(Math.round(((((line(data.length-1)-line(0))/ line(0)) / data.length) * 100 * 100)* 100) / 100) ? Math.round(((((line(data.length-1)-line(0))/ line(0)) / data.length) * 100 * 100)* 100) / 100 : null;

  return result;

}


function TempSaveTestruns(testruns,  callback) {

  var savedTesruns = [];

  _.each(testruns, function(testrun){
  var persistTestrun = new Testrun();
    persistTestrun.productName = testrun.productName;
    persistTestrun.dashboardName = testrun.dashboardName;
    persistTestrun.testRunId = testrun.testRunId;
    persistTestrun.start = testrun.start;
    persistTestrun.end = testrun.end;
    persistTestrun.eventIds = testrun.eventIds;
    persistTestrun.buildResultsUrl = testrun.buildResultsUrl;

    savedTesruns.push(persistTestrun);

    persistTestrun.save(function (err) {
      if (err) {
        winston.error(err);
        callback(err);
      } else {
        //callback(persistTestrun);
      }
    });
  });

  setTimeout(function(){

    callback(savedTesruns);
  },500);
}

function saveTestrun(testrun, metrics, callback) {
  getPreviousBuild(testrun.productName, testrun.dashboardName, testrun.testRunId, function (previousBuild) {
    var persistTestrun = new Testrun();
    persistTestrun.productName = testrun.productName;
    persistTestrun.dashboardName = testrun.dashboardName;
    persistTestrun.testRunId = testrun.testRunId;
    persistTestrun.start = testrun.start;
    persistTestrun.end = testrun.end;
    persistTestrun.baseline = testrun.baseline;
    persistTestrun.previousBuild = previousBuild;
    persistTestrun.buildResultsUrl = testrun.buildResultsUrl;
    persistTestrun.eventIds = testrun.eventIds;
    persistTestrun.metrics = metrics;
    persistTestrun.save(function (err) {
      if (err) {
        winston.error(err);
        callback(err);
      } else {
        callback(persistTestrun);
      }
    });
  });
}

function updateAllDashboardTestRuns(req, res){

  var regExpDashboardName = new RegExp(req.params.oldDashboardName, 'igm');

  Testrun.find({
    $and: [
      { productName: req.params.oldProductName },
      { dashboardName: req.params.oldDashboardName }
    ]}).exec(function(err, testruns){
    if (err) {
      return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
    } else {

      _.each(testruns, function(testrun){


        testrun.dashboardName = req.params.newDashboardName;
        testrun.testRunId = testrun.testRunId.replace(regExpDashboardName, req.params.newDashboardName);

        testrun.save(function (err) {
          if (err) {
            return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
          } else {
            //res.jsonp(testrun);
          }
        });
      });

      res.jsonp(testruns);
    }



  });
}

function updateAllProductTestRuns(req, res){

  var regExpProductName = new RegExp(req.params.oldProductName, 'igm');

  Testrun.find({productName: req.params.oldProductName}).exec(function(err, testruns){
    if (err) {
      return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
    } else {

      _.each(testruns, function(testrun){


        testrun.productName = req.params.newProductName;
        testrun.testRunId = testrun.testRunId.replace(regExpProductName,req.params.newProductName);

        testrun.save(function (err) {
          if (err) {
            return res.status(400).send({ message: errorHandler.getErrorMessage(err) });
          } else {
            //res.jsonp(testrun);
          }
        });
      });

      res.jsonp(testruns);
    }
  });
}
