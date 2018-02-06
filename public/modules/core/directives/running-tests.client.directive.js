'use strict';

angular.module('core').directive('runningTests', RunningTestsDirective);

function RunningTestsDirective () {

    var directive = {

        restrict: 'EA',
        templateUrl: 'modules/core/directives/running-tests.client.view.html',
        controller: RunningTestsDirectiveController
    };

    return directive;

    /* @ngInject */
    function RunningTestsDirectiveController ($scope, $state, $interval, $timeout, RunningTests, TestRuns, mySocket) {


        activate()

        $scope.$on('$destroy', function () {
            //  leave the room
            mySocket.emit('exit-room', room);
            mySocket.disconnect();
        });

        /*socket.io*/

        var room = 'running-test';


        mySocket.emit('room', room);
        console.log('Joined room: ' + room);


        mySocket.on('runningTest', function (message) {
            switch (message.event) {

                case 'saved':

                    var testRun = message.testrun;

                    testRun.progress = (testRun.duration) ? Math.round((new Date().getTime() - new Date(message.testrun.start).getTime()) / testRun.duration * 100) : undefined;
                    //testRun.humanReadablelastKnownDuration = (message.testrun.lastKnownDuration) ? TestRuns.humanReadbleDuration(message.testrun.lastKnownDuration): undefined;
                    testRun.timeLeft = (testRun.duration - ((new Date().getTime() - new Date(testRun.start).getTime())) > 0) ? TestRuns.humanReadbleDuration(testRun.duration - ((new Date().getTime() - new Date(testRun.start).getTime()))) + ' left (' + testRun.progress + '%)': TestRuns.humanReadbleDuration(((new Date().getTime() - new Date(testRun.start).getTime())) - testRun.duration) + ' longer than last completed test run (' + testRun.progress + '%)';


                    var index = $scope.runningTests.map(function(runningTest){ return runningTest.testRunId; }).indexOf(message.testrun.testRunId);

                    if (index === -1){

                        $scope.runningTests.unshift(testRun);

                    }else{

                        $scope.runningTests[index] = testRun;
                    }

                    //console.log('added running test: ' + message.testrun.testRunId);

                    break;

                case 'removed':

                    var index = $scope.runningTests.map(function(runningTest){ return runningTest.testRunId; }).indexOf(message.testrun.testRunId);
                    $scope.runningTests.splice(index, 1);

                    //console.log('removed running test: ' + message.testrun.testRunId);

                    break;

            }
        });


        function activate(){

            RunningTests.get().success(function(runningTests){


                /* calculate progress */

                _.each(runningTests, function(testRun, i){

                    testRun.progress = (testRun.duration) ? Math.round((new Date().getTime() - new Date(testRun.start).getTime()) / testRun.duration * 100) : undefined;
                    //testRun.humanReadablelastKnownDuration = (testRun.lastKnownDuration) ? TestRuns.humanReadbleDuration(testRun.lastKnownDuration): undefined;
                    testRun.timeLeft = (testRun.duration - ((new Date().getTime() - new Date(testRun.start).getTime())) > 0) ? TestRuns.humanReadbleDuration(testRun.duration - ((new Date().getTime() - new Date(testRun.start).getTime()))) + ' left (' + testRun.progress + '%)': TestRuns.humanReadbleDuration(((new Date().getTime() - new Date(testRun.start).getTime())) - testRun.duration) + ' longer than last completed test run (' + testRun.progress + '%)';
                })

                $scope.runningTests = runningTests;

            });

        }




    }
}
