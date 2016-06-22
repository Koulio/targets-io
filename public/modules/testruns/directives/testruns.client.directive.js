'use strict';

angular.module('testruns').directive('testruns', TestrunsDirective);

function TestrunsDirective () {

  var directive = {
    restrict: 'EA',
    templateUrl: 'modules/testruns/directives/testruns.client.view.html',
    controller: TestrunsDirectiveController,
    controllerAs: 'vm'

  };

  return directive;

  /* @ngInject */
  function TestrunsDirectiveController ($scope, $state, TestRuns, $filter, $rootScope, $stateParams, Dashboards, Utils, Metrics, TestRunSummary, $mdToast, $modal, ConfirmModal, $q, $interval, $timeout, $window, mySocket, Graphite) {


    var vm = this;

    $scope.productName = $stateParams.productName;
    $scope.dashboardName = $stateParams.dashboardName;

    /* spinner stuff */

    var j = 0, counter = 0;
    var spinner;
    $scope.modes = [];
    $scope.determinateValue = 30;


    /* By default, show completed test runs only */
    $scope.completedTestRunsOnly = true;


    $scope.loadNumberOfTestRuns = 10;

    $scope.numberOfRowOptions = [
      {value: 10},
      {value: 25},
      {value: 50},
      {value: 75},
      {value: 100}
    ];


    $scope.showAnnotations = showAnnotations;
    $scope.updateNumberOfTestRuns = updateNumberOfTestRuns;
    $scope.editTestRun = editTestRun;
    $scope.markAsComplete = markAsComplete;
    $scope.setTestRunsSelected = setTestRunsSelected;
    $scope.setAllTestRunsSelected = setAllTestRunsSelected;
    $scope.refreshTestrun = refreshTestrun;
    $scope.openDeleteSelectedTestRunsModal = openDeleteSelectedTestRunsModal;
    $scope.setTestRunAsBaseline = setTestRunAsBaseline;
    $scope.testRunRequirements = testRunRequirements;
    $scope.testRunPreviousBuildBenchmark = testRunPreviousBuildBenchmark;
    $scope.testRunFixedBaselineBenchmark = testRunFixedBaselineBenchmark;
    $scope.liveGraphs = liveGraphs;
    $scope.viewTestRunSummary = viewTestRunSummary;
    $scope.testRunDetails = testRunDetails;
    $scope.go = go;
    $scope.openMenu = openMenu;
    $scope.flushCache = flushCache;


    /* watches */

    $scope.$watch('$scope.loading', function (current, old) {
      if (current !== old) {
        if (current === true) {
          // Iterate every 100ms, non-stop
          spinner = $interval(function () {
            // Increment the Determinate loader
            $scope.determinateValue += 1;
            if ($scope.determinateValue > 100) {
              $scope.determinateValue = 30;
            }
            // Incrementally start animation the five (5) Indeterminate,
            // themed progress circular bars
            if (j < 5 && !$scope.modes[j] && $scope.loading) {
              $scope.modes[j] = 'indeterminate';
            }
            if (counter++ % 4 == 0)
              j++;
            console.log('bla');
          }, 100, 0, true);
        } else {

          $interval.cancel(spinner);

        }
      }
    });


    $scope.$watch('$scope.allTestRunsSelected', function (newVal, oldVal) {
      if (newVal !== oldVal) {
        _.each($scope.testRuns, function (testRun, i) {
          testRun.selected = newVal;
        });
      }
    });

    $scope.$on('$destroy', function () {
      // Make sure that the interval is destroyed too
      $interval.cancel(spinner);
      //  leave the room
      mySocket.emit('exit-room', room);

    });


    /*socket.io*/

    var room = $scope.productName + '-' + $scope.dashboardName;

    mySocket.emit('room', room);
    console.log('Joined room: ' + room);

    mySocket.on('testrun', function (message) {
      switch (message.event) {

        case 'saved':


          var index = $scope.testRuns.map(function(testRun){ return testRun.testRunId; }).indexOf(message.testrun.testRunId);

          if (index === -1){

            $scope.testRuns.unshift(message.testrun);

          }else{

            $scope.testRuns[index] = message.testrun;
          }

          break;

        case 'removed':

          var index = $scope.testRuns.map(function(testRun){ return testRun.testRunId; }).indexOf(message.testrun.testRunId);

          if(index !== -1) $scope.testRuns.splice(index, 1);

        break;

      }
    });

    mySocket.on('runningTest', function (message) {
      switch (message.event) {

        case 'saved':

          var testRun = message.testrun;

          testRun.progress = (message.testrun.lastKnownDuration) ? Math.round((new Date().getTime() - new Date(message.testrun.start).getTime()) / message.testrun.lastKnownDuration * 100) : undefined;

          var index = $scope.runningTests.map(function(runningTest){ return runningTest.testRunId; }).indexOf(message.testrun.testRunId);

          if (index === -1){

            $scope.runningTests.unshift(testRun);

          }else{

            $scope.runningTests[index] = testRun;
          }


          break;

        case 'removed':

          var index = $scope.runningTests.map(function(runningTest){ return runningTest.testRunId; }).indexOf(message.testrun.testRunId);
          $scope.runningTests.splice(index, 1);


      }
    });

    /* initialise */
    activate();


    function activate() {



      /* only get test runs from db when neccessary */
      /* if switching dashboards, reset application state */
      //if (($rootScope.currentStateParams.dashboardName !== $rootScope.previousStateParams.dashboardName && $rootScope.previousStateParams.dashboardName) || !$rootScope.previousStateParams.dashboardName) {
      //
      //
      //  $scope.loading = true;
      //
      //
      //} else {
      //
      //  $scope.testRuns = [];
      //  $scope.testRuns = TestRuns.list;
      //  $scope.runningTest = (TestRuns.runningTest) ? TestRuns.runningTest : false;
      //  $scope.numberOfRunningTests = (TestRuns.runningTest) ? TestRuns.runningTest : 0;
      //
      //}
      //

      /* Check if baseline test run exists */

      Dashboards.get($scope.productName, $scope.dashboardName).success(function (dashboard) {

        if (dashboard.useInBenchmark) {

          TestRuns.getTestRunById($scope.productName, $scope.dashboardName, dashboard.baseline).error(function (data, status, header, config) {

            var toast = $mdToast.simple()
                .action('OK')
                .highlightAction(true)
                .position('top')
                .hideDelay(30000)
                .parent(angular.element('#fixedBaselineToast'))
                .theme('error-toast');

            $mdToast.show(toast.content('No fixed baseline set!')).then(function (response) {

            });

          });

        }
      });

      /* get test runs */
      TestRuns.listTestRunsForDashboard($scope.productName, $scope.dashboardName, $scope.loadNumberOfTestRuns).success(function (testRuns) {


        /* set test runs */
        $scope.testRuns = testRuns;
        $scope.loading = false;
      });


   /* get running tests */
      TestRuns.listRunningTestsForDashboard($scope.productName, $scope.dashboardName).success(function (runningTests) {

        _.each(runningTests, function(runningTest){

          runningTest.progress = (runningTest.lastKnownDuration) ? Math.round((new Date().getTime() - new Date(runningTest.start).getTime()) / runningTest.lastKnownDuration * 100) : undefined;

          runningTest.progress = runningTest.progress < 100 ? runningTest.progress : undefined;
        });

        /* set running tests */
        $scope.runningTests = runningTests;

      });




  };



    var originatorEv;

    function openMenu($mdOpenMenu, ev) {
      originatorEv = ev;
      $mdOpenMenu(ev);

    };

    function flushCache(testRun) {

      Graphite.flushCache(testRun).success(function () {

        var toast = $mdToast.simple()
            .action('OK')
            .highlightAction(true)
            .hideDelay(3000)

        $mdToast.show(toast.content('Cache has been flushed for test run ' + testRun.testRunId)).then(function (response) {
        })

      })
    }


    function go(url) {
      //$window.location.href = url;
      $window.open(url, '_blank');
    };


    function testRunDetails(testRun) {
      TestRuns.selected = testRun;
      $state.go('viewGraphs', {
        'productName': $stateParams.productName,
        'dashboardName': $stateParams.dashboardName,
        'testRunId': testRun.testRunId,
        tag: Dashboards.getDefaultTag(Dashboards.selected.tags)
      });
    };

    function viewTestRunSummary(testRun) {


      $state.go('testRunSummary', {
        'productName': $stateParams.productName,
        'dashboardName': $stateParams.dashboardName,
        'testRunId': testRun.testRunId
      });

    }


    function liveGraphs(testRun) {

      $state.go('viewLiveGraphs', {
        'productName': $stateParams.productName,
        'dashboardName': $stateParams.dashboardName,
        tag: Dashboards.getDefaultTag(Dashboards.selected.tags)
      });
    }


    function testRunFixedBaselineBenchmark(testRun) {
      TestRuns.selected = testRun;
      var benchmarkFixedResult = testRun.benchmarkResultFixedOK ? 'passed' : 'failed';
      $state.go('benchmarkFixedBaselineTestRun', {
        'productName': $stateParams.productName,
        'dashboardName': $stateParams.dashboardName,
        'testRunId': testRun.testRunId,
        'benchmarkResult': benchmarkFixedResult
      });
    };

    function testRunPreviousBuildBenchmark(testRun) {
      TestRuns.selected = testRun;
      var benchmarkPreviousResult = testRun.benchmarkResultPreviousOK ? 'passed' : 'failed';
      $state.go('benchmarkPreviousBuildTestRun', {
        'productName': $stateParams.productName,
        'dashboardName': $stateParams.dashboardName,
        'testRunId': testRun.testRunId,
        'benchmarkResult': benchmarkPreviousResult
      });
    };

    function testRunRequirements(testRun) {
      TestRuns.selected = testRun;
      var requirementsResult = testRun.meetsRequirement ? 'passed' : 'failed';
      $state.go('requirementsTestRun', {
        'productName': $stateParams.productName,
        'dashboardName': $stateParams.dashboardName,
        'testRunId': testRun.testRunId,
        'requirementsResult': requirementsResult
      });
    };

    function setTestRunAsBaseline(baseline) {
      var arrayOfPromises = [];
      Dashboards.selected.baseline = baseline;
      Dashboards.update(Dashboards.selected).success(function (dashboard) {
        Dashboards.selected = dashboard;
        $scope.dashboard = dashboard;
        var baselineSet = false;
        _.each($scope.testRuns, function (testRun, index) {
          /* Only update test runs more recent than baseline */
          if (testRun.testRunId === baseline)
            baselineSet = true;
          if (testRun.testRunId !== baseline && baselineSet == false) {
            $scope.testRuns[index].benchmarkResultFixedOK = 'pending';
            testRun.baseline = baseline;
            arrayOfPromises.push(TestRuns.updateFixedBaseline(testRun).then(function (testRun) {
            }));
          }
        });
        $q.all(arrayOfPromises).then(function (results) {
          /* refresh test runs*/
          setTimeout(function () {
            TestRuns.listTestRunsForDashboard($scope.productName, $scope.dashboardName).success(function (testRuns) {
              TestRuns.list = testRuns;
            }, function (errorResponse) {
              $scope.error = errorResponse.data.message;
            });
          }, 100);
        });
      });
    };

    function openDeleteSelectedTestRunsModal(size) {
      ConfirmModal.itemType = 'Delete ';
      ConfirmModal.selectedItemDescription = ' selected test runs';
      var modalInstance = $modal.open({
        templateUrl: 'ConfirmDelete.html',
        controller: 'ModalInstanceController',
        size: size  //,
      });
      modalInstance.result.then(function (selectedIndex) {

        var deleteTestRunsArrayOfPromises = [];
        var i;
        for (i = $scope.testRuns.length - 1; i > -1; i--) {

          if ($scope.testRuns[i].selected === true) {
            deleteTestRunsArrayOfPromises.push(TestRuns.delete($scope.productName, $scope.dashboardName, $scope.testRuns[i].testRunId));
            $scope.testRunSelected = false;
            $scope.testRuns[i].selected = false;
            $scope.testRuns.splice(i, 1);
            if (TestRuns.list[i]) TestRuns.list.splice(i, 1);
          }

        }


        $q.all(deleteTestRunsArrayOfPromises)
            .then(function () {

              /* refresh view */



            });

      }, function () {
      });
    };

    function refreshTestrun(testRun) {



      var selectedTestRunIndex = $scope.testRuns.map(function (currentTestRun) {
        return currentTestRun._id.toString();
      }).indexOf(testRun._id.toString());

      $scope.testRuns[selectedTestRunIndex].meetsRequirement = 'pending';
      $scope.testRuns[selectedTestRunIndex].benchmarkResultPreviousOK = 'pending';
      $scope.testRuns[selectedTestRunIndex].benchmarkResultFixedOK = 'pending';
      $scope.testRuns[selectedTestRunIndex].busy = true;
      TestRuns.refreshTestrun($stateParams.productName, $stateParams.dashboardName, $scope.testRuns[selectedTestRunIndex].testRunId).success(function (testRun) {
        $scope.testRuns[selectedTestRunIndex] = testRun;
        $scope.testRuns[selectedTestRunIndex].busy = false;


      }, function (errorResponse) {
        $scope.error = errorResponse.data.message;
      });
    };

    function setAllTestRunsSelected(testRunSelected) {

      $scope.testRunSelected = testRunSelected;
    };


    function setTestRunsSelected(testRunSelected) {

      if (testRunSelected === false) {

        $scope.testRunSelected = false;

        _.each($scope.testRuns, function (testRun) {
          if (testRun.selected === true) $scope.testRunSelected = true;
        })

      } else {
        $scope.testRunSelected = testRunSelected;
      }
    };

    function markAsComplete(testRun) {

      testRun.completed = true;
      TestRuns.update(testRun).success(function (updatedTestRun) {

        if (updatedTestRun) {
          var updatedTestRunIndex = $scope.testRuns.map(function (currentTestRun) {
            return currentTestRun._id.toString();
          }).indexOf(updatedTestRun._id.toString());
          $scope.testRuns[updatedTestRunIndex] = updatedTestRun;
          $scope.completedTestRunsOnly = true;

          $scope.testRuns[updatedTestRunIndex].meetsRequirement = 'pending';
          $scope.testRuns[updatedTestRunIndex].benchmarkResultPreviousOK = 'pending';
          $scope.testRuns[updatedTestRunIndex].benchmarkResultFixedOK = 'pending';
          $scope.testRuns[updatedTestRunIndex].busy = true;

          TestRuns.refreshTestrun($stateParams.productName, $stateParams.dashboardName, $scope.testRuns[updatedTestRunIndex].testRunId).success(function (testRun) {
            $scope.testRuns[updatedTestRunIndex] = testRun;
            $scope.testRuns[updatedTestRunIndex].busy = false;  ///* refresh screen*/
            //setTimeout(function(){
            //    $state.go($state.current, {}, {reload: true});
            //},1);
          }, function (errorResponse) {
            $scope.error = errorResponse.data.message;
          });
        }
        ;

      });
    }


    function editTestRun(testRun) {

      TestRuns.selected = testRun;
      $state.go('editTestRun', {
        productName: testRun.productName,
        dashboardName: testRun.dashboardName,
        testRunId: testRun.testRunId
      });

    }


    function updateNumberOfTestRuns() {

      $scope.loading = true;


    }


    function showAnnotations($event, testRun) {

      var parentEl = angular.element(document.body);
      $mdDialog.show({
        parent: parentEl,
        targetEvent: $event,
        template: '<md-dialog aria-label="Annotations">' +
        '<md-toolbar class="md-padding"><h4>Test run annotations</h4></md-toolbar>' +
        '  <div layout="column"' +
        '  <md-dialog-content class="md-padding">' +
        '    <h5><em>{{testRun.testRunId}}</em></h5>' +
        '    <md-input-container class="md-block" flex>' +
        '       <textarea name="testrunAnnotations" ng-model="testRun.annotations" columns="1" md-maxlength="500" rows="10"></textarea>' +
        '    </md-input-container>' +
        '  </md-dialog-content>' +
        '  <md-dialog-actions>' +
        '    <md-button ng-click="closeDialog()" class="md-primary">' +
        '      OK' +
        '    </md-button>' +
        '  </md-dialog-actions>' +
        '  </div>' +
        '</md-dialog>',
        locals: {
          testRun: testRun
        },
        controller: DialogController
      });
      function DialogController(vm, $mdDialog, testRun, TestRuns) {
        testRun = testRun;
        $scope.closeDialog = function () {
          TestRuns.update(testRun).success(function () {

            $mdDialog.hide();
          })

        }
      }

    }
  }
}